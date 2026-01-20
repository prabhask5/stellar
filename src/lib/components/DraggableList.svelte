<script lang="ts" generics="T extends { id: string; order: number }">
  import type { Snippet } from 'svelte';
  import { calculateNewOrder } from '$lib/utils/reorder';

  interface Props {
    items: T[];
    onReorder: (itemId: string, newOrder: number) => Promise<void>;
    renderItem: Snippet<[{ item: T; dragHandleProps: { onpointerdown: (e: PointerEvent) => void } }]>;
    disabled?: boolean;
  }

  let { items, onReorder, renderItem, disabled = false }: Props = $props();

  let draggedId = $state<string | null>(null);
  let draggedIndex = $state<number>(-1);
  let dropTargetIndex = $state<number>(-1);
  let containerEl: HTMLDivElement;

  function handlePointerDown(e: PointerEvent, item: T, index: number) {
    if (disabled || items.length <= 1) return;

    // Only handle primary button (left mouse button or touch)
    if (e.button !== 0) return;

    e.preventDefault();
    draggedId = item.id;
    draggedIndex = index;
    dropTargetIndex = index;

    // Capture pointer for tracking outside the element
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // Add document-level listeners
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
  }

  function handlePointerMove(e: PointerEvent) {
    if (draggedId === null || !containerEl) return;

    // Find which item we're over
    const containerRect = containerEl.getBoundingClientRect();
    const itemElements = containerEl.querySelectorAll('[data-draggable-item]');

    let newDropIndex = items.length - 1; // Default to end

    for (let i = 0; i < itemElements.length; i++) {
      const itemEl = itemElements[i] as HTMLElement;
      const itemRect = itemEl.getBoundingClientRect();
      const itemMiddle = itemRect.top + itemRect.height / 2;

      if (e.clientY < itemMiddle) {
        newDropIndex = i;
        break;
      }
    }

    dropTargetIndex = newDropIndex;
  }

  async function handlePointerUp(e: PointerEvent) {
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointercancel', handlePointerUp);

    if (draggedId === null || draggedIndex === -1) {
      resetDragState();
      return;
    }

    const fromIndex = draggedIndex;
    const toIndex = dropTargetIndex;
    const itemId = draggedId;

    resetDragState();

    // Only reorder if position actually changed
    if (fromIndex !== toIndex) {
      const newOrder = calculateNewOrder(items, fromIndex, toIndex);
      await onReorder(itemId, newOrder);
    }
  }

  function resetDragState() {
    draggedId = null;
    draggedIndex = -1;
    dropTargetIndex = -1;
  }

  function getDragHandleProps(item: T, index: number) {
    return {
      onpointerdown: (e: PointerEvent) => handlePointerDown(e, item, index)
    };
  }
</script>

<div class="draggable-list" bind:this={containerEl}>
  {#each items as item, index (item.id)}
    <div
      class="draggable-item-wrapper"
      class:dragging={draggedId === item.id}
      class:drop-above={dropTargetIndex === index && draggedIndex > index && draggedId !== null}
      class:drop-below={dropTargetIndex === index && draggedIndex < index && draggedId !== null}
      data-draggable-item
    >
      {@render renderItem({ item, dragHandleProps: getDragHandleProps(item, index) })}
    </div>
  {/each}
</div>

<style>
  .draggable-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .draggable-item-wrapper {
    position: relative;
    transition: transform 0.15s ease, opacity 0.15s ease;
  }

  .draggable-item-wrapper.dragging {
    opacity: 0.5;
    z-index: 100;
  }

  .draggable-item-wrapper.drop-above::before {
    content: '';
    position: absolute;
    top: -6px;
    left: 0;
    right: 0;
    height: 3px;
    background-color: var(--color-primary);
    border-radius: 999px;
  }

  .draggable-item-wrapper.drop-below::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 0;
    right: 0;
    height: 3px;
    background-color: var(--color-primary);
    border-radius: 999px;
  }

  :global(.drag-handle) {
    cursor: grab;
    touch-action: none;
    padding: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
    transition: opacity 0.2s;
    user-select: none;
  }

  :global(.drag-handle:hover) {
    opacity: 1;
  }

  :global(.drag-handle:active) {
    cursor: grabbing;
  }
</style>
