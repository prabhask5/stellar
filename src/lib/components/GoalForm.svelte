<script lang="ts">
  import type { GoalType } from '$lib/types';
  import { trackEditing } from '@prabhask5/stellar-engine/actions';
  import DeferredChangesBanner from './DeferredChangesBanner.svelte';

  interface Props {
    name?: string;
    type?: GoalType;
    targetValue?: number | null;
    submitLabel?: string;
    // For trackEditing - existing entity being edited
    entityId?: string | null;
    entityType?: string;
    onSubmit: (data: { name: string; type: GoalType; targetValue: number | null }) => void;
    onCancel?: () => void;
  }

  let {
    name: initialName = '',
    type: initialType = 'completion',
    targetValue: initialTargetValue = 10,
    submitLabel = 'Create',
    entityId = null,
    entityType = 'goals',
    onSubmit,
    onCancel
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(initialName);
  // svelte-ignore state_referenced_locally
  let type = $state<GoalType>(initialType);
  // svelte-ignore state_referenced_locally
  let targetValue = $state(initialTargetValue ?? 10);

  // Track which fields were recently animated for shimmer effect
  let highlightedFields = $state<Set<string>>(new Set());

  const fieldLabels: Record<string, string> = {
    name: 'Name',
    type: 'Type',
    target_value: 'Target'
  };

  // Derive remote data by comparing reactive props (DB state) to local form state.
  // Props update when realtime writes to IndexedDB; local state holds user edits.
  const remoteData = $derived.by(() => {
    if (!entityId) return null;
    const propName = initialName;
    const propType = initialType;
    const propTarget = initialTargetValue ?? 10;
    if (propName !== name || propType !== type || propTarget !== targetValue) {
      return { name: propName, type: propType, target_value: propTarget };
    }
    return null;
  });

  function loadRemoteData() {
    const fieldsToHighlight: string[] = [];
    if (name !== initialName) fieldsToHighlight.push('name');
    if (type !== initialType) fieldsToHighlight.push('type');
    if (targetValue !== (initialTargetValue ?? 10)) fieldsToHighlight.push('target_value');

    name = initialName;
    type = initialType;
    targetValue = initialTargetValue ?? 10;

    highlightedFields = new Set(fieldsToHighlight);
    setTimeout(() => {
      highlightedFields = new Set();
    }, 1400);
  }

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (!name.trim()) return;

    onSubmit({
      name: name.trim(),
      type,
      targetValue: type === 'incremental' ? targetValue : null
    });
  }
</script>

<form
  class="goal-form"
  onsubmit={handleSubmit}
  use:trackEditing={{ entityId: entityId ?? 'new', entityType, formType: 'manual-save' }}
>
  {#if entityId}
    <DeferredChangesBanner
      {entityId}
      {entityType}
      {remoteData}
      localData={{ name, type, target_value: targetValue }}
      {fieldLabels}
      onLoadRemote={loadRemoteData}
      onDismiss={() => {}}
    />
  {/if}

  <div class="form-group">
    <label for="goal-name">Goal Name</label>
    <input
      id="goal-name"
      type="text"
      bind:value={name}
      placeholder="Enter goal name..."
      required
      class:field-changed={highlightedFields.has('name')}
    />
  </div>

  <div class="form-group">
    <span id="goal-type-label" class="label">Goal Type</span>
    <div
      class="type-toggle"
      class:field-changed={highlightedFields.has('type')}
      role="group"
      aria-labelledby="goal-type-label"
    >
      <button
        type="button"
        class="type-btn"
        class:active={type === 'completion'}
        onclick={() => (type = 'completion')}
      >
        <span class="type-icon">✓</span>
        <span>Completion</span>
      </button>
      <button
        type="button"
        class="type-btn"
        class:active={type === 'incremental'}
        onclick={() => (type = 'incremental')}
      >
        <span class="type-icon">↑</span>
        <span>Incremental</span>
      </button>
    </div>
  </div>

  {#if type === 'incremental'}
    <div class="form-group">
      <label for="target-value">Target Value</label>
      <input
        id="target-value"
        type="number"
        bind:value={targetValue}
        min="1"
        required
        class:field-changed={highlightedFields.has('target_value')}
      />
    </div>
  {/if}

  <div class="form-actions">
    {#if onCancel}
      <button type="button" class="btn btn-secondary" onclick={onCancel}> Cancel </button>
    {/if}
    <button type="submit" class="btn btn-primary">
      {submitLabel}
    </button>
  </div>
</form>

<style>
  .goal-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .form-group label,
  .form-group .label {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .type-toggle {
    display: flex;
    gap: 1rem;
  }

  .type-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1.25rem 1rem;
    background: linear-gradient(145deg, rgba(20, 20, 40, 0.9) 0%, rgba(15, 15, 32, 0.95) 100%);
    border: 2px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-xl);
    transition: all 0.35s var(--ease-out);
    position: relative;
    overflow: hidden;
  }

  .type-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at center, rgba(108, 92, 231, 0.3) 0%, transparent 70%);
    opacity: 0;
    transition: opacity 0.3s;
  }

  .type-btn:hover {
    border-color: rgba(108, 92, 231, 0.5);
    transform: translateY(-3px);
    box-shadow:
      0 12px 30px rgba(0, 0, 0, 0.4),
      0 0 40px rgba(108, 92, 231, 0.15);
  }

  .type-btn:hover::before {
    opacity: 0.5;
  }

  .type-btn.active {
    border-color: var(--color-primary);
    background: linear-gradient(145deg, rgba(108, 92, 231, 0.2) 0%, rgba(15, 15, 32, 0.95) 100%);
    box-shadow:
      0 0 40px var(--color-primary-glow),
      inset 0 0 40px rgba(108, 92, 231, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .type-btn.active::before {
    opacity: 0.3;
  }

  .type-icon {
    font-size: 2rem;
    position: relative;
    z-index: 1;
    transition: all 0.35s var(--ease-spring);
  }

  .type-btn:hover .type-icon {
    transform: scale(1.25) rotate(5deg);
  }

  .type-btn.active .type-icon {
    filter: drop-shadow(0 0 15px var(--color-primary));
    animation: iconGlow 2s ease-in-out infinite;
  }

  @keyframes iconGlow {
    0%,
    100% {
      filter: drop-shadow(0 0 15px var(--color-primary-glow));
    }
    50% {
      filter: drop-shadow(0 0 25px var(--color-primary-glow));
    }
  }

  .type-btn span:last-child {
    position: relative;
    z-index: 1;
    font-weight: 600;
    font-size: 0.9rem;
    letter-spacing: 0.02em;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 1rem;
    padding-top: 1.25rem;
    border-top: 1px solid rgba(108, 92, 231, 0.15);
  }
</style>
