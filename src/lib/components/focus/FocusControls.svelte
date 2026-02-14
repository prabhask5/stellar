<script lang="ts">
  /**
   * @fileoverview Focus session transport controls — play, pause, stop, and skip.
   *
   * Renders a context-sensitive control bar for the Pomodoro focus timer:
   * - **No session** — shows a single "Start Focus" button
   * - **Active session** — shows stop / play-pause / skip arranged in a row,
   *   plus a phase badge indicating whether the user is in a focus or break phase
   *
   * The component also supports `stateTransition` classes that trigger CSS
   * animations for remote-sync visual feedback (e.g., when another device
   * starts or pauses the timer).
   */

  import type { FocusSession } from '$lib/types';

  // =============================================================================
  //  Props Interface
  // =============================================================================

  interface Props {
    /** Current focus session object — `null` when no session is active */
    session: FocusSession | null;
    /** Whether the timer is currently counting down */
    isRunning: boolean;
    /** Milliseconds remaining in the current phase */
    remainingMs: number;
    /** Transition state for remote-sync animations — drives CSS class bindings */
    stateTransition?: 'none' | 'starting' | 'pausing' | 'resuming' | 'stopping' | null;
    /** Callback → start a new focus session */
    onStart: () => void;
    /** Callback → pause the running timer */
    onPause: () => void;
    /** Callback → resume a paused timer */
    onResume: () => void;
    /** Callback → stop and end the entire session */
    onStop: () => void;
    /** Callback → skip to the next phase (focus → break or break → focus) */
    onSkip: () => void;
  }

  // =============================================================================
  //  Props Destructuring
  // =============================================================================

  let {
    session,
    isRunning,
    remainingMs: _remainingMs,
    stateTransition = null,
    onStart,
    onPause,
    onResume,
    onStop,
    onSkip
  }: Props = $props();

  // =============================================================================
  //  Derived State
  // =============================================================================

  /** Whether an active (non-stopped) session exists — controls which UI branch renders */
  // Can go back only in first 30 seconds of a phase
  const hasSession = $derived(!!session && session.status !== 'stopped');
</script>

<!-- ═══ Controls Container ═══ -->
<div
  class="controls"
  class:transition-starting={stateTransition === 'starting'}
  class:transition-pausing={stateTransition === 'pausing'}
  class:transition-resuming={stateTransition === 'resuming'}
  class:transition-stopping={stateTransition === 'stopping'}
>
  {#if !hasSession}
    <!-- No session — show start button -->
    <button class="control-btn primary large" onclick={onStart} aria-label="Start focus session">
      <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
        <polygon points="5,3 19,12 5,21" />
      </svg>
      <span>Start Focus</span>
    </button>
  {:else}
    <!-- ═══ Active Session Controls ═══ -->
    <div class="control-row">
      <!-- Stop button — ends the session entirely -->
      <button class="control-btn stop" onclick={onStop} aria-label="Stop session">
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <rect x="5" y="5" width="14" height="14" rx="2" />
        </svg>
      </button>

      <!-- Main play/pause toggle — swaps icon based on `isRunning` -->
      {#if isRunning}
        <button
          class="control-btn primary"
          class:remote-changed={stateTransition === 'resuming'}
          onclick={onPause}
          aria-label="Pause"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        </button>
      {:else}
        <button
          class="control-btn primary"
          class:remote-changed={stateTransition === 'pausing'}
          onclick={onResume}
          aria-label="Resume"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </button>
      {/if}

      <!-- Skip button — advances to the next phase -->
      <button class="control-btn skip" onclick={onSkip} aria-label="Skip to next phase">
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <polygon points="5,4 15,12 5,20" />
          <rect x="15" y="4" width="4" height="16" rx="1" />
        </svg>
      </button>
    </div>

    <!-- ═══ Phase Badge ═══ -->
    {#if session}
      <div class="phase-info">
        {#if session.phase === 'focus'}
          <span class="phase-badge focus">Focus</span>
        {:else if session.phase === 'break'}
          <span class="phase-badge break">Break</span>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  /* ═══ Layout ═══ */

  .controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    margin-top: 2rem;
    position: relative;
  }

  .control-row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  /* ═══ Base Button ═══ */

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border: none;
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
    background: rgba(108, 92, 231, 0.15);
    color: var(--color-text);
  }

  .control-btn:hover {
    transform: scale(1.05);
  }

  .control-btn:active {
    transform: scale(0.95);
  }

  /* ═══ Primary Button (Play / Pause) ═══ */

  .control-btn.primary {
    width: 72px;
    height: 72px;
    background: var(--gradient-primary);
    color: white;
    box-shadow: 0 4px 20px var(--color-primary-glow);
  }

  .control-btn.primary:hover {
    box-shadow: 0 6px 30px var(--color-primary-glow);
  }

  /* "Start Focus" variant — wider with text label */
  .control-btn.primary.large {
    width: auto;
    padding: 1rem 2rem;
    font-size: 1rem;
    font-weight: 600;
  }

  .control-btn.primary.large span {
    margin-left: 0.5rem;
  }

  /* ═══ Stop Button ═══ */

  .control-btn.stop {
    width: 48px;
    height: 48px;
    background: rgba(255, 107, 107, 0.15);
    color: var(--color-red);
    border: 1px solid rgba(255, 107, 107, 0.3);
  }

  .control-btn.stop:hover {
    background: rgba(255, 107, 107, 0.25);
    border-color: rgba(255, 107, 107, 0.5);
  }

  /* ═══ Skip Button ═══ */

  .control-btn.skip {
    width: 48px;
    height: 48px;
    background: rgba(108, 92, 231, 0.15);
    color: var(--color-primary-light);
    border: 1px solid rgba(108, 92, 231, 0.3);
  }

  .control-btn.skip:hover {
    background: rgba(108, 92, 231, 0.25);
    border-color: rgba(108, 92, 231, 0.5);
  }

  /* ═══ Phase Badge ═══ */

  .phase-info {
    margin-top: 0.5rem;
  }

  .phase-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-radius: var(--radius-full);
  }

  .phase-badge.focus {
    background: rgba(108, 92, 231, 0.2);
    color: var(--color-primary-light);
  }

  .phase-badge.break {
    background: rgba(38, 222, 129, 0.2);
    color: #26de81;
  }

  /* ═══ Responsive ═══ */

  @media (max-width: 400px) {
    .control-btn.primary {
      width: 64px;
      height: 64px;
    }

    .control-btn.primary.large {
      padding: 0.875rem 1.5rem;
    }

    .control-btn.stop,
    .control-btn.skip {
      width: 44px;
      height: 44px;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     REMOTE SYNC TRANSITION ANIMATIONS
     ═══════════════════════════════════════════════════════════════════════════════ */

  /* Button pop — plays when a remote device changes state (e.g., pause → resume) */
  .control-btn.primary.remote-changed {
    animation: buttonPop 0.5s var(--ease-spring);
  }

  @keyframes buttonPop {
    0% {
      transform: scale(0.9);
      opacity: 0.7;
    }
    50% {
      transform: scale(1.1);
      box-shadow: 0 8px 40px var(--color-primary-glow);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  /* Starting transition — controls fade in from below */
  .controls.transition-starting {
    animation: controlsFadeIn 0.5s var(--ease-out);
  }

  @keyframes controlsFadeIn {
    0% {
      opacity: 0;
      transform: translateY(10px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Pausing transition — primary button color pulse */
  .controls.transition-pausing .control-btn.primary {
    animation: pausePulse 0.5s var(--ease-out);
  }

  @keyframes pausePulse {
    0% {
      background: var(--gradient-primary);
    }
    50% {
      background: linear-gradient(135deg, rgba(108, 92, 231, 0.4) 0%, rgba(108, 92, 231, 0.2) 100%);
      box-shadow: 0 0 20px var(--color-primary-glow);
    }
    100% {
      background: var(--gradient-primary);
    }
  }

  /* Resuming transition — energize bounce on primary button */
  .controls.transition-resuming .control-btn.primary {
    animation: resumeEnergize 0.5s var(--ease-spring);
  }

  @keyframes resumeEnergize {
    0% {
      transform: scale(1);
      box-shadow: 0 4px 20px var(--color-primary-glow);
    }
    50% {
      transform: scale(1.15);
      box-shadow: 0 8px 50px var(--color-primary-glow);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 4px 20px var(--color-primary-glow);
    }
  }

  /* Stopping transition — brief scale-down fade then recover */
  .controls.transition-stopping {
    animation: controlsTransition 0.5s var(--ease-out);
  }

  @keyframes controlsTransition {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
      transform: scale(0.95);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* Shimmer glow — radial burst behind controls on start / resume */
  .controls.transition-starting::after,
  .controls.transition-resuming::after {
    content: '';
    position: absolute;
    inset: -20px;
    border-radius: 50%;
    background: radial-gradient(circle at center, rgba(108, 92, 231, 0.2) 0%, transparent 70%);
    animation: controlsGlow 0.6s var(--ease-out);
    pointer-events: none;
  }

  @keyframes controlsGlow {
    0% {
      opacity: 0;
      transform: scale(0.8);
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: scale(1.5);
    }
  }
</style>
