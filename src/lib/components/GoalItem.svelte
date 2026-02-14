<script lang="ts">
  /**
   * @fileoverview GoalItem — single goal row with interactive controls and celebration effects.
   *
   * Renders one goal in a list — supports three goal types:
   * - **completion** — binary checkbox (done / not done).
   * - **incremental** — +/- buttons with a numeric `current/target` display.
   * - **progressive** — same controls as incremental (progressive just changes
   *   how the target increases over the routine's lifespan).
   *
   * Key behaviours:
   * - The progress bar fills proportionally and changes colour via
   *   `getProgressColor` / `getOverflowColor`.
   * - When `progress > 100%` the component enters a "celebrating" state with
   *   escalating visual effects: shimmer, pulse rings, orbiting sparks,
   *   star icons, particle burst, and energy arcs — all intensity-scaled
   *   by `celebrationIntensity`.
   * - Clicking the numeric value opens an inline `<input>` to set an
   *   arbitrary value (clamped to >= 0, overflow above target is allowed).
   * - `triggerLocalAnimation` provides immediate feedback on toggle / increment.
   * - `remoteChangeAnimation` highlights rows updated by another device.
   * - On mobile, the delete button moves from row 1 to the name row for
   *   better touch ergonomics.
   */

  import { getProgressColor, calculateGoalProgress, getOverflowColor } from '$lib/utils/colors';
  import { remoteChangeAnimation, triggerLocalAnimation } from '@prabhask5/stellar-engine/actions';
  import { truncateTooltip } from '@prabhask5/stellar-engine/actions';
  import type { Goal, DailyRoutineGoal, DailyGoalProgress } from '$lib/types';

  // =============================================================================
  //                                  Props
  // =============================================================================

  interface Props {
    /** The goal data — either a standalone `Goal` or a `DailyRoutineGoal` with optional progress */
    goal: Goal | (DailyRoutineGoal & { progress?: DailyGoalProgress });
    /** Toggle completion (completion-type goals) */
    onToggleComplete?: () => void;
    /** Increment current value by 1 (incremental/progressive goals) */
    onIncrement?: () => void;
    /** Decrement current value by 1 */
    onDecrement?: () => void;
    /** Set an arbitrary current value (via inline edit) */
    onSetValue?: (value: number) => void;
    /** Open the edit form for this goal */
    onEdit?: () => void;
    /** Delete this goal */
    onDelete?: () => void;
  }

  let { goal, onToggleComplete, onIncrement, onDecrement, onSetValue, onEdit, onDelete }: Props =
    $props();

  // =============================================================================
  //                      Entity Type for Remote Tracking
  // =============================================================================

  /** Determines whether this is a `goals` or `daily_routine_goals` entity for remote animations */
  const entityType = $derived('goal_list_id' in goal ? 'goals' : 'daily_routine_goals');

  // =============================================================================
  //                      Element Reference (for animations)
  // =============================================================================

  /** DOM reference for the goal row — used by `triggerLocalAnimation` */
  let element: HTMLElement;

  // =============================================================================
  //                          Event Handlers
  // =============================================================================

  /**
   * Toggle completion with an immediate local animation.
   */
  function handleToggle() {
    triggerLocalAnimation(element, 'toggle');
    onToggleComplete?.();
  }

  /**
   * Increment value with an immediate local animation.
   */
  function handleIncrement() {
    triggerLocalAnimation(element, 'increment');
    onIncrement?.();
  }

  /**
   * Decrement value with an immediate local animation.
   */
  function handleDecrement() {
    triggerLocalAnimation(element, 'decrement');
    onDecrement?.();
  }

  // =============================================================================
  //                          Utility Actions
  // =============================================================================

  /**
   * Auto-focus action — skipped on mobile to avoid keyboard popup.
   * @param {HTMLElement} node - Element to focus
   */
  function focus(node: HTMLElement) {
    if (window.innerWidth > 640) {
      node.focus();
    }
  }

  // =============================================================================
  //                          Inline Value Editing
  // =============================================================================

  /** Whether the inline value input is visible */
  let editing = $state(false);
  /** Temporary buffer for the value being edited */
  let inputValue = $state('');

  // =============================================================================
  //                    Derived — Goal Value Resolution
  // =============================================================================

  /** Whether this is a standalone goal (vs. a daily-routine goal) */
  const isRegularGoal = $derived('goal_list_id' in goal);

  /** Raw current value — resolved differently for Goal vs DailyRoutineGoal */
  const rawCurrentValue = $derived(
    isRegularGoal
      ? (goal as Goal).current_value
      : ((goal as DailyRoutineGoal & { progress?: DailyGoalProgress }).progress?.current_value ?? 0)
  );

  /** Current value (overflow allowed — NOT capped at target) */
  const currentValue = $derived(rawCurrentValue);

  /** Whether this goal is marked as completed */
  const completed = $derived(
    isRegularGoal
      ? (goal as Goal).completed
      : ((goal as DailyRoutineGoal & { progress?: DailyGoalProgress }).progress?.completed ?? false)
  );

  // =============================================================================
  //                    Derived — Progress & Colour
  // =============================================================================

  /** Progress percentage (can exceed 100 for overflow) */
  const progress = $derived(
    calculateGoalProgress(goal.type, completed, currentValue, goal.target_value)
  );

  /**
   * Bar colour — switches to the overflow palette when progress exceeds 100%.
   * Regular progress uses green-to-purple gradient; overflow adds gold / hot-pink.
   */
  const progressColor = $derived(
    progress > 100 ? getOverflowColor(progress) : getProgressColor(progress)
  );

  // =============================================================================
  //                    Derived — Celebration Effects
  // =============================================================================

  /** Whether the goal has exceeded its target (triggers visual celebration) */
  const isCelebrating = $derived(progress > 100);

  /**
   * Intensity scalar (0..1) that controls the magnitude of celebration effects.
   * Reaches 1.0 at 200% progress.
   */
  const celebrationIntensity = $derived(progress <= 100 ? 0 : Math.min(1, (progress - 100) / 100));

  // =============================================================================
  //                    Inline Value Edit Handlers
  // =============================================================================

  /**
   * Enter inline-editing mode for the current value.
   */
  function startEditing() {
    if (!onSetValue) return;
    inputValue = String(currentValue);
    editing = true;
  }

  /**
   * Handle keystrokes in the value input — Enter commits, Escape cancels.
   * @param {KeyboardEvent} e - The keydown event
   */
  function handleInputKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      commitValue();
    } else if (e.key === 'Escape') {
      editing = false;
    }
  }

  /**
   * Commit the edited value (clamped to >= 0; overflow above target is allowed).
   */
  function commitValue() {
    editing = false;
    const parsed = parseInt(inputValue, 10);
    if (!isNaN(parsed) && parsed !== currentValue && onSetValue) {
      const clamped = Math.max(0, parsed);
      onSetValue(clamped);
    }
  }
</script>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Template — Goal Item Row
     ═══════════════════════════════════════════════════════════════════════════ -->

<div
  bind:this={element}
  class="goal-item"
  class:celebrating={isCelebrating}
  class:is-incremental={goal.type === 'incremental' || goal.type === 'progressive'}
  style="border-left-color: {progressColor}; --celebration-intensity: {celebrationIntensity}; --glow-color: {progressColor}"
  use:remoteChangeAnimation={{ entityId: goal.id, entityType }}
>
  <div class="goal-content">
    <!-- ═══ Row 1: Controls + Action Buttons ═══ -->
    <div class="goal-row">
      {#if goal.type === 'completion'}
        <!-- Completion checkbox -->
        <button
          class="checkbox"
          class:checked={completed}
          onclick={handleToggle}
          style="border-color: {progressColor}; background-color: {completed
            ? progressColor
            : 'transparent'}"
          aria-label={completed ? 'Mark as incomplete' : 'Mark as complete'}
        >
          {#if completed}
            <span class="checkmark">✓</span>
          {/if}
        </button>
      {:else}
        <!-- Incremental / Progressive — decrement, value, increment -->
        <div class="increment-controls">
          <button class="increment-btn" onclick={handleDecrement} aria-label="Decrement">−</button>
          {#if editing}
            <input
              type="number"
              class="value-input"
              bind:value={inputValue}
              onkeydown={handleInputKeydown}
              onblur={commitValue}
              min="0"
              use:focus
            />
          {:else}
            <button
              class="current-value"
              style="color: {progressColor}"
              onclick={startEditing}
              disabled={!onSetValue}
              aria-label="Click to edit value"
            >
              {currentValue}/{goal.target_value}
            </button>
          {/if}
          <button class="increment-btn" onclick={handleIncrement} aria-label="Increment">+</button>
        </div>
      {/if}

      <!-- Edit / Delete action buttons -->
      <div class="goal-actions">
        {#if onEdit}
          <button class="action-btn" onclick={onEdit} aria-label="Edit goal">✎</button>
        {/if}
        {#if onDelete}
          <button class="action-btn delete row1-delete" onclick={onDelete} aria-label="Delete goal"
            >×</button
          >
        {/if}
      </div>
    </div>

    <!-- ═══ Row 2: Goal Name (+ mobile delete) ═══ -->
    <div class="name-row">
      <span
        class="goal-name"
        class:completed={completed && goal.type === 'completion'}
        use:truncateTooltip
      >
        {goal.name}
      </span>
      <!-- Delete button duplicated here for mobile layout -->
      {#if onDelete}
        <button
          class="action-btn delete name-row-delete"
          onclick={onDelete}
          aria-label="Delete goal">×</button
        >
      {/if}
    </div>

    <!-- ═══ Row 3: Progress Bar + Celebration Effects (incremental / progressive only) ═══ -->
    {#if goal.type === 'incremental' || goal.type === 'progressive'}
      <div
        class="mini-progress-wrapper"
        class:celebrating={isCelebrating}
        style="--glow-color: {progressColor}; --celebration-intensity: {celebrationIntensity}"
      >
        <!-- Pulse rings — appear at moderate overflow -->
        {#if celebrationIntensity > 0.3}
          <div class="pulse-ring pulse-ring-1"></div>
          {#if celebrationIntensity > 0.6}
            <div class="pulse-ring pulse-ring-2"></div>
          {/if}
        {/if}

        <!-- The actual progress bar -->
        <div class="mini-progress" class:celebrating={isCelebrating}>
          <div
            class="mini-progress-fill"
            class:celebrating={isCelebrating}
            style="width: {Math.min(100, progress)}%; background-color: {progressColor}"
          ></div>
          <!-- Shimmer overlay — sweeps across the bar when celebrating -->
          {#if isCelebrating}
            <div class="shimmer-overlay"></div>
          {/if}
        </div>

        <!-- Particle burst — intensity-scaled count of radiating dots -->
        {#if celebrationIntensity > 0.1}
          <div class="particle-burst">
            {#each Array(Math.floor(celebrationIntensity * 8)) as _, i (i)}
              <div
                class="particle"
                style="--angle: {i * 45}deg; --delay: {i * 0.15}s; --distance: {20 +
                  (i % 3) * 10}px"
              ></div>
            {/each}
          </div>
        {/if}

        <!-- Orbiting sparks — appear at high overflow -->
        {#if celebrationIntensity > 0.5}
          <div class="orbit-spark orbit-1"></div>
          {#if celebrationIntensity > 0.75}
            <div class="orbit-spark orbit-2"></div>
          {/if}
        {/if}

        <!-- Decorative overflow stars -->
        {#if isCelebrating}
          <span class="overflow-star star-1">✦</span>
          {#if celebrationIntensity > 0.4}
            <span class="overflow-star star-2">✦</span>
          {/if}
          {#if celebrationIntensity > 0.7}
            <span class="overflow-star star-3">✧</span>
          {/if}
        {/if}

        <!-- Energy arc crackle effects at extreme overflow -->
        {#if celebrationIntensity > 0.6}
          <div class="energy-arc arc-1"></div>
          {#if celebrationIntensity > 0.85}
            <div class="energy-arc arc-2"></div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Styles
     ═══════════════════════════════════════════════════════════════════════════ -->

<style>
  /* ═══ Goal Item Container ═══ */

  .goal-item {
    padding: 1.25rem 1.75rem;
    background: linear-gradient(135deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-left-width: 4px;
    border-radius: var(--radius-xl);
    transition:
      border-color 0.35s var(--ease-out),
      box-shadow 0.35s var(--ease-out),
      transform 0.35s var(--ease-out);
    position: relative;
    overflow: hidden;
  }

  .goal-content {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }

  /* Top shine line */
  .goal-item::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(108, 92, 231, 0.3) 30%,
      rgba(255, 255, 255, 0.15) 50%,
      rgba(108, 92, 231, 0.3) 70%,
      transparent 100%
    );
  }

  /* Subtle nebula glow (appears on hover) */
  .goal-item::after {
    content: '';
    position: absolute;
    top: -50%;
    right: -20%;
    width: 100px;
    height: 200%;
    background: radial-gradient(ellipse, rgba(108, 92, 231, 0.08) 0%, transparent 70%);
    pointer-events: none;
    transition: opacity 0.3s;
    opacity: 0;
  }

  @media (hover: hover) {
    .goal-item:hover {
      transform: translateX(6px) translateY(-2px);
    }

    .goal-item:hover::after {
      opacity: 1;
    }
  }

  .goal-item:hover {
    border-color: rgba(108, 92, 231, 0.35);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 60px rgba(108, 92, 231, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  /* ═══ Celebration Effects (overflow > 100%) ═══ */

  .goal-item.celebrating {
    border-color: color-mix(in srgb, var(--glow-color) 40%, rgba(108, 92, 231, 0.15));
    box-shadow:
      0 4px 20px rgba(0, 0, 0, 0.3),
      0 0 calc(20px + var(--celebration-intensity, 0) * 30px)
        color-mix(
          in srgb,
          var(--glow-color) calc(var(--celebration-intensity, 0) * 40%),
          transparent
        );
  }

  .goal-item.celebrating::after {
    opacity: calc(0.3 + var(--celebration-intensity, 0) * 0.7);
    background: radial-gradient(
      ellipse,
      color-mix(in srgb, var(--glow-color) 15%, transparent) 0%,
      transparent 70%
    );
  }

  /* ═══ Goal Row (controls + actions) ═══ */

  .goal-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-width: 0;
  }

  /* ═══ Progress Bar Wrapper ═══ */

  .mini-progress-wrapper {
    position: relative;
    width: 100%;
    height: 10px;
    margin: 0;
    flex-shrink: 0;
  }

  /* ═══ Completion Checkbox ═══ */

  .checkbox {
    width: 32px;
    height: 32px;
    border: 2px solid;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s var(--ease-spring);
    flex-shrink: 0;
    position: relative;
    cursor: pointer;
  }

  /* Glow behind checkbox on hover */
  .checkbox::before {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0;
    filter: blur(12px);
    transition: opacity 0.3s;
  }

  .checkbox:hover {
    transform: scale(1.15) rotate(5deg);
  }

  .checkbox:hover::before {
    opacity: 0.35;
  }

  .checkbox.checked {
    animation: starComplete 0.5s var(--ease-spring);
  }

  @keyframes starComplete {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.3);
      box-shadow: 0 0 30px currentColor;
    }
    100% {
      transform: scale(1);
    }
  }

  .checkmark {
    color: white;
    font-size: 1.125rem;
    font-weight: bold;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    animation: checkAppear 0.3s var(--ease-spring);
  }

  @keyframes checkAppear {
    from {
      transform: scale(0) rotate(-90deg);
      opacity: 0;
    }
    to {
      transform: scale(1) rotate(0);
      opacity: 1;
    }
  }

  /* ═══ Increment Controls ═══ */

  .increment-controls {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    flex-shrink: 0;
  }

  .increment-btn {
    width: 36px;
    height: 36px;
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: var(--radius-lg);
    background: linear-gradient(145deg, rgba(30, 30, 55, 0.9) 0%, rgba(20, 20, 40, 0.95) 100%);
    font-size: 1.375rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background 0.15s,
      border-color 0.15s,
      color 0.15s,
      box-shadow 0.15s;
    color: var(--color-text-muted);
    -webkit-tap-highlight-color: transparent;
  }

  .increment-btn:hover {
    background: var(--gradient-primary);
    border-color: transparent;
    color: white;
    box-shadow: 0 0 25px var(--color-primary-glow);
  }

  .increment-btn:active {
    background: var(--gradient-primary);
    border-color: transparent;
    color: white;
    box-shadow: 0 0 15px var(--color-primary-glow);
  }

  /* ═══ Current Value Display ═══ */

  .current-value {
    font-weight: 800;
    font-size: 1rem;
    min-width: 4.5rem;
    text-align: center;
    background: none;
    border: none;
    padding: 0.5rem 0.625rem;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.25s var(--ease-out);
    text-shadow: 0 0 20px currentColor;
    font-variant-numeric: tabular-nums;
    font-family: var(--font-mono);
  }

  .current-value:hover:not(:disabled) {
    background: rgba(108, 92, 231, 0.2);
    transform: scale(1.08);
    text-shadow: 0 0 30px currentColor;
  }

  .current-value:disabled {
    cursor: default;
  }

  /* ═══ Inline Value Input ═══ */

  .value-input {
    min-width: 4.5rem;
    width: 4.5rem;
    box-sizing: border-box;
    text-align: center;
    font-weight: 800;
    font-size: 1rem;
    padding: 0.5rem 0.625rem;
    border: 2px solid var(--color-primary);
    border-radius: var(--radius-lg);
    background: rgba(108, 92, 231, 0.15);
    color: var(--color-text);
    box-shadow:
      0 0 30px var(--color-primary-glow),
      inset 0 0 20px rgba(108, 92, 231, 0.1);
    font-family: var(--font-mono);
  }

  /* Hide native number spinner */
  .value-input::-webkit-inner-spin-button,
  .value-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .value-input[type='number'] {
    -moz-appearance: textfield;
    appearance: textfield;
  }

  /* ═══ Name Row ═══ */

  .name-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  /* Desktop: delete lives in row 1 — hidden beside name */
  .name-row-delete {
    display: none;
  }

  .goal-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
    font-size: 1rem;
    transition: all 0.3s;
    letter-spacing: -0.01em;
  }

  .goal-name.completed {
    text-decoration: line-through;
    opacity: 0.5;
    font-style: italic;
    filter: blur(0.5px);
  }

  /* ═══ Action Buttons (edit / delete) ═══ */

  .goal-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
  }

  /* ═══ Celebrating Progress Wrapper Glow ═══ */

  .mini-progress-wrapper.celebrating {
    filter: drop-shadow(0 0 calc(4px + var(--celebration-intensity, 0) * 12px) var(--glow-color));
    animation: wrapperPulse calc(1.5s - var(--celebration-intensity, 0) * 0.5s) ease-in-out infinite;
  }

  @keyframes wrapperPulse {
    0%,
    100% {
      filter: drop-shadow(0 0 calc(4px + var(--celebration-intensity, 0) * 12px) var(--glow-color));
    }
    50% {
      filter: drop-shadow(0 0 calc(8px + var(--celebration-intensity, 0) * 20px) var(--glow-color));
    }
  }

  /* ═══ Progress Bar ═══ */

  .mini-progress {
    width: 100%;
    height: 100%;
    border-radius: var(--radius-full);
    overflow: hidden;
    background: rgba(20, 20, 40, 0.9);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.4);
    position: relative;
    border: 1px solid rgba(108, 92, 231, 0.15);
  }

  .mini-progress.celebrating {
    border-color: color-mix(in srgb, var(--glow-color) 50%, transparent);
  }

  .mini-progress-fill {
    height: 100%;
    border-radius: var(--radius-full);
    transition: width 0.5s var(--ease-out);
    box-shadow: 0 0 15px currentColor;
    position: relative;
    overflow: hidden;
  }

  /* Glass-like highlight on top half of the fill bar */
  .mini-progress-fill::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 50%;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.3) 0%, transparent 100%);
    border-radius: var(--radius-full);
  }

  .mini-progress-fill.celebrating {
    animation: fillPulse calc(0.8s - var(--celebration-intensity, 0) * 0.3s) ease-in-out infinite;
  }

  @keyframes fillPulse {
    0%,
    100% {
      filter: brightness(1);
      box-shadow: 0 0 15px currentColor;
    }
    50% {
      filter: brightness(1.3);
      box-shadow:
        0 0 25px currentColor,
        0 0 40px currentColor;
    }
  }

  /* ═══ Shimmer Overlay ═══ */

  .shimmer-overlay {
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.5) 40%,
      rgba(255, 255, 255, 0.8) 50%,
      rgba(255, 255, 255, 0.5) 60%,
      transparent 100%
    );
    animation: shimmerSweep calc(1.5s - var(--celebration-intensity, 0) * 0.7s) ease-in-out infinite;
  }

  @keyframes shimmerSweep {
    0% {
      left: -100%;
    }
    100% {
      left: 100%;
    }
  }

  /* ═══ Pulse Rings (at right end of bar) ═══ */

  .pulse-ring {
    position: absolute;
    top: 50%;
    right: 0;
    width: 20px;
    height: 20px;
    border: 2px solid var(--glow-color);
    border-radius: 50%;
    transform: translate(50%, -50%);
    opacity: 0;
    pointer-events: none;
  }

  .pulse-ring-1 {
    animation: pulseExpand calc(2s - var(--celebration-intensity, 0) * 0.8s) ease-out infinite;
  }

  .pulse-ring-2 {
    animation: pulseExpand calc(2s - var(--celebration-intensity, 0) * 0.8s) ease-out infinite;
    animation-delay: calc(1s - var(--celebration-intensity, 0) * 0.4s);
  }

  @keyframes pulseExpand {
    0% {
      width: 10px;
      height: 10px;
      opacity: 0.9;
      border-width: 3px;
    }
    100% {
      width: 60px;
      height: 60px;
      opacity: 0;
      border-width: 1px;
    }
  }

  /* ═══ Particle Burst ═══ */

  .particle-burst {
    position: absolute;
    top: 50%;
    right: 0;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  .particle {
    position: absolute;
    width: 3px;
    height: 3px;
    background: var(--glow-color);
    border-radius: 50%;
    box-shadow:
      0 0 6px var(--glow-color),
      0 0 10px var(--glow-color);
    animation: particleShoot calc(1.5s - var(--celebration-intensity, 0) * 0.5s) ease-out infinite;
    animation-delay: var(--delay);
  }

  @keyframes particleShoot {
    0% {
      transform: rotate(var(--angle)) translateX(5px);
      opacity: 1;
    }
    100% {
      transform: rotate(var(--angle)) translateX(var(--distance));
      opacity: 0;
    }
  }

  /* ═══ Orbiting Sparks ═══ */

  .orbit-spark {
    position: absolute;
    top: 50%;
    right: 0;
    width: 4px;
    height: 4px;
    background: var(--glow-color);
    border-radius: 50%;
    box-shadow:
      0 0 8px var(--glow-color),
      0 0 15px var(--glow-color);
    pointer-events: none;
    transform-origin: center;
  }

  .orbit-1 {
    animation: orbit calc(2s - var(--celebration-intensity, 0) * 0.8s) linear infinite;
    --orbit-radius: 18px;
  }

  .orbit-2 {
    animation: orbit calc(2.5s - var(--celebration-intensity, 0) * 1s) linear infinite reverse;
    animation-delay: -0.5s;
    --orbit-radius: 25px;
  }

  @keyframes orbit {
    from {
      transform: rotate(0deg) translateX(var(--orbit-radius)) rotate(0deg);
    }
    to {
      transform: rotate(360deg) translateX(var(--orbit-radius)) rotate(-360deg);
    }
  }

  /* ═══ Overflow Stars ═══ */

  .overflow-star {
    position: absolute;
    font-size: 10px;
    color: var(--glow-color);
    text-shadow:
      0 0 8px var(--glow-color),
      0 0 15px var(--glow-color);
    pointer-events: none;
  }

  .star-1 {
    top: -8px;
    right: -8px;
    animation: starPulse calc(1s - var(--celebration-intensity, 0) * 0.3s) ease-in-out infinite;
  }

  .star-2 {
    bottom: -6px;
    right: 8px;
    font-size: 7px;
    animation: starPulseAlt calc(1.2s - var(--celebration-intensity, 0) * 0.4s) ease-in-out infinite;
    animation-delay: -0.3s;
  }

  .star-3 {
    top: 50%;
    right: -12px;
    font-size: 8px;
    transform: translateY(-50%);
    animation: starPulse calc(0.9s - var(--celebration-intensity, 0) * 0.3s) ease-in-out infinite;
    animation-delay: -0.6s;
  }

  @keyframes starPulse {
    0%,
    100% {
      opacity: 0.6;
      transform: scale(1);
      filter: brightness(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.4);
      filter: brightness(1.5);
    }
  }

  @keyframes starPulseAlt {
    0%,
    100% {
      opacity: 0.6;
      transform: scale(1);
      filter: brightness(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.5);
      filter: brightness(1.5);
    }
  }

  .star-2 {
    animation-name: starPulseAlt;
  }

  .star-3 {
    animation-name: starPulseAlt;
  }

  /* ═══ Energy Arcs ═══ */

  .energy-arc {
    position: absolute;
    width: 2px;
    height: 10px;
    background: var(--glow-color);
    border-radius: 2px;
    transform-origin: center center;
    pointer-events: none;
    filter: blur(0.5px);
    box-shadow: 0 0 4px var(--glow-color);
  }

  .arc-1 {
    top: -6px;
    right: 0;
    animation: arcCrackle 0.3s steps(3) infinite;
    transform: rotate(15deg);
  }

  .arc-2 {
    bottom: -4px;
    right: 8px;
    height: 8px;
    animation: arcCrackle 0.25s steps(3) infinite;
    animation-delay: -0.1s;
    transform: rotate(-20deg);
  }

  @keyframes arcCrackle {
    0% {
      opacity: 0.3;
      scaley: 0.7;
    }
    33% {
      opacity: 1;
      scaley: 1.2;
    }
    66% {
      opacity: 0.5;
      scaley: 0.9;
    }
    100% {
      opacity: 0.3;
      scaley: 0.7;
    }
  }

  /* ═══ Action Buttons ═══ */

  .action-btn {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    opacity: 0.6;
    transition: all 0.3s var(--ease-spring);
    border: 1px solid rgba(108, 92, 231, 0.25);
    background: rgba(108, 92, 231, 0.1);
  }

  .action-btn:hover {
    opacity: 1;
    background: rgba(108, 92, 231, 0.2);
    border-color: rgba(108, 92, 231, 0.35);
    transform: scale(1.15);
    box-shadow: 0 0 20px rgba(108, 92, 231, 0.2);
  }

  .action-btn.delete:hover {
    background: linear-gradient(135deg, rgba(255, 107, 107, 0.3) 0%, rgba(255, 107, 107, 0.1) 100%);
    border-color: rgba(255, 107, 107, 0.5);
    color: var(--color-red);
    box-shadow: 0 0 20px rgba(255, 107, 107, 0.3);
  }

  /* ═══ Mobile Adjustments ═══ */

  @media (max-width: 480px) {
    .goal-item {
      padding: 1rem 1.125rem;
    }

    .increment-controls {
      gap: 0.25rem;
      flex-shrink: 0;
    }

    /* Compact increment buttons — still 44px touch target via ::after */
    .increment-btn {
      width: 28px;
      height: 28px;
      font-size: 1rem;
      border-radius: var(--radius-sm);
      position: relative;
    }

    .increment-btn::after {
      content: '';
      position: absolute;
      inset: -8px;
    }

    .current-value {
      min-width: 2.75rem;
      font-size: 0.8125rem;
      padding: 0.25rem 0.25rem;
      font-weight: 700;
    }

    .value-input {
      min-width: 2.75rem;
      width: 2.75rem;
      font-size: 16px !important; /* Prevents iOS zoom */
      padding: 0.25rem 0.25rem;
      font-weight: 700;
    }

    .goal-name {
      font-size: 0.9375rem;
    }

    .goal-actions {
      gap: 0.375rem;
      flex-shrink: 0;
    }

    .action-btn {
      width: 36px;
      height: 36px;
      font-size: 1.25rem;
      opacity: 0.7;
      border-radius: var(--radius-md);
      position: relative;
    }

    .action-btn::after {
      content: '';
      position: absolute;
      inset: -4px;
    }

    /* Mobile: move delete to name row, hide from row 1 */
    .row1-delete {
      display: none;
    }

    .name-row-delete {
      display: flex;
      flex-shrink: 0;
    }

    /* Scale down celebration effects */
    .pulse-ring {
      width: 16px;
      height: 16px;
    }

    .overflow-star {
      font-size: 7px;
    }

    .orbit-spark {
      width: 2px;
      height: 2px;
    }

    .orbit-1 {
      --orbit-radius: 12px;
    }

    .orbit-2 {
      --orbit-radius: 16px;
    }

    .particle {
      width: 2px;
      height: 2px;
    }

    .energy-arc {
      height: 7px;
      width: 1px;
    }
  }

  /* ═══ Reduced Motion ═══ */

  @media (prefers-reduced-motion: reduce) {
    .mini-progress-wrapper.celebrating,
    .mini-progress.celebrating,
    .mini-progress-fill.celebrating,
    .shimmer-overlay,
    .pulse-ring,
    .particle,
    .orbit-spark,
    .overflow-star,
    .energy-arc {
      animation: none !important;
    }

    .mini-progress-wrapper.celebrating {
      filter: drop-shadow(0 0 8px var(--glow-color));
    }
  }
</style>
