<script lang="ts">
  import type { FocusSession, FocusSettings } from '$lib/types';
  import { formatTime, calculateProgress, getPhaseText } from '$lib/utils/focus';

  interface Props {
    session: FocusSession | null;
    settings: FocusSettings | null;
    remainingMs: number;
    isRunning: boolean;
  }

  let { session, settings, remainingMs, isRunning }: Props = $props();

  // Calculate total duration for progress
  const totalMs = $derived(() => {
    if (!session || !settings) {
      return (settings?.focus_duration || 25) * 60 * 1000;
    }

    if (session.phase === 'focus') {
      return session.focus_duration * 60 * 1000;
    }

    const isLongBreak = session.current_cycle >= settings.cycles_before_long_break;
    return isLongBreak
      ? settings.long_break_duration * 60 * 1000
      : session.break_duration * 60 * 1000;
  });

  const progress = $derived(calculateProgress(remainingMs, totalMs()));
  const timeDisplay = $derived(formatTime(remainingMs));
  const isBreak = $derived(session?.phase === 'break');
  const isLongBreak = $derived(
    session?.phase === 'break' &&
    settings &&
    session.current_cycle >= settings.cycles_before_long_break
  );
  const phaseText = $derived(
    session ? getPhaseText(session.phase, isLongBreak) : 'Ready to Focus'
  );

  // SVG circle calculations
  const radius = 140;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = $derived(circumference - (progress / 100) * circumference);
</script>

<div class="timer-container">
  <!-- Background stars animation -->
  <div class="stars">
    {#each Array(20) as _, i}
      <div
        class="star"
        style:--delay="{i * 0.5}s"
        style:--x="{Math.random() * 100}%"
        style:--y="{Math.random() * 100}%"
        style:--size="{1 + Math.random() * 2}px"
      ></div>
    {/each}
  </div>

  <!-- Timer ring -->
  <svg class="timer-ring" viewBox="0 0 320 320">
    <!-- Background ring -->
    <circle
      cx="160"
      cy="160"
      r={radius}
      fill="none"
      stroke="rgba(108, 92, 231, 0.15)"
      stroke-width={strokeWidth}
    />

    <!-- Progress ring -->
    <circle
      class="progress-ring"
      class:focus={!isBreak}
      class:break={isBreak}
      class:running={isRunning}
      cx="160"
      cy="160"
      r={radius}
      fill="none"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-dasharray={circumference}
      stroke-dashoffset={strokeDashoffset}
      transform="rotate(-90 160 160)"
    />

    <!-- Glow effect -->
    {#if isRunning}
      <circle
        class="glow-ring"
        class:focus={!isBreak}
        class:break={isBreak}
        cx="160"
        cy="160"
        r={radius}
        fill="none"
        stroke-width={strokeWidth + 4}
        stroke-linecap="round"
        stroke-dasharray={circumference}
        stroke-dashoffset={strokeDashoffset}
        transform="rotate(-90 160 160)"
      />
    {/if}
  </svg>

  <!-- Timer content -->
  <div class="timer-content">
    <div class="time-display" class:running={isRunning}>
      {timeDisplay}
    </div>
    <div class="phase-text" class:break={isBreak}>
      {phaseText}
    </div>
    {#if session}
      <div class="cycle-indicator">
        Cycle {session.current_cycle} of {session.total_cycles}
      </div>
    {/if}
  </div>
</div>

<style>
  .timer-container {
    position: relative;
    width: 320px;
    height: 320px;
    margin: 0 auto;
  }

  /* Stars animation */
  .stars {
    position: absolute;
    inset: -40px;
    overflow: hidden;
    pointer-events: none;
  }

  .star {
    position: absolute;
    left: var(--x);
    top: var(--y);
    width: var(--size);
    height: var(--size);
    background: white;
    border-radius: 50%;
    opacity: 0;
    animation: twinkle 3s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  @keyframes twinkle {
    0%, 100% { opacity: 0; transform: scale(0.5); }
    50% { opacity: 0.8; transform: scale(1); }
  }

  /* Timer ring */
  .timer-ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .progress-ring {
    transition: stroke-dashoffset 0.1s linear;
  }

  .progress-ring.focus {
    stroke: url(#focusGradient);
  }

  .progress-ring.break {
    stroke: url(#breakGradient);
  }

  .progress-ring.running {
    filter: drop-shadow(0 0 8px var(--color-primary-glow));
  }

  .progress-ring.running.break {
    filter: drop-shadow(0 0 8px rgba(38, 222, 129, 0.5));
  }

  .glow-ring {
    opacity: 0.3;
    filter: blur(8px);
  }

  .glow-ring.focus {
    stroke: var(--color-primary);
  }

  .glow-ring.break {
    stroke: #26de81;
  }

  /* Timer content */
  .timer-content {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .time-display {
    font-size: 4rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    color: var(--color-text);
    transition: text-shadow 0.3s;
  }

  .time-display.running {
    text-shadow: 0 0 30px var(--color-primary-glow);
  }

  .phase-text {
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-primary-light);
    margin-top: 0.5rem;
  }

  .phase-text.break {
    color: #26de81;
  }

  .cycle-indicator {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-top: 0.5rem;
  }

  /* Responsive */
  @media (max-width: 400px) {
    .timer-container {
      width: 280px;
      height: 280px;
    }

    .time-display {
      font-size: 3rem;
    }
  }
</style>

<!-- SVG gradient definitions (hidden) -->
<svg width="0" height="0" style="position: absolute;">
  <defs>
    <linearGradient id="focusGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6c5ce7"/>
      <stop offset="100%" stop-color="#ff79c6"/>
    </linearGradient>
    <linearGradient id="breakGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#26de81"/>
      <stop offset="100%" stop-color="#00d4ff"/>
    </linearGradient>
  </defs>
</svg>
