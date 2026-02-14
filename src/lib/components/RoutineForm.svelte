<script lang="ts">
  /**
   * @fileoverview RoutineForm — reusable form for creating and editing routines.
   *
   * Renders fields for name, goal type (completion / incremental / progressive),
   * target values, date range, and active-day selection.  Supports **deferred
   * change detection** — when the underlying DB entity is updated while the user
   * is editing, a banner shows the diff and lets the user load the remote data.
   *
   * Key behaviours:
   * - Goal-type buttons conditionally reveal type-specific fields.
   * - Active-day selector with quick-select shortcuts (weekdays, weekends, all).
   * - Progressive type forces an end-date requirement.
   * - Field-level shimmer highlights fields that were just updated from remote.
   * - Uses `trackEditing` to coordinate with the engine's editing-lock system.
   */

  import type { GoalType, DayOfWeek } from '$lib/types';
  import { formatDate } from '$lib/utils/dates';
  import { trackEditing } from '@prabhask5/stellar-engine/actions';
  import DeferredChangesBanner from './DeferredChangesBanner.svelte';

  // =============================================================================
  //                                  Props
  // =============================================================================

  interface Props {
    /** Pre-filled routine name (empty string for new routines) */
    name?: string;
    /** Goal tracking type — `completion`, `incremental`, or `progressive` */
    type?: GoalType;
    /** Daily target for incremental routines */
    targetValue?: number | null;
    /** Starting threshold for progressive routines */
    startTargetValue?: number | null;
    /** Ending threshold for progressive routines */
    endTargetValue?: number | null;
    /** Number of occurrences before the progressive threshold increments */
    progressionSchedule?: number | null;
    /** ISO date string — when the routine becomes active */
    startDate?: string;
    /** ISO date string — optional routine expiry date */
    endDate?: string | null;
    /** Which days of the week the routine is active (`null` → every day) */
    activeDays?: DayOfWeek[] | null;
    /** Label rendered on the submit button (e.g. "Create" or "Save") */
    submitLabel?: string;
    /** Existing entity ID when editing — `null` for creation */
    entityId?: string | null;
    /** Entity type string forwarded to `trackEditing` */
    entityType?: string;
    /** Callback fired with the validated form payload on submit */
    onSubmit: (data: {
      name: string;
      type: GoalType;
      targetValue: number | null;
      startTargetValue: number | null;
      endTargetValue: number | null;
      progressionSchedule: number | null;
      startDate: string;
      endDate: string | null;
      activeDays: DayOfWeek[] | null;
    }) => void;
    /** Optional cancel handler — when provided a cancel button is rendered */
    onCancel?: () => void;
  }

  let {
    name: initialName = '',
    type: initialType = 'completion',
    targetValue: initialTargetValue = 10,
    startTargetValue: initialStartTargetValue = 10,
    endTargetValue: initialEndTargetValue = 50,
    progressionSchedule: initialProgressionSchedule = 1,
    startDate: initialStartDate = formatDate(new Date()),
    endDate: initialEndDate = null,
    activeDays: initialActiveDays = null,
    submitLabel = 'Create',
    entityId = null,
    entityType = 'routines',
    onSubmit,
    onCancel
  }: Props = $props();

  // =============================================================================
  //                              Constants
  // =============================================================================

  /** Mapping of day-of-week indices → short / full labels used by the selector */
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
  //                           Local Form State
  // =============================================================================

  // These form fields intentionally capture the initial prop value for editing.
  // svelte-ignore state_referenced_locally
  let name = $state(initialName);
  // svelte-ignore state_referenced_locally
  let type = $state<GoalType>(initialType);
  // svelte-ignore state_referenced_locally
  let targetValue = $state(initialTargetValue ?? 10);
  // svelte-ignore state_referenced_locally
  let startTargetValue = $state(initialStartTargetValue ?? 10);
  // svelte-ignore state_referenced_locally
  let endTargetValue = $state(initialEndTargetValue ?? 50);
  // svelte-ignore state_referenced_locally
  let progressionSchedule = $state(initialProgressionSchedule ?? 1);
  // svelte-ignore state_referenced_locally
  let startDate = $state(initialStartDate);
  // svelte-ignore state_referenced_locally
  let hasEndDate = $state(initialEndDate !== null || initialType === 'progressive');
  // svelte-ignore state_referenced_locally
  let endDate = $state(initialEndDate ?? formatDate(new Date()));

  /** Set of field keys currently showing the shimmer highlight animation */
  let highlightedFields = $state<Set<string>>(new Set());

  /* ── Active-day selector state ────────────────────────────────────────── */
  // `null` → all days; empty set → invalid (disallowed by UI)
  // svelte-ignore state_referenced_locally
  let selectedDays = $state<Set<DayOfWeek>>(
    initialActiveDays === null
      ? new Set([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[])
      : new Set(initialActiveDays)
  );

  /** Derived — `true` when all 7 days are selected */
  let allDaysSelected = $derived(selectedDays.size === 7);

  // =============================================================================
  //                        Day-Selection Helpers
  // =============================================================================

  /**
   * Toggle a single day on/off in the selector.
   * Prevents deselecting the last remaining day.
   * @param {DayOfWeek} day - Day index (0 = Sun … 6 = Sat)
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

  /** Select all 7 days at once. */
  function selectAllDays() {
    selectedDays = new Set([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]);
  }

  /** Select weekdays only (Mon–Fri). */
  function selectWeekdays() {
    selectedDays = new Set([1, 2, 3, 4, 5] as DayOfWeek[]);
  }

  /** Select weekends only (Sat & Sun). */
  function selectWeekends() {
    selectedDays = new Set([0, 6] as DayOfWeek[]);
  }

  // =============================================================================
  //                         Derived Descriptions
  // =============================================================================

  /**
   * Human-readable summary of the current day selection — shown in the
   * help text at the bottom of the form (e.g. "weekdays only", "Mon, Wed, Fri").
   */
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
  //                    Deferred-Change Banner Helpers
  // =============================================================================

  /** Human-readable labels for each field key shown in the diff banner */
  const routineFieldLabels: Record<string, string> = {
    name: 'Name',
    type: 'Type',
    target_value: 'Target',
    start_target_value: 'Starting Threshold',
    end_target_value: 'Ending Threshold',
    progression_schedule: 'Milestone Interval',
    start_date: 'Start Date',
    end_date: 'End Date',
    active_days: 'Active Days'
  };

  /** Single-letter day labels used by `formatActiveDays` */
  const dayShortLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  /**
   * Format a `DayOfWeek[]` into a compact string for the deferred-change banner.
   * @param {DayOfWeek[] | null} days - Selected days or `null` for every day
   * @returns {string} Formatted string (e.g. "Weekdays", "S, T, S")
   */
  function formatActiveDays(days: DayOfWeek[] | null): string {
    if (days === null) return 'Everyday';
    if (days.length === 5 && !days.includes(0) && !days.includes(6)) return 'Weekdays';
    if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends';
    return days.map((d) => dayShortLabels[d]).join(', ');
  }

  /**
   * Stringify a field value for the deferred-change banner display.
   * @param {string} field  - Field key
   * @param {unknown} value - Raw field value
   * @returns {string} Human-readable representation
   */
  function formatFieldValue(field: string, value: unknown): string {
    if (field === 'active_days') return formatActiveDays(value as DayOfWeek[] | null);
    if (typeof value === 'boolean') return value ? 'On' : 'Off';
    if (value === null || value === undefined) return 'None';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  }

  // =============================================================================
  //                   Remote-vs-Local Diff Detection
  // =============================================================================

  /** Derived local active days — `null` when all days are selected */
  const localActiveDays = $derived(
    allDaysSelected ? null : Array.from(selectedDays).sort((a, b) => a - b)
  );

  /** Derived local end date — `null` when the "has end date" toggle is off */
  const localEndDate = $derived(hasEndDate ? endDate : null);

  /**
   * Compares current prop values (representing DB state) against local form
   * state.  Returns a snapshot of the remote values when a diff exists, or
   * `null` when the form is in sync with the DB.  Used by `DeferredChangesBanner`.
   */
  const remoteData = $derived.by(() => {
    if (!entityId) return null;
    const propActiveDays = initialActiveDays;
    const propEndDate = initialEndDate;
    const hasDiff =
      initialName !== name ||
      initialType !== type ||
      (initialTargetValue ?? 10) !== targetValue ||
      (initialStartTargetValue ?? 10) !== startTargetValue ||
      (initialEndTargetValue ?? 50) !== endTargetValue ||
      (initialProgressionSchedule ?? 1) !== progressionSchedule ||
      initialStartDate !== startDate ||
      JSON.stringify(propEndDate) !== JSON.stringify(localEndDate) ||
      JSON.stringify(propActiveDays) !== JSON.stringify(localActiveDays);
    if (!hasDiff) return null;
    return {
      name: initialName,
      type: initialType,
      target_value: initialTargetValue ?? 10,
      start_target_value: initialStartTargetValue ?? 10,
      end_target_value: initialEndTargetValue ?? 50,
      progression_schedule: initialProgressionSchedule ?? 1,
      start_date: initialStartDate,
      end_date: propEndDate,
      active_days: propActiveDays
    };
  });

  /**
   * Reset all local form fields to match the current prop (remote) values.
   * Triggers a shimmer highlight on every field that actually changed so the
   * user can see what was updated.
   */
  function loadRemoteData() {
    const fieldsToHighlight: string[] = [];
    if (name !== initialName) fieldsToHighlight.push('name');
    if (type !== initialType) fieldsToHighlight.push('type');
    if (targetValue !== (initialTargetValue ?? 10)) fieldsToHighlight.push('target_value');
    if (startTargetValue !== (initialStartTargetValue ?? 10))
      fieldsToHighlight.push('start_target_value');
    if (endTargetValue !== (initialEndTargetValue ?? 50))
      fieldsToHighlight.push('end_target_value');
    if (progressionSchedule !== (initialProgressionSchedule ?? 1))
      fieldsToHighlight.push('progression_schedule');
    if (startDate !== initialStartDate) fieldsToHighlight.push('start_date');
    if (JSON.stringify(hasEndDate ? endDate : null) !== JSON.stringify(initialEndDate))
      fieldsToHighlight.push('end_date');
    const currentActiveDays = allDaysSelected
      ? null
      : Array.from(selectedDays).sort((a, b) => a - b);
    if (JSON.stringify(currentActiveDays) !== JSON.stringify(initialActiveDays))
      fieldsToHighlight.push('active_days');

    /* ── Apply remote values to local state ── */
    name = initialName;
    type = initialType;
    targetValue = initialTargetValue ?? 10;
    startTargetValue = initialStartTargetValue ?? 10;
    endTargetValue = initialEndTargetValue ?? 50;
    progressionSchedule = initialProgressionSchedule ?? 1;
    startDate = initialStartDate;
    hasEndDate = initialEndDate !== null || initialType === 'progressive';
    endDate = initialEndDate ?? formatDate(new Date());
    selectedDays =
      initialActiveDays === null
        ? new Set([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[])
        : new Set(initialActiveDays);

    /* ── Trigger shimmer then clear after animation completes ── */
    highlightedFields = new Set(fieldsToHighlight);
    setTimeout(() => {
      highlightedFields = new Set();
    }, 1400);
  }

  // =============================================================================
  //                             Effects
  // =============================================================================

  /** Progressive routines always require an end date — enforce this reactively */
  $effect(() => {
    if (type === 'progressive') {
      hasEndDate = true;
    }
  });

  // =============================================================================
  //                          Form Submission
  // =============================================================================

  /**
   * Validate and submit the form data to the parent component.
   * @param {Event} event - Native form submit event
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
      type,
      targetValue: type === 'incremental' ? targetValue : null,
      startTargetValue: type === 'progressive' ? startTargetValue : null,
      endTargetValue: type === 'progressive' ? endTargetValue : null,
      progressionSchedule: type === 'progressive' ? progressionSchedule : null,
      startDate,
      endDate: hasEndDate ? endDate : null,
      activeDays: activeDaysResult
    });
  }
</script>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Template — Routine Form
     ═══════════════════════════════════════════════════════════════════════════ -->

<form
  class="routine-form"
  onsubmit={handleSubmit}
  use:trackEditing={{ entityId: entityId ?? 'new', entityType, formType: 'manual-save' }}
>
  <!-- ═══ Deferred-Change Banner (edit mode only) ═══ -->
  {#if entityId}
    <DeferredChangesBanner
      {entityId}
      {entityType}
      {remoteData}
      localData={{
        name,
        type,
        target_value: targetValue,
        start_target_value: startTargetValue,
        end_target_value: endTargetValue,
        progression_schedule: progressionSchedule,
        start_date: startDate,
        end_date: hasEndDate ? endDate : null,
        active_days: allDaysSelected ? null : Array.from(selectedDays).sort((a, b) => a - b)
      }}
      fieldLabels={routineFieldLabels}
      formatValue={formatFieldValue}
      onLoadRemote={loadRemoteData}
      onDismiss={() => {}}
    />
  {/if}

  <!-- ═══ Routine Name ═══ -->
  <div class="form-group">
    <label for="routine-name">Routine Name</label>
    <input
      id="routine-name"
      type="text"
      bind:value={name}
      placeholder="Enter routine name..."
      required
      class:field-changed={highlightedFields.has('name')}
    />
  </div>

  <!-- ═══ Goal Type Toggle ═══ -->
  <div class="form-group">
    <span id="routine-goal-type-label" class="label">Goal Type</span>
    <div
      class="type-toggle"
      class:field-changed={highlightedFields.has('type')}
      role="group"
      aria-labelledby="routine-goal-type-label"
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
      <button
        type="button"
        class="type-btn"
        class:active={type === 'progressive'}
        onclick={() => (type = 'progressive')}
      >
        <span class="type-icon">↗</span>
        <span>Progressive</span>
      </button>
    </div>
  </div>

  <!-- ═══ Incremental-Specific: Daily Target ═══ -->
  {#if type === 'incremental'}
    <div class="form-group">
      <label for="target-value">Daily Target Value</label>
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

  <!-- ═══ Progressive-Specific: Threshold Range & Interval ═══ -->
  {#if type === 'progressive'}
    <div class="form-group">
      <label for="start-target-value">Starting Threshold</label>
      <input
        id="start-target-value"
        type="number"
        bind:value={startTargetValue}
        min="1"
        required
        class:field-changed={highlightedFields.has('start_target_value')}
      />
    </div>
    <div class="form-group">
      <label for="end-target-value">Ending Threshold</label>
      <input
        id="end-target-value"
        type="number"
        bind:value={endTargetValue}
        min="1"
        required
        class:field-changed={highlightedFields.has('end_target_value')}
      />
    </div>
    <div class="form-group">
      <label for="progression-schedule">Milestone Interval</label>
      <input
        id="progression-schedule"
        type="number"
        bind:value={progressionSchedule}
        min="1"
        required
        class:field-changed={highlightedFields.has('progression_schedule')}
      />
      <p class="field-help">
        The threshold will increase after every {progressionSchedule === 1
          ? 'occurrence'
          : progressionSchedule + ' occurrences'}.
      </p>
    </div>
  {/if}

  <!-- ═══ Active Days Selector ═══ -->
  <div class="form-group">
    <span id="routine-active-days-label" class="label">Active Days</span>
    <div
      class="days-selector"
      class:field-changed={highlightedFields.has('active_days')}
      role="group"
      aria-labelledby="routine-active-days-label"
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
    <!-- Quick-select presets -->
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

  <!-- ═══ Date Range ═══ -->
  <div class="form-row">
    <div class="form-group">
      <label for="start-date">Start Date</label>
      <input
        id="start-date"
        type="date"
        bind:value={startDate}
        required
        class:field-changed={highlightedFields.has('start_date')}
      />
    </div>

    <div class="form-group">
      <label for="end-date-toggle" class="checkbox-label">
        <input
          id="end-date-toggle"
          type="checkbox"
          bind:checked={hasEndDate}
          disabled={type === 'progressive'}
          class:field-changed={highlightedFields.has('end_date')}
        />
        <span>Has End Date{type === 'progressive' ? ' (required)' : ''}</span>
      </label>
      {#if hasEndDate}
        <input id="end-date" type="date" bind:value={endDate} min={startDate} required />
      {/if}
    </div>
  </div>

  <!-- ═══ Summary Help Text ═══ -->
  <p class="help-text">
    {#if hasEndDate}
      This routine will be active on <strong>{activeDaysDescription()}</strong> from {startDate} to {endDate}.
    {:else}
      This routine will be active on <strong>{activeDaysDescription()}</strong> starting from {startDate}.
    {/if}
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

<!-- ═══════════════════════════════════════════════════════════════════════════
     Styles
     ═══════════════════════════════════════════════════════════════════════════ -->

<style>
  /* ═══ Form Layout ═══ */

  .routine-form {
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

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
  }

  @media (max-width: 480px) {
    .form-row {
      grid-template-columns: 1fr;
    }
  }

  /* ═══ Goal Type Toggle Buttons ═══ */

  .type-toggle {
    display: flex;
    gap: 0.75rem;
  }

  .type-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: linear-gradient(135deg, rgba(37, 37, 61, 0.8) 0%, rgba(26, 26, 46, 0.9) 100%);
    border: 2px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    transition: all 0.3s var(--ease-smooth);
    position: relative;
    overflow: hidden;
  }

  /* Gradient overlay — visible only when active */
  .type-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--gradient-primary);
    opacity: 0;
    transition: opacity 0.3s;
  }

  .type-btn:hover {
    border-color: rgba(108, 92, 231, 0.5);
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
  }

  .type-btn.active {
    border-color: var(--color-primary);
    box-shadow:
      0 0 25px var(--color-primary-glow),
      inset 0 0 30px rgba(108, 92, 231, 0.1);
  }

  .type-btn.active::before {
    opacity: 0.15;
  }

  .type-icon {
    font-size: 1.75rem;
    position: relative;
    z-index: 1;
    transition: transform 0.3s var(--ease-bounce);
  }

  .type-btn:hover .type-icon {
    transform: scale(1.2);
  }

  .type-btn.active .type-icon {
    filter: drop-shadow(0 0 10px var(--color-primary));
  }

  .type-btn span:last-child {
    position: relative;
    z-index: 1;
    font-weight: 500;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     DAYS SELECTOR
     ═══════════════════════════════════════════════════════════════════════════════════ */

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

  /* Mobile: single-letter abbreviation */
  .day-btn .day-short {
    display: block;
    font-size: 0.875rem;
  }

  /* Desktop: 3-letter abbreviation — hidden on small screens */
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

  /* ═══ Quick-Select Preset Buttons ═══ */

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

  /* ═══════════════════════════════════════════════════════════════════════════════════
     OTHER FORM ELEMENTS
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: var(--radius-md);
    transition: background 0.2s;
  }

  .checkbox-label:hover {
    background: rgba(108, 92, 231, 0.1);
  }

  .checkbox-label input[type='checkbox'] {
    width: 20px;
    height: 20px;
    cursor: pointer;
    accent-color: var(--color-primary);
  }

  .field-help {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    line-height: 1.5;
    margin: 0;
  }

  /* ═══ Summary / Help Text ═══ */

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
