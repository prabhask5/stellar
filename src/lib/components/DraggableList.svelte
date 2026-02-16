<script lang="ts" generics="T extends { id: string; order: number }">
  /**
   * @fileoverview DraggableList — generic pointer-based drag-and-drop reorderable list.
   *
   * Uses the PointerEvents API (works on both touch and mouse) with a movement
   * threshold to distinguish intentional drags from accidental taps.  When the
   * user drops an item at a new position, `calculateNewOrder` from the engine
   * computes a fractional order value so only the moved item needs a DB write.
   *
   * Generic constraint: each item must have `id: string` and `order: number`.
   *
   * The component exposes a `renderItem` snippet that receives the item plus
   * `dragHandleProps` — an object with `onpointerdown` that the consumer should
   * spread onto their drag-handle element.
   */

  // =============================================================================
  //  Imports
  // =============================================================================

  import type { Snippet } from 'svelte';
  import { calculateNewOrder } from 'stellar-drive/utils';

  // =============================================================================
  //  Props Interface
  // =============================================================================

  interface Props {
    /** The ordered array of items to display */
    items: T[];
    /** Callback invoked after a successful reorder — receives `(itemId, newOrder)` */
    onReorder: (itemId: string, newOrder: number) => Promise<void>;
    /** Snippet that renders each item; receives the item and `dragHandleProps` */
    renderItem: Snippet<
      [{ item: T; dragHandleProps: { onpointerdown: (e: PointerEvent) => void } }]
    >;
    /** When `true`, dragging is disabled (e.g. single-item lists) */
    disabled?: boolean;
  }

  // =============================================================================
  //  Component State
  // =============================================================================

  let { items, onReorder, renderItem, disabled = false }: Props = $props();

  /* ── Drag tracking state ──── */
  let draggedId = $state<string | null>(null);
  let draggedIndex = $state<number>(-1);
  let dropTargetIndex = $state<number>(-1);
  let isDragging = $state(false);
  let containerEl: HTMLDivElement;

  /* ── Pointer start position for movement threshold ──── */
  let startX = 0;
  let startY = 0;
  let pendingItem: T | null = null;
  let pendingIndex = -1;

  /** Minimum pointer travel (px) before drag activates — tolerates touch jitter on mobile */
  const DRAG_THRESHOLD = 8;

  // =============================================================================
  //  Pointer Event Handlers
  // =============================================================================

  /**
   * Initiates a potential drag when the user presses on a drag handle.
   * The actual drag is not activated until the pointer moves beyond `DRAG_THRESHOLD`.
   *
   * @param {PointerEvent} e     — the pointer-down event
   * @param {T}            item  — the list item being touched
   * @param {number}       index — the item's current position in the array
   */
  function handlePointerDown(e: PointerEvent, item: T, index: number) {
    if (disabled || items.length <= 1) return;
    if (e.button !== 0) return; /* left click / primary touch only */

    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    pendingItem = item;
    pendingIndex = index;

    /* Capture pointer for tracking outside the element */
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
  }

  /**
   * Tracks pointer movement. On first crossing `DRAG_THRESHOLD`, activates
   * dragging. Then continuously updates `dropTargetIndex` based on which
   * item the pointer is hovering over (using bounding-rect midpoint test).
   *
   * @param {PointerEvent} e — the pointer-move event
   */
  function handlePointerMove(e: PointerEvent) {
    /* If we haven't crossed the threshold yet, check Euclidean distance */
    if (!isDragging) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;

      /* Threshold crossed — activate drag */
      if (pendingItem) {
        draggedId = pendingItem.id;
        draggedIndex = pendingIndex;
        dropTargetIndex = pendingIndex;
        isDragging = true;
      }
    }

    if (draggedId === null || !containerEl) return;

    /* Determine which item the pointer is over via midpoint comparison */
    const itemElements = containerEl.querySelectorAll('[data-draggable-item]');

    let newDropIndex = items.length - 1;

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

  /**
   * Finalizes a drag operation. If the item moved to a new position,
   * computes a fractional order via `calculateNewOrder` and calls `onReorder`.
   *
   * @param {PointerEvent} _e — the pointer-up / pointer-cancel event (unused)
   */
  async function handlePointerUp(_e: PointerEvent) {
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointercancel', handlePointerUp);

    const wasDragging = isDragging;

    /*
     * Suppress the click that the browser fires after pointerup.
     * Use capturing phase so it runs before any card onclick handlers.
     * Always suppress when the handle was touched — even without drag —
     * to prevent accidental navigation from tapping the handle.
     */
    suppressNextClick();

    if (!wasDragging || draggedId === null || draggedIndex === -1) {
      resetDragState();
      return;
    }

    const fromIndex = draggedIndex;
    const toIndex = dropTargetIndex;
    const itemId = draggedId;

    resetDragState();

    if (fromIndex !== toIndex) {
      const newOrder = calculateNewOrder(items, fromIndex, toIndex);
      await onReorder(itemId, newOrder);
    }
  }

  // =============================================================================
  //  Utility Functions
  // =============================================================================

  /**
   * Temporarily attaches a capturing click handler to the container that
   * stops propagation of the very next click. Prevents accidental card
   * navigation after drag interactions.
   */
  function suppressNextClick() {
    if (!containerEl) return;
    const handler = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
      containerEl.removeEventListener('click', handler, true);
    };
    containerEl.addEventListener('click', handler, true);
    /* Safety: remove if click never fires (e.g. iOS sometimes doesn't) */
    setTimeout(() => containerEl?.removeEventListener('click', handler, true), 300);
  }

  /**
   * Resets all drag-related state variables back to their defaults.
   */
  function resetDragState() {
    draggedId = null;
    draggedIndex = -1;
    dropTargetIndex = -1;
    isDragging = false;
    pendingItem = null;
    pendingIndex = -1;
  }

  /**
   * Builds the `dragHandleProps` object that the consumer spreads onto
   * their drag handle element.
   *
   * @param {T}      item  — the list item
   * @param {number} index — the item's current array index
   * @returns {{ onpointerdown: (e: PointerEvent) => void }}
   */
  function getDragHandleProps(item: T, index: number) {
    return {
      onpointerdown: (e: PointerEvent) => handlePointerDown(e, item, index)
    };
  }
</script>

<!-- ═══ Draggable List Container ═══ -->
<div class="draggable-list" bind:this={containerEl}>
  {#each items as item, index (item.id)}
    <div
      class="draggable-item-wrapper"
      class:dragging={isDragging && draggedId === item.id}
      class:drop-above={isDragging && dropTargetIndex === index && draggedIndex > index}
      class:drop-below={isDragging && dropTargetIndex === index && draggedIndex < index}
      data-draggable-item
    >
      {@render renderItem({ item, dragHandleProps: getDragHandleProps(item, index) })}
    </div>
  {/each}
</div>

<style>
  /* ═══ List Layout ═══ */

  .draggable-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* ═══ Item Wrapper ═══ */

  .draggable-item-wrapper {
    position: relative;
    transition: all 0.25s var(--ease-out);
    animation: fadeInUp 0.4s var(--ease-out) backwards;
  }

  /* Staggered entrance animation for first 6 items */
  .draggable-item-wrapper:nth-child(1) {
    animation-delay: 0s;
  }
  .draggable-item-wrapper:nth-child(2) {
    animation-delay: 0.06s;
  }
  .draggable-item-wrapper:nth-child(3) {
    animation-delay: 0.12s;
  }
  .draggable-item-wrapper:nth-child(4) {
    animation-delay: 0.18s;
  }
  .draggable-item-wrapper:nth-child(5) {
    animation-delay: 0.24s;
  }
  .draggable-item-wrapper:nth-child(6) {
    animation-delay: 0.3s;
  }

  /* ═══ Dragging State ═══ */

  /* Active drag — lifted card appearance with scale + glow */
  .draggable-item-wrapper.dragging {
    opacity: 0.7;
    z-index: 100;
    transform: scale(1.03) rotate(0.5deg);
    filter: brightness(1.15);
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.4),
      0 0 60px var(--color-primary-glow);
  }

  /* ═══ Drop Indicators ═══ */

  /* Glowing bar above the target when dragging downward → upward */
  .draggable-item-wrapper.drop-above::before {
    content: '';
    position: absolute;
    top: -9px;
    left: 0;
    right: 0;
    height: 4px;
    background: var(--gradient-primary);
    border-radius: var(--radius-full);
    box-shadow:
      0 0 25px var(--color-primary-glow),
      0 0 50px rgba(108, 92, 231, 0.3);
    animation: dropIndicatorPulse 1s var(--ease-smooth) infinite;
  }

  /* Glowing bar below the target when dragging upward → downward */
  .draggable-item-wrapper.drop-below::after {
    content: '';
    position: absolute;
    bottom: -9px;
    left: 0;
    right: 0;
    height: 4px;
    background: var(--gradient-primary);
    border-radius: var(--radius-full);
    box-shadow:
      0 0 25px var(--color-primary-glow),
      0 0 50px rgba(108, 92, 231, 0.3);
    animation: dropIndicatorPulse 1s var(--ease-smooth) infinite;
  }

  @keyframes dropIndicatorPulse {
    0%,
    100% {
      opacity: 1;
      box-shadow:
        0 0 25px var(--color-primary-glow),
        0 0 50px rgba(108, 92, 231, 0.3);
    }
    50% {
      opacity: 0.8;
      box-shadow:
        0 0 35px var(--color-primary-glow),
        0 0 70px rgba(108, 92, 231, 0.4);
    }
  }

  /* ═══ Global Drag Handle Styles ═══ */

  /* These use :global() because the handle lives inside the consumer's snippet */
  :global(.drag-handle) {
    cursor: grab;
    touch-action: none; /* prevents scroll-hijack on mobile */
    padding: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.35;
    transition: all 0.3s var(--ease-spring);
    user-select: none;
    border-right: 1px solid rgba(108, 92, 231, 0.1);
    font-weight: bold;
  }

  :global(.drag-handle:hover) {
    opacity: 1;
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.15) 0%, rgba(108, 92, 231, 0.05) 100%);
    color: var(--color-primary-light);
    box-shadow: inset 0 0 20px rgba(108, 92, 231, 0.1);
  }

  :global(.drag-handle:active) {
    cursor: grabbing;
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.25) 0%, rgba(108, 92, 231, 0.1) 100%);
    box-shadow: inset 0 0 30px rgba(108, 92, 231, 0.2);
  }
</style>
