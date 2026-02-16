<script lang="ts">
  /**
   * @fileoverview GoalForm — form component for creating or editing a goal.
   *
   * Supports two goal types:
   *   - **Completion** — a simple done/not-done goal
   *   - **Incremental** — a goal with a numeric target value
   *
   * When editing an existing goal (`entityId` is set), the form:
   *   - Integrates `trackEditing` to mark the entity as being edited
   *   - Renders a `DeferredChangesBanner` if remote changes arrive while editing
   *   - Highlights fields that were just updated from remote data with a shimmer
   *
   * The `remoteData` derived value compares current props (DB state) against
   * local form state to detect when the parent's data diverges from user edits.
   */

  // =============================================================================
  //  Imports
  // =============================================================================

  import type { GoalType } from '$lib/types';
  import { trackEditing } from 'stellar-drive/actions';
  import DeferredChangesBanner from 'stellar-drive/components/DeferredChangesBanner';

  // =============================================================================
  //  Props Interface
  // =============================================================================

  interface Props {
    /** Initial goal name — pre-filled when editing */
    name?: string;
    /** Initial goal type — `'completion'` or `'incremental'` */
    type?: GoalType;
    /** Initial target value for incremental goals */
    targetValue?: number | null;
    /** Label for the submit button (e.g. "Create", "Save") */
    submitLabel?: string;
    /** Entity ID when editing — `null` for new goals */
    entityId?: string | null;
    /** Entity type string for `trackEditing` */
    entityType?: string;
    /** Callback with the validated form data on submission */
    onSubmit: (data: { name: string; type: GoalType; targetValue: number | null }) => void;
    /** Optional cancel callback — renders Cancel button when provided */
    onCancel?: () => void;
  }

  // =============================================================================
  //  Component State
  // =============================================================================

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

  /* ── Local form state (editable copies of initial props) ──── */
  // svelte-ignore state_referenced_locally
  let name = $state(initialName);
  // svelte-ignore state_referenced_locally
  let type = $state<GoalType>(initialType);
  // svelte-ignore state_referenced_locally
  let targetValue = $state(initialTargetValue ?? 10);

  /** Fields that were recently overwritten by remote data — triggers shimmer CSS */
  let highlightedFields = $state<Set<string>>(new Set());

  /** Human-readable labels for diff display in `DeferredChangesBanner` */
  const fieldLabels: Record<string, string> = {
    name: 'Name',
    type: 'Type',
    target_value: 'Target'
  };

  // =============================================================================
  //  Derived Values
  // =============================================================================

  /**
   * Compares reactive props (latest DB state) against local form state.
   * Returns a snapshot of the remote values when they differ, or `null`
   * when everything matches. Props update when realtime writes to IndexedDB;
   * local state holds user edits.
   */
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

  // =============================================================================
  //  Helper Functions
  // =============================================================================

  /**
   * Overwrites local form state with the latest prop values (remote data)
   * and temporarily highlights the changed fields with a shimmer animation.
   */
  function loadRemoteData() {
    const fieldsToHighlight: string[] = [];
    if (name !== initialName) fieldsToHighlight.push('name');
    if (type !== initialType) fieldsToHighlight.push('type');
    if (targetValue !== (initialTargetValue ?? 10)) fieldsToHighlight.push('target_value');

    name = initialName;
    type = initialType;
    targetValue = initialTargetValue ?? 10;

    /* Trigger shimmer CSS class, then clear after 1.4s */
    highlightedFields = new Set(fieldsToHighlight);
    setTimeout(() => {
      highlightedFields = new Set();
    }, 1400);
  }

  /**
   * Validates the form and calls `onSubmit` with structured data.
   * Only includes `targetValue` for incremental goals.
   *
   * @param {Event} event — the form submit event
   */
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

<!-- ═══ Goal Form ═══ -->
<form
  class="goal-form"
  onsubmit={handleSubmit}
  use:trackEditing={{ entityId: entityId ?? 'new', entityType, formType: 'manual-save' }}
>
  <!-- Deferred changes banner — only shown when editing an existing goal -->
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

  <!-- ═══ Name Field ═══ -->
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

  <!-- ═══ Goal Type Toggle ═══ -->
  <div class="form-group">
    <span id="goal-type-label" class="label">Goal Type</span>
    <div
      class="type-toggle"
      class:field-changed={highlightedFields.has('type')}
      role="group"
      aria-labelledby="goal-type-label"
    >
      <!-- Completion type button -->
      <button
        type="button"
        class="type-btn"
        class:active={type === 'completion'}
        onclick={() => (type = 'completion')}
      >
        <span class="type-icon">✓</span>
        <span>Completion</span>
      </button>
      <!-- Incremental type button -->
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

  <!-- ═══ Target Value (incremental only) ═══ -->
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

  <!-- ═══ Form Actions ═══ -->
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
  /* ═══ Form Layout ═══ */

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

  /* ═══ Goal Type Toggle ═══ */

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

  /* Radial glow overlay — fades in on hover/active */
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

  /* Active state — selected goal type */
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

  /* ═══ Type Icon ═══ */

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

  /* ═══ Form Actions ═══ */

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 1rem;
    padding-top: 1.25rem;
    border-top: 1px solid rgba(108, 92, 231, 0.15);
  }
</style>
