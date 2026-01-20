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

  const PULL_THRESHOLD = 80;
  const MAX_PULL = 120;
  const RESISTANCE = 0.5;

  // Subscribe to sync status to detect when sync completes
  let syncStatus = $state<'idle' | 'syncing' | 'error'>('idle');
  $effect(() => {
    const unsub = syncStatusStore.subscribe((value) => {
      syncStatus = value.status;
      if (isRefreshing && value.status === 'idle') {
        // Sync completed, finish refresh animation
        setTimeout(() => {
          isRefreshing = false;
          pullDistance = 0;
        }, 300);
      }
    });
    return unsub;
  });

  function handleTouchStart(e: TouchEvent) {
    if (disabled || isRefreshing) return;

    // Only activate if at top of page
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop > 5) return;

    startY = e.touches[0].clientY;
    isPulling = true;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!isPulling || disabled || isRefreshing) return;

    currentY = e.touches[0].clientY;
    const delta = currentY - startY;

    if (delta > 0) {
      // Apply resistance as user pulls further
      pullDistance = Math.min(delta * RESISTANCE, MAX_PULL);

      // Prevent default scroll behavior when pulling
      if (pullDistance > 10) {
        e.preventDefault();
      }
    }
  }

  function handleTouchEnd() {
    if (!isPulling || disabled) return;
    isPulling = false;

    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      // Trigger refresh
      triggerRefresh();
    } else {
      // Reset
      pullDistance = 0;
    }
  }

  async function triggerRefresh() {
    isRefreshing = true;
    pullDistance = 60; // Hold at refresh position

    try {
      // Perform sync and invalidate all data
      await performSync();
      await invalidateAll();
    } catch (error) {
      console.error('Refresh failed:', error);
      isRefreshing = false;
      pullDistance = 0;
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

  // Computed values
  const progress = $derived(Math.min(pullDistance / PULL_THRESHOLD, 1));
  const isReady = $derived(pullDistance >= PULL_THRESHOLD);
</script>

<!-- Pull indicator at top of viewport -->
<div
  class="pull-indicator"
  class:visible={pullDistance > 0}
  class:ready={isReady}
  class:refreshing={isRefreshing}
  style="--pull-distance: {pullDistance}px; --progress: {progress};"
>
  <div class="pull-content">
    <div class="pull-icon" class:spinning={isRefreshing}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        {#if isRefreshing}
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        {:else}
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
        {/if}
      </svg>
    </div>
    <span class="pull-text">
      {#if isRefreshing}
        Syncing...
      {:else if isReady}
        Release to refresh
      {:else}
        Pull to refresh
      {/if}
    </span>
  </div>

  <!-- Progress ring around icon -->
  <svg class="progress-ring" width="48" height="48" viewBox="0 0 48 48">
    <circle
      cx="24"
      cy="24"
      r="20"
      fill="none"
      stroke="rgba(108, 92, 231, 0.2)"
      stroke-width="3"
    />
    <circle
      class="progress-circle"
      cx="24"
      cy="24"
      r="20"
      fill="none"
      stroke="url(#pullGradient)"
      stroke-width="3"
      stroke-linecap="round"
      stroke-dasharray="125.6"
      stroke-dashoffset={125.6 * (1 - progress)}
      transform="rotate(-90 24 24)"
    />
    <defs>
      <linearGradient id="pullGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#6c5ce7"/>
        <stop offset="100%" stop-color="#ff79c6"/>
      </linearGradient>
    </defs>
  </svg>
</div>

<style>
  .pull-indicator {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 200;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    height: var(--pull-distance);
    overflow: hidden;
    pointer-events: none;
    transition: none;
    /* Account for Dynamic Island / notch */
    padding-top: env(safe-area-inset-top, 0);
  }

  .pull-indicator.refreshing {
    transition: height 0.3s var(--ease-out);
  }

  .pull-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 0.75rem;
    opacity: var(--progress);
    transform: scale(calc(0.8 + var(--progress) * 0.2));
    transition: transform 0.1s ease-out;
  }

  .pull-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-primary-light);
    transition: transform 0.3s var(--ease-spring);
  }

  .pull-icon.spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .ready .pull-icon {
    transform: rotate(180deg);
    color: var(--color-green);
  }

  .refreshing .pull-icon {
    transform: none;
    color: var(--color-primary-light);
  }

  .pull-text {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .ready .pull-text {
    color: var(--color-green);
  }

  .refreshing .pull-text {
    color: var(--color-primary-light);
  }

  .progress-ring {
    position: absolute;
    top: calc(env(safe-area-inset-top, 0) + 8px);
    left: 50%;
    transform: translateX(-50%);
    opacity: var(--progress);
  }

  .progress-circle {
    transition: stroke-dashoffset 0.1s ease-out;
  }

  .refreshing .progress-ring {
    animation: ringPulse 1.5s ease-in-out infinite;
  }

  @keyframes ringPulse {
    0%, 100% {
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }
    50% {
      opacity: 0.7;
      transform: translateX(-50%) scale(1.05);
    }
  }

  /* Hide on desktop */
  @media (min-width: 641px) {
    .pull-indicator {
      display: none;
    }
  }
</style>
