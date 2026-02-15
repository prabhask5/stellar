<script lang="ts">
  /**
   * @fileoverview **Focus** — Pomodoro-style focus timer page.
   *
   * Presents a circular countdown timer with start / pause / resume / stop /
   * skip controls. Supports customizable focus/break durations via a settings
   * modal. Displays today's accumulated focus time and active block-list count.
   *
   * The timer logic lives in `focusStore`; this page wires up the UI controls,
   * subscribes to store state, and manages a 30-second tick for live focus-time
   * updates while a focus phase is running.
   */

  // =============================================================================
  //                               IMPORTS
  // =============================================================================

  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { resolveUserId } from '@prabhask5/stellar-engine/auth';

  import { focusStore, blockListStore, focusTimeUpdated } from '$lib/stores/focus';
  import type { FocusSettings, FocusSession, BlockList, DayOfWeek } from '$lib/types';
  import { formatDuration } from '$lib/utils/focus';

  import FocusTimer from '$lib/components/focus/FocusTimer.svelte';
  import FocusControls from '$lib/components/focus/FocusControls.svelte';
  import SessionSchedule from '$lib/components/focus/SessionSchedule.svelte';
  import FocusSettingsModal from '$lib/components/focus/FocusSettings.svelte';
  import BlockListManager from '$lib/components/focus/BlockListManager.svelte';

  // =============================================================================
  //                         COMPONENT STATE
  // =============================================================================

  /* ── Focus store mirrors ──── */
  let settings = $state<FocusSettings | null>(null);
  let session = $state<FocusSession | null>(null);
  let remainingMs = $state(0);
  let isRunning = $state(false);
  let loading = $state(true);
  /** Describes the current UI transition animation (e.g., 'starting', 'pausing') */
  let stateTransition = $state<'none' | 'starting' | 'pausing' | 'resuming' | 'stopping' | null>(
    null
  );

  /* ── Block lists ──── */
  let blockLists = $state<BlockList[]>([]);

  /* ── UI ──── */
  let showSettings = $state(false);
  /** Accumulated focus-phase time for today, in milliseconds */
  let todayFocusTime = $state(0);

  // =============================================================================
  //                           HELPERS
  // =============================================================================

  /**
   * Extract the current user's ID — checks Supabase session first,
   * then falls back to offline profile.
   * @returns User UUID or empty string
   */
  function getUserId(): string {
    return resolveUserId($page.data.session, $page.data.offlineProfile);
  }

  // =============================================================================
  //                    STORE SUBSCRIPTIONS
  // =============================================================================

  /** Mirror focus store, block-list store, and focus-time-updated signal into local state. */
  $effect(() => {
    const unsubs = [
      focusStore.subscribe((state) => {
        settings = state.settings;
        session = state.session;
        remainingMs = state.remainingMs;
        isRunning = state.isRunning;
        stateTransition = state.stateTransition;
      }),
      focusStore.loading.subscribe((v) => (loading = v)),
      blockListStore.subscribe((v) => (blockLists = v)),
      // Refresh focus time when it's updated (e.g., after phase completion)
      focusTimeUpdated.subscribe(() => {
        loadTodayFocusTime();
      })
    ];

    return () => unsubs.forEach((u) => u());
  });

  /** Interval handle for the 30-second focus-time refresh tick */
  let focusTimeTickInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Start a 30-second tick to refresh today's focus time while a focus
   * phase is actively running. Clears the interval when the phase ends.
   */
  $effect(() => {
    const isRunningFocusPhase = session?.status === 'running' && session?.phase === 'focus';

    if (isRunningFocusPhase && !focusTimeTickInterval) {
      // Start ticking every 30 seconds
      focusTimeTickInterval = setInterval(() => {
        loadTodayFocusTime();
      }, 30000);
    } else if (!isRunningFocusPhase && focusTimeTickInterval) {
      // Stop ticking
      clearInterval(focusTimeTickInterval);
      focusTimeTickInterval = null;
    }
  });

  // =============================================================================
  //                           LIFECYCLE
  // =============================================================================

  onMount(async () => {
    const userId = getUserId();
    if (userId) {
      await focusStore.load(userId);
      await loadTodayFocusTime();
    }
  });

  /** Clean up the focus store and tick interval on component destroy. */
  onDestroy(() => {
    focusStore.destroy();
    if (focusTimeTickInterval) {
      clearInterval(focusTimeTickInterval);
      focusTimeTickInterval = null;
    }
  });

  /** Refresh today's accumulated focus time from the store. */
  async function loadTodayFocusTime() {
    todayFocusTime = await focusStore.getTodayFocusTime();
  }

  // =============================================================================
  //                     TIMER CONTROL HANDLERS
  // =============================================================================

  /** Start a new focus session. */
  function handleStart() {
    focusStore.start();
  }

  function handlePause() {
    focusStore.pause();
  }

  function handleResume() {
    focusStore.resume();
  }

  function handleStop() {
    focusStore.stop();
    loadTodayFocusTime();
  }

  function handleSkip() {
    focusStore.skip();
  }

  function handleSaveSettings(updates: Partial<FocusSettings>) {
    focusStore.updateSettings(updates);
  }

  // =============================================================================
  //                       DERIVED VALUES
  // =============================================================================

  /**
   * Check whether a block list should be active for the current day-of-week.
   * A `null` `active_days` array means "every day."
   * @param list - The block list to check
   * @returns `true` if the list is enabled and scheduled for today
   */
  function isBlockListActiveToday(list: BlockList): boolean {
    if (!list.is_enabled) return false;
    if (list.active_days === null) return true; // null means every day
    const currentDay = new Date().getDay() as DayOfWeek;
    return list.active_days.includes(currentDay);
  }

  /** Number of block lists active today — shown in the stats row */
  const enabledBlockListCount = $derived(blockLists.filter(isBlockListActiveToday).length);
  /** Human-readable today's focus time (e.g., "1h 25m") */
  const todayFocusFormatted = $derived(formatDuration(todayFocusTime));
</script>

<svelte:head>
  <title>Focus - Stellar Planner</title>
</svelte:head>

<div class="container">
  <!-- Header -->
  <header class="page-header">
    <h1 class="page-title">Focus</h1>
    <button class="settings-btn" onclick={() => (showSettings = true)} aria-label="Focus settings">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        width="20"
        height="20"
      >
        <circle cx="12" cy="12" r="3" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
        />
      </svg>
    </button>
  </header>

  {#if loading}
    <!-- Loading skeleton -->
    <div class="loading-skeleton">
      <div class="timer-skeleton">
        <div class="timer-ring-skeleton"></div>
        <div class="timer-content-skeleton">
          <div class="time-skeleton"></div>
          <div class="phase-skeleton"></div>
        </div>
      </div>
      <div class="controls-skeleton">
        <div class="btn-skeleton"></div>
      </div>
    </div>
  {:else}
    <!-- ═══ Timer + Controls ═══ -->
    <section class="timer-section" class:transitioning={stateTransition}>
      <FocusTimer {session} {settings} {remainingMs} {isRunning} {stateTransition} />

      <FocusControls
        {session}
        {isRunning}
        {remainingMs}
        {stateTransition}
        onStart={handleStart}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
        onSkip={handleSkip}
      />
    </section>

    <!-- ═══ Session Schedule (phase indicator pills) ═══ -->
    <SessionSchedule {session} {settings} />

    <!-- ═══ Stats Row — Focus time + active block lists ═══ -->
    <div class="stats-row">
      <div class="stat-card">
        <span class="stat-label">Focus Time Today</span>
        <span class="stat-value">{todayFocusFormatted}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Block Lists</span>
        <span class="stat-value">{enabledBlockListCount} active</span>
      </div>
    </div>

    <!-- ═══ Block List Manager — CRUD for website block lists ═══ -->
    <BlockListManager userId={getUserId()} />
  {/if}
</div>

<!-- ═══ Settings Modal — focus/break durations, auto-start, etc. ═══ -->
<FocusSettingsModal
  {settings}
  isOpen={showSettings}
  onClose={() => (showSettings = false)}
  onSave={handleSaveSettings}
/>

<style>
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  .page-title {
    font-size: 1.75rem;
    font-weight: 700;
    background: linear-gradient(
      135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 50%,
      var(--color-text) 100%
    );
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.02em;
  }

  .settings-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: rgba(108, 92, 231, 0.15);
    border: 1px solid rgba(108, 92, 231, 0.3);
    border-radius: var(--radius-full);
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.3s;
  }

  .settings-btn:hover {
    background: rgba(108, 92, 231, 0.25);
    border-color: rgba(108, 92, 231, 0.5);
    transform: rotate(30deg);
  }

  .timer-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem 0;
  }

  /* Stats Row */
  .stats-row {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .stat-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 1rem;
    background: rgba(15, 15, 26, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-xl);
  }

  .stat-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
  }

  .stat-value {
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-primary-light);
  }

  /* Loading skeleton */
  .loading-skeleton {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem 0;
  }

  .timer-skeleton {
    position: relative;
    width: 320px;
    height: 320px;
  }

  .timer-ring-skeleton {
    position: absolute;
    inset: 0;
    border: 8px solid rgba(108, 92, 231, 0.15);
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }

  .timer-content-skeleton {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .time-skeleton {
    width: 160px;
    height: 48px;
    background: rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    animation: pulse 2s ease-in-out infinite;
  }

  .phase-skeleton {
    width: 100px;
    height: 20px;
    background: rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-md);
    animation: pulse 2s ease-in-out infinite;
    animation-delay: 0.2s;
  }

  .controls-skeleton {
    margin-top: 2rem;
  }

  .btn-skeleton {
    width: 160px;
    height: 56px;
    background: rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-full);
    animation: pulse 2s ease-in-out infinite;
    animation-delay: 0.4s;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     MOBILE RESPONSIVE — iPhone 16 Pro Optimized
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 640px) {
    .page-header {
      margin-bottom: 1.25rem;
    }

    .page-title {
      font-size: 1.5rem;
    }

    .timer-section {
      padding: 0.75rem 0;
    }

    .stats-row {
      gap: 0.75rem;
    }

    .stat-card {
      padding: 0.875rem;
    }

    .stat-label {
      font-size: 0.6875rem;
    }

    .stat-value {
      font-size: 0.9375rem;
    }

    .timer-skeleton {
      width: 280px;
      height: 280px;
    }

    .time-skeleton {
      width: 140px;
      height: 40px;
    }
  }

  /* iPhone SE */
  @media (max-width: 375px) {
    .page-title {
      font-size: 1.375rem;
    }

    .timer-skeleton {
      width: 240px;
      height: 240px;
    }

    .stat-label {
      font-size: 0.625rem;
    }

    .stat-value {
      font-size: 0.875rem;
    }
  }

  /* iPhone 16 Pro (402px) */
  @media (min-width: 400px) and (max-width: 430px) {
    .page-title {
      font-size: 1.625rem;
    }

    .timer-skeleton {
      width: 300px;
      height: 300px;
    }

    .stat-card {
      padding: 1rem;
    }
  }

  /* iPhone Pro Max (430px+) */
  @media (min-width: 430px) and (max-width: 640px) {
    .page-title {
      font-size: 1.75rem;
    }

    .stats-row {
      flex-direction: row;
    }

    .timer-section {
      padding: 1.25rem 0;
    }
  }
</style>
