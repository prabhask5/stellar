<script lang="ts">
  /**
   * @fileoverview TaskTagsModal — modal for browsing and managing task tags (categories).
   *
   * Provides a full-featured tag management interface: inline name editing,
   * colour picker, delete with confirmation, and a grouped list of incomplete
   * tasks under each tag.  Tags are split into two groups:
   * - **Standalone** tags — user-created; editable name, colour, and deletable.
   * - **Project-owned** tags — managed by a project; read-only header with a
   *   star icon, but tasks can still be toggled / deleted.
   *
   * Key behaviours:
   * - `tasksByCategory` groups incomplete tasks into a `Map<string | null, ...>`.
   * - Escape key is intercepted to close nested UI (colour picker / name edit)
   *   before the modal itself.
   * - `remoteChangeAnimation` highlights tags and tasks updated by another device.
   * - Untagged tasks appear in a dashed-border "Untagged" section at the bottom.
   */

  import Modal from './Modal.svelte';
  import { scale } from 'svelte/transition';
  import type { TaskCategory, LongTermTaskWithCategory } from '$lib/types';
  import { parseDateString } from '$lib/utils/dates';
  import { remoteChangeAnimation } from '@prabhask5/stellar-engine/actions';
  import { truncateTooltip } from '$lib/actions/truncateTooltip';

  // =============================================================================
  //                               Constants
  // =============================================================================

  /** Palette of selectable tag colours (same as CategoryCreateModal) */
  const CATEGORY_COLORS = [
    '#6c5ce7', // Purple (primary)
    '#a29bfe', // Light purple
    '#00d4ff', // Cyan
    '#26de81', // Green
    '#ffd93d', // Yellow
    '#ff6b6b', // Red
    '#fd79a8', // Pink
    '#fdcb6e', // Orange
    '#74b9ff', // Blue
    '#55efc4' // Teal
  ];

  // =============================================================================
  //                                  Props
  // =============================================================================

  interface Props {
    /** Whether the modal is visible */
    open: boolean;
    /** All task categories (standalone + project-owned) */
    categories: TaskCategory[];
    /** All long-term tasks (will be filtered to incomplete internally) */
    tasks: LongTermTaskWithCategory[];
    /** Close the modal */
    onClose: () => void;
    /** Open a task detail modal */
    onTaskClick: (task: LongTermTaskWithCategory) => void;
    /** Toggle a task's completion */
    onToggle: (id: string) => void;
    /** Delete a task */
    onDelete: (id: string) => void;
    /** Delete a category (standalone only) */
    onDeleteCategory: (id: string) => void;
    /** Update a category's name or colour */
    onUpdateCategory: (id: string, updates: { name?: string; color?: string }) => void;
  }

  let {
    open,
    categories,
    tasks,
    onClose,
    onTaskClick,
    onToggle,
    onDelete,
    onDeleteCategory,
    onUpdateCategory
  }: Props = $props();

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
  //                          Editing State
  // =============================================================================

  /** ID of the category whose name is being edited, or `null` */
  let editingCategoryId = $state<string | null>(null);
  /** Temporary buffer for the edited category name */
  let editingCategoryName = $state('');
  /** ID of the category whose colour picker is open, or `null` */
  let showColorPicker = $state<string | null>(null);

  // =============================================================================
  //                      Derived — Task Grouping
  // =============================================================================

  /**
   * Groups incomplete tasks by `category_id`, including empty groups for
   * categories that have no incomplete tasks.  Each group is sorted by
   * `due_date` ascending (soonest first).
   */
  const tasksByCategory = $derived(() => {
    const incompleteTasks = tasks.filter((t) => !t.completed);
    const grouped = new Map<string | null, LongTermTaskWithCategory[]>();

    // Initialise with all categories (even empty ones)
    for (const cat of categories) {
      grouped.set(cat.id, []);
    }
    // Add null for uncategorized
    grouped.set(null, []);

    // Group tasks
    for (const task of incompleteTasks) {
      const categoryId = task.category_id ?? null;
      if (!grouped.has(categoryId)) {
        grouped.set(categoryId, []);
      }
      grouped.get(categoryId)!.push(task);
    }

    // Sort each group by due date (soonest first)
    for (const [, taskList] of grouped) {
      taskList.sort((a, b) => a.due_date.localeCompare(b.due_date));
    }

    return grouped;
  });

  // =============================================================================
  //                 Derived — Category Partitions
  // =============================================================================

  /**
   * Check whether a category is owned by a project (not independently editable).
   * @param {TaskCategory} category - The category to check
   * @returns {boolean} `true` if the category belongs to a project
   */
  function isProjectOwned(category: TaskCategory): boolean {
    return !!category.project_id;
  }

  /** Standalone (user-created) categories — editable */
  const standaloneCategories = $derived(categories.filter((c) => !isProjectOwned(c)));

  /** Project-owned categories — read-only headers */
  const projectCategories = $derived(categories.filter((c) => isProjectOwned(c)));

  // =============================================================================
  //                          Utility Functions
  // =============================================================================

  /**
   * Format a due-date string into a human-readable relative label
   * (e.g. "Today", "Tomorrow", "3d", "2d overdue", or "Feb 13").
   * @param {string} dateStr - ISO date string (`YYYY-MM-DD`)
   * @returns {string} Formatted date label
   */
  function formatDate(dateStr: string): string {
    const date = parseDateString(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = parseDateString(dateStr);

    const diffDays = Math.floor((taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return `${Math.abs(diffDays)}d overdue`;
    } else if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Tomorrow';
    } else if (diffDays <= 7) {
      return `${diffDays}d`;
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /**
   * Check whether a date string is before today.
   * @param {string} dateStr - ISO date string
   * @returns {boolean} `true` if the date is in the past
   */
  function isOverdue(dateStr: string): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return parseDateString(dateStr) < today;
  }

  /**
   * Check whether a date string is exactly today.
   * @param {string} dateStr - ISO date string
   * @returns {boolean} `true` if the date is today
   */
  function isDueToday(dateStr: string): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = parseDateString(dateStr);
    return taskDate.getTime() === today.getTime();
  }

  // =============================================================================
  //                    Keyboard — Escape Key Handling
  // =============================================================================

  /**
   * Intercept Escape to close nested UI (name edit or colour picker) first,
   * before the modal itself.
   * @param {KeyboardEvent} event - The keydown event
   */
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (editingCategoryId) {
        event.stopPropagation();
        cancelEditName();
      } else if (showColorPicker) {
        event.stopPropagation();
        showColorPicker = null;
      }
      // Otherwise let Modal handle it
    }
  }

  // =============================================================================
  //                   Category Name Editing
  // =============================================================================

  /**
   * Enter name-editing mode for a category.
   * @param {TaskCategory} category - The category to rename
   */
  function startEditName(category: TaskCategory) {
    editingCategoryId = category.id;
    editingCategoryName = category.name;
    showColorPicker = null;
  }

  /**
   * Persist the edited name and exit editing mode.
   */
  function saveEditName() {
    if (editingCategoryId && editingCategoryName.trim()) {
      onUpdateCategory(editingCategoryId, { name: editingCategoryName.trim() });
    }
    cancelEditName();
  }

  /**
   * Discard the edit and exit editing mode.
   */
  function cancelEditName() {
    editingCategoryId = null;
    editingCategoryName = '';
  }

  /**
   * Handle keystrokes inside the name input — Enter saves, Escape cancels.
   * @param {KeyboardEvent} event - The keydown event
   */
  function handleNameKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveEditName();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditName();
    }
  }

  // =============================================================================
  //                   Colour Picker
  // =============================================================================

  /**
   * Toggle the colour picker for a given category.
   * Closes name editing if it was open.
   * @param {string} categoryId - Category whose picker to toggle
   */
  function toggleColorPicker(categoryId: string) {
    if (showColorPicker === categoryId) {
      showColorPicker = null;
    } else {
      showColorPicker = categoryId;
      editingCategoryId = null;
    }
  }

  /**
   * Apply a new colour to a category and close the picker.
   * @param {string} categoryId - The target category
   * @param {string} color       - Hex colour value
   */
  function selectColor(categoryId: string, color: string) {
    onUpdateCategory(categoryId, { color });
    showColorPicker = null;
  }

  // =============================================================================
  //                   Category Deletion
  // =============================================================================

  /**
   * Confirm before deleting a tag; warns if tasks will become untagged.
   * @param {string} id        - Category ID
   * @param {string} name      - Category name (for the confirmation message)
   * @param {number} taskCount - Number of tasks currently using this tag
   */
  function handleDeleteTag(id: string, name: string, taskCount: number) {
    const message =
      taskCount > 0
        ? `Delete "${name}"? ${taskCount} task${taskCount === 1 ? '' : 's'} will become untagged.`
        : `Delete "${name}"?`;

    if (confirm(message)) {
      onDeleteCategory(id);
    }
  }
</script>

<!-- Intercept Escape for nested UI before the modal -->
<svelte:window onkeydown={handleKeydown} />

<!-- ═══════════════════════════════════════════════════════════════════════════
     Template — Task Tags Modal
     ═══════════════════════════════════════════════════════════════════════════ -->

<Modal {open} title="Task Tags" {onClose}>
  <div class="tags-content">
    <!-- ═══ Empty State ═══ -->
    {#if categories.length === 0}
      <div class="empty-state">
        <div class="empty-icon">🏷️</div>
        <p class="empty-text">No tags created yet</p>
        <p class="empty-hint">Create tags when adding new tasks</p>
      </div>
    {:else}
      <div class="categories-list">
        <!-- ═══ Standalone Categories ═══ -->
        {#if standaloneCategories.length > 0}
          {#each standaloneCategories as category (category.id)}
            {@const categoryTasks = tasksByCategory().get(category.id) || []}
            <div
              class="category-section"
              use:remoteChangeAnimation={{ entityId: category.id, entityType: 'task_categories' }}
            >
              <!-- ── Category Header (colour dot + name + count + delete) ── -->
              <div class="category-header">
                <div class="category-info">
                  <!-- Clickable colour dot — opens colour picker -->
                  <button
                    class="category-color"
                    style="background-color: {category.color}"
                    onclick={() => toggleColorPicker(category.id)}
                    aria-label="Change color"
                  ></button>

                  <!-- Inline name editing or clickable label -->
                  {#if editingCategoryId === category.id}
                    <input
                      type="text"
                      class="category-name-input"
                      bind:value={editingCategoryName}
                      onkeydown={handleNameKeydown}
                      onblur={saveEditName}
                      use:focus
                    />
                  {:else}
                    <button
                      class="category-name"
                      onclick={() => startEditName(category)}
                      use:truncateTooltip
                    >
                      {category.name}
                    </button>
                  {/if}

                  <span class="task-count">{categoryTasks.length}</span>
                </div>
                <button
                  class="delete-tag-btn"
                  onclick={() => handleDeleteTag(category.id, category.name, categoryTasks.length)}
                  aria-label="Delete tag"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <!-- ── Inline Colour Picker (scale transition) ── -->
              {#if showColorPicker === category.id}
                <div class="color-picker" transition:scale={{ duration: 150, start: 0.95 }}>
                  {#each CATEGORY_COLORS as color (color)}
                    <button
                      class="color-option"
                      class:selected={category.color === color}
                      style="background-color: {color}"
                      onclick={() => selectColor(category.id, color)}
                      aria-label="Select {color}"
                    ></button>
                  {/each}
                </div>
              {/if}

              <!-- ── Tasks Under This Category ── -->
              {#if categoryTasks.length > 0}
                <div class="tasks-list">
                  {#each categoryTasks as task (task.id)}
                    <div
                      class="task-row"
                      class:overdue={isOverdue(task.due_date)}
                      class:due-today={isDueToday(task.due_date)}
                      use:remoteChangeAnimation={{
                        entityId: task.id,
                        entityType: 'long_term_agenda'
                      }}
                    >
                      <!-- Reminder bell or completion checkbox -->
                      {#if task.type === 'reminder'}
                        <span class="bell-icon" aria-label="Reminder">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                          </svg>
                        </span>
                      {:else}
                        <button
                          class="checkbox"
                          onclick={() => onToggle(task.id)}
                          aria-label="Mark complete"
                        ></button>
                      {/if}

                      <!-- Task name + due date -->
                      <button class="task-info" onclick={() => onTaskClick(task)}>
                        <span class="task-name" use:truncateTooltip>{task.name}</span>
                        <span
                          class="due-date"
                          class:overdue={isOverdue(task.due_date)}
                          class:due-today={isDueToday(task.due_date)}
                        >
                          {formatDate(task.due_date)}
                        </span>
                      </button>

                      <!-- Delete task button (hover-reveal) -->
                      <button
                        class="delete-btn"
                        onclick={() => onDelete(task.id)}
                        aria-label="Delete task"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="no-tasks">No incomplete tasks</div>
              {/if}
            </div>
          {/each}
        {/if}

        <!-- ═══ Project-Owned Categories (read-only headers) ═══ -->
        {#if projectCategories.length > 0}
          <div class="section-divider">
            <span class="section-label">Projects</span>
          </div>

          {#each projectCategories as category (category.id)}
            {@const categoryTasks = tasksByCategory().get(category.id) || []}
            <div
              class="category-section project-owned"
              use:remoteChangeAnimation={{ entityId: category.id, entityType: 'task_categories' }}
            >
              <!-- ── Project Category Header (static colour + star icon) ── -->
              <div class="category-header">
                <div class="category-info">
                  <span
                    class="category-color-static"
                    style="background-color: {category.color}"
                    title="Managed by project"
                  ></span>
                  <span class="project-icon" title="Managed by project">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                      />
                    </svg>
                  </span>
                  <span class="category-name-static" use:truncateTooltip>{category.name}</span>
                  <span class="task-count">{categoryTasks.length}</span>
                </div>
              </div>

              <!-- ── Tasks Under This Project Category ── -->
              {#if categoryTasks.length > 0}
                <div class="tasks-list">
                  {#each categoryTasks as task (task.id)}
                    <div
                      class="task-row"
                      class:overdue={isOverdue(task.due_date)}
                      class:due-today={isDueToday(task.due_date)}
                      use:remoteChangeAnimation={{
                        entityId: task.id,
                        entityType: 'long_term_agenda'
                      }}
                    >
                      {#if task.type === 'reminder'}
                        <span class="bell-icon" aria-label="Reminder">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                          </svg>
                        </span>
                      {:else}
                        <button
                          class="checkbox"
                          onclick={() => onToggle(task.id)}
                          aria-label="Mark complete"
                        ></button>
                      {/if}

                      <button class="task-info" onclick={() => onTaskClick(task)}>
                        <span class="task-name" use:truncateTooltip>{task.name}</span>
                        <span
                          class="due-date"
                          class:overdue={isOverdue(task.due_date)}
                          class:due-today={isDueToday(task.due_date)}
                        >
                          {formatDate(task.due_date)}
                        </span>
                      </button>

                      <button
                        class="delete-btn"
                        onclick={() => onDelete(task.id)}
                        aria-label="Delete task"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="no-tasks">No incomplete tasks</div>
              {/if}
            </div>
          {/each}
        {/if}

        <!-- ═══ Untagged Tasks ═══ -->
        {#if (tasksByCategory().get(null) || []).length > 0}
          {@const untaggedTasks = tasksByCategory().get(null) || []}
          <div class="category-section untagged">
            <div class="category-header">
              <div class="category-info">
                <span
                  class="category-color-static"
                  style="background-color: rgba(108, 92, 231, 0.5)"
                ></span>
                <span class="category-name-static">Untagged</span>
                <span class="task-count">{untaggedTasks.length}</span>
              </div>
            </div>

            <div class="tasks-list">
              {#each untaggedTasks as task (task.id)}
                <div
                  class="task-row"
                  class:overdue={isOverdue(task.due_date)}
                  class:due-today={isDueToday(task.due_date)}
                  use:remoteChangeAnimation={{
                    entityId: task.id,
                    entityType: 'long_term_agenda'
                  }}
                >
                  {#if task.type === 'reminder'}
                    <span class="bell-icon" aria-label="Reminder">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                    </span>
                  {:else}
                    <button
                      class="checkbox"
                      onclick={() => onToggle(task.id)}
                      aria-label="Mark complete"
                    ></button>
                  {/if}

                  <button class="task-info" onclick={() => onTaskClick(task)}>
                    <span class="task-name" use:truncateTooltip>{task.name}</span>
                    <span
                      class="due-date"
                      class:overdue={isOverdue(task.due_date)}
                      class:due-today={isDueToday(task.due_date)}
                    >
                      {formatDate(task.due_date)}
                    </span>
                  </button>

                  <button
                    class="delete-btn"
                    onclick={() => onDelete(task.id)}
                    aria-label="Delete task"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</Modal>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Styles
     ═══════════════════════════════════════════════════════════════════════════ -->

<style>
  /* ═══ Content Container ═══ */

  .tags-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* ═══ Empty State ═══ */

  .empty-state {
    text-align: center;
    padding: 2rem 1rem;
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.7;
  }

  .empty-text {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 0.5rem;
  }

  .empty-hint {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  /* ═══ Categories List ═══ */

  .categories-list {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* ═══ Projects Section Divider ═══ */

  .section-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.25rem 0;
  }

  .section-divider::before,
  .section-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255, 215, 0, 0.2), transparent);
  }

  .section-label {
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255, 215, 0, 0.5);
    white-space: nowrap;
  }

  /* ═══ Category Section ═══ */

  .category-section {
    position: relative;
  }

  .category-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: rgba(20, 20, 40, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-md);
  }

  .category-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }

  /* ═══ Category Colour Dot (clickable) ═══ */

  .category-color {
    width: 12px;
    height: 12px;
    min-width: 12px;
    min-height: 12px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    border: none;
    padding: 0;
    cursor: pointer;
    transition: all 0.2s var(--ease-out);
  }

  .category-color:hover {
    transform: scale(1.2);
    box-shadow: 0 0 8px currentColor;
  }

  /* Static colour dot (project-owned / untagged) */
  .category-color-static {
    width: 12px;
    height: 12px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  /* ═══ Colour Picker ═══ */

  .color-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0.5rem 0.75rem;
    margin-top: 0.375rem;
    background: rgba(15, 15, 30, 0.8);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-md);
  }

  .color-option {
    width: 26px;
    height: 26px;
    border-radius: var(--radius-sm);
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s var(--ease-out);
  }

  .color-option:hover {
    transform: scale(1.15);
    border-color: rgba(255, 255, 255, 0.4);
  }

  .color-option.selected {
    border-color: white;
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
  }

  /* ═══ Category Name (editable button / input) ═══ */

  .category-name {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--color-text);
    background: none;
    border: none;
    padding: 0.25rem 0.5rem;
    margin: -0.25rem -0.5rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .category-name:hover {
    background: rgba(108, 92, 231, 0.15);
  }

  .category-name-static {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--color-text);
  }

  .category-name-input {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--color-text);
    background: rgba(108, 92, 231, 0.1);
    border: 1px solid rgba(108, 92, 231, 0.4);
    padding: 0.25rem 0.5rem;
    margin: -0.25rem -0.5rem;
    border-radius: var(--radius-sm);
    width: 100%;
    max-width: 200px;
  }

  .category-name-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-glow);
  }

  /* ═══ Task Count Badge ═══ */

  .task-count {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
    background: rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-full);
    color: var(--color-primary-light);
    flex-shrink: 0;
  }

  /* ═══ Delete Tag Button (hover-reveal) ═══ */

  .delete-tag-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.3;
    transition: all 0.3s var(--ease-spring);
    border: none;
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    flex-shrink: 0;
  }

  .category-header:hover .delete-tag-btn {
    opacity: 0.6;
  }

  .delete-tag-btn:hover {
    opacity: 1 !important;
    color: var(--color-red);
    background: rgba(255, 107, 107, 0.2);
  }

  /* ═══ Tasks List ═══ */

  .tasks-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-top: 0.5rem;
    padding-left: 0.5rem;
  }

  .task-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.75rem;
    background: rgba(15, 15, 30, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-md);
    transition: all 0.2s var(--ease-out);
  }

  .task-row:hover {
    background: rgba(20, 20, 40, 0.8);
    border-color: rgba(108, 92, 231, 0.2);
    transform: translateX(4px);
  }

  /* Variant-specific left borders */
  .task-row.overdue {
    border-left: 2px solid var(--color-red);
  }

  .task-row.due-today {
    border-left: 2px solid var(--color-yellow);
  }

  /* ═══ Reminder Bell ═══ */

  .bell-icon {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--color-primary-light);
    opacity: 0.7;
  }

  /* ═══ Completion Checkbox ═══ */

  .checkbox {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(108, 92, 231, 0.4);
    border-radius: 50%;
    flex-shrink: 0;
    background: transparent;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .checkbox:hover {
    border-color: var(--color-green);
    transform: scale(1.1);
  }

  /* ═══ Task Info Button ═══ */

  .task-info {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .task-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ═══ Due Date Label ═══ */

  .due-date {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--color-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .due-date.overdue {
    color: var(--color-red);
  }

  .due-date.due-today {
    color: var(--color-yellow);
  }

  /* ═══ Delete Task Button (hover-reveal) ═══ */

  .delete-btn {
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: all 0.2s var(--ease-spring);
    border: none;
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    flex-shrink: 0;
  }

  .task-row:hover .delete-btn {
    opacity: 0.5;
  }

  .delete-btn:hover {
    opacity: 1 !important;
    color: var(--color-red);
    background: rgba(255, 107, 107, 0.2);
  }

  /* ═══ No Tasks Placeholder ═══ */

  .no-tasks {
    padding: 0.75rem 1rem;
    margin-top: 0.5rem;
    margin-left: 0.5rem;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    font-style: italic;
    background: rgba(15, 15, 30, 0.4);
    border-radius: var(--radius-md);
    border: 1px dashed rgba(108, 92, 231, 0.1);
  }

  /* ═══ Untagged Section ═══ */

  .category-section.untagged .category-header {
    background: rgba(30, 30, 50, 0.4);
    border-style: dashed;
  }

  /* ═══ Project-Owned Tag Headers ═══ */

  .category-section.project-owned .category-header {
    border-color: rgba(255, 215, 0, 0.15);
    background: rgba(255, 215, 0, 0.03);
  }

  .category-section.project-owned .category-header:hover {
    border-color: rgba(255, 215, 0, 0.25);
    background: rgba(255, 215, 0, 0.05);
  }

  .project-icon {
    color: #ffd700;
    opacity: 0.7;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ═══ Mobile Adjustments ═══ */

  @media (max-width: 640px) {
    .delete-btn {
      opacity: 0.3;
    }

    .delete-tag-btn {
      opacity: 0.5;
    }
  }
</style>
