/**
 * @fileoverview Reactive data stores for the Stellar application.
 *
 * This module implements the **local-first** data layer — every store reads
 * from the local SQLite database (via the sync engine) and writes go to
 * local DB immediately through {@link repo repositories}.  Background sync
 * pushes changes to the server; when sync completes the stores auto-refresh
 * so the UI always reflects the latest data.
 *
 * The file is organized into feature-specific sections:
 *
 * 1. **Goal Stores** — goal lists, single goal list with nested goals
 * 2. **Routine Stores** — daily routines, single routine detail, daily
 *    progress tracking, and month-level calendar progress
 * 3. **Task Stores** — task categories, commitments, daily tasks, and
 *    long-term agenda items
 * 4. **Project Stores** — projects with joined goal-list progress, tags,
 *    and combined completion metrics
 *
 * Each store follows a consistent factory pattern:
 * - `createXxxStore()` → closure that returns `{ subscribe, loading, load, … }`
 * - An exported `const xxxStore` singleton consumed by Svelte components
 * - A `loading` sub-store for skeleton / spinner UI
 * - An `onSyncComplete` listener that auto-refreshes from local DB
 *
 * @module stores/data
 */

import { writable, type Writable } from 'svelte/store';
import type {
  GoalListWithProgress,
  Goal,
  GoalList,
  DailyRoutineGoal,
  DailyGoalProgress,
  DayProgress,
  TaskCategory,
  Commitment,
  CommitmentSection,
  DailyTask,
  LongTermTask,
  LongTermTaskWithCategory,
  AgendaItemType,
  ProjectWithDetails
} from '$lib/types';
import { engineGetAll } from '@prabhask5/stellar-engine/data';
import * as repo from '$lib/db/repositories';
import * as queries from '$lib/db/queries';
import { calculateGoalProgressCapped } from '$lib/utils/colors';
import { isRoutineActiveOnDate, getProgressiveTargetForDate } from '$lib/utils/dates';
import { browser } from '$app/environment';
import { onSyncComplete, remoteChangesStore } from '@prabhask5/stellar-engine/stores';

// =============================================================================
//  LOCAL-FIRST STORES — ARCHITECTURE OVERVIEW
// =============================================================================
//
// All reads come from local DB via sync engine functions.
// Writes go to local DB immediately via repositories.
// Background sync updates local, stores can refresh from local.
// =============================================================================

// =============================================================================
//  GOAL STORES
// =============================================================================

// ── Goal Lists Store ────────────────────────────────────────────────────────

/**
 * Factory for the **goal lists** store.
 *
 * Manages the top-level collection of goal lists, each enriched with
 * aggregate progress data (`totalGoals`, `completedGoals`,
 * `completionPercentage`).  Supports CRUD, reorder, and sync-driven
 * auto-refresh.
 *
 * @returns A custom Svelte store with `load`, `create`, `update`, `delete`,
 *          `reorder`, and `refresh` methods.
 */
function createGoalListsStore() {
  const { subscribe, set, update }: Writable<GoalListWithProgress[]> = writable([]);

  /** Whether the initial load is still in flight. */
  const loading = writable(true);

  /** Teardown handle for the `onSyncComplete` listener. */
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,

    /** Expose `loading` as a read-only subscribable. */
    loading: { subscribe: loading.subscribe },

    /**
     * Load all goal lists from the local database and register for
     * sync-driven auto-refresh.
     */
    load: async () => {
      loading.set(true);
      try {
        /* ── Read from local DB ── */
        const lists = await queries.getGoalLists();
        set(lists);

        /* ── Register sync listener (once) ── */
        if (browser && !unsubscribe) {
          unsubscribe = onSyncComplete(async () => {
            const refreshed = await queries.getGoalLists();
            set(refreshed);
          });
        }
      } finally {
        loading.set(false);
      }
    },

    /**
     * Create a new goal list and optimistically prepend it to the store.
     *
     * @param name   - Display name for the new list.
     * @param userId - Owner user ID.
     * @returns The newly created {@link GoalList}.
     */
    create: async (name: string, userId: string) => {
      /* ── Write to local DB immediately ── */
      const newList = await repo.createGoalList(name, userId);
      /* Record for animation before updating store (so element mounts with animation) */
      remoteChangesStore.recordLocalChange(newList.id, 'goal_lists', 'create');
      update((lists) => [
        { ...newList, totalGoals: 0, completedGoals: 0, completionPercentage: 0 },
        ...lists
      ]);
      return newList;
    },

    /**
     * Rename an existing goal list.
     *
     * @param id   - Goal list ID.
     * @param name - New display name.
     * @returns The updated record, or `null` if not found.
     */
    update: async (id: string, name: string) => {
      const updated = await repo.updateGoalList(id, name);
      if (updated) {
        update((lists) => lists.map((l) => (l.id === id ? { ...l, name } : l)));
      }
      return updated;
    },

    /**
     * Permanently delete a goal list and remove it from the store.
     *
     * @param id - Goal list ID to delete.
     */
    delete: async (id: string) => {
      await repo.deleteGoalList(id);
      update((lists) => lists.filter((l) => l.id !== id));
    },

    /**
     * Move a goal list to a new sort position and re-sort the store.
     *
     * @param id       - Goal list ID.
     * @param newOrder - Target sort-order value.
     * @returns The updated record, or `null` if not found.
     */
    reorder: async (id: string, newOrder: number) => {
      const updated = await repo.reorderGoalList(id, newOrder);
      if (updated) {
        update((lists) => {
          const updatedLists = lists.map((l) => (l.id === id ? { ...l, order: newOrder } : l));
          updatedLists.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          return updatedLists;
        });
      }
      return updated;
    },

    /**
     * Force-refresh from local DB without touching the loading flag.
     * Useful after external mutations (e.g., project store changes).
     */
    refresh: async () => {
      const lists = await queries.getGoalLists();
      set(lists);
    }
  };
}

/** Singleton goal-lists store consumed by UI components. */
export const goalListsStore = createGoalListsStore();

// ── Single Goal List (with nested Goals) Store ──────────────────────────────

/**
 * Factory for the **single goal list** detail store.
 *
 * Holds one {@link GoalList} together with its child {@link Goal} array.
 * Used on the goal-list detail page for managing individual goals
 * (add, update, delete, increment, reorder).
 *
 * @returns A custom Svelte store with goal-level CRUD methods.
 */
function createGoalListStore() {
  const { subscribe, set, update }: Writable<(GoalList & { goals: Goal[] }) | null> =
    writable(null);

  /** Whether the initial load is still in flight. */
  const loading = writable(true);

  /** ID of the currently loaded goal list (for sync refresh). */
  let currentId: string | null = null;

  /** Teardown handle for the `onSyncComplete` listener. */
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },

    /**
     * Load a single goal list (with goals) by ID.
     *
     * @param id - Goal list ID to fetch.
     */
    load: async (id: string) => {
      loading.set(true);
      currentId = id;
      try {
        /* ── Read from local DB ── */
        const list = await queries.getGoalList(id);
        set(list);

        /* ── Register sync listener (once) ── */
        if (browser && !unsubscribe) {
          unsubscribe = onSyncComplete(async () => {
            if (currentId) {
              const refreshed = await queries.getGoalList(currentId);
              set(refreshed);
            }
          });
        }
      } finally {
        loading.set(false);
      }
    },

    /**
     * Rename the currently loaded goal list.
     *
     * @param id   - Goal list ID.
     * @param name - New display name.
     */
    updateName: async (id: string, name: string) => {
      await repo.updateGoalList(id, name);
      update((list) => (list ? { ...list, name } : null));
    },

    /**
     * Create a new goal inside the loaded list and prepend it to the array.
     *
     * @param goalListId  - Parent list ID.
     * @param name        - Goal display name.
     * @param type        - `'completion'` | `'incremental'` | `'progressive'`.
     * @param targetValue - Numeric target (for incremental / progressive).
     * @returns The newly created {@link Goal}.
     */
    addGoal: async (
      goalListId: string,
      name: string,
      type: 'completion' | 'incremental' | 'progressive',
      targetValue: number | null
    ) => {
      const newGoal = await repo.createGoal(goalListId, name, type, targetValue);
      /* Record for animation before updating store */
      remoteChangesStore.recordLocalChange(newGoal.id, 'goals', 'create');
      /* Prepend to top (new items have lower order values) */
      update((list) => (list ? { ...list, goals: [newGoal, ...list.goals] } : null));
      return newGoal;
    },

    /**
     * Partially update a goal's properties (name, type, completed, values).
     *
     * @param goalId  - Goal ID.
     * @param updates - Partial field updates.
     * @returns The updated {@link Goal}, or `null` if not found.
     */
    updateGoal: async (
      goalId: string,
      updates: Partial<Pick<Goal, 'name' | 'type' | 'completed' | 'current_value' | 'target_value'>>
    ) => {
      const updated = await repo.updateGoal(goalId, updates);
      if (updated) {
        update((list) =>
          list
            ? {
                ...list,
                goals: list.goals.map((g) => (g.id === goalId ? updated : g))
              }
            : null
        );
      }
      return updated;
    },

    /**
     * Delete a goal and remove it from the store.
     *
     * @param goalId - Goal ID to delete.
     */
    deleteGoal: async (goalId: string) => {
      await repo.deleteGoal(goalId);
      update((list) =>
        list
          ? {
              ...list,
              goals: list.goals.filter((g) => g.id !== goalId)
            }
          : null
      );
    },

    /**
     * Increment an incremental/progressive goal's `current_value`.
     *
     * @param goalId - Goal ID.
     * @param amount - Increment delta (default `1`).
     * @returns The updated {@link Goal}, or `null`.
     */
    incrementGoal: async (goalId: string, amount: number = 1) => {
      const updated = await repo.incrementGoal(goalId, amount);
      if (updated) {
        update((list) =>
          list
            ? {
                ...list,
                goals: list.goals.map((g) => (g.id === goalId ? updated : g))
              }
            : null
        );
      }
      return updated;
    },

    /**
     * Move a goal to a new sort position within its list.
     *
     * @param goalId   - Goal ID.
     * @param newOrder - Target sort-order value.
     * @returns The updated {@link Goal}, or `null`.
     */
    reorderGoal: async (goalId: string, newOrder: number) => {
      const updated = await repo.reorderGoal(goalId, newOrder);
      if (updated) {
        update((list) => {
          if (!list) return null;
          const updatedGoals = list.goals.map((g) => (g.id === goalId ? updated : g));
          /* Re-sort by order */
          updatedGoals.sort((a, b) => a.order - b.order);
          return { ...list, goals: updatedGoals };
        });
      }
      return updated;
    },

    /**
     * Reset the store to `null` — used when navigating away from the
     * goal list detail page.
     */
    clear: () => {
      currentId = null;
      set(null);
    }
  };
}

/** Singleton single-goal-list store consumed by the detail page. */
export const goalListStore = createGoalListStore();

// =============================================================================
//  ROUTINE STORES
// =============================================================================

// ── Daily Routines Store ────────────────────────────────────────────────────

/**
 * Factory for the **daily routines** collection store.
 *
 * Manages the full list of {@link DailyRoutineGoal} records — the
 * recurring items a user tracks every day (e.g., "Meditate 10 min",
 * "Read 30 pages").  Supports CRUD, reorder, and sync-driven
 * auto-refresh.
 *
 * @returns A custom Svelte store with `load`, `create`, `update`, `delete`,
 *          `reorder`, and `refresh` methods.
 */
function createDailyRoutinesStore() {
  const { subscribe, set, update }: Writable<DailyRoutineGoal[]> = writable([]);

  /** Whether the initial load is still in flight. */
  const loading = writable(true);

  /** Teardown handle for the `onSyncComplete` listener. */
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },

    /**
     * Load all daily routine goals from the local database.
     */
    load: async () => {
      loading.set(true);
      try {
        /* ── Read from local DB ── */
        const routines = await queries.getDailyRoutineGoals();
        set(routines);

        /* ── Register sync listener (once) ── */
        if (browser && !unsubscribe) {
          unsubscribe = onSyncComplete(async () => {
            const refreshed = await queries.getDailyRoutineGoals();
            set(refreshed);
          });
        }
      } finally {
        loading.set(false);
      }
    },

    /**
     * Create a new daily routine goal with full configuration.
     *
     * Progressive routines accept additional parameters for start/end
     * target values and a progression schedule that linearly ramps the
     * daily target over the routine's lifespan.
     *
     * @param name                - Display name.
     * @param type                - `'completion'` | `'incremental'` | `'progressive'`.
     * @param targetValue         - Fixed target (for incremental).
     * @param startDate           - ISO date when the routine becomes active.
     * @param endDate             - ISO date when the routine expires (nullable).
     * @param userId              - Owner user ID.
     * @param activeDays          - Day-of-week mask (nullable → every day).
     * @param startTargetValue    - Starting target for progressive routines.
     * @param endTargetValue      - Ending target for progressive routines.
     * @param progressionSchedule - Number of days between target increases.
     * @returns The newly created {@link DailyRoutineGoal}.
     */
    create: async (
      name: string,
      type: 'completion' | 'incremental' | 'progressive',
      targetValue: number | null,
      startDate: string,
      endDate: string | null,
      userId: string,
      activeDays: DailyRoutineGoal['active_days'] = null,
      startTargetValue: number | null = null,
      endTargetValue: number | null = null,
      progressionSchedule: number | null = null
    ) => {
      const newRoutine = await repo.createDailyRoutineGoal(
        name,
        type,
        targetValue,
        startDate,
        endDate,
        userId,
        activeDays,
        startTargetValue,
        endTargetValue,
        progressionSchedule
      );
      /* Record for animation before updating store */
      remoteChangesStore.recordLocalChange(newRoutine.id, 'daily_routine_goals', 'create');
      update((routines) => [newRoutine, ...routines]);
      return newRoutine;
    },

    /**
     * Partially update a daily routine goal's configuration.
     *
     * @param id      - Routine ID.
     * @param updates - Partial field updates.
     * @returns The updated {@link DailyRoutineGoal}, or `null`.
     */
    update: async (
      id: string,
      updates: Partial<
        Pick<
          DailyRoutineGoal,
          | 'name'
          | 'type'
          | 'target_value'
          | 'start_date'
          | 'end_date'
          | 'active_days'
          | 'start_target_value'
          | 'end_target_value'
          | 'progression_schedule'
        >
      >
    ) => {
      const updated = await repo.updateDailyRoutineGoal(id, updates);
      if (updated) {
        update((routines) => routines.map((r) => (r.id === id ? updated : r)));
      }
      return updated;
    },

    /**
     * Delete a daily routine goal and remove it from the store.
     *
     * @param id - Routine ID to delete.
     */
    delete: async (id: string) => {
      await repo.deleteDailyRoutineGoal(id);
      update((routines) => routines.filter((r) => r.id !== id));
    },

    /**
     * Move a routine to a new sort position and re-sort the store.
     *
     * @param id       - Routine ID.
     * @param newOrder - Target sort-order value.
     * @returns The updated record, or `null`.
     */
    reorder: async (id: string, newOrder: number) => {
      const updated = await repo.reorderDailyRoutineGoal(id, newOrder);
      if (updated) {
        update((routines) => {
          const updatedRoutines = routines.map((r) => (r.id === id ? updated : r));
          /* Re-sort by order */
          updatedRoutines.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          return updatedRoutines;
        });
      }
      return updated;
    },

    /**
     * Force-refresh from local DB without touching the loading flag.
     */
    refresh: async () => {
      const routines = await queries.getDailyRoutineGoals();
      set(routines);
    }
  };
}

/** Singleton daily-routines store consumed by UI components. */
export const dailyRoutinesStore = createDailyRoutinesStore();

// ── Single Routine Store ────────────────────────────────────────────────────

/**
 * Factory for the **single routine** detail store.
 *
 * Holds a single {@link DailyRoutineGoal} for the routine edit / detail
 * page.  Supports loading by ID, partial updates, and clearing.
 *
 * @returns A custom Svelte store with `load`, `update`, and `clear` methods.
 */
function createRoutineStore() {
  const { subscribe, set }: Writable<DailyRoutineGoal | null> = writable(null);

  /** Whether the initial load is still in flight. */
  const loading = writable(true);

  /** ID of the currently loaded routine (for sync refresh). */
  let currentId: string | null = null;

  /** Teardown handle for the `onSyncComplete` listener. */
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },

    /**
     * Load a single daily routine goal by ID.
     *
     * @param id - Routine ID to fetch.
     */
    load: async (id: string) => {
      loading.set(true);
      currentId = id;
      try {
        /* ── Read from local DB ── */
        const routine = await queries.getDailyRoutineGoal(id);
        set(routine);

        /* ── Register sync listener (once) ── */
        if (browser && !unsubscribe) {
          unsubscribe = onSyncComplete(async () => {
            if (currentId) {
              const refreshed = await queries.getDailyRoutineGoal(currentId);
              set(refreshed);
            }
          });
        }
      } finally {
        loading.set(false);
      }
    },

    /**
     * Partially update the currently loaded routine's configuration.
     *
     * @param id      - Routine ID.
     * @param updates - Partial field updates.
     * @returns The updated {@link DailyRoutineGoal}, or `null`.
     */
    update: async (
      id: string,
      updates: Partial<
        Pick<
          DailyRoutineGoal,
          | 'name'
          | 'type'
          | 'target_value'
          | 'start_date'
          | 'end_date'
          | 'active_days'
          | 'start_target_value'
          | 'end_target_value'
          | 'progression_schedule'
        >
      >
    ) => {
      const updated = await repo.updateDailyRoutineGoal(id, updates);
      if (updated) {
        set(updated);
      }
      return updated;
    },

    /**
     * Reset the store to `null` — used when navigating away.
     */
    clear: () => {
      currentId = null;
      set(null);
    }
  };
}

/** Singleton single-routine store consumed by the routine detail page. */
export const routineStore = createRoutineStore();

// ── Daily Progress Store ────────────────────────────────────────────────────

/**
 * Shape of the daily progress store's value.
 *
 * Combines the active routines for a date with their corresponding
 * {@link DailyGoalProgress} records keyed by routine ID.
 */
interface DailyProgressState {
  /** ISO date string (e.g., `"2025-03-15"`). */
  date: string;

  /** Routines active on this date (filtered by date range + active days). */
  routines: DailyRoutineGoal[];

  /** Progress records keyed by `daily_routine_goal_id`. */
  progress: Map<string, DailyGoalProgress>;
}

/**
 * Factory for the **daily progress** store.
 *
 * Tracks a user's progress on their routines for a specific date.
 * Provides methods to toggle completion, increment counts, and set
 * arbitrary values.  Used on the "Today" / daily tracking page.
 *
 * @returns A custom Svelte store with `load`, `toggleComplete`, `increment`,
 *          `setValue`, and `clear` methods.
 */
function createDailyProgressStore() {
  const { subscribe, set, update }: Writable<DailyProgressState | null> = writable(null);

  /** Whether the initial load is still in flight. */
  const loading = writable(true);

  /** ISO date of the currently loaded day (for sync refresh). */
  let currentDate: string | null = null;

  /** Teardown handle for the `onSyncComplete` listener. */
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },

    /**
     * Load routines and progress for a specific date.
     *
     * Fetches active routines and their progress records in parallel,
     * then builds a `Map<routineId, progress>` for O(1) lookups.
     *
     * @param date - ISO date string to load progress for.
     */
    load: async (date: string) => {
      loading.set(true);
      currentDate = date;
      try {
        /* ── Parallel fetch: routines + progress ── */
        const [routines, progressList] = await Promise.all([
          queries.getActiveRoutinesForDate(date),
          queries.getDailyProgress(date)
        ]);

        /* ── Build progress lookup map ── */
        const progressMap = new Map<string, DailyGoalProgress>();
        for (const p of progressList) {
          progressMap.set(p.daily_routine_goal_id, p);
        }

        set({ date, routines, progress: progressMap });

        /* ── Register sync listener (once) ── */
        if (browser && !unsubscribe) {
          unsubscribe = onSyncComplete(async () => {
            if (currentDate) {
              const [r, p] = await Promise.all([
                queries.getActiveRoutinesForDate(currentDate),
                queries.getDailyProgress(currentDate)
              ]);
              const pMap = new Map<string, DailyGoalProgress>();
              for (const prog of p) {
                pMap.set(prog.daily_routine_goal_id, prog);
              }
              set({ date: currentDate, routines: r, progress: pMap });
            }
          });
        }
      } finally {
        loading.set(false);
      }
    },

    /**
     * Toggle the `completed` flag on a routine's daily progress.
     *
     * For `'completion'`-type routines this is the primary interaction.
     * For `'incremental'`/`'progressive'` routines it provides a manual
     * override.
     *
     * @param routineId - Daily routine goal ID.
     * @param date      - ISO date string.
     */
    toggleComplete: async (routineId: string, date: string) => {
      /* ── Snapshot current state ── */
      let state: DailyProgressState | null = null;
      update((s) => {
        state = s;
        return s;
      });

      if (!state) return;
      const current = (state as DailyProgressState).progress.get(routineId);
      const newCompleted = !current?.completed;

      const updated = await repo.upsertDailyProgress(
        routineId,
        date,
        current?.current_value || 0,
        newCompleted
      );

      /* ── Optimistic store update ── */
      update((s) => {
        if (!s) return s;
        const newProgress = new Map(s.progress);
        newProgress.set(routineId, updated);
        return { ...s, progress: newProgress };
      });
    },

    /**
     * Increment the `current_value` of a routine's daily progress.
     *
     * Delegates to {@link repo.incrementDailyProgress} which handles
     * upsert logic and auto-completion when the target is met.
     *
     * @param routineId   - Daily routine goal ID.
     * @param date        - ISO date string.
     * @param targetValue - The routine's target (for auto-complete check).
     * @param amount      - Increment delta (default `1`).
     */
    increment: async (routineId: string, date: string, targetValue: number, amount: number = 1) => {
      /* ── Snapshot current state ── */
      let state: DailyProgressState | null = null;
      update((s) => {
        state = s;
        return s;
      });

      if (!state) return;

      const updated = await repo.incrementDailyProgress(routineId, date, targetValue, amount);

      /* ── Optimistic store update ── */
      update((s) => {
        if (!s) return s;
        const newProgress = new Map(s.progress);
        newProgress.set(routineId, updated);
        return { ...s, progress: newProgress };
      });
    },

    /**
     * Set the `current_value` of a routine's daily progress to an
     * arbitrary non-negative number.
     *
     * Values are clamped to `>= 0` but **may exceed** the target (no
     * upper cap) — this allows "over-achievement" tracking.  The
     * `completed` flag is automatically set when `value >= targetValue`.
     *
     * @param routineId   - Daily routine goal ID.
     * @param date        - ISO date string.
     * @param targetValue - The routine's target (for auto-complete).
     * @param value       - Absolute value to set.
     */
    setValue: async (routineId: string, date: string, targetValue: number, value: number) => {
      /* ── Snapshot current state ── */
      let state: DailyProgressState | null = null;
      update((s) => {
        state = s;
        return s;
      });

      if (!state) return;

      /* Only prevent negative — allow overflow above target */
      const clamped = Math.max(0, value);
      const completed = clamped >= targetValue;

      const updated = await repo.upsertDailyProgress(routineId, date, clamped, completed);

      /* ── Optimistic store update ── */
      update((s) => {
        if (!s) return s;
        const newProgress = new Map(s.progress);
        newProgress.set(routineId, updated);
        return { ...s, progress: newProgress };
      });
    },

    /**
     * Reset the store to `null` — used when navigating away.
     */
    clear: () => {
      currentDate = null;
      set(null);
    }
  };
}

/** Singleton daily-progress store consumed by the Today page. */
export const dailyProgressStore = createDailyProgressStore();

// ── Month Progress Store (Calendar View) ────────────────────────────────────

/**
 * Shape of the month progress store's value.
 *
 * Provides per-day completion data for the routine calendar heatmap.
 */
interface MonthProgressState {
  /** Calendar year (e.g., `2025`). */
  year: number;

  /** Calendar month, 1-indexed (1 = January). */
  month: number;

  /** Per-day progress summaries keyed by ISO date string. */
  dayProgress: Map<string, DayProgress>;
}

/**
 * Factory for the **month progress** store.
 *
 * Computes per-day routine completion percentages for an entire month,
 * used by the calendar heatmap view.  The heavy lifting happens in
 * `loadMonthData` which:
 *
 * 1. Fetches all routines + month's progress records in parallel
 * 2. Groups progress by date
 * 3. For each day, filters active routines (date range + day-of-week)
 * 4. Calculates completion % per routine, averages across the day
 *
 * @returns A custom Svelte store with `load` and `clear` methods.
 */
function createMonthProgressStore() {
  const { subscribe, set }: Writable<MonthProgressState | null> = writable(null);

  /** Whether the initial load is still in flight. */
  const loading = writable(true);

  /** Currently displayed year (for sync refresh). */
  let currentYear: number | null = null;

  /** Currently displayed month (for sync refresh). */
  let currentMonth: number | null = null;

  /** Teardown handle for the `onSyncComplete` listener. */
  let unsubscribe: (() => void) | null = null;

  /**
   * Internal helper — fetches routines + progress and computes per-day
   * completion for the given month.
   *
   * @param year  - Calendar year.
   * @param month - Calendar month (1-indexed).
   * @returns Fully computed {@link MonthProgressState}.
   */
  async function loadMonthData(year: number, month: number): Promise<MonthProgressState> {
    /* ── Parallel fetch: all routines + month progress ── */
    const [routines, progressList] = await Promise.all([
      queries.getDailyRoutineGoals(),
      queries.getMonthProgress(year, month)
    ]);

    /* ── Group progress records by date ── */
    const progressByDate = new Map<string, DailyGoalProgress[]>();
    for (const p of progressList) {
      const list = progressByDate.get(p.date) || [];
      list.push(p);
      progressByDate.set(p.date, list);
    }

    /* ── Calculate per-day completion ── */
    const dayProgress = new Map<string, DayProgress>();
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      /* Get active routines for this date (checks both date range AND active days) */
      const activeRoutines = routines.filter((r) => isRoutineActiveOnDate(r, dateStr));

      if (activeRoutines.length === 0) continue;

      const dayProgressList = progressByDate.get(dateStr) || [];
      const progressMap = new Map<string, DailyGoalProgress>();
      for (const p of dayProgressList) {
        progressMap.set(p.daily_routine_goal_id, p);
      }

      let completedProgress = 0;
      let completedGoals = 0;

      for (const routine of activeRoutines) {
        const progress = progressMap.get(routine.id);
        const currentValue = progress?.current_value || 0;
        const isCompleted = progress?.completed || false;

        /* For progressive routines, compute the dynamic target for this date */
        const effectiveTarget =
          routine.type === 'progressive'
            ? getProgressiveTargetForDate(routine, dateStr)
            : routine.target_value;

        const progressPercent = calculateGoalProgressCapped(
          routine.type,
          isCompleted,
          currentValue,
          effectiveTarget
        );
        completedProgress += progressPercent;

        if (routine.type === 'completion' ? isCompleted : currentValue >= (effectiveTarget || 0)) {
          completedGoals++;
        }
      }

      dayProgress.set(dateStr, {
        date: dateStr,
        totalGoals: activeRoutines.length,
        completedGoals,
        completionPercentage: Math.round(completedProgress / activeRoutines.length)
      });
    }

    return { year, month, dayProgress };
  }

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },

    /**
     * Load (or reload) per-day routine progress for a given month.
     *
     * @param year  - Calendar year.
     * @param month - Calendar month (1-indexed).
     */
    load: async (year: number, month: number) => {
      loading.set(true);
      currentYear = year;
      currentMonth = month;
      try {
        const state = await loadMonthData(year, month);
        set(state);

        /* ── Register sync listener (once) ── */
        if (browser && !unsubscribe) {
          unsubscribe = onSyncComplete(async () => {
            if (currentYear !== null && currentMonth !== null) {
              const refreshed = await loadMonthData(currentYear, currentMonth);
              set(refreshed);
            }
          });
        }
      } finally {
        loading.set(false);
      }
    },

    /**
     * Reset the store to `null` — used when navigating away from
     * the calendar view.
     */
    clear: () => {
      currentYear = null;
      currentMonth = null;
      set(null);
    }
  };
}

/** Singleton month-progress store consumed by the calendar heatmap. */
export const monthProgressStore = createMonthProgressStore();

// =============================================================================
//  TASK STORES
// =============================================================================

// ── Task Categories Store ───────────────────────────────────────────────────

/**
 * Factory for the **task categories** store.
 *
 * Task categories are colored labels (tags) that can be assigned to
 * long-term tasks and linked to projects.  This store manages the
 * full collection with CRUD and reorder support.
 *
 * @returns A custom Svelte store with `load`, `create`, `update`, `delete`,
 *          `reorder`, and `refresh` methods.
 */
function createTaskCategoriesStore() {
  const { subscribe, set, update }: Writable<TaskCategory[]> = writable([]);

  /** Whether the initial load is still in flight. */
  const loading = writable(true);

  /** Teardown handle for the `onSyncComplete` listener. */
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },

    /**
     * Load all task categories from the local database.
     */
    load: async () => {
      loading.set(true);
      try {
        const categories = await queries.getTaskCategories();
        set(categories);

        if (browser && !unsubscribe) {
          unsubscribe = onSyncComplete(async () => {
            const refreshed = await queries.getTaskCategories();
            set(refreshed);
          });
        }
      } finally {
        loading.set(false);
      }
    },

    /**
     * Create a new task category.
     *
     * @param name   - Display name (e.g., "Work", "Health").
     * @param color  - Hex color string (e.g., `"#3b82f6"`).
     * @param userId - Owner user ID.
     * @returns The newly created {@link TaskCategory}.
     */
    create: async (name: string, color: string, userId: string) => {
      const newCategory = await repo.createTaskCategory(name, color, userId);
      /* Record for animation before updating store */
      remoteChangesStore.recordLocalChange(newCategory.id, 'task_categories', 'create');
      update((categories) => [newCategory, ...categories]);
      return newCategory;
    },

    /**
     * Partially update a task category's name or color.
     *
     * @param id      - Category ID.
     * @param updates - Partial field updates.
     * @returns The updated {@link TaskCategory}, or `null`.
     */
    update: async (id: string, updates: Partial<Pick<TaskCategory, 'name' | 'color'>>) => {
      const updated = await repo.updateTaskCategory(id, updates);
      if (updated) {
        update((categories) => categories.map((c) => (c.id === id ? updated : c)));
      }
      return updated;
    },

    /**
     * Delete a task category and remove it from the store.
     *
     * @param id - Category ID to delete.
     */
    delete: async (id: string) => {
      await repo.deleteTaskCategory(id);
      update((categories) => categories.filter((c) => c.id !== id));
    },

    /**
     * Move a category to a new sort position and re-sort the store.
     *
     * @param id       - Category ID.
     * @param newOrder - Target sort-order value.
     * @returns The updated record, or `null`.
     */
    reorder: async (id: string, newOrder: number) => {
      const updated = await repo.reorderTaskCategory(id, newOrder);
      if (updated) {
        update((categories) => {
          const updatedCategories = categories.map((c) => (c.id === id ? updated : c));
          updatedCategories.sort((a, b) => a.order - b.order);
          return updatedCategories;
        });
      }
      return updated;
    },

    /**
     * Force-refresh from local DB without touching the loading flag.
     */
    refresh: async () => {
      const categories = await queries.getTaskCategories();
      set(categories);
    }
  };
}

/** Singleton task-categories store consumed by UI components. */
export const taskCategoriesStore = createTaskCategoriesStore();

// ── Commitments Store ───────────────────────────────────────────────────────

/**
 * Factory for the **commitments** store.
 *
 * Commitments are high-level pledges grouped into sections (e.g.,
 * "Personal", "Work").  They live alongside projects and provide
 * a "promise to self" anchor for related tasks and goals.
 *
 * @returns A custom Svelte store with `load`, `create`, `update`, `delete`,
 *          `reorder`, and `refresh` methods.
 */
function createCommitmentsStore() {
  const { subscribe, set, update }: Writable<Commitment[]> = writable([]);

  /** Whether the initial load is still in flight. */
  const loading = writable(true);

  /** Teardown handle for the `onSyncComplete` listener. */
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },

    /**
     * Load all commitments from the local database.
     */
    load: async () => {
      loading.set(true);
      try {
        const commitments = await queries.getCommitments();
        set(commitments);

        if (browser && !unsubscribe) {
          unsubscribe = onSyncComplete(async () => {
            const refreshed = await queries.getCommitments();
            set(refreshed);
          });
        }
      } finally {
        loading.set(false);
      }
    },

    /**
     * Create a new commitment in a given section.
     *
     * @param name    - Commitment text.
     * @param section - Section grouping (e.g., `'personal'`).
     * @param userId  - Owner user ID.
     * @returns The newly created {@link Commitment}.
     */
    create: async (name: string, section: CommitmentSection, userId: string) => {
      const newCommitment = await repo.createCommitment(name, section, userId);
      /* Record for animation before updating store */
      remoteChangesStore.recordLocalChange(newCommitment.id, 'commitments', 'create');
      update((commitments) => [newCommitment, ...commitments]);
      return newCommitment;
    },

    /**
     * Partially update a commitment's name or section.
     *
     * @param id      - Commitment ID.
     * @param updates - Partial field updates.
     * @returns The updated {@link Commitment}, or `null`.
     */
    update: async (id: string, updates: Partial<Pick<Commitment, 'name' | 'section'>>) => {
      const updated = await repo.updateCommitment(id, updates);
      if (updated) {
        update((commitments) => commitments.map((c) => (c.id === id ? updated : c)));
      }
      return updated;
    },

    /**
     * Delete a commitment and remove it from the store.
     *
     * @param id - Commitment ID to delete.
     */
    delete: async (id: string) => {
      await repo.deleteCommitment(id);
      update((commitments) => commitments.filter((c) => c.id !== id));
    },

    /**
     * Move a commitment to a new sort position and re-sort the store.
     *
     * @param id       - Commitment ID.
     * @param newOrder - Target sort-order value.
     * @returns The updated record, or `null`.
     */
    reorder: async (id: string, newOrder: number) => {
      const updated = await repo.reorderCommitment(id, newOrder);
      if (updated) {
        update((commitments) => {
          const updatedCommitments = commitments.map((c) => (c.id === id ? updated : c));
          updatedCommitments.sort((a, b) => a.order - b.order);
          return updatedCommitments;
        });
      }
      return updated;
    },

    /**
     * Force-refresh from local DB without touching the loading flag.
     */
    refresh: async () => {
      const commitments = await queries.getCommitments();
      set(commitments);
    }
  };
}

/** Singleton commitments store consumed by UI components. */
export const commitmentsStore = createCommitmentsStore();

// ── Daily Tasks Store ───────────────────────────────────────────────────────

/**
 * Factory for the **daily tasks** store.
 *
 * Daily tasks are one-off to-do items for today.  They may be
 * **standalone** (user-created) or **spawned** from a long-term task
 * whose due date has arrived — in the latter case the two items share
 * a bi-directional completion link via `long_term_task_id`.
 *
 * Key behaviours:
 * - Toggling a spawned daily task → also toggles its parent long-term task
 * - Deleting a spawned daily task → also deletes the parent long-term task
 * - Clearing completed tasks → refreshes the long-term store if any
 *   spawned tasks were among those cleared
 *
 * @returns A custom Svelte store with `load`, `create`, `update`, `toggle`,
 *          `delete`, `reorder`, `clearCompleted`, and `refresh` methods.
 */
function createDailyTasksStore() {
  const { subscribe, set, update }: Writable<DailyTask[]> = writable([]);

  /** Whether the initial load is still in flight. */
  const loading = writable(true);

  /** Teardown handle for the `onSyncComplete` listener. */
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },

    /**
     * Load all daily tasks from the local database.
     */
    load: async () => {
      loading.set(true);
      try {
        const tasks = await queries.getDailyTasks();
        set(tasks);

        if (browser && !unsubscribe) {
          unsubscribe = onSyncComplete(async () => {
            const refreshed = await queries.getDailyTasks();
            set(refreshed);
          });
        }
      } finally {
        loading.set(false);
      }
    },

    /**
     * Create a new standalone daily task.
     *
     * @param name   - Task description.
     * @param userId - Owner user ID.
     * @returns The newly created {@link DailyTask}.
     */
    create: async (name: string, userId: string) => {
      const newTask = await repo.createDailyTask(name, userId);
      /* Record for animation before updating store */
      remoteChangesStore.recordLocalChange(newTask.id, 'daily_tasks', 'create');
      /* Prepend to top (new items have lower order values) */
      update((tasks) => [newTask, ...tasks]);
      return newTask;
    },

    /**
     * Partially update a daily task's name or completed status.
     *
     * @param id      - Task ID.
     * @param updates - Partial field updates.
     * @returns The updated {@link DailyTask}, or `null`.
     */
    update: async (id: string, updates: Partial<Pick<DailyTask, 'name' | 'completed'>>) => {
      const updated = await repo.updateDailyTask(id, updates);
      if (updated) {
        update((tasks) => tasks.map((t) => (t.id === id ? updated : t)));
      }
      return updated;
    },

    /**
     * Toggle a daily task's `completed` flag.
     *
     * Preserves the runtime `category` field (which comes from a JOIN
     * and is not returned by the raw repo toggle).  If the task is
     * **spawned** from a long-term task, also refreshes
     * {@link longTermTasksStore} to reflect bi-directional completion.
     *
     * @param id - Task ID.
     * @returns The updated {@link DailyTask}, or `null`.
     */
    toggle: async (id: string) => {
      /* ── Preserve runtime category before toggle ── */
      let taskCategory: DailyTask['category'] | undefined;
      let wasSpawned = false;
      update((tasks) => {
        const task = tasks.find((t) => t.id === id);
        taskCategory = task?.category;
        wasSpawned = !!task?.long_term_task_id;
        return tasks;
      });
      const updated = await repo.toggleDailyTaskComplete(id);
      if (updated) {
        update((tasks) =>
          tasks.map((t) => (t.id === id ? { ...updated, category: taskCategory } : t))
        );
        /* If spawned task, refresh long-term tasks to reflect bi-directional completion */
        if (wasSpawned) {
          await longTermTasksStore.refresh();
        }
      }
      return updated;
    },

    /**
     * Delete a daily task and remove it from the store.
     *
     * If the task was **spawned** from a long-term task, the linked
     * long-term task is also deleted, so we refresh that store too.
     *
     * @param id - Task ID to delete.
     */
    delete: async (id: string) => {
      let wasSpawned = false;
      update((tasks) => {
        const task = tasks.find((t) => t.id === id);
        wasSpawned = !!task?.long_term_task_id;
        return tasks;
      });
      await repo.deleteDailyTask(id);
      update((tasks) => tasks.filter((t) => t.id !== id));
      /* If spawned task, the linked long-term task was also deleted */
      if (wasSpawned) {
        await longTermTasksStore.refresh();
      }
    },

    /**
     * Move a task to a new sort position and re-sort the store.
     *
     * @param id       - Task ID.
     * @param newOrder - Target sort-order value.
     * @returns The updated record, or `null`.
     */
    reorder: async (id: string, newOrder: number) => {
      const updated = await repo.reorderDailyTask(id, newOrder);
      if (updated) {
        update((tasks) => {
          const updatedTasks = tasks.map((t) => (t.id === id ? updated : t));
          updatedTasks.sort((a, b) => a.order - b.order);
          return updatedTasks;
        });
      }
      return updated;
    },

    /**
     * Bulk-delete all completed daily tasks for the user.
     *
     * If any completed tasks were spawned from long-term tasks, refreshes
     * {@link longTermTasksStore} afterwards.
     *
     * @param userId - Owner user ID.
     */
    clearCompleted: async (userId: string) => {
      let hadSpawned = false;
      update((tasks) => {
        hadSpawned = tasks.some((t) => t.completed && t.long_term_task_id);
        return tasks;
      });
      await repo.clearCompletedDailyTasks(userId);
      update((tasks) => tasks.filter((t) => !t.completed));
      if (hadSpawned) {
        await longTermTasksStore.refresh();
      }
    },

    /**
     * Force-refresh from local DB without touching the loading flag.
     */
    refresh: async () => {
      const tasks = await queries.getDailyTasks();
      set(tasks);
    }
  };
}

/** Singleton daily-tasks store consumed by the Today page. */
export const dailyTasksStore = createDailyTasksStore();

// ── Long-Term Tasks Store ───────────────────────────────────────────────────

/**
 * Factory for the **long-term tasks** (agenda) store.
 *
 * Long-term tasks have a `due_date` and an optional `category_id` (tag).
 * They can be of type `'task'` (completable) or `'reminder'` (display-only).
 *
 * When a task's due date is today or earlier, creating it also **spawns**
 * a linked daily task so it appears on the Today page.  Toggling and
 * deleting propagate bi-directionally between long-term and daily stores.
 *
 * @returns A custom Svelte store with `load`, `create`, `update`, `toggle`,
 *          `delete`, and `refresh` methods.
 */
function createLongTermTasksStore() {
  const { subscribe, set, update }: Writable<LongTermTaskWithCategory[]> = writable([]);

  /** Whether the initial load is still in flight. */
  const loading = writable(true);

  /** Teardown handle for the `onSyncComplete` listener. */
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },

    /**
     * Load all long-term tasks (with joined category) from the local database.
     */
    load: async () => {
      loading.set(true);
      try {
        const tasks = await queries.getLongTermTasks();
        set(tasks);

        if (browser && !unsubscribe) {
          unsubscribe = onSyncComplete(async () => {
            const refreshed = await queries.getLongTermTasks();
            set(refreshed);
          });
        }
      } finally {
        loading.set(false);
      }
    },

    /**
     * Create a new long-term task/reminder.
     *
     * If the task is a `'task'` type and due today or earlier, a linked
     * daily task is automatically spawned so it appears on the Today page.
     *
     * @param name       - Task description.
     * @param dueDate    - ISO date string for the due date.
     * @param categoryId - Optional tag / category ID.
     * @param userId     - Owner user ID.
     * @param type       - `'task'` (default) or `'reminder'`.
     * @returns The newly created {@link LongTermTask}.
     */
    create: async (
      name: string,
      dueDate: string,
      categoryId: string | null,
      userId: string,
      type: AgendaItemType = 'task'
    ) => {
      const newTask = await repo.createLongTermTask(name, dueDate, categoryId, userId, type);
      /* Record for animation before updating store */
      remoteChangesStore.recordLocalChange(newTask.id, 'long_term_agenda', 'create');
      /* Fetch the task with category for the store */
      const taskWithCategory = await queries.getLongTermTask(newTask.id);
      if (taskWithCategory) {
        update((tasks) => [...tasks, taskWithCategory]);
      }

      /* ── Auto-spawn daily task if due today or earlier ── */
      const today = new Date().toISOString().split('T')[0];
      if (dueDate <= today && type === 'task') {
        const spawnedTask = await repo.createDailyTask(name, userId, newTask.id);
        remoteChangesStore.recordLocalChange(spawnedTask.id, 'daily_tasks', 'create');
        await dailyTasksStore.refresh();
      }

      return newTask;
    },

    /**
     * Partially update a long-term task's properties.
     *
     * If `due_date` or `name` changes, daily tasks are refreshed because
     * a linked spawned task may need updating or spawning.
     *
     * @param id      - Task ID.
     * @param updates - Partial field updates.
     * @returns The updated {@link LongTermTask}, or `null`.
     */
    update: async (
      id: string,
      updates: Partial<Pick<LongTermTask, 'name' | 'due_date' | 'category_id' | 'completed'>>
    ) => {
      const updated = await repo.updateLongTermTask(id, updates);
      if (updated) {
        /* Fetch the updated task with category */
        const taskWithCategory = await queries.getLongTermTask(updated.id);
        if (taskWithCategory) {
          update((tasks) => tasks.map((t) => (t.id === id ? taskWithCategory : t)));
        }
        /* Refresh daily tasks: due_date/name change may spawn or update linked daily tasks */
        if (updates.due_date !== undefined || updates.name !== undefined) {
          await dailyTasksStore.refresh();
        }
      }
      return updated;
    },

    /**
     * Toggle a long-term task's `completed` flag.
     *
     * Reminders (`type === 'reminder'`) cannot be toggled — the method
     * returns early.  After toggling, refreshes the daily tasks store
     * to reflect bi-directional completion sync.
     *
     * @param id - Task ID.
     * @returns The updated task, or the unchanged reminder.
     */
    toggle: async (id: string) => {
      /* ── Guard: reminders can't be toggled ── */
      let currentTask: LongTermTaskWithCategory | undefined;
      update((tasks) => {
        currentTask = tasks.find((t) => t.id === id);
        return tasks;
      });
      if (currentTask?.type === 'reminder') return currentTask;

      const updated = await repo.toggleLongTermTaskComplete(id);
      if (updated) {
        const taskWithCategory = await queries.getLongTermTask(updated.id);
        if (taskWithCategory) {
          update((tasks) => tasks.map((t) => (t.id === id ? taskWithCategory : t)));
        }
        /* Refresh daily tasks to reflect bi-directional completion sync */
        await dailyTasksStore.refresh();
      }
      return updated;
    },

    /**
     * Delete a long-term task and remove it from the store.
     *
     * Also refreshes daily tasks since a linked spawned task may have
     * been cascade-deleted.
     *
     * @param id - Task ID to delete.
     */
    delete: async (id: string) => {
      await repo.deleteLongTermTask(id);
      update((tasks) => tasks.filter((t) => t.id !== id));
      /* Refresh daily tasks since a linked spawned task may have been deleted */
      await dailyTasksStore.refresh();
    },

    /**
     * Force-refresh from local DB without touching the loading flag.
     */
    refresh: async () => {
      const tasks = await queries.getLongTermTasks();
      set(tasks);
    }
  };
}

/** Singleton long-term-tasks store consumed by the agenda page. */
export const longTermTasksStore = createLongTermTasksStore();

// =============================================================================
//  PROJECT STORES
// =============================================================================

// ── Projects Store ──────────────────────────────────────────────────────────

/**
 * Factory for the **projects** store.
 *
 * Projects are the top-level organizational unit in Stellar — each project
 * optionally links to:
 * - A **goal list** (for tracking project-level goals)
 * - A **tag** / task category (for filtering long-term tasks)
 * - A **commitment** (the "why" behind the project)
 *
 * The store enriches raw project records with:
 * - `goalList` — joined {@link GoalListWithProgress}
 * - `tag` — joined {@link TaskCategory}
 * - `taskStats` — `{ totalTasks, completedTasks }` derived from tagged
 *   long-term tasks
 * - `combinedProgress` — weighted average of goal + task completion
 *
 * On first load, a **one-time migration** (`project-order-sync-v1`) syncs
 * the sort order of linked tags and commitments to match project order.
 *
 * @returns A custom Svelte store with `load`, `create`, `update`, `delete`,
 *          `setCurrent`, `clearCurrent`, `reorder`, and `refresh` methods.
 */
function createProjectsStore() {
  const { subscribe, set, update }: Writable<ProjectWithDetails[]> = writable([]);

  /** Whether the initial load is still in flight. */
  const loading = writable(true);

  /** Teardown handle for the `onSyncComplete` listener. */
  let unsubscribe: (() => void) | null = null;

  /**
   * Internal helper — fetches all projects and joins them with their
   * related goal lists, tags, task stats, and combined progress.
   *
   * The join is done in-memory by fetching all related entities in
   * parallel and mapping them onto each project.
   *
   * @returns Fully enriched {@link ProjectWithDetails} array.
   */
  async function loadProjectsWithDetails(): Promise<ProjectWithDetails[]> {
    /* ── Parallel fetch: projects + all related entities ── */
    const [projects, goalLists, categories, longTermTasks, allGoals] = await Promise.all([
      queries.getProjects(),
      queries.getGoalLists(),
      queries.getTaskCategories(),
      queries.getLongTermTasks(),
      (engineGetAll('goals') as Promise<unknown>).then((g) =>
        (g as Goal[]).filter((goal) => !goal.deleted)
      )
    ]);

    /* ── Join projects with their goal lists, tags, task stats, and combined progress ── */
    return projects.map((project) => {
      const goalList = project.goal_list_id
        ? goalLists.find((gl) => gl.id === project.goal_list_id) || null
        : null;
      const tag = project.tag_id ? categories.find((c) => c.id === project.tag_id) || null : null;

      /* ── Compute task stats for projects with a tag ── */
      let taskStats: { totalTasks: number; completedTasks: number } | null = null;
      let combinedProgress: number | undefined;

      if (project.tag_id) {
        const projectTasks = longTermTasks.filter((t) => t.category_id === project.tag_id);
        const totalTasks = projectTasks.length;
        const completedTaskCount = projectTasks.filter((t) => t.completed).length;
        taskStats = { totalTasks, completedTasks: completedTaskCount };

        /* ── Compute combined progress averaging goals + tasks evenly ── */
        const projectGoals = project.goal_list_id
          ? allGoals.filter((g) => g.goal_list_id === project.goal_list_id)
          : [];
        const totalItems = projectGoals.length + totalTasks;

        if (totalItems > 0) {
          let sum = 0;
          for (const goal of projectGoals) {
            sum += calculateGoalProgressCapped(
              goal.type,
              goal.completed,
              goal.current_value,
              goal.target_value
            );
          }
          for (const task of projectTasks) {
            sum += task.completed ? 100 : 0;
          }
          combinedProgress = Math.round(sum / totalItems);
        } else {
          combinedProgress = 0;
        }
      }

      return {
        ...project,
        goalList,
        tag,
        taskStats,
        combinedProgress
      };
    });
  }

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },

    /**
     * Load all projects with enriched details.
     *
     * On first browser load, runs a one-time migration to sync linked
     * tag/commitment sort orders to match project order.
     */
    load: async () => {
      loading.set(true);
      try {
        const projectsWithDetails = await loadProjectsWithDetails();
        set(projectsWithDetails);

        /* ── One-time migration: sync linked tag/commitment order to match project order ── */
        if (browser && !localStorage.getItem('project-order-sync-v1')) {
          const commitments = await queries.getCommitments();
          for (const project of projectsWithDetails) {
            if (project.tag_id && project.tag && project.tag.order !== project.order) {
              await repo.reorderTaskCategory(project.tag_id, project.order);
            }
            if (project.commitment_id) {
              const commitment = commitments.find((c) => c.id === project.commitment_id);
              if (commitment && commitment.order !== project.order) {
                await repo.reorderCommitment(project.commitment_id, project.order);
              }
            }
          }
          localStorage.setItem('project-order-sync-v1', '1');
        }

        if (browser && !unsubscribe) {
          unsubscribe = onSyncComplete(async () => {
            const refreshed = await loadProjectsWithDetails();
            set(refreshed);
          });
        }
      } finally {
        loading.set(false);
      }
    },

    /**
     * Create a new project and refresh the full details list.
     *
     * @param name   - Project display name.
     * @param userId - Owner user ID.
     * @returns The newly created project record.
     */
    create: async (name: string, userId: string) => {
      const newProject = await repo.createProject(name, userId);
      /* Record for animation before updating store */
      remoteChangesStore.recordLocalChange(newProject.id, 'projects', 'create');
      /* Refresh to get full details */
      const projectsWithDetails = await loadProjectsWithDetails();
      set(projectsWithDetails);
      return newProject;
    },

    /**
     * Rename a project and refresh the full details list.
     *
     * @param id   - Project ID.
     * @param name - New display name.
     * @returns The updated project record, or `null`.
     */
    update: async (id: string, name: string) => {
      const updated = await repo.updateProject(id, name);
      if (updated) {
        /* Refresh to get updated related entities */
        const projectsWithDetails = await loadProjectsWithDetails();
        set(projectsWithDetails);
      }
      return updated;
    },

    /**
     * Delete a project and remove it from the store.
     *
     * @param id - Project ID to delete.
     */
    delete: async (id: string) => {
      await repo.deleteProject(id);
      update((projects) => projects.filter((p) => p.id !== id));
    },

    /**
     * Mark a project as the "current" (active) project.
     *
     * Only one project can be current at a time — the repository
     * handles clearing the previous current project.
     *
     * @param id - Project ID to set as current.
     */
    setCurrent: async (id: string) => {
      await repo.setCurrentProject(id);
      /* Refresh to reflect is_current changes */
      const projectsWithDetails = await loadProjectsWithDetails();
      set(projectsWithDetails);
    },

    /**
     * Clear the "current" flag from all projects for a user.
     *
     * @param userId - Owner user ID.
     */
    clearCurrent: async (userId: string) => {
      await repo.clearCurrentProject(userId);
      /* Refresh to reflect is_current changes */
      const projectsWithDetails = await loadProjectsWithDetails();
      set(projectsWithDetails);
    },

    /**
     * Move a project to a new sort position.
     *
     * Also propagates the new order to linked tag and commitment so
     * they stay in sync across all views (tasks page, commitments page).
     *
     * @param id       - Project ID.
     * @param newOrder - Target sort-order value.
     * @returns The updated project record, or `null`.
     */
    reorder: async (id: string, newOrder: number) => {
      const updated = await repo.reorderProject(id, newOrder);
      if (updated) {
        /* ── Sync order to linked tag and commitment ── */
        if (updated.tag_id) {
          await repo.reorderTaskCategory(updated.tag_id, newOrder);
        }
        if (updated.commitment_id) {
          await repo.reorderCommitment(updated.commitment_id, newOrder);
        }

        update((projects) => {
          const updatedProjects = projects.map((p) =>
            p.id === id ? { ...p, order: newOrder } : p
          );
          updatedProjects.sort((a, b) => a.order - b.order);
          return updatedProjects;
        });
      }
      return updated;
    },

    /**
     * Force-refresh from local DB without touching the loading flag.
     */
    refresh: async () => {
      const projectsWithDetails = await loadProjectsWithDetails();
      set(projectsWithDetails);
    }
  };
}

/** Singleton projects store consumed by the projects page and dashboard. */
export const projectsStore = createProjectsStore();
