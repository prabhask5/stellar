<script lang="ts">
  import Modal from './Modal.svelte';
  import type { TaskCategory } from '$lib/types';

  interface Props {
    open: boolean;
    categories: TaskCategory[];
    defaultDate?: string;
    onClose: () => void;
    onCreate: (name: string, dueDate: string, categoryId: string | null) => void;
  }

  let { open, categories, defaultDate, onClose, onCreate }: Props = $props();

  let name = $state('');
  let dueDate = $state('');
  let categoryId = $state<string | null>(null);

  $effect(() => {
    if (open) {
      name = '';
      dueDate = defaultDate || getTodayString();
      categoryId = null;
    }
  });

  function getTodayString(): string {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (!name.trim() || !dueDate) return;
    onCreate(name.trim(), dueDate, categoryId);
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<Modal {open} title="New Long-term Task" {onClose}>
  <form class="form" onsubmit={handleSubmit}>
    <div class="field">
      <label class="field-label" for="task-name">Task Name</label>
      <input
        id="task-name"
        type="text"
        bind:value={name}
        class="field-input"
        placeholder="What needs to be done?"
        autofocus
      />
    </div>

    <div class="field">
      <label class="field-label" for="due-date">Due Date</label>
      <input
        id="due-date"
        type="date"
        bind:value={dueDate}
        class="field-input date-input"
        min={getTodayString()}
      />
    </div>

    <div class="field">
      <label class="field-label" for="category">Category (optional)</label>
      <select
        id="category"
        bind:value={categoryId}
        class="field-input"
      >
        <option value={null}>No category</option>
        {#each categories as cat}
          <option value={cat.id}>
            {cat.name}
          </option>
        {/each}
      </select>

      {#if categories.length > 0}
        <div class="category-chips">
          {#each categories as cat}
            <button
              type="button"
              class="category-chip"
              class:selected={categoryId === cat.id}
              style="--chip-color: {cat.color}"
              onclick={() => categoryId = categoryId === cat.id ? null : cat.id}
            >
              <span class="chip-dot"></span>
              {cat.name}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="actions">
      <button type="button" class="cancel-btn" onclick={onClose}>
        Cancel
      </button>
      <button type="submit" class="submit-btn" disabled={!name.trim() || !dueDate}>
        Create Task
      </button>
    </div>
  </form>
</Modal>

<style>
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

  .date-input {
    color-scheme: dark;
  }

  .category-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .category-chip {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    background: rgba(15, 15, 30, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-full);
    color: var(--color-text-muted);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .category-chip:hover {
    border-color: var(--chip-color);
    background: rgba(var(--chip-color), 0.1);
  }

  .category-chip.selected {
    background: var(--chip-color);
    border-color: var(--chip-color);
    color: white;
    box-shadow: 0 0 15px color-mix(in srgb, var(--chip-color) 50%, transparent);
  }

  .chip-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--chip-color);
  }

  .category-chip.selected .chip-dot {
    background: white;
  }

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
