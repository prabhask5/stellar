<script lang="ts">
  import type { FocusSettings } from '$lib/types';
  import { trackEditing } from '@prabhask5/stellar-engine/actions';
  import DeferredChangesBanner from '../DeferredChangesBanner.svelte';
  import Modal from '../Modal.svelte';

  interface Props {
    settings: FocusSettings | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (updates: Partial<FocusSettings>) => void;
  }

  let { settings, isOpen, onClose, onSave }: Props = $props();

  // Local state for form -- populated once on mount, not reactively
  let focusDuration = $state(25);
  let breakDuration = $state(5);
  let longBreakDuration = $state(15);
  let cyclesBeforeLongBreak = $state(4);
  let autoStartBreaks = $state(false);
  let autoStartFocus = $state(false);
  let initialized = $state(false);

  // Track which fields were recently animated for highlight effect
  let highlightedFields = $state<Set<string>>(new Set());

  const fieldLabels: Record<string, string> = {
    focus_duration: 'Focus Duration',
    break_duration: 'Short Break',
    long_break_duration: 'Long Break',
    cycles_before_long_break: 'Cycles Before Long Break',
    auto_start_breaks: 'Auto-start Breaks',
    auto_start_focus: 'Auto-start Focus'
  };

  function formatValue(field: string, value: unknown): string {
    if (typeof value === 'boolean') return value ? 'On' : 'Off';
    if (
      field === 'focus_duration' ||
      field === 'break_duration' ||
      field === 'long_break_duration'
    ) {
      return `${value} min`;
    }
    return String(value ?? 'None');
  }

  // Initialize form state when modal opens with settings
  $effect(() => {
    if (isOpen && settings && !initialized) {
      focusDuration = settings.focus_duration;
      breakDuration = settings.break_duration;
      longBreakDuration = settings.long_break_duration;
      cyclesBeforeLongBreak = settings.cycles_before_long_break;
      autoStartBreaks = settings.auto_start_breaks;
      autoStartFocus = settings.auto_start_focus;
      initialized = true;
    }
    if (!isOpen) {
      initialized = false;
      highlightedFields = new Set();
    }
  });

  // Derive remote data by comparing reactive settings prop (DB state) to local form state.
  // The settings prop updates when realtime writes to IndexedDB; local state holds user edits.
  const remoteData = $derived.by(() => {
    if (!settings || !initialized) return null;
    const hasDiff =
      settings.focus_duration !== focusDuration ||
      settings.break_duration !== breakDuration ||
      settings.long_break_duration !== longBreakDuration ||
      settings.cycles_before_long_break !== cyclesBeforeLongBreak ||
      settings.auto_start_breaks !== autoStartBreaks ||
      settings.auto_start_focus !== autoStartFocus;
    if (!hasDiff) return null;
    return {
      focus_duration: settings.focus_duration,
      break_duration: settings.break_duration,
      long_break_duration: settings.long_break_duration,
      cycles_before_long_break: settings.cycles_before_long_break,
      auto_start_breaks: settings.auto_start_breaks,
      auto_start_focus: settings.auto_start_focus
    };
  });

  // Animate a slider value smoothly from current to target
  function animateSliderTo(
    getCurrentValue: () => number,
    setValue: (v: number) => void,
    targetValue: number,
    step: number,
    duration: number = 500
  ) {
    const startValue = getCurrentValue();
    if (startValue === targetValue) return;

    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const rawValue = startValue + (targetValue - startValue) * eased;
      // Snap to nearest step
      const snapped = Math.round(rawValue / step) * step;
      setValue(snapped);

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        setValue(targetValue);
      }
    }

    requestAnimationFrame(tick);
  }

  function loadRemoteData() {
    if (!settings) return;

    const fieldsToHighlight: string[] = [];

    // Capture target values before local state changes
    const targets = {
      focus_duration: settings.focus_duration,
      break_duration: settings.break_duration,
      long_break_duration: settings.long_break_duration,
      cycles_before_long_break: settings.cycles_before_long_break,
      auto_start_breaks: settings.auto_start_breaks,
      auto_start_focus: settings.auto_start_focus
    };

    // Animate sliders
    if (targets.focus_duration !== focusDuration) {
      fieldsToHighlight.push('focus_duration');
      animateSliderTo(
        () => focusDuration,
        (v) => (focusDuration = v),
        targets.focus_duration,
        15
      );
    }
    if (targets.break_duration !== breakDuration) {
      fieldsToHighlight.push('break_duration');
      animateSliderTo(
        () => breakDuration,
        (v) => (breakDuration = v),
        targets.break_duration,
        1
      );
    }
    if (targets.long_break_duration !== longBreakDuration) {
      fieldsToHighlight.push('long_break_duration');
      animateSliderTo(
        () => longBreakDuration,
        (v) => (longBreakDuration = v),
        targets.long_break_duration,
        5
      );
    }
    if (targets.cycles_before_long_break !== cyclesBeforeLongBreak) {
      fieldsToHighlight.push('cycles_before_long_break');
      animateSliderTo(
        () => cyclesBeforeLongBreak,
        (v) => (cyclesBeforeLongBreak = v),
        targets.cycles_before_long_break,
        1
      );
    }

    // Toggles update immediately (they have built-in CSS transitions)
    if (targets.auto_start_breaks !== autoStartBreaks) {
      fieldsToHighlight.push('auto_start_breaks');
      autoStartBreaks = targets.auto_start_breaks;
    }
    if (targets.auto_start_focus !== autoStartFocus) {
      fieldsToHighlight.push('auto_start_focus');
      autoStartFocus = targets.auto_start_focus;
    }

    // Apply highlight shimmer
    highlightedFields = new Set(fieldsToHighlight);
    setTimeout(() => {
      highlightedFields = new Set();
    }, 1400);
  }

  function dismissBanner() {
    // Do nothing -- keep local edits. The banner component clears the store's
    // deferred changes so it won't re-show until a new remote change arrives.
  }

  function handleSave() {
    onSave({
      focus_duration: focusDuration,
      break_duration: breakDuration,
      long_break_duration: longBreakDuration,
      cycles_before_long_break: cyclesBeforeLongBreak,
      auto_start_breaks: autoStartBreaks,
      auto_start_focus: autoStartFocus
    });
    onClose();
  }
</script>

<Modal open={isOpen} title="Focus Settings" {onClose}>
  <div
    class="modal-body"
    use:trackEditing={{
      entityId: settings?.id ?? 'new',
      entityType: 'focus_settings',
      formType: 'manual-save'
    }}
  >
    {#if settings?.id}
      <DeferredChangesBanner
        entityId={settings.id}
        entityType="focus_settings"
        {remoteData}
        localData={{
          focus_duration: focusDuration,
          break_duration: breakDuration,
          long_break_duration: longBreakDuration,
          cycles_before_long_break: cyclesBeforeLongBreak,
          auto_start_breaks: autoStartBreaks,
          auto_start_focus: autoStartFocus
        }}
        {fieldLabels}
        {formatValue}
        onLoadRemote={loadRemoteData}
        onDismiss={dismissBanner}
      />
    {/if}

    <!-- Focus Duration -->
    <div class="setting-group">
      <label class="setting-label" for="focus-duration">
        <span class="label-text">Focus Duration</span>
        <span class="label-value">{focusDuration} min</span>
      </label>
      <input
        id="focus-duration"
        type="range"
        min="15"
        max="240"
        step="15"
        bind:value={focusDuration}
        class="slider"
        class:field-changed={highlightedFields.has('focus_duration')}
      />
    </div>

    <!-- Break Duration -->
    <div class="setting-group">
      <label class="setting-label" for="break-duration">
        <span class="label-text">Short Break</span>
        <span class="label-value">{breakDuration} min</span>
      </label>
      <input
        id="break-duration"
        type="range"
        min="3"
        max="20"
        step="1"
        bind:value={breakDuration}
        class="slider break"
        class:field-changed={highlightedFields.has('break_duration')}
      />
    </div>

    <!-- Long Break Duration -->
    <div class="setting-group">
      <label class="setting-label" for="long-break-duration">
        <span class="label-text">Long Break</span>
        <span class="label-value">{longBreakDuration} min</span>
      </label>
      <input
        id="long-break-duration"
        type="range"
        min="10"
        max="60"
        step="5"
        bind:value={longBreakDuration}
        class="slider long-break"
        class:field-changed={highlightedFields.has('long_break_duration')}
      />
    </div>

    <!-- Cycles Before Long Break -->
    <div class="setting-group">
      <label class="setting-label" for="cycles-before-long-break">
        <span class="label-text">Cycles Before Long Break</span>
        <span class="label-value">{cyclesBeforeLongBreak}</span>
      </label>
      <input
        id="cycles-before-long-break"
        type="range"
        min="2"
        max="6"
        step="1"
        bind:value={cyclesBeforeLongBreak}
        class="slider"
        class:field-changed={highlightedFields.has('cycles_before_long_break')}
      />
    </div>

    <hr class="divider" />

    <!-- Auto-start toggles -->
    <div class="setting-group toggle-group">
      <span class="toggle-label" id="auto-start-breaks-label">
        <span class="label-text">Auto-start Breaks</span>
        <span class="label-desc">Automatically start break timer after focus</span>
      </span>
      <button
        class="toggle-btn"
        class:active={autoStartBreaks}
        class:field-changed={highlightedFields.has('auto_start_breaks')}
        onclick={() => (autoStartBreaks = !autoStartBreaks)}
        aria-checked={autoStartBreaks}
        aria-labelledby="auto-start-breaks-label"
        role="switch"
      >
        <span class="toggle-knob"></span>
      </button>
    </div>

    <div class="setting-group toggle-group">
      <span class="toggle-label" id="auto-start-focus-label">
        <span class="label-text">Auto-start Focus</span>
        <span class="label-desc">Automatically start focus timer after break</span>
      </span>
      <button
        class="toggle-btn"
        class:active={autoStartFocus}
        class:field-changed={highlightedFields.has('auto_start_focus')}
        onclick={() => (autoStartFocus = !autoStartFocus)}
        aria-checked={autoStartFocus}
        aria-labelledby="auto-start-focus-label"
        role="switch"
      >
        <span class="toggle-knob"></span>
      </button>
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" onclick={onClose}>Cancel</button>
      <button class="btn btn-primary" onclick={handleSave}>Save Settings</button>
    </div>
  </div>
</Modal>

<style>
  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.375rem;
    border-radius: var(--radius-md);
    transition:
      background 0.3s,
      box-shadow 0.3s;
  }

  /* Cosmic shimmer applied directly on slider/toggle via global .field-changed::after */

  .setting-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .label-text {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .label-value {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-primary-light);
  }

  /* Slider styles */
  .slider {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: rgba(108, 92, 231, 0.2);
    outline: none;
    -webkit-appearance: none;
    appearance: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--gradient-primary);
    cursor: pointer;
    box-shadow: 0 2px 8px var(--color-primary-glow);
    transition: transform 0.2s;
  }

  .slider::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }

  .slider.break::-webkit-slider-thumb {
    background: linear-gradient(135deg, #26de81 0%, #00d4ff 100%);
    box-shadow: 0 2px 8px rgba(38, 222, 129, 0.5);
  }

  .slider.long-break::-webkit-slider-thumb {
    background: linear-gradient(135deg, #00d4ff 0%, #6c5ce7 100%);
    box-shadow: 0 2px 8px rgba(0, 212, 255, 0.5);
  }

  /* Firefox slider styles */
  .slider::-moz-range-track {
    height: 6px;
    border-radius: 3px;
    background: rgba(108, 92, 231, 0.2);
    border: none;
  }

  .slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--gradient-primary);
    cursor: pointer;
    box-shadow: 0 2px 8px var(--color-primary-glow);
    border: none;
    transition: transform 0.2s;
  }

  .slider::-moz-range-thumb:hover {
    transform: scale(1.15);
  }

  .slider.break::-moz-range-thumb {
    background: linear-gradient(135deg, #26de81 0%, #00d4ff 100%);
    box-shadow: 0 2px 8px rgba(38, 222, 129, 0.5);
  }

  .slider.long-break::-moz-range-thumb {
    background: linear-gradient(135deg, #00d4ff 0%, #6c5ce7 100%);
    box-shadow: 0 2px 8px rgba(0, 212, 255, 0.5);
  }

  .divider {
    border: none;
    border-top: 1px solid rgba(108, 92, 231, 0.15);
    margin: 0.5rem 0;
  }

  /* Toggle styles */
  .toggle-group {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .toggle-label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .label-desc {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .toggle-btn {
    position: relative;
    width: 48px;
    height: 28px;
    border-radius: 14px;
    background: rgba(108, 92, 231, 0.2);
    border: 1px solid rgba(108, 92, 231, 0.3);
    cursor: pointer;
    transition: all 0.3s;
    flex-shrink: 0;
  }

  .toggle-btn.active {
    background: var(--gradient-primary);
    border-color: transparent;
  }

  .toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: white;
    transition: transform 0.3s var(--ease-spring);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .toggle-btn.active .toggle-knob {
    transform: translateX(20px);
  }

  .modal-footer {
    display: flex;
    gap: 0.75rem;
    padding: 1.25rem 1.5rem;
    border-top: 1px solid rgba(108, 92, 231, 0.15);
  }

  .btn {
    flex: 1;
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
    font-weight: 600;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.3s;
  }

  .btn-secondary {
    background: rgba(108, 92, 231, 0.15);
    border: 1px solid rgba(108, 92, 231, 0.3);
    color: var(--color-text);
  }

  .btn-secondary:hover {
    background: rgba(108, 92, 231, 0.25);
    border-color: rgba(108, 92, 231, 0.5);
  }

  .btn-primary {
    background: var(--gradient-primary);
    border: none;
    color: white;
    box-shadow: 0 4px 12px var(--color-primary-glow);
  }

  .btn-primary:hover {
    box-shadow: 0 6px 20px var(--color-primary-glow);
    transform: translateY(-1px);
  }

  /* Tablet responsive toggles */
  @media (min-width: 641px) and (max-width: 900px) {
    .toggle-btn {
      width: 44px;
      height: 26px;
    }

    .toggle-knob {
      width: 20px;
      height: 20px;
    }

    .toggle-btn.active .toggle-knob {
      transform: translateX(18px);
    }
  }
</style>
