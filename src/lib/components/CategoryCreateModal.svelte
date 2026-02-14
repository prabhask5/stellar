<script lang="ts">
  /**
   * @fileoverview CategoryCreateModal — dialog for creating a new tag (category).
   *
   * Wraps the `Modal` component with a form containing:
   *   - A text input for the tag name
   *   - A color picker with 8 preset color swatches
   *   - A live preview showing the selected color + name
   *   - Cancel / Create action buttons
   *
   * Resets the form fields every time the modal opens so previous state
   * does not leak between sessions.
   */

  // =============================================================================
  //  Imports
  // =============================================================================

  import Modal from './Modal.svelte';
  import { truncateTooltip } from '@prabhask5/stellar-engine/actions';

  // =============================================================================
  //  Props Interface
  // =============================================================================

  interface Props {
    /** Whether the modal is currently visible */
    open: boolean;
    /** Callback fired when the user dismisses the modal */
    onClose: () => void;
    /** Callback fired with `(name, color)` when the user confirms creation */
    onCreate: (name: string, color: string) => void;
  }

  // =============================================================================
  //  Component State
  // =============================================================================

  let { open, onClose, onCreate }: Props = $props();

  /**
   * Svelte action that auto-focuses an element on desktop.
   * Skipped on mobile (width ≤640) to prevent the soft keyboard from popping up.
   *
   * @param {HTMLElement} node — the element to focus
   */
  function focus(node: HTMLElement) {
    if (window.innerWidth > 640) {
      node.focus();
    }
  }

  /** Palette of 8 preset colors for quick selection */
  const presetColors = [
    '#6c5ce7', // Purple
    '#ff79c6', // Pink
    '#00cec9', // Teal
    '#fdcb6e', // Yellow
    '#e17055', // Orange
    '#d63031', // Red
    '#00b894', // Green
    '#0984e3' // Blue
  ];

  /** User-entered tag name */
  let name = $state('');

  /** Currently selected color hex value */
  let color = $state(presetColors[0]);

  /**
   * Resets form fields whenever the modal opens so the user
   * always starts with a clean form.
   */
  $effect(() => {
    if (open) {
      name = '';
      color = presetColors[0];
    }
  });

  // =============================================================================
  //  Event Handlers
  // =============================================================================

  /**
   * Handles form submission — validates non-empty name, calls `onCreate`,
   * and closes the modal.
   *
   * @param {Event} e — the submit event
   */
  function handleSubmit(e: Event) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), color);
    onClose();
  }

  /**
   * Allows dismissal via the Escape key.
   *
   * @param {KeyboardEvent} e — keydown event
   */
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }
</script>

<!-- Global Escape key listener -->
<svelte:window onkeydown={handleKeydown} />

<!-- ═══ Category Create Modal ═══ -->
<Modal {open} title="New Tag" {onClose}>
  <form class="form" onsubmit={handleSubmit}>
    <!-- ═══ Name Field ═══ -->
    <div class="field">
      <label class="field-label" for="tag-name">Tag Name</label>
      <input
        id="tag-name"
        type="text"
        bind:value={name}
        class="field-input"
        placeholder="e.g. Work, Personal, Health..."
        use:focus
      />
    </div>

    <!-- ═══ Color Picker Field ═══ -->
    <div class="field">
      <span id="color-label" class="field-label">Color</span>

      <!-- Preset color swatches -->
      <div class="color-picker" role="group" aria-labelledby="color-label">
        {#each presetColors as presetColor (presetColor)}
          <button
            type="button"
            class="color-btn"
            class:selected={color === presetColor}
            style="--btn-color: {presetColor}"
            onclick={() => (color = presetColor)}
            aria-label="Select color"
          ></button>
        {/each}
      </div>

      <!-- Live preview of the tag with selected color -->
      <div class="color-preview" style="--preview-color: {color}">
        <span class="preview-dot"></span>
        <span class="preview-text" use:truncateTooltip>{name || 'Tag Preview'}</span>
      </div>
    </div>

    <!-- ═══ Action Buttons ═══ -->
    <div class="actions">
      <button type="button" class="cancel-btn" onclick={onClose}> Cancel </button>
      <button type="submit" class="submit-btn" disabled={!name.trim()}> Create Tag </button>
    </div>
  </form>
</Modal>

<style>
  /* ═══ Form Layout ═══ */

  .form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .field-label {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }

  /* ═══ Text Input ═══ */

  .field-input {
    padding: 0.875rem 1rem;
    background: rgba(15, 15, 30, 0.8);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    color: var(--color-text);
    font-size: 1rem;
    transition: all 0.3s var(--ease-out);
  }

  .field-input::placeholder {
    color: var(--color-text-muted);
    opacity: 0.6;
  }

  .field-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  /* ═══ Color Picker ═══ */

  .color-picker {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .color-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    background: var(--btn-color);
    border: 3px solid transparent;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .color-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 0 15px var(--btn-color);
  }

  /* White border + glow when selected */
  .color-btn.selected {
    border-color: white;
    box-shadow: 0 0 20px var(--btn-color);
    transform: scale(1.05);
  }

  /* ═══ Color Preview ═══ */

  .color-preview {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.75rem 1rem;
    background: rgba(15, 15, 30, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    margin-top: 0.5rem;
  }

  /* Small colored dot showing the selected color */
  .preview-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--preview-color);
    box-shadow: 0 0 10px color-mix(in srgb, var(--preview-color) 50%, transparent);
  }

  .preview-text {
    font-size: 0.9375rem;
    color: var(--color-text);
  }

  /* ═══ Action Buttons ═══ */

  .actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .cancel-btn {
    flex: 1;
    padding: 0.875rem 1rem;
    background: rgba(15, 15, 30, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  /* Turns red on hover to signal destructive intent */
  .cancel-btn:hover {
    background: rgba(255, 107, 107, 0.15);
    border-color: rgba(255, 107, 107, 0.3);
    color: var(--color-red);
  }

  .submit-btn {
    flex: 1;
    padding: 0.875rem 1rem;
    background: var(--gradient-primary);
    border: none;
    border-radius: var(--radius-lg);
    color: white;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .submit-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .submit-btn:not(:disabled):hover {
    transform: scale(1.02);
    box-shadow: 0 0 30px var(--color-primary-glow);
  }
</style>
