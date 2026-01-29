<script lang="ts">
  import { remoteChangesStore } from '$lib/stores/remoteChanges';
  import { onMount, onDestroy } from 'svelte';

  interface Props {
    entityId: string;
    entityType: string;
    remoteData: Record<string, unknown> | null;
    localData: Record<string, unknown>;
    fieldLabels: Record<string, string>;
    formatValue?: (field: string, value: unknown) => string;
    onLoadRemote: () => void;
    onDismiss: () => void;
  }

  let {
    entityId,
    entityType,
    remoteData,
    localData,
    fieldLabels,
    formatValue,
    onLoadRemote,
    onDismiss
  }: Props = $props();

  let showBanner = $state(false);
  let showPreview = $state(false);
  let checkInterval: ReturnType<typeof setInterval> | null = null;

  interface FieldDiff {
    field: string;
    label: string;
    oldValue: string;
    newValue: string;
  }

  const diffs = $derived.by(() => {
    if (!remoteData) return [] as FieldDiff[];
    const result: FieldDiff[] = [];
    for (const [field, label] of Object.entries(fieldLabels)) {
      const local = localData[field];
      const remote = remoteData[field];
      if (local !== remote && remote !== undefined) {
        const fmt = formatValue || defaultFormat;
        result.push({
          field,
          label,
          oldValue: fmt(field, local),
          newValue: fmt(field, remote)
        });
      }
    }
    return result;
  });

  function defaultFormat(_field: string, value: unknown): string {
    if (typeof value === 'boolean') return value ? 'On' : 'Off';
    if (value === null || value === undefined) return 'None';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  }

  function checkDeferred() {
    const has = remoteChangesStore.hasDeferredChanges(entityId, entityType);
    if (has && !showBanner) {
      showBanner = true;
    }
  }

  onMount(() => {
    checkDeferred();
    checkInterval = setInterval(checkDeferred, 500);
  });

  onDestroy(() => {
    if (checkInterval) clearInterval(checkInterval);
  });

  function handleLoadRemote() {
    // Clear deferred changes from the store so polling doesn't re-show
    remoteChangesStore.clearDeferredChanges(entityId, entityType);
    showBanner = false;
    showPreview = false;
    onLoadRemote();
  }

  function handleDismiss() {
    // Clear deferred changes from the store so polling doesn't re-show
    remoteChangesStore.clearDeferredChanges(entityId, entityType);
    showBanner = false;
    showPreview = false;
    onDismiss();
  }
</script>

<!-- Always rendered; CSS controls visibility via max-height transition -->
<div class="deferred-banner-wrapper" class:show={showBanner}>
  <div class="deferred-banner">
    <div class="banner-content">
      <div class="banner-message">
        <span class="banner-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </span>
        <span class="banner-text">Changes were made on another device</span>
        {#if diffs.length > 0}
          <button
            class="toggle-preview"
            onclick={() => (showPreview = !showPreview)}
            type="button"
          >
            {showPreview ? 'Hide' : 'Show'} changes
            <svg
              class="chevron"
              class:expanded={showPreview}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              width="14"
              height="14"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        {/if}
      </div>
      <div class="banner-actions">
        <button class="banner-btn update-btn" onclick={handleLoadRemote} type="button">
          Update
        </button>
        <button class="banner-btn dismiss-btn" onclick={handleDismiss} type="button">
          Dismiss
        </button>
      </div>
    </div>

    {#if showPreview && diffs.length > 0}
      <div class="diff-preview">
        {#each diffs as diff}
          <div class="diff-row">
            <span class="diff-label">{diff.label}:</span>
            <span class="diff-old">{diff.oldValue}</span>
            <span class="diff-arrow">&rarr;</span>
            <span class="diff-new">{diff.newValue}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .deferred-banner-wrapper {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    transition:
      grid-template-rows 0.4s var(--ease-spring),
      opacity 0.3s var(--ease-out);
  }

  .deferred-banner-wrapper.show {
    grid-template-rows: 1fr;
    opacity: 1;
  }

  .deferred-banner-wrapper > .deferred-banner {
    overflow: hidden;
  }

  @media (prefers-reduced-motion: reduce) {
    .deferred-banner-wrapper {
      transition: none;
    }
  }

  .deferred-banner {
    background: linear-gradient(
      135deg,
      rgba(255, 165, 2, 0.12) 0%,
      rgba(255, 165, 2, 0.06) 100%
    );
    border: 1px solid rgba(255, 165, 2, 0.3);
    border-radius: var(--radius-lg);
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    animation: bannerGlow 3s ease-in-out infinite;
  }

  @keyframes bannerGlow {
    0%,
    100% {
      box-shadow: 0 0 8px rgba(255, 165, 2, 0.15);
    }
    50% {
      box-shadow: 0 0 16px rgba(255, 165, 2, 0.25);
    }
  }

  .banner-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .banner-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    min-width: 0;
  }

  .banner-icon {
    color: var(--color-orange);
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .banner-text {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-orange);
    white-space: nowrap;
  }

  .toggle-preview {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--color-text-muted);
    background: none;
    border: none;
    padding: 0.125rem 0.375rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: color 0.2s;
    white-space: nowrap;
  }

  .toggle-preview:hover {
    color: var(--color-text);
  }

  .chevron {
    transition: transform 0.2s var(--ease-smooth);
  }

  .chevron.expanded {
    transform: rotate(180deg);
  }

  .banner-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .banner-btn {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s var(--ease-smooth);
    border: none;
    white-space: nowrap;
  }

  .update-btn {
    background: rgba(255, 165, 2, 0.2);
    color: var(--color-orange);
    border: 1px solid rgba(255, 165, 2, 0.3);
  }

  .update-btn:hover {
    background: rgba(255, 165, 2, 0.3);
    box-shadow: 0 0 12px rgba(255, 165, 2, 0.2);
  }

  .dismiss-btn {
    background: rgba(255, 255, 255, 0.05);
    color: var(--color-text-muted);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .dismiss-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text);
  }

  /* Diff preview */
  .diff-preview {
    margin-top: 0.625rem;
    padding-top: 0.625rem;
    border-top: 1px solid rgba(255, 165, 2, 0.15);
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .diff-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    flex-wrap: wrap;
  }

  .diff-label {
    color: var(--color-text-secondary);
    font-weight: 600;
  }

  .diff-old {
    color: var(--color-text-muted);
    text-decoration: line-through;
    opacity: 0.7;
  }

  .diff-arrow {
    color: var(--color-text-muted);
    font-size: 0.625rem;
  }

  .diff-new {
    color: var(--color-orange);
    font-weight: 600;
  }

  /* Mobile responsive */
  @media (max-width: 480px) {
    .banner-content {
      flex-direction: column;
      align-items: stretch;
    }

    .banner-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .banner-btn {
      text-align: center;
    }

    .deferred-banner {
      padding: 0.625rem 0.75rem;
    }
  }

  /* Tablet */
  @media (min-width: 481px) and (max-width: 900px) {
    .deferred-banner {
      padding: 0.625rem 0.875rem;
    }
  }
</style>
