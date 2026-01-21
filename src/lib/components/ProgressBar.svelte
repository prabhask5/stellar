<script lang="ts">
  import { getProgressColor, getOverflowColor } from '$lib/utils/colors';

  interface Props {
    percentage: number;
    showLabel?: boolean;
    height?: string;
  }

  let { percentage, showLabel = true, height = '12px' }: Props = $props();

  // Use overflow color for >100%, regular progress color otherwise
  const color = $derived(percentage > 100 ? getOverflowColor(percentage) : getProgressColor(percentage));

  // Celebration intensity: 0 at 100%, scales to 1 at 200%+
  // Progressive: very subtle at 101%, moderate at 150%, intense at 200%+
  const celebrationIntensity = $derived(
    percentage <= 100 ? 0 : Math.min(1, (percentage - 100) / 100)
  );

  // Whether we're celebrating (any overflow)
  const isCelebrating = $derived(percentage > 100);

  // Cap the visual bar width at 100%
  const barWidth = $derived(Math.min(100, percentage));

  // Calculate dynamic glow size based on intensity (scales from 10px to 30px)
  const glowSize = $derived(10 + celebrationIntensity * 20);

  // Calculate dynamic glow brightness boost (scales from 0.05 to 0.2)
  const glowBrightness = $derived(0.05 + celebrationIntensity * 0.15);

  // Nebula opacity range (scales with intensity)
  const nebulaMin = $derived(0.05 + celebrationIntensity * 0.1);
  const nebulaMax = $derived(0.15 + celebrationIntensity * 0.25);

  // Animation speed: faster as intensity increases (from 3s down to 1s)
  const shimmerDuration = $derived(3 - celebrationIntensity * 2);
</script>

<div class="progress-container">
  <div
    class="progress-bar"
    class:celebrating={isCelebrating}
    style="height: {height}; --celebration-intensity: {celebrationIntensity}; --glow-size: {glowSize}px; --glow-color: {color}; --glow-brightness: {glowBrightness}; --nebula-min: {nebulaMin}; --nebula-max: {nebulaMax}; --shimmer-duration: {shimmerDuration}s"
  >
    <!-- Nebula glow background for celebrating state -->
    {#if isCelebrating}
      <div class="nebula-glow" style="--fill-color: {color}"></div>
    {/if}

    <div
      class="progress-fill"
      class:celebrating={isCelebrating}
      style="width: {barWidth}%; --fill-color: {color}"
    ></div>
    <div
      class="progress-glow"
      class:celebrating={isCelebrating}
      style="width: {barWidth}%; --fill-color: {color}"
    ></div>

    <!-- Orbiting stars for high intensity celebrations -->
    {#if celebrationIntensity > 0.4}
      <div class="orbital-container" style="--orbit-color: {color}">
        <div class="orbital-star" style="--orbit-radius: 20px; --orbit-duration: {4 - celebrationIntensity * 2}s; --star-delay: 0s"></div>
        {#if celebrationIntensity > 0.7}
          <div class="orbital-star" style="--orbit-radius: 25px; --orbit-duration: {5 - celebrationIntensity * 2}s; --star-delay: -1.5s"></div>
        {/if}
      </div>
    {/if}
  </div>
  {#if showLabel}
    <span
      class="progress-label"
      class:celebrating={isCelebrating}
      style="color: {color}; --glow-color: {color}; --celebration-intensity: {celebrationIntensity}"
    >
      {Math.round(percentage)}%
    </span>
  {/if}
</div>

<style>
  .progress-container {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .progress-bar {
    flex: 1;
    background: linear-gradient(180deg,
      rgba(20, 20, 40, 0.9) 0%,
      rgba(10, 10, 25, 0.95) 100%);
    border-radius: var(--radius-full);
    overflow: hidden;
    position: relative;
    box-shadow:
      inset 0 2px 6px rgba(0, 0, 0, 0.4),
      inset 0 -1px 0 rgba(255, 255, 255, 0.03),
      0 1px 3px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(108, 92, 231, 0.2);
  }

  .progress-bar.celebrating {
    border-color: color-mix(in srgb, var(--glow-color) 40%, transparent);
    animation: cosmicGlow calc(2s - var(--celebration-intensity, 0) * 1s) ease-in-out infinite;
  }

  /* Nebula glow background */
  .nebula-glow {
    position: absolute;
    inset: -20px;
    background: radial-gradient(
      ellipse at 30% 50%,
      color-mix(in srgb, var(--fill-color) calc(var(--nebula-max, 0.3) * 100%), transparent) 0%,
      transparent 60%
    );
    animation: nebulaBreath 3s ease-in-out infinite;
    pointer-events: none;
    z-index: 0;
  }

  .progress-fill {
    height: 100%;
    border-radius: var(--radius-full);
    background: linear-gradient(180deg,
      color-mix(in srgb, var(--fill-color) 100%, white 20%) 0%,
      var(--fill-color) 50%,
      color-mix(in srgb, var(--fill-color) 80%, black) 100%);
    transition: width 0.6s var(--ease-out);
    position: relative;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
    animation: progressPulse 2s ease-in-out infinite;
    z-index: 1;
  }

  .progress-fill.celebrating {
    animation: progressPulse calc(2s - var(--celebration-intensity, 0) * 1s) ease-in-out infinite;
  }

  @keyframes progressPulse {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.1); }
  }

  /* Shine effect on top */
  .progress-fill::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 50%;
    background: linear-gradient(180deg,
      rgba(255, 255, 255, 0.35) 0%,
      rgba(255, 255, 255, 0.1) 50%,
      transparent 100%);
    border-radius: var(--radius-full) var(--radius-full) 0 0;
  }

  /* Animated shimmer */
  .progress-fill::after {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.2) 50%,
      transparent 100%);
    animation: shimmer 2s ease-in-out infinite;
  }

  .progress-fill.celebrating::after {
    animation: supernovaShimmer var(--shimmer-duration, 2s) ease-in-out infinite;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.4) 50%,
      transparent 100%);
  }

  @keyframes shimmer {
    0% { left: -100%; }
    100% { left: 100%; }
  }

  .progress-glow {
    position: absolute;
    top: -50%;
    left: 0;
    height: 200%;
    border-radius: var(--radius-full);
    background: var(--fill-color);
    filter: blur(12px);
    opacity: 0.5;
    transition: width 0.6s var(--ease-out);
    pointer-events: none;
    animation: glowPulse 2s ease-in-out infinite;
    z-index: 0;
  }

  .progress-glow.celebrating {
    filter: blur(calc(12px + var(--celebration-intensity, 0) * 8px));
    opacity: calc(0.5 + var(--celebration-intensity, 0) * 0.3);
    animation: glowPulse calc(2s - var(--celebration-intensity, 0) * 1s) ease-in-out infinite;
  }

  @keyframes glowPulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.6; }
  }

  /* Orbital stars container */
  .orbital-container {
    position: absolute;
    top: 50%;
    right: 10%;
    width: 0;
    height: 0;
    z-index: 2;
  }

  .orbital-star {
    position: absolute;
    width: 4px;
    height: 4px;
    background: var(--orbit-color, var(--color-cyan));
    border-radius: 50%;
    box-shadow: 0 0 6px var(--orbit-color, var(--color-cyan));
    animation: orbitalStar var(--orbit-duration, 3s) linear infinite;
    animation-delay: var(--star-delay, 0s);
  }

  .progress-label {
    font-size: 1.125rem;
    font-weight: 800;
    min-width: 4rem;
    text-align: right;
    text-shadow: 0 0 30px currentColor;
    font-variant-numeric: tabular-nums;
    font-family: var(--font-mono);
    letter-spacing: -0.02em;
    transition: all 0.3s var(--ease-out);
  }

  .progress-label.celebrating {
    text-shadow: 0 0 calc(30px + var(--celebration-intensity, 0) * 20px) var(--glow-color);
    animation: celebrationTwinkle calc(2s - var(--celebration-intensity, 0) * 1s) ease-in-out infinite;
    --twinkle-min: calc(0.8 - var(--celebration-intensity, 0) * 0.2);
    --twinkle-max: 1;
  }

  .progress-container:hover .progress-label {
    transform: scale(1.05);
    text-shadow: 0 0 40px currentColor;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .progress-fill,
    .progress-fill::after,
    .progress-glow,
    .progress-bar.celebrating,
    .progress-label.celebrating,
    .orbital-star,
    .nebula-glow {
      animation: none !important;
    }
  }
</style>
