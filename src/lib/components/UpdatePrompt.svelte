<script lang="ts">
  /**
   * @fileoverview UpdatePrompt — service-worker update notification banner.
   *
   * Monitors the service worker lifecycle to detect when a new version of
   * Stellar has been installed but is waiting to activate. When detected,
   * a fixed-position toast slides up from the bottom of the screen offering
   * two actions:
   *   - **Refresh** — sends `SKIP_WAITING` to the new worker, waits for
   *     `controllerchange`, then reloads the page
   *   - **Later** — dismisses the toast (the update will apply on next visit)
   *
   * Detection strategy (covers all major browsers and iOS PWA quirks):
   *   1. Check for `registration.waiting` immediately on mount
   *   2. Retry after 1s and 3s (iOS PWA sometimes delays worker state)
   *   3. Listen for `SW_INSTALLED` messages from the worker
   *   4. Listen for `updatefound` → `statechange` on new workers
   *   5. Re-check on `visibilitychange` (critical for iOS PWA resume)
   *   6. Poll for updates every 2 minutes via `registration.update()`
   */

  // =============================================================================
  //  Imports
  // =============================================================================

  import { onMount, onDestroy } from 'svelte';
  import { monitorSwLifecycle, handleSwUpdate } from 'stellar-drive/kit';

  // =============================================================================
  //  Component State
  // =============================================================================

  /** Whether the update toast is visible */
  let showPrompt = $state(false);

  /** Cleanup function returned by `monitorSwLifecycle` */
  let cleanupMonitor: (() => void) | null = null;

  // =============================================================================
  //  Service Worker Monitoring (runs only in browser)
  // =============================================================================

  onMount(() => {
    cleanupMonitor = monitorSwLifecycle({
      onUpdateAvailable: () => {
        showPrompt = true;
      }
    });
  });

  onDestroy(() => {
    cleanupMonitor?.();
  });

  // =============================================================================
  //  Action Handlers
  // =============================================================================

  /** Guard flag to prevent double-reload */
  let reloading = false;

  /**
   * Instructs the waiting service worker to take over via `SKIP_WAITING`,
   * then reloads the page once the new controller is active.
   */
  async function handleRefresh() {
    if (reloading) return;
    reloading = true;
    showPrompt = false;
    await handleSwUpdate();
  }

  /**
   * Dismisses the update prompt without applying the update.
   * The new worker will activate on the next page visit.
   */
  function handleDismiss() {
    showPrompt = false;
  }
</script>

<!-- ═══ Update Toast ═══ -->
{#if showPrompt}
  <div class="update-prompt">
    <div class="update-content">
      <!-- Spinning refresh icon -->
      <span class="update-icon">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 12a9 9 0 11-6.219-8.56" />
          <path d="M21 3v6h-6" />
        </svg>
      </span>
      <span class="update-text">A new version of this page is available</span>
    </div>

    <!-- Action buttons -->
    <div class="update-actions">
      <button class="update-btn dismiss" onclick={handleDismiss}>Later</button>
      <button class="update-btn refresh" onclick={handleRefresh}>Refresh</button>
    </div>
  </div>
{/if}

<style>
  /* ═══ Toast Container ═══ */

  .update-prompt {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 1.25rem;
    padding: 1rem 1.5rem;
    background: linear-gradient(145deg, rgba(26, 26, 46, 0.95) 0%, rgba(26, 26, 46, 0.85) 100%);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(108, 92, 231, 0.4);
    border-radius: var(--radius-xl);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 40px rgba(108, 92, 231, 0.2);
    z-index: 1000;
    animation: slideUp 0.4s var(--ease-bounce);
  }

  /* Top glow line accent */
  .update-prompt::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(108, 92, 231, 0.5), transparent);
  }

  @keyframes slideUp {
    from {
      transform: translateX(-50%) translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  }

  /* ═══ Content ═══ */

  .update-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  /* Spinning refresh icon with purple glow */
  .update-icon {
    color: var(--color-primary);
    display: flex;
    animation: spin 2s linear infinite;
    filter: drop-shadow(0 0 8px var(--color-primary));
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .update-text {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--color-text);
  }

  /* ═══ Action Buttons ═══ */

  .update-actions {
    display: flex;
    gap: 0.625rem;
  }

  .update-btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: var(--radius-lg);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s var(--ease-smooth);
  }

  .update-btn:hover {
    transform: translateY(-2px);
  }

  /* "Later" dismiss button — muted */
  .update-btn.dismiss {
    background: rgba(37, 37, 61, 0.8);
    color: var(--color-text-muted);
    border: 1px solid rgba(108, 92, 231, 0.2);
  }

  .update-btn.dismiss:hover {
    background: rgba(37, 37, 61, 1);
    border-color: rgba(108, 92, 231, 0.4);
  }

  /* "Refresh" primary action button */
  .update-btn.refresh {
    background: var(--gradient-primary);
    color: white;
    box-shadow: 0 4px 15px var(--color-primary-glow);
  }

  .update-btn.refresh:hover {
    box-shadow: 0 6px 25px var(--color-primary-glow);
  }

  /* ═══ Mobile Responsive ═══ */

  @media (max-width: 640px) {
    .update-prompt {
      left: 1rem;
      right: 1rem;
      transform: none;
      width: auto;
      padding: 0.875rem 1rem;
      gap: 0.75rem;
    }

    .update-content {
      flex: 1;
      min-width: 0;
    }

    .update-text {
      font-size: 0.8125rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .update-actions {
      flex-shrink: 0;
    }

    .update-btn {
      padding: 0.5rem 0.875rem;
      font-size: 0.75rem;
    }
  }

  /* Separate mobile slide-up animation (no horizontal transform) */
  @keyframes slideUpMobile {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @media (max-width: 640px) {
    .update-prompt {
      animation: slideUpMobile 0.4s var(--ease-bounce);
    }
  }
</style>
