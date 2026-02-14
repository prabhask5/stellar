<script lang="ts">
  /**
   * @fileoverview TaskItem — single daily task row with checkbox, name, category tag, and actions.
   *
   * Renders a horizontal card for one `DailyTask` with:
   *   - An optional drag handle (when `dragHandleProps` is provided)
   *   - A circular checkbox that toggles completion
   *   - The task name (truncated with tooltip on overflow)
   *   - An optional colored category tag badge
   *   - An optional delete button (visible on hover)
   *
   * Integrates with `remoteChangeAnimation` to flash when realtime sync
   * updates arrive, and `triggerLocalAnimation` for optimistic toggle feedback.
   */

  // =============================================================================
  //  Imports
  // =============================================================================

  import { remoteChangeAnimation, triggerLocalAnimation } from '@prabhask5/stellar-engine/actions';
  import { truncateTooltip } from '@prabhask5/stellar-engine/actions';
  import type { DailyTask } from '$lib/types';

  // =============================================================================
  //  Props Interface
  // =============================================================================

  interface Props {
    /** The daily task data object */
    task: DailyTask;
    /** Callback to toggle completion status */
    onToggle?: () => void;
    /** Callback to delete this task */
    onDelete?: () => void;
    /** Drag handle event props from `DraggableList` — enables reorder handle */
    dragHandleProps?: { onpointerdown: (e: PointerEvent) => void };
  }

  // =============================================================================
  //  Component State
  // =============================================================================

  let { task, onToggle, onDelete, dragHandleProps }: Props = $props();

  /** Reference to the root element — used for `triggerLocalAnimation` */
  let element: HTMLElement;

  // =============================================================================
  //  Event Handlers
  // =============================================================================

  /**
   * Triggers a local animation on the card element and invokes the
   * toggle callback to flip the task's completion state.
   */
  function handleToggle() {
    triggerLocalAnimation(element, 'toggle');
    onToggle?.();
  }
</script>

<!-- ═══ Task Item Card ═══ -->
<div
  bind:this={element}
  class="task-item"
  class:completed={task.completed}
  use:remoteChangeAnimation={{ entityId: task.id, entityType: 'daily_tasks' }}
>
  <!-- Optional drag handle for reorder mode -->
  {#if dragHandleProps}
    <button class="drag-handle" {...dragHandleProps} aria-label="Drag to reorder">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="9" cy="6" r="1.5" fill="currentColor" />
        <circle cx="15" cy="6" r="1.5" fill="currentColor" />
        <circle cx="9" cy="12" r="1.5" fill="currentColor" />
        <circle cx="15" cy="12" r="1.5" fill="currentColor" />
        <circle cx="9" cy="18" r="1.5" fill="currentColor" />
        <circle cx="15" cy="18" r="1.5" fill="currentColor" />
      </svg>
    </button>
  {/if}

  <!-- Circular checkbox — toggles completion on click -->
  <button
    class="checkbox"
    class:checked={task.completed}
    onclick={handleToggle}
    aria-label={task.completed ? 'Mark as incomplete' : 'Mark as complete'}
  >
    {#if task.completed}
      <span class="checkmark">✓</span>
    {/if}
  </button>

  <!-- Task name area — includes the name and optional category tag -->
  <span class="task-name-area">
    <span class="task-name" use:truncateTooltip>{task.name}</span>
    {#if task.category}
      <span class="category-tag" style="--tag-color: {task.category.color}">
        {task.category.name}
      </span>
    {/if}
  </span>

  <!-- Delete button — appears on hover -->
  {#if onDelete}
    <button class="delete-btn" onclick={onDelete} aria-label="Delete task">×</button>
  {/if}
</div>

<style>
  /* ═══ Task Card ═══ */

  .task-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    background: linear-gradient(135deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-left: 4px solid var(--color-red); /* red accent = incomplete */
    border-radius: var(--radius-lg);
    transition: all 0.3s var(--ease-out);
    position: relative;
    overflow: hidden;
  }

  /* Green accent when completed + reduced opacity */
  .task-item.completed {
    border-left-color: var(--color-green);
    opacity: 0.7;
  }

  /* Subtle top glow line */
  .task-item::before {
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

  .task-item:hover {
    transform: translateX(4px);
    border-color: rgba(108, 92, 231, 0.3);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  /* ═══ Drag Handle ═══ */

  .drag-handle {
    cursor: grab;
    touch-action: none;
    padding: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.35;
    transition: all 0.3s var(--ease-spring);
    user-select: none;
    color: var(--color-text-muted);
    background: none;
    border: none;
    border-radius: var(--radius-md);
    margin-left: -0.25rem;
  }

  .drag-handle:hover {
    opacity: 1;
    background: rgba(108, 92, 231, 0.15);
    color: var(--color-primary-light);
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  /* ═══ Checkbox ═══ */

  .checkbox {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-red);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s var(--ease-spring);
    flex-shrink: 0;
    cursor: pointer;
    background: transparent;
  }

  /* Filled green circle when checked */
  .checkbox.checked {
    border-color: var(--color-green);
    background: var(--color-green);
  }

  .checkbox:hover {
    transform: scale(1.1);
    box-shadow: 0 0 15px currentColor;
  }

  .checkmark {
    color: white;
    font-size: 0.875rem;
    font-weight: bold;
  }

  /* ═══ Task Name Area ═══ */

  .task-name-area {
    flex: 1;
    min-width: 0; /* allows text truncation in flex container */
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .task-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
    font-size: 0.9375rem;
    transition: all 0.3s;
  }

  /* Completed task — strikethrough + italic + dimmed */
  .task-item.completed .task-name {
    text-decoration: line-through;
    opacity: 0.6;
    font-style: italic;
  }

  /* ═══ Category Tag ═══ */

  .category-tag {
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
    border-radius: var(--radius-sm);
    background: var(--tag-color);
    color: white;
    white-space: nowrap;
    flex-shrink: 0;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ═══ Delete Button ═══ */

  /* Hidden by default, fades in on row hover */
  .delete-btn {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    opacity: 0;
    transition: all 0.3s var(--ease-spring);
    border: 1px solid transparent;
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .task-item:hover .delete-btn {
    opacity: 0.5;
  }

  .delete-btn:hover {
    opacity: 1 !important;
    background: rgba(255, 107, 107, 0.2);
    border-color: rgba(255, 107, 107, 0.4);
    color: var(--color-red);
    transform: scale(1.1);
  }

  /* ═══ Mobile Responsive ═══ */

  @media (max-width: 480px) {
    .task-item {
      padding: 0.625rem 0.75rem;
      gap: 0.625rem;
    }

    .task-name-area {
      gap: 0.375rem;
    }

    .task-name {
      font-size: 0.875rem;
    }

    .category-tag {
      font-size: 0.625rem;
      padding: 0.125rem 0.375rem;
      max-width: 80px;
    }

    /* Always partially visible on mobile (no hover) */
    .delete-btn {
      width: 36px;
      height: 36px;
      font-size: 1.25rem;
      opacity: 0.3;
    }

    .drag-handle {
      padding: 0.25rem;
    }
  }
</style>
