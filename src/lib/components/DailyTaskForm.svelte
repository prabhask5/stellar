<script lang="ts">
  /**
   * @fileoverview DailyTaskForm — inline form for quickly adding a new daily task.
   *
   * Renders a single-line text input with a submit button. On submission the
   * input is cleared and re-focused for rapid sequential entry. The `Enter`
   * key submits (unless Shift is held) and the button is disabled when the
   * input is empty.
   */

  // =============================================================================
  //  Props Interface
  // =============================================================================

  interface Props {
    /** Callback fired with the trimmed task name on valid submission */
    onSubmit: (name: string) => void;
  }

  // =============================================================================
  //  Component State
  // =============================================================================

  let { onSubmit }: Props = $props();

  /** Current text value of the input field */
  let name = $state('');

  /** Reference to the `<input>` element — used for re-focus after submit */
  let inputEl: HTMLInputElement;

  // =============================================================================
  //  Event Handlers
  // =============================================================================

  /**
   * Handles form submission. Guards against blank input, invokes the
   * callback with the trimmed name, then resets and re-focuses the field.
   *
   * @param {Event} e — the `submit` event from the `<form>`
   */
  function handleSubmit(e: Event) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim());
    name = '';
    inputEl?.focus();
  }

  /**
   * Allows `Enter` (without Shift) to submit the form from the input.
   *
   * @param {KeyboardEvent} e — keydown event on the text input
   */
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e);
    }
  }
</script>

<!-- ═══ Task Creation Form ═══ -->
<form class="task-form" onsubmit={handleSubmit}>
  <!-- Text input — bound to `name` state -->
  <input
    bind:this={inputEl}
    bind:value={name}
    type="text"
    placeholder="Add a task..."
    class="task-input"
    onkeydown={handleKeydown}
  />

  <!-- Submit button — disabled when input is blank -->
  <button type="submit" class="add-btn" disabled={!name.trim()} aria-label="Add task">
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  </button>
</form>

<style>
  /* ═══ Form Layout ═══ */

  .task-form {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  /* ═══ Text Input ═══ */

  .task-input {
    flex: 1;
    padding: 0.75rem 1rem;
    background: rgba(15, 15, 30, 0.8);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    color: var(--color-text);
    font-size: 0.9375rem;
    transition: all 0.3s var(--ease-out);
  }

  .task-input::placeholder {
    color: var(--color-text-muted);
    opacity: 0.6;
  }

  /* Focus ring — purple glow to match Stellar theme */
  .task-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 20px var(--color-primary-glow);
    background: rgba(20, 20, 40, 0.9);
  }

  /* ═══ Add Button ═══ */

  .add-btn {
    width: 42px;
    height: 42px;
    border-radius: var(--radius-lg);
    background: var(--gradient-primary);
    border: none;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
    flex-shrink: 0;
  }

  .add-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    background: rgba(108, 92, 231, 0.3);
  }

  .add-btn:not(:disabled):hover {
    transform: scale(1.08);
    box-shadow: 0 0 25px var(--color-primary-glow);
  }

  .add-btn:not(:disabled):active {
    transform: scale(0.95);
  }
</style>
