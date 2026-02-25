<script lang="ts">
  /**
   * @fileoverview **Task List Detail** — Single task list detail page.
   *
   * Reached via `/agenda/:id` where `:id` is a task list UUID.
   *
   * This page mirrors the structure of the Plans detail page (`/plans/[id]`)
   * but is simpler — single column, no goals/progress bar, just a flat list
   * of checkable task items.
   *
   * Features:
   * - **Editable list name** — inline edit form matching the Plans detail
   *   page pattern (click title → form with Save/Cancel buttons)
   * - **Add task form** — reuses the {@link DailyTaskForm} component for
   *   consistent inline task creation UX
   * - **Draggable task items** — each item renders with a drag handle,
   *   circular checkbox, truncated name, and hover-visible delete button,
   *   matching the existing {@link TaskItem} component visual design
   * - **Sync support** — `remoteChangeAnimation` highlights items that
   *   arrive from background sync, `triggerLocalAnimation` provides
   *   immediate feedback on checkbox toggles
   *
   * Store lifecycle:
   * - `onMount`   → loads the task list + items via `taskListStore.load(id)`
   * - `onDestroy` → clears the store to prevent stale data on re-navigation
   */

  // =============================================================================
  //                               IMPORTS
  // =============================================================================

  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { taskListStore } from '$lib/stores/data';
  import type { TaskList, TaskListItem } from '$lib/types';
  import DailyTaskForm from '$lib/components/DailyTaskForm.svelte';
  import DraggableList from '$lib/components/DraggableList.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { remoteChangeAnimation, triggerLocalAnimation } from 'stellar-drive/actions';
  import { truncateTooltip } from 'stellar-drive/actions';

  // =============================================================================
  //                         COMPONENT STATE
  // =============================================================================

  /** The currently loaded task list with its nested items array, or null while loading. */
  let list = $state<(TaskList & { items: TaskListItem[] }) | null>(null);

  /** Whether the initial data load is still in flight (shows skeleton). */
  let loading = $state(true);

  /** Whether the user is currently editing the list name inline. */
  let editingListName = $state(false);

  /** Two-way bound value of the name input during inline editing. */
  let newListName = $state('');

  /**
   * Svelte action that auto-focuses an element on desktop.
   *
   * Skips on mobile (viewport <= 640px) to prevent the virtual keyboard
   * from popping up and obscuring content on mount.
   *
   * @param node - The HTML element to focus
   */
  function focus(node: HTMLElement) {
    if (window.innerWidth > 640) {
      node.focus();
    }
  }

  /** Route parameter — the task list UUID extracted from the URL. */
  const listId = $derived($page.params.id!);

  // =============================================================================
  //                       STORE SUBSCRIPTIONS
  // =============================================================================

  /**
   * Subscribe to the detail store and mirror its value + loading state
   * into local reactive variables.  When the store value changes (e.g.
   * after sync refresh), `list` updates and the template re-renders.
   *
   * Also keeps `newListName` in sync with the current list name so the
   * inline edit form always starts with the correct value.
   */
  $effect(() => {
    const unsubList = taskListStore.subscribe((value) => {
      list = value;
      /* Keep the edit input in sync with the current name */
      if (value) newListName = value.name;
    });
    const unsubLoading = taskListStore.loading.subscribe((value) => {
      loading = value;
    });

    return () => {
      unsubList();
      unsubLoading();
    };
  });

  // =============================================================================
  //                           LIFECYCLE
  // =============================================================================

  /**
   * On mount, load the task list and its items from the local database
   * (with remote fallback for deep-linked / bookmarked URLs).
   */
  onMount(async () => {
    await taskListStore.load(listId);
  });

  /**
   * On destroy, clear the store to prevent stale data from appearing
   * briefly when the user navigates to a different task list.
   */
  onDestroy(() => {
    taskListStore.clear();
  });

  // =============================================================================
  //                      EVENT HANDLERS
  // =============================================================================

  /**
   * Persist the inline-edited list name and exit edit mode.
   *
   * Guards against empty names — the user must enter at least one
   * non-whitespace character for the rename to proceed.
   */
  async function handleUpdateListName() {
    if (!list || !newListName.trim()) return;
    await taskListStore.updateName(list.id, newListName.trim());
    editingListName = false;
  }

  /**
   * Add a new task item to the list.
   *
   * Called by the {@link DailyTaskForm} `onSubmit` callback. The form
   * handles input clearing and re-focus automatically.
   *
   * @param name - Task name entered by the user (already trimmed by the form)
   */
  async function handleAddItem(name: string) {
    if (!list) return;
    await taskListStore.addItem(list.id, name);
  }

  /**
   * Toggle a task item's completion state (done ↔ not done).
   *
   * The store reads the current `completed` value and flips it,
   * updating both the database and the UI optimistically.
   *
   * @param itemId - The item's unique identifier
   */
  async function handleToggleItem(itemId: string) {
    await taskListStore.toggleItem(itemId);
  }

  /**
   * Delete a task item from the list.
   *
   * The engine soft-deletes the record; the store filters it out
   * of the items array immediately for instant UI feedback.
   *
   * @param itemId - The item's unique identifier
   */
  async function handleDeleteItem(itemId: string) {
    await taskListStore.deleteItem(itemId);
  }

  /**
   * Persist a drag-and-drop reorder of a task item.
   *
   * Called by {@link DraggableList}'s `onReorder` callback when the
   * user drops an item at a new position.
   *
   * @param itemId   - The dragged item's unique identifier
   * @param newOrder - The zero-based target position
   */
  async function handleReorderItem(itemId: string, newOrder: number) {
    await taskListStore.reorderItem(itemId, newOrder);
  }
</script>

<svelte:head>
  <title>{list?.name ?? 'Task List'} - Stellar Planner</title>
</svelte:head>

<!-- ═══ Page Header — Back button + editable list name ═══ -->
<div class="container">
  <header class="page-header">
    <div class="header-left">
      <button class="back-btn" onclick={() => goto('/agenda')} aria-label="Back to agenda">
        ← Back
      </button>
      {#if editingListName}
        <form
          class="edit-name-form"
          onsubmit={(e) => {
            e.preventDefault();
            handleUpdateListName();
          }}
        >
          <input type="text" bind:value={newListName} use:focus />
          <button type="submit" class="btn btn-sm btn-primary">Save</button>
          <button
            type="button"
            class="btn btn-sm btn-secondary"
            onclick={() => {
              editingListName = false;
              newListName = list?.name ?? '';
            }}
          >
            Cancel
          </button>
        </form>
      {:else if loading}
        <div class="title-skeleton"></div>
      {:else}
        <button
          class="title-edit-btn"
          onclick={() => (editingListName = true)}
          title="Click to edit list name"
        >
          <h1 use:truncateTooltip>{list?.name ?? 'Task List'}</h1>
        </button>
      {/if}
    </div>
  </header>

  <!-- ═══════════════════════════════════════════════════════════════════════
       Loading skeleton / Content switch
       Shows a skeleton UI while the store is loading, then either the
       task list content or nothing if the list wasn't found.
       ═══════════════════════════════════════════════════════════════════════ -->
  {#if loading}
    <!-- Skeleton — mimics the form + task rows layout while data loads -->
    <div class="tasks-section">
      <!-- Add task form skeleton -->
      <div class="form-skeleton">
        <div class="form-skeleton-input"></div>
        <div class="form-skeleton-btn"></div>
        <div class="skeleton-shimmer"></div>
      </div>
      <!-- Task item skeletons (3 rows with staggered animation) -->
      <div class="tasks-skeleton">
        {#each Array(3) as _, i (i)}
          <div class="task-skeleton-item" style="--delay: {i * 0.1}s">
            <div class="task-skeleton-handle"></div>
            <div class="task-skeleton-checkbox"></div>
            <div class="task-skeleton-title"></div>
            <div class="task-skeleton-delete"></div>
            <div class="skeleton-shimmer"></div>
          </div>
        {/each}
      </div>
    </div>
  {:else if list}
    <div class="tasks-section">
      <!-- Inline task creation form — reuses DailyTaskForm for consistency -->
      <DailyTaskForm onSubmit={handleAddItem} />

      {#if list.items.length === 0}
        <!-- Empty state — shown when the list has no items yet -->
        <EmptyState
          icon="📝"
          title="No tasks yet"
          description="Add your first task to this list above"
        />
      {:else}
        <!-- ═══ Draggable Task Items ═══
             Each item renders inline (not via TaskItem component) because
             TaskItem is typed for DailyTask which has `long_term_task_id`
             and `category` fields. Task list items are simpler but share
             the same visual design: drag handle + checkbox + name + delete.
        -->
        <DraggableList items={list.items} onReorder={handleReorderItem}>
          {#snippet renderItem({ item, dragHandleProps })}
            <!-- Element ref wrapper — needed for triggerLocalAnimation on toggle -->
            {@const el = { current: null as HTMLElement | null }}
            <div
              bind:this={el.current}
              class="task-item"
              class:completed={item.completed}
              use:remoteChangeAnimation={{ entityId: item.id, entityType: 'task_list_items' }}
            >
              <!-- Optional drag handle — provided by DraggableList for reorder -->
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

              <!-- Circular checkbox — toggles completion on click.
                   Red border = incomplete, green filled = complete.
                   triggerLocalAnimation provides instant visual feedback. -->
              <button
                class="checkbox"
                class:checked={item.completed}
                onclick={() => {
                  if (el.current) triggerLocalAnimation(el.current, 'toggle');
                  handleToggleItem(item.id);
                }}
                aria-label={item.completed ? 'Mark as incomplete' : 'Mark as complete'}
              >
                {#if item.completed}
                  <span class="checkmark">✓</span>
                {/if}
              </button>

              <!-- Task name — truncated with tooltip on overflow -->
              <span class="task-name" use:truncateTooltip>{item.name}</span>

              <!-- Delete button — hidden by default, fades in on row hover -->
              <button
                class="item-delete-btn"
                onclick={() => handleDeleteItem(item.id)}
                aria-label="Delete task">×</button
              >
            </div>
          {/snippet}
        </DraggableList>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════
     Page Header — matches Plans detail page
     ═══════════════════════════════════════════════════════════════════════════ */

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 2.5rem;
    flex-wrap: wrap;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex: 1;
    min-width: 0;
  }

  .back-btn {
    padding: 0.75rem 1.25rem;
    border-radius: var(--radius-xl);
    color: var(--color-text-muted);
    transition: all 0.35s var(--ease-spring);
    white-space: nowrap;
    border: 1px solid rgba(108, 92, 231, 0.15);
    font-weight: 600;
    background: linear-gradient(135deg, rgba(15, 15, 30, 0.8) 0%, rgba(20, 20, 40, 0.7) 100%);
    cursor: pointer;
  }

  .back-btn:hover {
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.2) 0%, rgba(108, 92, 231, 0.1) 100%);
    border-color: rgba(108, 92, 231, 0.4);
    color: var(--color-text);
    transform: translateX(-6px);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .title-edit-btn {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    text-align: left;
  }

  .title-edit-btn:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 4px;
    border-radius: var(--radius-lg);
  }

  .page-header h1,
  .title-edit-btn h1 {
    font-size: 2rem;
    font-weight: 800;
    cursor: pointer;
    padding: 0.5rem 1rem;
    margin: -0.5rem -1rem;
    border-radius: var(--radius-xl);
    transition: all 0.35s var(--ease-out);
    background: linear-gradient(
      135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 50%,
      var(--color-text) 100%
    );
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.03em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .title-edit-btn:hover h1 {
    background-position: 100% center;
  }

  .title-skeleton {
    width: 200px;
    height: 2rem;
    background: rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    animation: skeletonPulse 2s ease-in-out infinite;
  }

  .edit-name-form {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
  }

  .edit-name-form input {
    flex: 1;
    min-width: 0;
    font-size: 1.25rem;
    font-weight: 700;
    padding: 0.5rem 1rem;
    border-radius: var(--radius-xl);
    border: 1px solid rgba(108, 92, 231, 0.4);
    background: rgba(15, 15, 30, 0.8);
    color: var(--color-text);
    transition: border-color 0.3s;
  }

  .edit-name-form input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     Tasks Section
     ═══════════════════════════════════════════════════════════════════════════ */

  .tasks-section {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     Task Items — matches TaskItem.svelte design exactly
     ═══════════════════════════════════════════════════════════════════════════ */

  .task-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    background: linear-gradient(135deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-left: 4px solid var(--color-red);
    border-radius: var(--radius-lg);
    transition: all 0.3s var(--ease-out);
    position: relative;
    overflow: hidden;
  }

  .task-item.completed {
    border-left-color: var(--color-green);
    opacity: 0.7;
  }

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

  /* ═══ Task Name ═══ */

  .task-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
    font-size: 0.9375rem;
    transition: all 0.3s;
  }

  .task-item.completed .task-name {
    text-decoration: line-through;
    opacity: 0.6;
    font-style: italic;
  }

  /* ═══ Delete Button ═══ */

  .item-delete-btn {
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

  .task-item:hover .item-delete-btn {
    opacity: 0.5;
  }

  .item-delete-btn:hover {
    opacity: 1 !important;
    background: rgba(255, 107, 107, 0.2);
    border-color: rgba(255, 107, 107, 0.4);
    color: var(--color-red);
    transform: scale(1.1);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     Skeleton Loading
     ═══════════════════════════════════════════════════════════════════════════ */

  .form-skeleton {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    position: relative;
    overflow: hidden;
    animation: skeletonPulse 2s ease-in-out infinite;
  }

  .form-skeleton-input {
    flex: 1;
    height: 2.25rem;
    background: rgba(108, 92, 231, 0.12);
    border-radius: var(--radius-md);
  }

  .form-skeleton-btn {
    width: 80px;
    height: 2.25rem;
    background: rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-md);
  }

  .tasks-skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .task-skeleton-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    position: relative;
    overflow: hidden;
    animation: skeletonPulse 2s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  .task-skeleton-handle {
    width: 16px;
    height: 16px;
    background: rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-sm);
  }

  .task-skeleton-checkbox {
    width: 22px;
    height: 22px;
    background: rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-md);
  }

  .task-skeleton-title {
    flex: 1;
    height: 1rem;
    background: linear-gradient(
      90deg,
      rgba(108, 92, 231, 0.12) 0%,
      rgba(108, 92, 231, 0.2) 50%,
      rgba(108, 92, 231, 0.12) 100%
    );
    border-radius: var(--radius-sm);
  }

  .task-skeleton-delete {
    width: 32px;
    height: 32px;
    background: rgba(108, 92, 231, 0.08);
    border-radius: var(--radius-md);
  }

  .skeleton-shimmer {
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(108, 92, 231, 0.08) 20%,
      rgba(255, 255, 255, 0.05) 40%,
      rgba(108, 92, 231, 0.08) 60%,
      transparent 100%
    );
    animation: shimmer 2.5s ease-in-out infinite;
  }

  @keyframes skeletonPulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }

  @keyframes shimmer {
    0% {
      left: -100%;
    }
    100% {
      left: 200%;
    }
  }

  /* ═══ Button styles ═══ */

  :global(.btn-sm) {
    padding: 0.5rem 0.875rem;
    font-size: 0.8125rem;
  }

  :global(.btn-secondary) {
    background: rgba(108, 92, 231, 0.15);
    border: 1px solid rgba(108, 92, 231, 0.3);
    color: var(--color-primary-light);
  }

  :global(.btn-secondary:hover) {
    background: rgba(108, 92, 231, 0.25);
    border-color: rgba(108, 92, 231, 0.5);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     Mobile Responsive
     ═══════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 640px) {
    .page-header {
      margin-bottom: 1.5rem;
    }

    .back-btn {
      padding: 0.5rem 0.875rem;
      font-size: 0.8125rem;
    }

    .page-header h1,
    .title-edit-btn h1 {
      font-size: 1.375rem;
    }

    .edit-name-form {
      gap: 0.5rem;
    }

    .edit-name-form input {
      font-size: 1rem;
      padding: 0.375rem 0.75rem;
    }

    .tasks-section {
      gap: 0.75rem;
    }

    .task-item {
      padding: 0.625rem 0.75rem;
      gap: 0.625rem;
    }

    .task-name {
      font-size: 0.875rem;
    }

    .item-delete-btn {
      width: 36px;
      height: 36px;
      font-size: 1.25rem;
      opacity: 0.3;
    }

    .drag-handle {
      padding: 0.25rem;
    }
  }

  @media (max-width: 375px) {
    .page-header h1,
    .title-edit-btn h1 {
      font-size: 1.125rem;
    }
  }
</style>
