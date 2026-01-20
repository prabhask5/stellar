<script lang="ts">
  import { syncStatusStore } from '$lib/stores/sync';
  import { isOnline } from '$lib/stores/network';
  import { performSync } from '$lib/sync/engine';
  import type { SyncStatus } from '$lib/types';

  let status = $state<SyncStatus>('idle');
  let pendingCount = $state(0);
  let online = $state(true);

  // Subscribe to stores
  $effect(() => {
    const unsubSync = syncStatusStore.subscribe((value) => {
      status = value.status;
      pendingCount = value.pendingCount;
    });
    const unsubOnline = isOnline.subscribe((value) => {
      online = value;
    });

    return () => {
      unsubSync();
      unsubOnline();
    };
  });

  function handleSyncClick() {
    if (online && status !== 'syncing') {
      performSync();
    }
  }

  // Derive the display state
  const displayState = $derived(() => {
    if (!online) return 'offline';
    if (status === 'syncing') return 'syncing';
    if (status === 'error') return 'error';
    if (pendingCount > 0) return 'pending';
    return 'synced';
  });
</script>

<!-- Icon-only sync indicator with tooltip on hover -->
<button
  class="sync-indicator"
  class:offline={displayState() === 'offline'}
  class:syncing={displayState() === 'syncing'}
  class:error={displayState() === 'error'}
  class:pending={displayState() === 'pending'}
  class:synced={displayState() === 'synced'}
  onclick={handleSyncClick}
  disabled={!online || status === 'syncing'}
  aria-label={
    displayState() === 'offline' ? 'Offline' :
    displayState() === 'syncing' ? 'Syncing' :
    displayState() === 'error' ? 'Sync error - tap to retry' :
    displayState() === 'pending' ? `${pendingCount} changes pending - tap to sync` :
    'Synced'
  }
>
  <span class="indicator-ring"></span>
  <span class="indicator-core">
    {#if displayState() === 'offline'}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9"/>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
        <line x1="12" y1="20" x2="12.01" y2="20"/>
      </svg>
    {:else if displayState() === 'syncing'}
      <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
    {:else if displayState() === 'error'}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    {:else if displayState() === 'pending'}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
      </svg>
      <span class="pending-badge">{pendingCount}</span>
    {:else}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    {/if}
  </span>
</button>

<style>
  .sync-indicator {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(145deg,
      rgba(20, 20, 40, 0.9) 0%,
      rgba(15, 15, 32, 0.95) 100%);
    border: 1.5px solid rgba(108, 92, 231, 0.25);
    cursor: pointer;
    transition: all 0.4s var(--ease-spring);
    flex-shrink: 0;
  }

  .sync-indicator:disabled {
    cursor: default;
  }

  .sync-indicator:not(:disabled):hover {
    transform: scale(1.1);
    border-color: rgba(108, 92, 231, 0.5);
  }

  .sync-indicator:not(:disabled):active {
    transform: scale(0.95);
  }

  /* The animated ring around the indicator */
  .indicator-ring {
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 2px solid transparent;
    transition: all 0.4s var(--ease-smooth);
  }

  .indicator-core {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    transition: all 0.3s var(--ease-smooth);
  }

  /* Synced state - green glow */
  .sync-indicator.synced {
    border-color: rgba(38, 222, 129, 0.3);
  }

  .sync-indicator.synced .indicator-core {
    color: var(--color-green);
  }

  .sync-indicator.synced .indicator-ring {
    border-color: rgba(38, 222, 129, 0.2);
    animation: ringPulseGreen 3s ease-in-out infinite;
  }

  @keyframes ringPulseGreen {
    0%, 100% {
      transform: scale(1);
      opacity: 1;
      border-color: rgba(38, 222, 129, 0.2);
    }
    50% {
      transform: scale(1.15);
      opacity: 0;
      border-color: rgba(38, 222, 129, 0.4);
    }
  }

  /* Syncing state - purple spinning */
  .sync-indicator.syncing {
    border-color: rgba(108, 92, 231, 0.5);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .sync-indicator.syncing .indicator-core {
    color: var(--color-primary-light);
  }

  .sync-indicator.syncing .indicator-ring {
    border-color: var(--color-primary);
    border-top-color: transparent;
    animation: ringSpinPurple 1s linear infinite;
  }

  @keyframes ringSpinPurple {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .spin {
    animation: iconSpin 1s linear infinite;
  }

  @keyframes iconSpin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Pending state - needs attention */
  .sync-indicator.pending {
    border-color: rgba(108, 92, 231, 0.4);
  }

  .sync-indicator.pending .indicator-core {
    color: var(--color-primary-light);
  }

  .sync-indicator.pending:not(:disabled):hover {
    box-shadow: 0 0 25px var(--color-primary-glow);
  }

  .pending-badge {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    background: var(--gradient-primary);
    color: white;
    font-size: 10px;
    font-weight: 700;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px var(--color-primary-glow);
  }

  /* Error state - red alert */
  .sync-indicator.error {
    border-color: rgba(255, 107, 107, 0.5);
    animation: errorShake 0.5s ease-in-out;
  }

  .sync-indicator.error .indicator-core {
    color: var(--color-red);
  }

  .sync-indicator.error .indicator-ring {
    border-color: rgba(255, 107, 107, 0.3);
    animation: ringPulseRed 1.5s ease-in-out infinite;
  }

  @keyframes ringPulseRed {
    0%, 100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.2);
      opacity: 0;
    }
  }

  @keyframes errorShake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-3px); }
    40%, 80% { transform: translateX(3px); }
  }

  /* Offline state - yellow warning */
  .sync-indicator.offline {
    border-color: rgba(255, 217, 61, 0.4);
  }

  .sync-indicator.offline .indicator-core {
    color: var(--color-yellow);
  }

  .sync-indicator.offline .indicator-ring {
    border-color: rgba(255, 217, 61, 0.2);
  }

  /* Mobile optimization */
  @media (max-width: 640px) {
    .sync-indicator {
      width: 40px;
      height: 40px;
    }
  }
</style>
