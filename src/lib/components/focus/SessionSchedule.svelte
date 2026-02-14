<script lang="ts">
  /**
   * @fileoverview Visual timeline of the Pomodoro session schedule.
   *
   * Displays a horizontal row of circular phase indicators (focus, short break,
   * long break) connected by thin lines. Each indicator shows:
   * - A short label (e.g., "F1" for Focus cycle 1, "B" for Break, "LB" for Long Break)
   * - A checkmark overlay when the phase is complete
   * - A pulsing dot beneath the currently-active phase
   *
   * The schedule is generated via `generateSchedule()` from the focus utilities
   * and reacts to changes in both the session state and the user's settings.
   */

  import type { FocusSession, FocusSettings } from '$lib/types';
  import { generateSchedule, type SchedulePhase } from '$lib/utils/focus';

  // =============================================================================
  //  Props Interface
  // =============================================================================

  interface Props {
    /** Current focus session — `null` when no session is active */
    session: FocusSession | null;
    /** User's Pomodoro configuration (durations, cycle count, etc.) */
    settings: FocusSettings | null;
  }

  let { session, settings }: Props = $props();

  // =============================================================================
  //  Derived State
  // =============================================================================

  /**
   * Builds the full schedule array from current session + settings.
   * Returns an empty array when settings are unavailable.
   * Wrapped in a closure so Svelte re-evaluates it reactively.
   */
  const schedule = $derived(() => {
    if (!settings) return [];
    return generateSchedule(session, settings);
  });

  // =============================================================================
  //  Helpers
  // =============================================================================

  /**
   * Maps a `SchedulePhase` to a compact label string.
   *
   * @param phase - The schedule phase descriptor
   * @returns Short label — "F1", "F2", ... for focus, "B" for break, "LB" for long break
   */
  function getPhaseLabel(phase: SchedulePhase): string {
    if (phase.type === 'focus') {
      return `F${phase.cycle}`;
    }
    if (phase.type === 'long_break') {
      return 'LB';
    }
    return 'B';
  }
</script>

<!-- ═══ Schedule Container ═══ -->
<div class="schedule-container">
  <h3 class="schedule-title">Session Schedule</h3>

  <!-- ═══ Phase Timeline ═══ -->
  <div class="schedule-timeline">
    {#each schedule() as phase, i (i)}
      <!-- Individual phase circle -->
      <div
        class="phase-item"
        class:focus={phase.type === 'focus'}
        class:break={phase.type === 'break' || phase.type === 'long_break'}
        class:long-break={phase.type === 'long_break'}
        class:complete={phase.isComplete}
        class:current={phase.isCurrent}
        title="{phase.durationMinutes} min"
      >
        <span class="phase-label">{getPhaseLabel(phase)}</span>

        <!-- Checkmark overlay for completed phases -->
        {#if phase.isComplete}
          <svg
            class="check-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
          >
            <polyline points="20,6 9,17 4,12" />
          </svg>
        {/if}

        <!-- Pulsing dot indicator beneath the active phase -->
        {#if phase.isCurrent}
          <span class="current-indicator"></span>
        {/if}
      </div>

      <!-- Connector line between phases (skip after last item) -->
      {#if i < schedule().length - 1}
        <div class="connector" class:complete={phase.isComplete}></div>
      {/if}
    {/each}
  </div>
</div>

<style>
  /* ═══ Container ═══ */

  .schedule-container {
    margin-top: 2rem;
    padding: 1.5rem;
    background: rgba(15, 15, 26, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-xl);
  }

  .schedule-title {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    margin: 0 0 1rem 0;
  }

  /* ═══ Timeline Layout ═══ */

  .schedule-timeline {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    flex-wrap: wrap;
    overflow-x: auto;
    padding: 0.5rem 0;
  }

  /* ═══ Phase Item (Circle) ═══ */

  .phase-item {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    font-size: 0.625rem;
    font-weight: 700;
    transition: all 0.3s var(--ease-spring);
    flex-shrink: 0;
  }

  /* Focus phase — purple tones */
  .phase-item.focus {
    background: rgba(108, 92, 231, 0.2);
    border: 2px solid rgba(108, 92, 231, 0.4);
    color: var(--color-primary-light);
  }

  /* Short break phase — green tones */
  .phase-item.break {
    background: rgba(38, 222, 129, 0.15);
    border: 2px solid rgba(38, 222, 129, 0.3);
    color: #26de81;
  }

  /* Long break phase — slightly larger circle, cyan tones */
  .phase-item.long-break {
    width: 40px;
    height: 40px;
    background: rgba(0, 212, 255, 0.15);
    border: 2px solid rgba(0, 212, 255, 0.3);
    color: #00d4ff;
  }

  /* Completed phase — stronger background fill */
  .phase-item.complete {
    background: rgba(108, 92, 231, 0.3);
    border-color: var(--color-primary);
  }

  .phase-item.complete.break {
    background: rgba(38, 222, 129, 0.3);
    border-color: #26de81;
  }

  /* Current phase — scaled up with glow */
  .phase-item.current {
    transform: scale(1.15);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .phase-item.current.break {
    box-shadow: 0 0 20px rgba(38, 222, 129, 0.5);
  }

  .phase-label {
    z-index: 1; /* keep label above the checkmark overlay */
  }

  /* ═══ Checkmark Icon ═══ */

  .check-icon {
    position: absolute;
    width: 14px;
    height: 14px;
    color: white;
    opacity: 0.8;
  }

  /* Dim the label text when checkmark is shown */
  .phase-item.complete .phase-label {
    opacity: 0.3;
  }

  /* ═══ Current Phase Indicator Dot ═══ */

  .current-indicator {
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 4px;
    background: var(--color-primary);
    border-radius: 50%;
    box-shadow: 0 0 8px var(--color-primary-glow);
  }

  .phase-item.break .current-indicator {
    background: #26de81;
    box-shadow: 0 0 8px rgba(38, 222, 129, 0.5);
  }

  /* ═══ Connector Lines ═══ */

  .connector {
    width: 16px;
    height: 2px;
    background: rgba(108, 92, 231, 0.2);
    flex-shrink: 0;
  }

  /* Solid color once the preceding phase is complete */
  .connector.complete {
    background: var(--color-primary);
  }

  /* ═══ Responsive ═══ */

  @media (max-width: 500px) {
    .schedule-timeline {
      gap: 0;
    }

    .phase-item {
      width: 32px;
      height: 32px;
      font-size: 0.5625rem;
    }

    .phase-item.long-break {
      width: 36px;
      height: 36px;
    }

    .connector {
      width: 8px;
    }
  }
</style>
