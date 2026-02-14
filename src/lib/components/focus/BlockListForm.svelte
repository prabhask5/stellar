<script lang="ts">
  /**
   * @fileoverview Form for creating or editing a website block list.
   *
   * Renders a form with two fields:
   * - **Name** — text input for the block list's display name
   * - **Active Days** — a 7-day toggle selector (Sun–Sat) with quick-select
   *   presets for "Every day", "Weekdays", and "Weekends"
   *
   * When editing an existing block list (`entityId` is provided), the form
   * integrates with the `trackEditing` action and the `DeferredChangesBanner`
   * component to handle remote-sync conflicts — showing a banner when the
   * server-side data diverges from the user's local edits and offering to
   * load the remote values with a shimmer highlight animation.
   *
   * The form uses a "manual-save" pattern: changes are local until the
   * user explicitly clicks the submit button.
   */

  import type { DayOfWeek } from '$lib/types';
  import { trackEditing } from '@prabhask5/stellar-engine/actions';
  import DeferredChangesBanner from '@prabhask5/stellar-engine/components/DeferredChangesBanner';

  // =============================================================================
  //  Props Interface
  // =============================================================================

  interface Props {
    /** Initial block list name — empty string for new lists */
    name?: string;
    /** Initial active days — `null` means every day; array for specific days */
    activeDays?: DayOfWeek[] | null;
    /** Label text for the submit button (e.g., "Create" or "Save") */
    submitLabel?: string;
    /** Entity ID of the block list being edited — `null` for new lists */
    // For trackEditing - existing entity being edited
    entityId?: string | null;
    /** Callback → fires with validated form data on submission */
    onSubmit: (data: { name: string; activeDays: DayOfWeek[] | null }) => void;
    /** Optional callback → fires when the cancel button is clicked */
    onCancel?: () => void;
  }

  let {
    name: initialName = '',
    activeDays: initialActiveDays = null,
    submitLabel = 'Create',
    entityId = null,
    onSubmit,
    onCancel
  }: Props = $props();

  // =============================================================================
  //  Constants
  // =============================================================================

  /** Day-of-week metadata — maps numeric `DayOfWeek` values to short / full labels */
  // Day labels for the selector
  const dayLabels: { short: string; full: string; value: DayOfWeek }[] = [
    { short: 'S', full: 'Sun', value: 0 },
    { short: 'M', full: 'Mon', value: 1 },
    { short: 'T', full: 'Tue', value: 2 },
    { short: 'W', full: 'Wed', value: 3 },
    { short: 'T', full: 'Thu', value: 4 },
    { short: 'F', full: 'Fri', value: 5 },
    { short: 'S', full: 'Sat', value: 6 }
  ];

  // =============================================================================
  //  Local Form State
  // =============================================================================

  // svelte-ignore state_referenced_locally
  let name = $state(initialName);

  /** Fields currently showing the shimmer highlight after loading remote data */
  // Track which fields were recently animated for shimmer effect
  let highlightedFields = $state<Set<string>>(new Set());

  /**
   * Set of selected day-of-week values.
   * - `null` active-days input → all 7 days selected
   * - Non-null → only the specified days
   */
  // Active days state - null means all days, empty array means no days (invalid)
  // Default to all days selected if null
  // svelte-ignore state_referenced_locally
  let selectedDays = $state<Set<DayOfWeek>>(
    initialActiveDays === null
      ? new Set([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[])
      : new Set(initialActiveDays)
  );

  /** Whether every day of the week is currently selected */
  let allDaysSelected = $derived(selectedDays.size === 7);

  // =============================================================================
  //  Day Selection Handlers
  // =============================================================================

  /**
   * Toggles a single day on or off — prevents deselecting the last remaining day.
   *
   * @param day - The `DayOfWeek` numeric value (0 = Sun, 6 = Sat)
   */
  function toggleDay(day: DayOfWeek) {
    const newSet = new Set(selectedDays);
    if (newSet.has(day)) {
      // Don't allow deselecting the last day
      if (newSet.size > 1) {
        newSet.delete(day);
      }
    } else {
      newSet.add(day);
    }
    selectedDays = newSet;
  }

  /**
   * Quick-select preset — selects all 7 days (Sun–Sat).
   */
  function selectAllDays() {
    selectedDays = new Set([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]);
  }

  /**
   * Quick-select preset — selects weekdays only (Mon–Fri).
   */
  function selectWeekdays() {
    selectedDays = new Set([1, 2, 3, 4, 5] as DayOfWeek[]);
  }

  /**
   * Quick-select preset — selects weekends only (Sun, Sat).
   */
  function selectWeekends() {
    selectedDays = new Set([0, 6] as DayOfWeek[]);
  }

  // =============================================================================
  //  Derived Descriptions
  // =============================================================================

  /**
   * Human-readable summary of the selected active days
   * — e.g., "every day", "weekdays only", or "Sun, Wed, Fri".
   */
  // Helper to get active days description
  const activeDaysDescription = $derived(() => {
    if (selectedDays.size === 7) return 'every day';
    if (selectedDays.size === 5 && !selectedDays.has(0) && !selectedDays.has(6)) {
      return 'weekdays only';
    }
    if (selectedDays.size === 2 && selectedDays.has(0) && selectedDays.has(6)) {
      return 'weekends only';
    }
    const days = Array.from(selectedDays).sort((a, b) => a - b);
    return days.map((d) => dayLabels[d].full).join(', ');
  });

  // =============================================================================
  //  Remote Sync / Deferred Changes
  // =============================================================================

  /** Human-readable labels for the `DeferredChangesBanner` field display */
  const blockListFieldLabels: Record<string, string> = {
    name: 'Name',
    active_days: 'Active Days'
  };

  /* ── Short day labels for compact formatting ──── */
  const dayShortLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  /**
   * Formats an `active_days` array into a short display string.
   *
   * @param days - Array of `DayOfWeek` values, or `null` for every day
   * @returns Formatted string — "Everyday", "Weekdays", "Weekends", or comma-separated letters
   */
  function formatActiveDays(days: DayOfWeek[] | null): string {
    if (days === null) return 'Everyday';
    if (days.length === 5 && !days.includes(0) && !days.includes(6)) return 'Weekdays';
    if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends';
    return days.map((d) => dayShortLabels[d]).join(', ');
  }

  /**
   * Generic field value formatter for the deferred-changes banner.
   *
   * @param field - Field key (e.g., "name", "active_days")
   * @param value - Raw field value
   * @returns Human-readable string representation
   */
  function formatFieldValue(field: string, value: unknown): string {
    if (field === 'active_days') return formatActiveDays(value as DayOfWeek[] | null);
    if (typeof value === 'boolean') return value ? 'On' : 'Off';
    if (value === null || value === undefined) return 'None';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  }

  /**
   * The local active-days value normalised for comparison / submission.
   * Returns `null` when all days are selected (semantically "every day").
   */
  // Derive remote data by comparing reactive props (DB state) to local form state
  const localActiveDays = $derived(
    allDaysSelected ? null : Array.from(selectedDays).sort((a, b) => a - b)
  );

  /**
   * Computes the remote (server-side) data snapshot when it diverges from local
   * form state. Returns `null` when there is no conflict — meaning either we are
   * creating a new entity or the local form matches the prop values.
   */
  const remoteData = $derived.by(() => {
    if (!entityId) return null;
    const hasDiff =
      initialName !== name || JSON.stringify(initialActiveDays) !== JSON.stringify(localActiveDays);
    if (!hasDiff) return null;
    return {
      name: initialName,
      active_days: initialActiveDays
    };
  });

  /**
   * Replaces local form state with the latest remote (prop) values and
   * triggers a shimmer highlight on changed fields for visual feedback.
   */
  function loadRemoteData() {
    const fieldsToHighlight: string[] = [];
    if (name !== initialName) fieldsToHighlight.push('name');
    const currentActiveDays = allDaysSelected
      ? null
      : Array.from(selectedDays).sort((a, b) => a - b);
    if (JSON.stringify(currentActiveDays) !== JSON.stringify(initialActiveDays))
      fieldsToHighlight.push('active_days');

    /* ── Apply remote values ──── */
    name = initialName;
    selectedDays =
      initialActiveDays === null
        ? new Set([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[])
        : new Set(initialActiveDays);

    /* ── Trigger shimmer then clear after animation completes ──── */
    highlightedFields = new Set(fieldsToHighlight);
    setTimeout(() => {
      highlightedFields = new Set();
    }, 1400);
  }

  // =============================================================================
  //  Form Submission
  // =============================================================================

  /**
   * Validates and submits the form data. Prevents submission when name is
   * blank or no days are selected.
   *
   * @param event - Native form submit event (prevented)
   */
  function handleSubmit(event: Event) {
    event.preventDefault();
    if (!name.trim()) return;
    if (selectedDays.size === 0) return;

    // Convert selected days to sorted array, or null if all days selected
    const activeDaysResult: DayOfWeek[] | null = allDaysSelected
      ? null
      : (Array.from(selectedDays).sort((a, b) => a - b) as DayOfWeek[]);

    onSubmit({
      name: name.trim(),
      activeDays: activeDaysResult
    });
  }
</script>

<!-- ═══ Block List Form ═══ -->
<form
  class="block-list-form"
  onsubmit={handleSubmit}
  use:trackEditing={{
    entityId: entityId ?? 'new',
    entityType: 'block_lists',
    formType: 'manual-save'
  }}
>
  <!-- Deferred changes banner — visible only when editing an existing list with remote conflicts -->
  {#if entityId}
    <DeferredChangesBanner
      {entityId}
      entityType="block_lists"
      {remoteData}
      localData={{
        name,
        active_days: allDaysSelected ? null : Array.from(selectedDays).sort((a, b) => a - b)
      }}
      fieldLabels={blockListFieldLabels}
      formatValue={formatFieldValue}
      onLoadRemote={loadRemoteData}
      onDismiss={() => {}}
    />
  {/if}

  <!-- ═══ Name Input ═══ -->
  <div class="form-group">
    <label for="block-list-name">Block List Name</label>
    <input
      id="block-list-name"
      type="text"
      bind:value={name}
      placeholder="Enter block list name..."
      required
      class:field-changed={highlightedFields.has('name')}
    />
  </div>

  <!-- ═══ Active Days Selector ═══ -->
  <div class="form-group">
    <span id="blocklist-active-days-label" class="label">Active Days</span>
    <div
      class="days-selector"
      class:field-changed={highlightedFields.has('active_days')}
      role="group"
      aria-labelledby="blocklist-active-days-label"
    >
      {#each dayLabels as day (day.value)}
        <button
          type="button"
          class="day-btn"
          class:active={selectedDays.has(day.value)}
          onclick={() => toggleDay(day.value)}
          title={day.full}
          aria-label={day.full}
          aria-pressed={selectedDays.has(day.value)}
        >
          <span class="day-short">{day.short}</span>
          <span class="day-full">{day.full}</span>
        </button>
      {/each}
    </div>
    <!-- Quick-select preset buttons -->
    <div class="quick-select">
      <button
        type="button"
        class="quick-btn"
        class:active={allDaysSelected}
        onclick={selectAllDays}
      >
        Every day
      </button>
      <button
        type="button"
        class="quick-btn"
        class:active={selectedDays.size === 5 && !selectedDays.has(0) && !selectedDays.has(6)}
        onclick={selectWeekdays}
      >
        Weekdays
      </button>
      <button
        type="button"
        class="quick-btn"
        class:active={selectedDays.size === 2 && selectedDays.has(0) && selectedDays.has(6)}
        onclick={selectWeekends}
      >
        Weekends
      </button>
    </div>
  </div>

  <!-- Help text summarising the active-days selection -->
  <p class="help-text">
    This block list will be active on <strong>{activeDaysDescription()}</strong> during focus sessions.
  </p>

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

  .block-list-form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .form-group label,
  .form-group .label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* ═══ Days Selector ═══ */

  .days-selector {
    display: flex;
    gap: 0.375rem;
    justify-content: space-between;
  }

  .day-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    height: 48px;
    padding: 0.375rem;
    background: linear-gradient(135deg, rgba(37, 37, 61, 0.8) 0%, rgba(26, 26, 46, 0.9) 100%);
    border: 2px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-md);
    transition: all 0.2s var(--ease-smooth);
    color: var(--color-text-muted);
    font-weight: 600;
  }

  /* Single-letter label shown on small screens */
  .day-btn .day-short {
    display: block;
    font-size: 0.875rem;
  }

  /* Full abbreviation hidden by default, shown on wider screens */
  .day-btn .day-full {
    display: none;
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .day-btn:hover {
    border-color: rgba(108, 92, 231, 0.4);
    transform: translateY(-1px);
  }

  /* Selected day — purple glow + highlighted border */
  .day-btn.active {
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.3) 0%, rgba(108, 92, 231, 0.15) 100%);
    border-color: var(--color-primary);
    color: var(--color-text);
    box-shadow: 0 0 12px var(--color-primary-glow);
  }

  .day-btn.active:hover {
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.4) 0%, rgba(108, 92, 231, 0.2) 100%);
  }

  /* Larger screens — show full day name instead of single letter */
  @media (min-width: 480px) {
    .day-btn {
      height: 52px;
      min-width: 44px;
    }

    .day-btn .day-short {
      display: none;
    }

    .day-btn .day-full {
      display: block;
    }
  }

  /* ═══ Quick Select Presets ═══ */

  .quick-select {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .quick-btn {
    flex: 1;
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    background: rgba(37, 37, 61, 0.5);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-md);
    transition: all 0.2s var(--ease-smooth);
    white-space: nowrap;
  }

  .quick-btn:hover {
    background: rgba(108, 92, 231, 0.15);
    border-color: rgba(108, 92, 231, 0.3);
    color: var(--color-text);
  }

  .quick-btn.active {
    background: rgba(108, 92, 231, 0.2);
    border-color: var(--color-primary);
    color: var(--color-primary-light);
  }

  @media (max-width: 400px) {
    .quick-select {
      flex-wrap: wrap;
    }

    .quick-btn {
      flex: none;
      padding: 0.375rem 0.625rem;
      font-size: 0.6875rem;
    }
  }

  /* ═══ Help Text ═══ */

  .help-text {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    padding: 0.875rem 1rem;
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.1) 0%, rgba(108, 92, 231, 0.05) 100%);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    line-height: 1.6;
  }

  .help-text strong {
    color: var(--color-primary-light);
    font-weight: 600;
  }

  /* ═══ Form Actions ═══ */

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 0.75rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(108, 92, 231, 0.1);
  }
</style>
