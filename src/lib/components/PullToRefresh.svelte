<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { performSync } from '$lib/sync/engine';
  import { syncStatusStore } from '$lib/stores/sync';
  import { invalidateAll } from '$app/navigation';

  interface Props {
    disabled?: boolean;
  }

  let { disabled = false }: Props = $props();

  let pullDistance = $state(0);
  let isPulling = $state(false);
  let isRefreshing = $state(false);
  let startY = 0;
  let currentY = 0;
  let velocity = $state(0);
  let lastY = 0;
  let lastTime = 0;

  // Gravitational physics constants
  const PULL_THRESHOLD = 75;
  const MAX_PULL = 140;
  const BASE_RESISTANCE = 0.45;
  const SPRING_TENSION = 0.15;
  const GRAVITY_DAMPING = 0.92;

  // Subscribe to sync status to detect when sync completes
  let syncStatus = $state<'idle' | 'syncing' | 'error'>('idle');
  $effect(() => {
    const unsub = syncStatusStore.subscribe((value) => {
      syncStatus = value.status;
      if (isRefreshing && value.status === 'idle') {
        // Sync completed, finish refresh animation with bounce
        setTimeout(() => {
          animateSnapBack();
        }, 200);
      }
    });
    return unsub;
  });

  // Smooth spring animation for snap back
  function animateSnapBack() {
    const animate = () => {
      if (pullDistance <= 0.5) {
        pullDistance = 0;
        isRefreshing = false;
        return;
      }
      // Apply spring physics for smooth return
      pullDistance *= GRAVITY_DAMPING;
      velocity *= 0.8;
      requestAnimationFrame(animate);
    };
    animate();
  }

  function handleTouchStart(e: TouchEvent) {
    if (disabled || isRefreshing) return;

    // Only activate if at top of page
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop > 5) return;

    startY = e.touches[0].clientY;
    lastY = startY;
    lastTime = Date.now();
    isPulling = true;
    velocity = 0;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!isPulling || disabled || isRefreshing) return;

    currentY = e.touches[0].clientY;
    const delta = currentY - startY;

    // Calculate velocity for physics feel
    const now = Date.now();
    const dt = now - lastTime;
    if (dt > 0) {
      velocity = (currentY - lastY) / dt;
    }
    lastY = currentY;
    lastTime = now;

    if (delta > 0) {
      // Progressive resistance - feels like stretching against gravity
      // Resistance increases as you pull further (like a rubber band)
      const progress = delta / MAX_PULL;
      const dynamicResistance = BASE_RESISTANCE * (1 - progress * 0.4);
      const elasticDelta = delta * dynamicResistance * Math.pow(1 - progress, 0.3);

      pullDistance = Math.min(elasticDelta, MAX_PULL);

      // Prevent default scroll behavior when pulling
      if (pullDistance > 8) {
        e.preventDefault();
      }
    }
  }

  function handleTouchEnd() {
    if (!isPulling || disabled) return;
    isPulling = false;

    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      // Trigger refresh with haptic-like visual feedback
      triggerRefresh();
    } else if (!isRefreshing) {
      // Animate back with spring physics
      animateSnapBack();
    }
  }

  async function triggerRefresh() {
    isRefreshing = true;
    // Hold at optimal refresh position with slight bounce
    const targetPosition = 65;
    const bounceAnimate = () => {
      const diff = targetPosition - pullDistance;
      pullDistance += diff * 0.2;
      if (Math.abs(diff) > 0.5) {
        requestAnimationFrame(bounceAnimate);
      }
    };
    bounceAnimate();

    try {
      // Perform sync and invalidate all data
      await performSync();
      await invalidateAll();
    } catch (error) {
      console.error('Refresh failed:', error);
      animateSnapBack();
    }
  }

  onMount(() => {
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
  });

  onDestroy(() => {
    document.removeEventListener('touchstart', handleTouchStart);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
  });

  // Computed values with gravitational feel
  const progress = $derived(Math.min(pullDistance / PULL_THRESHOLD, 1));
  const isReady = $derived(pullDistance >= PULL_THRESHOLD);
  const rotation = $derived(progress * 180 + (isRefreshing ? 360 : 0));
  const scale = $derived(0.7 + progress * 0.3);
  const orbitalRotation = $derived(progress * 720);
</script>

<!-- Pull indicator at top of viewport - Gravitational Design -->
<div
  class="pull-indicator"
  class:visible={pullDistance > 0}
  class:ready={isReady}
  class:refreshing={isRefreshing}
  style="
    --pull-distance: {pullDistance}px;
    --progress: {progress};
    --rotation: {rotation}deg;
    --scale: {scale};
    --orbital: {orbitalRotation}deg;
  "
>
  <!-- Cosmic backdrop glow -->
  <div class="pull-backdrop"></div>

  <!-- Orbital rings -->
  <div class="orbital-container">
    <div class="orbital-ring orbital-ring-1"></div>
    <div class="orbital-ring orbital-ring-2"></div>
    <div class="orbital-ring orbital-ring-3"></div>
  </div>

  <!-- Central indicator -->
  <div class="pull-core">
    <div class="pull-icon" class:spinning={isRefreshing}>
      <!-- Custom cosmic refresh icon -->
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        {#if isRefreshing}
          <!-- Syncing spinner arc -->
          <circle cx="12" cy="12" r="9" stroke-opacity="0.2"/>
          <path class="spinner-arc" d="M21 12a9 9 0 1 1-6.219-8.56"/>
        {:else}
          <!-- Bidirectional refresh arrows -->
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
        {/if}
      </svg>
    </div>
  </div>

  <!-- Status text -->
  <div class="pull-text">
    <span class="pull-status">
      {#if isRefreshing}
        Syncing with the cosmos...
      {:else if isReady}
        Release to sync
      {:else}
        Pull to sync
      {/if}
    </span>
  </div>

  <!-- Progress arc around core -->
  <svg class="progress-ring" viewBox="0 0 80 80">
    <!-- Background track -->
    <circle
      cx="40"
      cy="40"
      r="34"
      fill="none"
      stroke="rgba(108, 92, 231, 0.15)"
      stroke-width="4"
    />
    <!-- Progress arc -->
    <circle
      class="progress-arc"
      cx="40"
      cy="40"
      r="34"
      fill="none"
      stroke="url(#progressGradient)"
      stroke-width="4"
      stroke-linecap="round"
      stroke-dasharray="213.6"
      stroke-dashoffset={213.6 * (1 - progress)}
      transform="rotate(-90 40 40)"
    />
    <!-- Gradient definition -->
    <defs>
      <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#6c5ce7"/>
        <stop offset="50%" stop-color="#ff79c6"/>
        <stop offset="100%" stop-color="#26de81"/>
      </linearGradient>
    </defs>
  </svg>
</div>

<style>
  .pull-indicator {
    position: fixed;
    /* Start BELOW the Dynamic Island safe area */
    top: calc(env(safe-area-inset-top, 47px) + 8px);
    left: 0;
    right: 0;
    z-index: 200;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    /* Height is just the pull distance, since we're already positioned below the island */
    height: var(--pull-distance);
    min-height: 0;
    overflow: visible;
    pointer-events: none;
  }

  /* Cosmic backdrop glow - positioned to not overlap Dynamic Island */
  .pull-backdrop {
    position: fixed;
    /* Start at the very top of the screen */
    top: 0;
    left: 0;
    right: 0;
    /* Extend from top through the safe area and pull distance */
    height: calc(env(safe-area-inset-top, 47px) + var(--pull-distance) * 1.2);
    background: linear-gradient(180deg,
      rgba(8, 8, 16, 1) 0%,
      rgba(8, 8, 16, 0.95) calc(env(safe-area-inset-top, 47px) * 0.6),
      transparent 100%
    ),
    radial-gradient(
      ellipse 100% 80% at 50% calc(env(safe-area-inset-top, 47px) + 30px),
      rgba(108, 92, 231, calc(var(--progress) * 0.4)) 0%,
      rgba(255, 121, 198, calc(var(--progress) * 0.2)) 40%,
      transparent 70%
    );
    opacity: var(--progress);
    transition: opacity 0.15s;
    pointer-events: none;
    z-index: -1;
  }

  .ready .pull-backdrop {
    background: radial-gradient(
      ellipse 80% 100% at 50% 0%,
      rgba(38, 222, 129, 0.35) 0%,
      rgba(0, 212, 255, 0.2) 30%,
      transparent 70%
    );
  }

  .refreshing .pull-backdrop {
    animation: backdropPulse 2s ease-in-out infinite;
  }

  @keyframes backdropPulse {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 1; }
  }

  /* Orbital rings for cosmic effect - positioned in pull area */
  .orbital-container {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    width: 100px;
    height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .orbital-ring {
    position: absolute;
    border-radius: 50%;
    border: 1px solid transparent;
    opacity: calc(var(--progress) * 0.6);
    transition: opacity 0.2s;
  }

  .orbital-ring-1 {
    width: 60px;
    height: 60px;
    border-color: rgba(108, 92, 231, 0.4);
    transform: rotate(var(--orbital)) rotateX(60deg);
    animation: none;
  }

  .orbital-ring-2 {
    width: 75px;
    height: 75px;
    border-color: rgba(255, 121, 198, 0.3);
    transform: rotate(calc(var(--orbital) * -0.7)) rotateX(70deg) rotateY(20deg);
  }

  .orbital-ring-3 {
    width: 90px;
    height: 90px;
    border-color: rgba(38, 222, 129, 0.25);
    transform: rotate(calc(var(--orbital) * 0.5)) rotateX(50deg) rotateY(-30deg);
  }

  .refreshing .orbital-ring-1 {
    animation: orbitSpin1 3s linear infinite;
  }

  .refreshing .orbital-ring-2 {
    animation: orbitSpin2 4s linear infinite reverse;
  }

  .refreshing .orbital-ring-3 {
    animation: orbitSpin3 5s linear infinite;
  }

  @keyframes orbitSpin1 {
    from { transform: rotate(0deg) rotateX(60deg); }
    to { transform: rotate(360deg) rotateX(60deg); }
  }

  @keyframes orbitSpin2 {
    from { transform: rotate(0deg) rotateX(70deg) rotateY(20deg); }
    to { transform: rotate(360deg) rotateX(70deg) rotateY(20deg); }
  }

  @keyframes orbitSpin3 {
    from { transform: rotate(0deg) rotateX(50deg) rotateY(-30deg); }
    to { transform: rotate(360deg) rotateX(50deg) rotateY(-30deg); }
  }

  /* Central core - positioned well below Dynamic Island */
  .pull-core {
    position: absolute;
    bottom: 35px;
    left: 50%;
    transform: translateX(-50%) scale(var(--scale));
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: var(--progress);
    transition: opacity 0.15s, transform 0.1s var(--ease-spring);
  }

  .pull-icon {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-primary-light);
    background: linear-gradient(145deg,
      rgba(20, 20, 40, 0.95) 0%,
      rgba(15, 15, 32, 0.98) 100%);
    border: 1.5px solid rgba(108, 92, 231, 0.4);
    border-radius: 50%;
    box-shadow:
      0 4px 20px rgba(0, 0, 0, 0.4),
      0 0 30px rgba(108, 92, 231, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
    transition: all 0.3s var(--ease-spring);
    transform: rotate(var(--rotation));
  }

  .ready .pull-icon {
    color: var(--color-green);
    border-color: rgba(38, 222, 129, 0.5);
    box-shadow:
      0 4px 20px rgba(0, 0, 0, 0.4),
      0 0 40px rgba(38, 222, 129, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
    transform: rotate(180deg) scale(1.1);
  }

  .pull-icon.spinning {
    animation: iconSpin 1s linear infinite;
    color: var(--color-cyan);
    border-color: rgba(0, 212, 255, 0.5);
    box-shadow:
      0 4px 20px rgba(0, 0, 0, 0.4),
      0 0 50px rgba(0, 212, 255, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  @keyframes iconSpin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .spinner-arc {
    stroke-dasharray: 45;
    stroke-dashoffset: 0;
  }

  /* Status text - positioned at bottom of pull area */
  .pull-text {
    position: absolute;
    bottom: 6px;
    left: 50%;
    transform: translateX(-50%);
    opacity: calc(var(--progress) * 0.9);
    transition: opacity 0.2s;
  }

  .pull-status {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    white-space: nowrap;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  }

  .ready .pull-status {
    color: var(--color-green);
    text-shadow: 0 0 20px rgba(38, 222, 129, 0.5);
  }

  .refreshing .pull-status {
    color: var(--color-cyan);
    animation: statusPulse 1.5s ease-in-out infinite;
  }

  @keyframes statusPulse {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 1; }
  }

  /* Progress ring - surrounds the core icon */
  .progress-ring {
    position: absolute;
    bottom: 15px;
    left: 50%;
    transform: translateX(-50%);
    width: 80px;
    height: 80px;
    opacity: var(--progress);
    transition: opacity 0.2s;
    pointer-events: none;
  }

  .progress-arc {
    transition: stroke-dashoffset 0.1s ease-out;
  }

  .refreshing .progress-ring {
    animation: ringPulseRefresh 2s ease-in-out infinite;
  }

  @keyframes ringPulseRefresh {
    0%, 100% {
      transform: translateX(-50%) scale(1);
      opacity: 1;
    }
    50% {
      transform: translateX(-50%) scale(1.05);
      opacity: 0.8;
    }
  }

  /* Hide on desktop */
  @media (min-width: 641px) {
    .pull-indicator {
      display: none;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .pull-icon.spinning {
      animation: none;
    }

    .refreshing .orbital-ring-1,
    .refreshing .orbital-ring-2,
    .refreshing .orbital-ring-3 {
      animation: none;
    }

    .refreshing .progress-ring,
    .refreshing .pull-backdrop,
    .refreshing .pull-status {
      animation: none;
    }
  }
</style>
