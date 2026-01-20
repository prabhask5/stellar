<script lang="ts">
  import Modal from './Modal.svelte';
  import type { TaskCategory } from '$lib/types';

  interface Props {
    open: boolean;
    categories: TaskCategory[];
    onClose: () => void;
    onCreate: (name: string, color: string) => void;
    onUpdate: (id: string, updates: { name?: string; color?: string }) => void;
    onDelete: (id: string) => void;
    onReorder: (id: string, newOrder: number) => void;
  }

  let { open, categories, onClose, onCreate, onUpdate, onDelete, onReorder }: Props = $props();

  const presetColors = [
    '#6c5ce7', // Purple
    '#ff79c6', // Pink
    '#00cec9', // Teal
    '#fdcb6e', // Yellow
    '#e17055', // Orange
    '#d63031', // Red
    '#00b894', // Green
    '#0984e3', // Blue
  ];

  let adding = $state(false);
  let newName = $state('');
  let newColor = $state(presetColors[0]);
  let editingId = $state<string | null>(null);
  let editingName = $state('');
  let editingColor = $state('');

  // Drag state
  let draggedId = $state<string | null>(null);
  let dropTargetId = $state<string | null>(null);

  function handleAddSubmit() {
    if (!newName.trim()) return;
    onCreate(newName.trim(), newColor);
    adding = false;
    newName = '';
    newColor = presetColors[0];
  }

  function handleAddKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleAddSubmit();
    } else if (e.key === 'Escape') {
      adding = false;
      newName = '';
    }
  }

  function startEditing(category: TaskCategory) {
    editingId = category.id;
    editingName = category.name;
    editingColor = category.color;
  }

  function handleEditSubmit() {
    if (editingId && editingName.trim()) {
      const updates: { name?: string; color?: string } = {};
      const cat = categories.find(c => c.id === editingId);
      if (cat) {
        if (editingName.trim() !== cat.name) updates.name = editingName.trim();
        if (editingColor !== cat.color) updates.color = editingColor;
        if (Object.keys(updates).length > 0) {
          onUpdate(editingId, updates);
        }
      }
    }
    editingId = null;
    editingName = '';
    editingColor = '';
  }

  function handleEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleEditSubmit();
    } else if (e.key === 'Escape') {
      editingId = null;
    }
  }

  function handleDelete(id: string) {
    if (confirm('Delete this category? Tasks will keep their data but lose the category tag.')) {
      onDelete(id);
    }
  }

  function handleDragStart(e: DragEvent, category: TaskCategory) {
    draggedId = category.id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleDragOver(e: DragEvent, targetId: string) {
    e.preventDefault();
    dropTargetId = targetId;
  }

  function handleDragEnd() {
    if (draggedId && dropTargetId && draggedId !== dropTargetId) {
      const sorted = [...categories].sort((a, b) => a.order - b.order);
      const draggedIndex = sorted.findIndex(c => c.id === draggedId);
      const targetIndex = sorted.findIndex(c => c.id === dropTargetId);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        let newOrder: number;
        if (targetIndex === 0) {
          newOrder = sorted[0].order - 1;
        } else if (targetIndex === sorted.length - 1) {
          newOrder = sorted[targetIndex].order + 1;
        } else {
          const before = sorted[targetIndex - 1].order;
          const after = sorted[targetIndex].order;
          newOrder = (before + after) / 2;
        }

        onReorder(draggedId, newOrder);
      }
    }

    draggedId = null;
    dropTargetId = null;
  }
</script>

<Modal {open} title="Manage Categories" onClose={onClose}>
  <div class="categories-content">
    <div class="add-section">
      {#if adding}
        <div class="add-form">
          <input
            type="text"
            bind:value={newName}
            placeholder="Category name"
            class="name-input"
            onkeydown={handleAddKeydown}
            autofocus
          />
          <div class="color-picker">
            {#each presetColors as color}
              <button
                type="button"
                class="color-btn"
                class:selected={newColor === color}
                style="--btn-color: {color}"
                onclick={() => newColor = color}
                aria-label="Select color {color}"
              ></button>
            {/each}
          </div>
          <div class="form-actions">
            <button class="confirm-btn" onclick={handleAddSubmit} disabled={!newName.trim()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
            <button class="cancel-btn" onclick={() => { adding = false; newName = ''; }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      {:else}
        <button class="add-btn" onclick={() => adding = true}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Category
        </button>
      {/if}
    </div>

    <div class="categories-list">
      {#each [...categories].sort((a, b) => a.order - b.order) as category (category.id)}
        <div
          class="category-item"
          class:dragging={draggedId === category.id}
          class:drop-target={dropTargetId === category.id && draggedId !== category.id}
          draggable="true"
          ondragstart={(e) => handleDragStart(e, category)}
          ondragover={(e) => handleDragOver(e, category.id)}
          ondragend={handleDragEnd}
        >
          <span class="drag-handle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="6" r="1.5" />
              <circle cx="15" cy="6" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="18" r="1.5" />
              <circle cx="15" cy="18" r="1.5" />
            </svg>
          </span>

          {#if editingId === category.id}
            <div class="edit-form">
              <input
                type="text"
                bind:value={editingName}
                class="edit-input"
                onkeydown={handleEditKeydown}
                autofocus
              />
              <div class="color-picker inline">
                {#each presetColors as color}
                  <button
                    type="button"
                    class="color-btn small"
                    class:selected={editingColor === color}
                    style="--btn-color: {color}"
                    onclick={() => editingColor = color}
                  ></button>
                {/each}
              </div>
              <button class="confirm-btn small" onclick={handleEditSubmit}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            </div>
          {:else}
            <span class="color-indicator" style="--cat-color: {category.color}"></span>
            <span class="category-name" ondblclick={() => startEditing(category)}>
              {category.name}
            </span>
            <button class="edit-btn" onclick={() => startEditing(category)} aria-label="Edit category">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button class="delete-btn" onclick={() => handleDelete(category.id)} aria-label="Delete category">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          {/if}
        </div>
      {:else}
        <div class="empty-state">
          No categories yet. Create one to organize your tasks.
        </div>
      {/each}
    </div>
  </div>
</Modal>

<style>
  .categories-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .add-section {
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(108, 92, 231, 0.15);
  }

  .add-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(108, 92, 231, 0.15);
    border: 1px dashed rgba(108, 92, 231, 0.4);
    border-radius: var(--radius-lg);
    color: var(--color-primary-light);
    font-size: 0.9375rem;
    font-weight: 600;
    width: 100%;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .add-btn:hover {
    background: rgba(108, 92, 231, 0.25);
    border-style: solid;
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .add-form, .edit-form {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    padding: 0.75rem;
    background: rgba(15, 15, 30, 0.6);
    border-radius: var(--radius-lg);
    border: 1px solid rgba(108, 92, 231, 0.2);
  }

  .edit-form {
    flex: 1;
    padding: 0.5rem;
    gap: 0.5rem;
  }

  .name-input, .edit-input {
    flex: 1;
    min-width: 120px;
    padding: 0.625rem 0.875rem;
    background: rgba(10, 10, 20, 0.8);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-size: 0.9375rem;
  }

  .name-input:focus, .edit-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 15px var(--color-primary-glow);
  }

  .color-picker {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
  }

  .color-picker.inline {
    gap: 0.25rem;
  }

  .color-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    background: var(--btn-color);
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .color-btn.small {
    width: 22px;
    height: 22px;
    border-radius: var(--radius-sm);
  }

  .color-btn:hover {
    transform: scale(1.15);
    box-shadow: 0 0 15px var(--btn-color);
  }

  .color-btn.selected {
    border-color: white;
    box-shadow: 0 0 12px var(--btn-color);
  }

  .form-actions {
    display: flex;
    gap: 0.5rem;
  }

  .confirm-btn, .cancel-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
    border: none;
  }

  .confirm-btn.small, .cancel-btn.small {
    width: 28px;
    height: 28px;
  }

  .confirm-btn {
    background: var(--color-green);
    color: white;
  }

  .confirm-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .confirm-btn:not(:disabled):hover {
    transform: scale(1.1);
    box-shadow: 0 0 15px rgba(38, 222, 129, 0.4);
  }

  .cancel-btn {
    background: rgba(255, 107, 107, 0.2);
    color: var(--color-red);
  }

  .cancel-btn:hover {
    background: rgba(255, 107, 107, 0.3);
    transform: scale(1.1);
  }

  .categories-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .category-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: rgba(15, 15, 30, 0.8);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    transition: all 0.25s var(--ease-out);
    cursor: grab;
  }

  .category-item:hover {
    border-color: rgba(108, 92, 231, 0.3);
    background: rgba(20, 20, 40, 0.9);
  }

  .category-item.dragging {
    opacity: 0.6;
    transform: scale(1.02);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  }

  .category-item.drop-target {
    border-color: var(--color-primary);
    box-shadow: 0 0 15px var(--color-primary-glow);
  }

  .drag-handle {
    opacity: 0.3;
    transition: opacity 0.2s;
    color: var(--color-text-muted);
  }

  .category-item:hover .drag-handle {
    opacity: 0.7;
  }

  .color-indicator {
    width: 16px;
    height: 16px;
    border-radius: var(--radius-sm);
    background: var(--cat-color);
    flex-shrink: 0;
    box-shadow: 0 0 10px color-mix(in srgb, var(--cat-color) 50%, transparent);
  }

  .category-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.9375rem;
    cursor: text;
  }

  .edit-btn, .delete-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: all 0.3s var(--ease-spring);
    border: none;
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .category-item:hover .edit-btn,
  .category-item:hover .delete-btn {
    opacity: 0.5;
  }

  .edit-btn:hover {
    opacity: 1 !important;
    color: var(--color-primary-light);
    background: rgba(108, 92, 231, 0.2);
  }

  .delete-btn:hover {
    opacity: 1 !important;
    color: var(--color-red);
    background: rgba(255, 107, 107, 0.2);
  }

  .empty-state {
    padding: 2rem;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    font-style: italic;
    opacity: 0.7;
  }
</style>
