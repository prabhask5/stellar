/**
 * @fileoverview Reactive stores for the **Focus / Pomodoro timer** feature.
 *
 * This module manages all focus-session state: settings, active session
 * lifecycle (start / pause / resume / stop / skip), a 100 ms tick loop
 * for the countdown UI, and multi-device sync via both real-time
 * subscriptions and sync-complete fallback.
 *
 * The file is organized into three main sections:
 *
 * 1. **Focus Timer Store** (`focusStore`) — the core Pomodoro engine,
 *    including the tick loop, phase-completion logic, auto-start
 *    behaviour, and cross-device realtime synchronization.
 * 2. **Focus Time Updated** (`focusTimeUpdated`) — a lightweight
 *    notification store that increments whenever logged focus minutes
 *    change, so dependent UI (e.g., daily focus summary) can re-fetch.
 * 3. **Block List Stores** — `blockListStore`, `blockedWebsitesStore`,
 *    and `singleBlockListStore` for managing website-blocking lists
 *    that integrate with the focus session.
 *
 * Architecture notes:
 * - All writes go to local DB first via {@link repo} (local-first).
 * - {@link onSyncComplete} provides a polling-style refresh after sync.
 * - {@link onRealtimeDataUpdate} provides instant push updates for
 *   focus sessions and settings from other devices.
 * - Concurrency guards via `createAsyncGuard` from stellar-drive prevent
 *   duplicate state mutations from overlapping async operations.
 *
 * @module stores/focus
 */

import { writable, derived, type Writable, type Readable } from 'svelte/store';
import type { FocusSettings, FocusSession, BlockList, BlockedWebsite } from '$lib/types';
import * as repo from '$lib/db/repositories';
import { browser } from '$app/environment';
import { calculateRemainingMs, getNextPhase } from '$lib/utils/focus';
import {
  createCollectionStore,
  createDetailStore,
  onSyncComplete,
  onRealtimeDataUpdate,
  remoteChangesStore
} from 'stellar-drive/stores';
import { createAsyncGuard } from 'stellar-drive/utils';

// =============================================================================
//  FOCUS TIMER STORE
// =============================================================================

/**
 * Internal shape of the focus store's reactive value.
 *
 * Combines settings, active session data, countdown state, and an
 * animation transition hint for the UI.
 */
interface FocusState {
  /** User's Pomodoro configuration (durations, cycle count, auto-start). */
  settings: FocusSettings | null;

  /** Currently active focus session, or `null` if idle. */
  session: FocusSession | null;

  /** Milliseconds remaining in the current phase (focus / break). */
  remainingMs: number;

  /** Whether the countdown is actively ticking. */
  isRunning: boolean;

  /**
   * Animation hint for UI transitions between states.
   * Set on state change, then cleared after 600 ms.
   */
  stateTransition: 'none' | 'starting' | 'pausing' | 'resuming' | 'stopping' | null;
}

// ── Focus Time Notification Store ───────────────────────────────────────────

/**
 * Internal writable that increments each time logged focus minutes change.
 * Components subscribe to the read-only {@link focusTimeUpdated} export
 * to know when to re-fetch today's focus time.
 */
const focusTimeUpdatedStore = writable(0);

// ── Focus Store Factory ─────────────────────────────────────────────────────

/**
 * Factory for the **focus timer** store.
 *
 * Encapsulates the entire Pomodoro session lifecycle:
 *
 * - **load** — fetch settings + any active session, resume ticker if needed
 * - **start** — create a new session, begin the first focus phase
 * - **pause / resume** — freeze / restart the countdown
 * - **stop** — end the session, log elapsed focus time
 * - **skip** — advance to the next phase (focus → break or vice-versa)
 * - **updateSettings** — persist setting changes
 * - **getTodayFocusTime** — query total focus minutes for today
 * - **destroy** — tear down ticker and subscriptions
 *
 * Internally uses a 100 ms `setInterval` tick loop for smooth countdown
 * updates, with concurrency guards to prevent race conditions when
 * phases complete or remote changes arrive simultaneously.
 *
 * @returns A custom Svelte store with session lifecycle methods.
 */
function createFocusStore() {
  const { subscribe, set, update }: Writable<FocusState> = writable({
    settings: null,
    session: null,
    remainingMs: 0,
    isRunning: false,
    stateTransition: null
  });

  /** Whether the initial load is still in flight. */
  const loading = writable(true);

  /** Handle for the 100 ms countdown interval. */
  let tickInterval: ReturnType<typeof setInterval> | null = null;

  /** ID of the user whose session we're tracking. */
  let currentUserId: string | null = null;

  /** Teardown for the {@link onSyncComplete} fallback listener. */
  let unsubscribeSyncComplete: (() => void) | null = null;

  /** Teardown for the {@link onRealtimeDataUpdate} primary listener. */
  let unsubscribeRealtime: (() => void) | null = null;

  /** Guarded phase-completion handler — prevents overlapping async calls. */
  const guardedHandlePhaseComplete = createAsyncGuard(handlePhaseComplete);

  /** Guarded realtime update handler — prevents recursive handling. */
  const guardedHandleRealtimeUpdate = createAsyncGuard(handleRealtimeUpdate);

  // ── Internal Helpers ────────────────────────────────────────────────────

  /**
   * Bump the {@link focusTimeUpdatedStore} so subscribers know to
   * re-fetch today's focus time total.
   */
  function notifyFocusTimeUpdated() {
    focusTimeUpdatedStore.update((n) => n + 1);
  }

  /**
   * Tick callback — runs every 100 ms while the session is active.
   *
   * Recalculates `remainingMs` from the session's `phase_started_at`
   * timestamp.  When the remaining time hits zero, triggers
   * {@link handlePhaseComplete} (guarded against concurrent calls).
   */
  function tick() {
    update((state) => {
      if (!state.session || state.session.status !== 'running') {
        return state;
      }

      const remaining = calculateRemainingMs(state.session);

      /* ── Phase expired — hand off to async completion handler ── */
      if (remaining <= 0) {
        guardedHandlePhaseComplete();
        return state; /* State will be updated by handlePhaseComplete */
      }

      return { ...state, remainingMs: remaining };
    });
  }

  /**
   * Handle natural phase completion (timer reached zero).
   *
   * Determines the next phase via {@link getNextPhase}:
   * - If `'idle'` → session is fully complete; stop and log focus time.
   * - Otherwise → advance to the next focus/break phase, respecting
   *   auto-start settings.  If auto-start is off, the new phase begins
   *   in a paused state so the user must manually resume.
   */
  async function handlePhaseComplete() {
    /* ── Snapshot current state ── */
    let state: FocusState | null = null;
    update((s) => {
      state = s;
      return s;
    });

    if (!state || !(state as FocusState).session || !(state as FocusState).settings) return;

    const session = (state as FocusState).session!;
    const settings = (state as FocusState).settings!;

    /* ── Calculate elapsed focus time if completing a focus phase ── */
    let elapsedFocusMinutes: number | undefined;
    if (session.phase === 'focus') {
      elapsedFocusMinutes = session.focus_duration; /* Full duration on natural completion */
    }

    const next = getNextPhase(session, settings);

    if (next.phase === 'idle') {
      /* ── Session complete — stop and clean up ── */
      await repo.stopFocusSession(session.id, elapsedFocusMinutes);
      const stopped = await repo.getFocusSession(session.id);
      update((s) => ({
        ...s,
        session: stopped,
        remainingMs: 0,
        isRunning: false
      }));
      stopTicker();
      /* Notify that focus time has been updated */
      if (elapsedFocusMinutes !== undefined) {
        notifyFocusTimeUpdated();
      }
      return;
    }

    /* ── Advance to next phase ── */
    const updated = await repo.advancePhase(
      session.id,
      next.phase,
      next.cycle,
      next.durationMs,
      elapsedFocusMinutes
    );

    if (updated) {
      /* ── Check auto-start settings ── */
      const shouldAutoStart =
        (next.phase === 'break' && settings.auto_start_breaks) ||
        (next.phase === 'focus' && settings.auto_start_focus);

      if (!shouldAutoStart) {
        /* Pause at the start of new phase — user must manually resume */
        await repo.pauseFocusSession(session.id, next.durationMs);
        const paused = await repo.getFocusSession(session.id);
        update((s) => ({
          ...s,
          session: paused,
          remainingMs: next.durationMs,
          isRunning: false
        }));
        stopTicker();
      } else {
        update((s) => ({
          ...s,
          session: updated,
          remainingMs: next.durationMs,
          isRunning: true
        }));
      }

      /* Notify that focus time has been updated after completing a focus phase */
      if (elapsedFocusMinutes !== undefined) {
        notifyFocusTimeUpdated();
      }
    }
  }

  /**
   * Start the 100 ms countdown interval (idempotent — no-ops if
   * already running).
   */
  function startTicker() {
    if (tickInterval) return;
    tickInterval = setInterval(tick, 100); /* 100 ms for smooth countdown */
  }

  /**
   * Stop the countdown interval and release the handle.
   */
  function stopTicker() {
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
  }

  // ── Realtime Sync Handlers ──────────────────────────────────────────────

  /**
   * Handle realtime updates for `focus_sessions` from another device.
   *
   * Compares previous vs. incoming session status to determine the
   * appropriate UI transition animation (`'starting'`, `'pausing'`,
   * `'resuming'`, `'stopping'`), then recalculates remaining time
   * from the server-synced session data.
   *
   * @param table     - The table that was updated (must be `'focus_sessions'`).
   * @param _entityId - The specific row ID (unused — we re-fetch active session).
   */
  async function handleRealtimeUpdate(table: string, _entityId: string) {
    if (table !== 'focus_sessions' || !currentUserId) {
      return;
    }

    /* ── Get current state for comparison ── */
    let currentState: FocusState = {
      settings: null,
      session: null,
      remainingMs: 0,
      isRunning: false,
      stateTransition: null
    };
    update((s) => {
      currentState = s;
      return s;
    });

    /* ── Fetch updated session (already written to local DB by realtime handler) ── */
    const updatedSession = await repo.getActiveSession(currentUserId);

    /* ── Determine transition type for UI animation ── */
    let transition: FocusState['stateTransition'] = null;

    const prevSession = currentState.session;
    const prevStatus = prevSession?.status;
    const newStatus = updatedSession?.status;

    if (!prevSession && updatedSession) {
      transition = 'starting';
    } else if (prevSession && !updatedSession) {
      transition = 'stopping';
    } else if (prevStatus !== newStatus) {
      if (newStatus === 'running' && prevStatus === 'paused') {
        transition = 'resuming';
      } else if (newStatus === 'paused' && prevStatus === 'running') {
        transition = 'pausing';
      } else if (newStatus === 'stopped') {
        transition = 'stopping';
      }
    }

    /* ── Calculate remaining time from the server-synced session ── */
    let remainingMs = 0;
    let isRunning = false;

    if (updatedSession) {
      /* Use the server's `phase_remaining_ms` for accuracy */
      remainingMs = calculateRemainingMs(updatedSession);
      isRunning = updatedSession.status === 'running';
    }

    /* ── Update state with transition hint ── */
    update((s) => ({
      ...s,
      session: updatedSession,
      remainingMs,
      isRunning,
      stateTransition: transition
    }));

    /* ── Start or stop ticker based on running state ── */
    if (isRunning) {
      startTicker();
    } else {
      stopTicker();
    }

    /* ── Clear transition hint after animation duration (600 ms) ── */
    if (transition) {
      setTimeout(() => {
        update((s) => ({
          ...s,
          stateTransition: null
        }));
      }, 600);
    }
  }

  /**
   * Handle realtime updates for `focus_settings` from another device.
   *
   * Simply re-fetches the latest settings and patches them into state.
   *
   * @param table     - The table that was updated (must be `'focus_settings'`).
   * @param _entityId - The specific row ID (unused).
   */
  async function handleSettingsRealtimeUpdate(table: string, _entityId: string) {
    if (table !== 'focus_settings' || !currentUserId) {
      return;
    }

    /* ── Fetch updated settings from local DB ── */
    const updatedSettings = await repo.getFocusSettings(currentUserId);
    if (updatedSettings) {
      update((s) => ({
        ...s,
        settings: updatedSettings
      }));
    }
  }

  // ── Public Store API ────────────────────────────────────────────────────

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },

    /**
     * Load the user's focus settings and any active session.
     *
     * If an active session is found but has expired while the app was
     * closed (e.g., laptop was sleeping), it is automatically stopped.
     * Otherwise, the ticker is resumed from where it left off.
     *
     * Registers both sync-complete (fallback) and realtime (primary)
     * listeners for cross-device synchronization.
     *
     * @param userId - The authenticated user's ID.
     */
    load: async (userId: string) => {
      loading.set(true);
      currentUserId = userId;

      try {
        /* ── Get or create settings ── */
        const settings = await repo.getOrCreateFocusSettings(userId);

        /* ── Check for active session ── */
        const activeSession = await repo.getActiveSession(userId);

        let remainingMs = 0;
        let isRunning = false;

        if (activeSession) {
          remainingMs = calculateRemainingMs(activeSession);
          isRunning = activeSession.status === 'running';

          /* ── If session expired while away, stop it ── */
          if (remainingMs <= 0 && isRunning) {
            await repo.stopFocusSession(activeSession.id);
            const stopped = await repo.getFocusSession(activeSession.id);
            set({
              settings,
              session: stopped,
              remainingMs: 0,
              isRunning: false,
              stateTransition: null
            });
            loading.set(false);
            return;
          }

          if (isRunning) {
            startTicker();
          }
        }

        set({ settings, session: activeSession, remainingMs, isRunning, stateTransition: null });

        /* ── Register sync-complete listener (fallback for when realtime is unavailable) ── */
        if (browser && !unsubscribeSyncComplete) {
          unsubscribeSyncComplete = onSyncComplete(async () => {
            if (currentUserId) {
              const refreshedSettings = await repo.getFocusSettings(currentUserId);
              const refreshedSession = await repo.getActiveSession(currentUserId);

              /* Only update if not currently handling a realtime change */
              let remainingMs = 0;
              let isRunning = false;
              if (refreshedSession) {
                remainingMs = calculateRemainingMs(refreshedSession);
                isRunning = refreshedSession.status === 'running';
              }

              update((s) => ({
                ...s,
                settings: refreshedSettings || s.settings,
                session: refreshedSession,
                remainingMs,
                isRunning
              }));

              /* Ensure ticker state is correct */
              if (isRunning) {
                startTicker();
              } else {
                stopTicker();
              }
            }
          });
        }

        /* ── Register realtime listener (primary sync method) ── */
        if (browser && !unsubscribeRealtime) {
          unsubscribeRealtime = onRealtimeDataUpdate((table, entityId) => {
            if (table === 'focus_sessions') {
              guardedHandleRealtimeUpdate(table, entityId);
            } else if (table === 'focus_settings') {
              handleSettingsRealtimeUpdate(table, entityId);
            }
          });
        }
      } finally {
        loading.set(false);
      }
    },

    /**
     * Start a new focus session.
     *
     * Creates a session record in local DB with the user's configured
     * durations and cycle count, then starts the ticker.  The first
     * phase is always `'focus'`.
     */
    start: async () => {
      /* ── Snapshot current state ── */
      let state: FocusState | null = null;
      update((s) => {
        state = s;
        return s;
      });

      if (!state || !(state as FocusState).settings || !currentUserId) return;

      const settings = (state as FocusState).settings!;

      /* ── Create new session ── */
      const session = await repo.createFocusSession(
        currentUserId,
        settings.focus_duration,
        settings.break_duration,
        settings.cycles_before_long_break
      );

      const durationMs = settings.focus_duration * 60 * 1000;

      update((s) => ({
        ...s,
        session,
        remainingMs: durationMs,
        isRunning: true
      }));

      startTicker();
    },

    /**
     * Pause the currently running session.
     *
     * Snapshots the remaining time and persists it so the session can
     * be accurately resumed later (even from another device).
     */
    pause: async () => {
      /* ── Snapshot current state ── */
      let state: FocusState | null = null;
      update((s) => {
        state = s;
        return s;
      });

      if (!state || !(state as FocusState).session) return;

      const session = (state as FocusState).session!;
      const remaining = calculateRemainingMs(session);

      await repo.pauseFocusSession(session.id, remaining);
      const paused = await repo.getFocusSession(session.id);

      update((s) => ({
        ...s,
        session: paused,
        remainingMs: remaining,
        isRunning: false
      }));

      stopTicker();
    },

    /**
     * Resume a paused session.
     *
     * Restores the countdown from the persisted `phase_remaining_ms`
     * and restarts the ticker.
     */
    resume: async () => {
      /* ── Snapshot current state ── */
      let state: FocusState | null = null;
      update((s) => {
        state = s;
        return s;
      });

      if (!state || !(state as FocusState).session) return;

      const session = (state as FocusState).session!;

      await repo.resumeFocusSession(session.id);
      const resumed = await repo.getFocusSession(session.id);

      update((s) => ({
        ...s,
        session: resumed,
        isRunning: true
      }));

      startTicker();
    },

    /**
     * Stop the session entirely (user-initiated cancellation).
     *
     * If the session is currently in a focus phase, calculates the
     * partial elapsed focus time and logs it before stopping.  This
     * ensures the user gets credit for time already spent focusing.
     */
    stop: async () => {
      /* ── Snapshot current state ── */
      let state: FocusState | null = null;
      update((s) => {
        state = s;
        return s;
      });

      if (!state || !(state as FocusState).session) return;

      const session = (state as FocusState).session!;

      /* ── Calculate elapsed focus time if stopping during a focus phase ── */
      let elapsedFocusMinutes: number | undefined;
      if (session.phase === 'focus') {
        const elapsedMs = Date.now() - new Date(session.phase_started_at).getTime();
        elapsedFocusMinutes = Math.min(Math.floor(elapsedMs / 60000), session.focus_duration);
      }

      await repo.stopFocusSession(session.id, elapsedFocusMinutes);

      update((s) => ({
        ...s,
        session: null,
        remainingMs: 0,
        isRunning: false
      }));

      stopTicker();

      /* Notify that focus time has been updated */
      if (elapsedFocusMinutes !== undefined) {
        notifyFocusTimeUpdated();
      }
    },

    /**
     * Skip to the next phase without waiting for the timer to expire.
     *
     * Follows the same phase-advance logic as natural completion:
     * - If next phase is `'idle'` → session ends.
     * - Otherwise → advance, preserving the running/paused state.
     *
     * Partial focus time is logged if skipping out of a focus phase.
     */
    skip: async () => {
      /* ── Snapshot current state ── */
      let state: FocusState | null = null;
      update((s) => {
        state = s;
        return s;
      });

      if (!state || !(state as FocusState).session || !(state as FocusState).settings) return;

      const session = (state as FocusState).session!;
      const settings = (state as FocusState).settings!;
      const wasRunning = session.status === 'running';

      /* ── Calculate elapsed focus time if skipping during a focus phase ── */
      let elapsedFocusMinutes: number | undefined;
      if (session.phase === 'focus') {
        const elapsedMs = Date.now() - new Date(session.phase_started_at).getTime();
        elapsedFocusMinutes = Math.min(Math.floor(elapsedMs / 60000), session.focus_duration);
      }

      const next = getNextPhase(session, settings);

      if (next.phase === 'idle') {
        /* ── Session complete ── */
        await repo.stopFocusSession(session.id, elapsedFocusMinutes);
        update((s) => ({
          ...s,
          session: null,
          remainingMs: 0,
          isRunning: false
        }));
        stopTicker();
        /* Notify that focus time has been updated */
        if (elapsedFocusMinutes !== undefined) {
          notifyFocusTimeUpdated();
        }
        return;
      }

      /* ── Advance to next phase ── */
      const updated = await repo.advancePhase(
        session.id,
        next.phase,
        next.cycle,
        next.durationMs,
        elapsedFocusMinutes
      );

      if (updated) {
        /* Keep running state if was running */
        if (wasRunning) {
          update((s) => ({
            ...s,
            session: updated,
            remainingMs: next.durationMs,
            isRunning: true
          }));
        } else {
          await repo.pauseFocusSession(session.id, next.durationMs);
          const paused = await repo.getFocusSession(session.id);
          update((s) => ({
            ...s,
            session: paused,
            remainingMs: next.durationMs,
            isRunning: false
          }));
        }

        /* Notify that focus time has been updated after completing a focus phase */
        if (elapsedFocusMinutes !== undefined) {
          notifyFocusTimeUpdated();
        }
      }
    },

    /**
     * Update the user's Pomodoro settings.
     *
     * Changes take effect on the *next* session — they do not alter
     * an in-progress session's durations.
     *
     * @param updates - Partial settings to merge.
     */
    updateSettings: async (
      updates: Partial<
        Pick<
          FocusSettings,
          | 'focus_duration'
          | 'break_duration'
          | 'long_break_duration'
          | 'cycles_before_long_break'
          | 'auto_start_breaks'
          | 'auto_start_focus'
        >
      >
    ) => {
      /* ── Snapshot current state ── */
      let state: FocusState | null = null;
      update((s) => {
        state = s;
        return s;
      });

      if (!state || !(state as FocusState).settings) return;

      const settings = (state as FocusState).settings!;
      const updated = await repo.updateFocusSettings(settings.id, updates);

      if (updated) {
        update((s) => ({ ...s, settings: updated }));
      }
    },

    /**
     * Query today's total focus time in minutes.
     *
     * @returns Minutes spent focusing today (integer).
     */
    getTodayFocusTime: async (): Promise<number> => {
      if (!currentUserId) return 0;
      return repo.getTodayFocusTime(currentUserId);
    },

    /**
     * Tear down the ticker interval and all sync listeners.
     *
     * Should be called when the focus feature is unmounted (e.g.,
     * user signs out or navigates to a non-focus section).
     */
    destroy: () => {
      stopTicker();
      if (unsubscribeSyncComplete) {
        unsubscribeSyncComplete();
        unsubscribeSyncComplete = null;
      }
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
        unsubscribeRealtime = null;
      }
    }
  };
}

/** Singleton focus-timer store consumed by the Focus page and timer widget. */
export const focusStore = createFocusStore();

/**
 * Read-only store that increments whenever logged focus minutes change.
 *
 * Components subscribe to this to know when to call
 * `focusStore.getTodayFocusTime()` for an updated total.
 */
export const focusTimeUpdated: Readable<number> = { subscribe: focusTimeUpdatedStore.subscribe };

// =============================================================================
//  BLOCK LIST STORES
// =============================================================================

// ── Block Lists Collection Store ────────────────────────────────────────────

/**
 * Factory for the **block lists** collection store.
 *
 * Block lists group websites that should be blocked during focus
 * sessions.  Each list can be independently enabled/disabled and
 * configured with active-day schedules.
 *
 * @returns A custom Svelte store with `load`, `create`, `update`, `toggle`,
 *          `delete`, `reorder`, `refresh`, and `getEnabledCount` methods.
 */
function createBlockListStore() {
  /** ID of the user whose block lists we're tracking. */
  let currentUserId: string | null = null;

  const store = createCollectionStore<BlockList>({
    load: () => (currentUserId ? repo.getBlockLists(currentUserId) : Promise.resolve([]))
  });

  return {
    ...store,

    /**
     * Load all block lists for a user from the local database.
     *
     * @param userId - The authenticated user's ID.
     */
    load: async (userId: string) => {
      currentUserId = userId;
      await store.load();
    },

    /**
     * Create a new block list and prepend it to the store.
     *
     * @param name - Display name for the block list.
     * @returns The newly created {@link BlockList}, or `undefined` if no user.
     */
    create: async (name: string) => {
      if (!currentUserId) return;
      const newList = await repo.createBlockList(name, currentUserId);
      /* Record for animation before updating store */
      remoteChangesStore.recordLocalChange(newList.id, 'block_lists', 'create');
      store.mutate((lists) => [newList, ...lists]);
      return newList;
    },

    /**
     * Partially update a block list's name, active days, or enabled state.
     *
     * @param id      - Block list ID.
     * @param updates - Partial field updates.
     * @returns The updated {@link BlockList}, or `null`.
     */
    update: async (
      id: string,
      updates: Partial<Pick<BlockList, 'name' | 'active_days' | 'is_enabled'>>
    ) => {
      const updated = await repo.updateBlockList(id, updates);
      if (updated) {
        store.mutate((lists) => lists.map((l) => (l.id === id ? updated : l)));
      }
      return updated;
    },

    /**
     * Toggle a block list's `is_enabled` flag.
     *
     * @param id - Block list ID.
     * @returns The updated {@link BlockList}, or `null`.
     */
    toggle: async (id: string) => {
      const updated = await repo.toggleBlockList(id);
      if (updated) {
        store.mutate((lists) => lists.map((l) => (l.id === id ? updated : l)));
      }
      return updated;
    },

    /**
     * Delete a block list and remove it from the store.
     *
     * @param id - Block list ID to delete.
     */
    delete: async (id: string) => {
      await repo.deleteBlockList(id);
      store.mutate((lists) => lists.filter((l) => l.id !== id));
    },

    /**
     * Move a block list to a new sort position and re-sort the store.
     *
     * @param id       - Block list ID.
     * @param newOrder - Target sort-order value.
     * @returns The updated record, or `null`.
     */
    reorder: async (id: string, newOrder: number) => {
      const updated = await repo.reorderBlockList(id, newOrder);
      if (updated) {
        store.mutate((lists) => {
          const updatedLists = lists.map((l) => (l.id === id ? updated : l));
          updatedLists.sort((a, b) => a.order - b.order);
          return updatedLists;
        });
      }
      return updated;
    },

    /**
     * Force-refresh from local DB without touching the loading flag.
     */
    refresh: async () => {
      if (currentUserId) {
        await store.refresh();
      }
    },

    /**
     * Create a derived store that emits the count of currently enabled
     * block lists.  Useful for badge / indicator UI.
     *
     * @returns A read-only {@link Readable} store of the enabled count.
     */
    getEnabledCount: (): Readable<number> => {
      return derived(
        { subscribe: store.subscribe },
        ($lists) => $lists.filter((l) => l.is_enabled).length
      );
    }
  };
}

/** Singleton block-list store consumed by the Focus settings page. */
export const blockListStore = createBlockListStore();

// =============================================================================
//  BLOCKED WEBSITES STORE (for a single block list)
// =============================================================================

// ── Blocked Websites Store ──────────────────────────────────────────────────

/**
 * Factory for the **blocked websites** store.
 *
 * Manages the list of {@link BlockedWebsite} entries belonging to a
 * single block list.  Used on the block-list detail / edit page.
 *
 * @returns A custom Svelte store with `load`, `create`, `update`, `delete`,
 *          and `clear` methods.
 */
function createBlockedWebsitesStore() {
  /** ID of the block list whose websites we're displaying. */
  let currentBlockListId: string | null = null;

  const store = createCollectionStore<BlockedWebsite>({
    load: () =>
      currentBlockListId ? repo.getBlockedWebsites(currentBlockListId) : Promise.resolve([])
  });

  return {
    ...store,

    /**
     * Load all blocked websites for a specific block list.
     *
     * @param blockListId - The parent block list's ID.
     */
    load: async (blockListId: string) => {
      currentBlockListId = blockListId;
      await store.load();
    },

    /**
     * Add a new blocked website domain to the current list.
     *
     * @param domain - The domain to block (e.g., `"twitter.com"`).
     * @returns The newly created {@link BlockedWebsite}, or `undefined`.
     */
    create: async (domain: string) => {
      if (!currentBlockListId) return;
      const newWebsite = await repo.createBlockedWebsite(currentBlockListId, domain);
      /* Record for animation before updating store */
      remoteChangesStore.recordLocalChange(newWebsite.id, 'blocked_websites', 'create');
      /* Prepend to top */
      store.mutate((websites) => [newWebsite, ...websites]);
      return newWebsite;
    },

    /**
     * Update a blocked website's domain.
     *
     * @param id     - Blocked website ID.
     * @param domain - New domain string.
     * @returns The updated {@link BlockedWebsite}, or `null`.
     */
    update: async (id: string, domain: string) => {
      const updated = await repo.updateBlockedWebsite(id, domain);
      if (updated) {
        store.mutate((websites) => websites.map((w) => (w.id === id ? updated : w)));
      }
      return updated;
    },

    /**
     * Delete a blocked website and remove it from the store.
     *
     * @param id - Blocked website ID to delete.
     */
    delete: async (id: string) => {
      await repo.deleteBlockedWebsite(id);
      store.mutate((websites) => websites.filter((w) => w.id !== id));
    },

    /**
     * Reset the store to an empty array — used when navigating away
     * from the block-list detail page.
     */
    clear: () => {
      currentBlockListId = null;
      store.set([]);
    }
  };
}

/** Singleton blocked-websites store consumed by the block-list detail page. */
export const blockedWebsitesStore = createBlockedWebsitesStore();

// =============================================================================
//  SINGLE BLOCK LIST STORE (for edit page)
// =============================================================================

// ── Single Block List Store ─────────────────────────────────────────────────

/**
 * Factory for the **single block list** detail store.
 *
 * Holds a single {@link BlockList} record for the edit page.  When
 * updates are made, also refreshes the parent {@link blockListStore}
 * so collection-level counts (e.g., enabled count) stay in sync.
 *
 * @returns A custom Svelte store with `load`, `update`, and `clear` methods.
 */
function createSingleBlockListStore() {
  const store = createDetailStore<BlockList>({
    load: repo.getBlockList
  });

  return {
    ...store,

    /**
     * Update the block list's name, active days, or enabled state.
     *
     * Also refreshes the parent {@link blockListStore} so collection-level
     * derived data (like enabled count) stays current.
     *
     * @param id      - Block list ID.
     * @param updates - Partial field updates.
     * @returns The updated {@link BlockList}, or `null`.
     */
    update: async (
      id: string,
      updates: Partial<Pick<BlockList, 'name' | 'active_days' | 'is_enabled'>>
    ) => {
      const updated = await repo.updateBlockList(id, updates);
      if (updated) {
        store.set(updated);
        /* Also refresh the main block list store so counts update */
        blockListStore.refresh();
      }
      return updated;
    }
  };
}

/** Singleton single-block-list store consumed by the block-list edit page. */
export const singleBlockListStore = createSingleBlockListStore();
