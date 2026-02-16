<script lang="ts">
  /**
   * @fileoverview LongTermTaskModal — detail / edit modal for a single long-term task.
   *
   * Displays task name, due date, category tag, and completion status inside
   * a reusable `Modal` shell.  Most fields support inline editing with
   * auto-save behaviour (changes are pushed via `onUpdate` immediately on
   * blur / Enter / selection).
   *
   * Key behaviours:
   * - Name field toggles between a read-only display and an `<input>` on click.
   * - Due-date changes are committed instantly via `onchange`.
   * - Category is selected through a custom dropdown split into standalone
   *   and project-owned groups.
   * - The `lockedCategory` prop disables the dropdown (used in project views).
   * - `trackEditing` marks the entity as "being edited" for cross-device
   *   conflict awareness; `remoteChangeAnimation` flashes when another device
   *   updates this task.
   */

  import Modal from './Modal.svelte';
  import type { LongTermTaskWithCategory, TaskCategory } from '$lib/types';
  import { parseDateString } from '$lib/utils/dates';
  import { remoteChangeAnimation, trackEditing } from 'stellar-drive/actions';
  import { truncateTooltip } from 'stellar-drive/actions';

  // =============================================================================
  //                                  Props
  // =============================================================================

  interface Props {
    /** Whether the modal is currently visible */
    open: boolean;
    /** The task to display/edit, or `null` when closed */
    task: LongTermTaskWithCategory | null;
    /** All available categories for the tag dropdown */
    categories: TaskCategory[];
    /** When `true`, the category dropdown is replaced with a static display */
    lockedCategory?: boolean;
    /** Close the modal */
    onClose: () => void;
    /** Persist field-level updates (name, due_date, category_id) */
    onUpdate: (
      id: string,
      updates: { name?: string; due_date?: string; category_id?: string | null }
    ) => void;
    /** Toggle completion status */
    onToggle: (id: string) => void;
    /** Delete the task */
    onDelete: (id: string) => void;
  }

  let {
    open,
    task,
    categories,
    lockedCategory = false,
    onClose,
    onUpdate,
    onToggle,
    onDelete
  }: Props = $props();

  // =============================================================================
  //                          Utility Actions
  // =============================================================================

  /**
   * Auto-focus action — skipped on mobile to avoid an unwanted keyboard popup.
   * @param {HTMLElement} node - Element to focus
   */
  function focus(node: HTMLElement) {
    if (window.innerWidth > 640) {
      node.focus();
    }
  }

  // =============================================================================
  //                          Local Form State
  // =============================================================================

  /** Whether the name field is in edit mode */
  let editingName = $state(false);
  /** Local copy of the task name (two-way bound to the input) */
  let name = $state('');
  /** Local copy of the due date string */
  let dueDate = $state('');
  /** Local copy of the selected category ID */
  let categoryId = $state<string | null>(null);
  /** Local copy of the completion flag */
  let completed = $state(false);
  /** Whether the category dropdown is open */
  let dropdownOpen = $state(false);

  // =============================================================================
  //                          Derived State
  // =============================================================================

  /** Resolved category object for the locally-selected `categoryId` */
  const selectedCategory = $derived(
    categoryId ? categories.find((c) => c.id === categoryId) : null
  );

  /** Categories that are NOT owned by a project */
  const standaloneCategories = $derived(categories.filter((c) => !c.project_id));

  /** Categories created by / owned by a project */
  const projectCategories = $derived(categories.filter((c) => !!c.project_id));

  // =============================================================================
  //                          Effects — Sync Props to Local State
  // =============================================================================

  /**
   * Whenever the `task` prop changes (e.g. modal re-opened with a different
   * task), copy its values into local state so the form fields reflect the
   * current task.
   */
  $effect(() => {
    if (task) {
      name = task.name;
      dueDate = task.due_date;
      categoryId = task.category_id;
      completed = task.completed;
      dropdownOpen = false;
    }
  });

  // =============================================================================
  //                          Event Handlers
  // =============================================================================

  /**
   * Select a category and persist the change immediately.
   * @param {string | null} id - The chosen category ID, or `null` for "No tag"
   */
  function selectCategory(id: string | null) {
    categoryId = id;
    dropdownOpen = false;
    if (task && id !== task.category_id) {
      onUpdate(task.id, { category_id: id });
    }
  }

  /**
   * Close the category dropdown when the user clicks outside of it.
   * @param {MouseEvent} e - The click event
   */
  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.category-dropdown')) {
      dropdownOpen = false;
    }
  }

  /**
   * Commit the edited name on blur / Enter, only if it actually changed.
   */
  function handleNameSubmit() {
    if (task && name.trim() && name !== task.name) {
      onUpdate(task.id, { name: name.trim() });
    }
    editingName = false;
  }

  /**
   * Commit due-date change immediately when the native date-picker value changes.
   */
  function handleDueDateChange() {
    if (task && dueDate !== task.due_date) {
      onUpdate(task.id, { due_date: dueDate });
    }
  }

  /**
   * Confirm and delete the task, then close the modal.
   */
  function handleDelete() {
    if (task && confirm(task.type === 'reminder' ? 'Delete this reminder?' : 'Delete this task?')) {
      onDelete(task.id);
      onClose();
    }
  }

  /**
   * Toggle completion — updates local state immediately for a responsive feel,
   * then fires the callback.
   */
  function handleToggle() {
    if (task) {
      completed = !completed;
      onToggle(task.id);
    }
  }

  // =============================================================================
  //                      Derived Status Badges
  // =============================================================================

  /** Whether the task's due date is before today (and still incomplete) */
  const isOverdue = $derived.by(() => {
    if (!dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDueDate = parseDateString(dueDate);
    return taskDueDate < today && !completed;
  });

  /** Whether the task's due date is exactly today (and still incomplete) */
  const isDueToday = $derived.by(() => {
    if (!dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDueDate = parseDateString(dueDate);
    return taskDueDate.getTime() === today.getTime() && !completed;
  });
</script>

<!-- Close category dropdown on any window click -->
<svelte:window onclick={handleClickOutside} />

<!-- ═══════════════════════════════════════════════════════════════════════════
     Template — Task Detail Modal
     ═══════════════════════════════════════════════════════════════════════════ -->

<Modal {open} title={task?.type === 'reminder' ? 'Reminder Details' : 'Task Details'} {onClose}>
  {#if task}
    <div
      class="task-details"
      use:remoteChangeAnimation={{ entityId: task.id, entityType: 'long_term_agenda' }}
      use:trackEditing={{
        entityId: task.id,
        entityType: 'long_term_agenda',
        formType: 'auto-save'
      }}
    >
      <!-- ═══ Name Field (click-to-edit) ═══ -->
      <div class="field">
        <span id="task-modal-name-label" class="field-label">Name</span>
        {#if editingName}
          <input
            type="text"
            bind:value={name}
            class="field-input"
            aria-labelledby="task-modal-name-label"
            onblur={handleNameSubmit}
            onkeydown={(e) => e.key === 'Enter' && handleNameSubmit()}
            use:focus
          />
        {:else}
          <button
            class="field-value editable"
            aria-labelledby="task-modal-name-label"
            onclick={() => (editingName = true)}
          >
            {name}
          </button>
        {/if}
      </div>

      <!-- ═══ Due Date Field (native date picker) ═══ -->
      <div class="field">
        <label class="field-label" for="task-modal-due-date">Due Date</label>
        <input
          id="task-modal-due-date"
          type="date"
          bind:value={dueDate}
          class="field-input date-input"
          onchange={handleDueDateChange}
        />
        <!-- Status badges — shown below the date input -->
        {#if isOverdue}
          <span class="overdue-badge">Overdue</span>
        {:else if isDueToday}
          <span class="due-today-badge">Due Today</span>
        {/if}
      </div>

      <!-- ═══ Tag / Category Field ═══ -->
      <div class="field">
        <span id="task-modal-tag-label" class="field-label">Tag</span>
        {#if lockedCategory}
          <!-- Read-only tag display (used in project context) -->
          <div class="field-value locked-tag" role="group" aria-labelledby="task-modal-tag-label">
            {#if selectedCategory}
              <span class="selected-category" use:truncateTooltip>
                <span class="cat-dot" style="--cat-color: {selectedCategory.color}"></span>
                {selectedCategory.name}
              </span>
            {:else}
              <span class="no-tag">
                <span class="cat-dot none"></span>
                No tag
              </span>
            {/if}
          </div>
        {:else}
          <!-- Interactive category dropdown -->
          <div class="category-dropdown">
            <button
              type="button"
              class="dropdown-trigger"
              onclick={() => (dropdownOpen = !dropdownOpen)}
            >
              {#if selectedCategory}
                <span class="selected-category" use:truncateTooltip>
                  <span class="cat-dot" style="--cat-color: {selectedCategory.color}"></span>
                  {selectedCategory.name}
                </span>
              {:else}
                <span class="no-tag">
                  <span class="cat-dot none"></span>
                  No tag
                </span>
              {/if}
              <svg
                class="chevron"
                class:open={dropdownOpen}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            <!-- ═══ Dropdown Menu — Standalone + Project Categories ═══ -->
            {#if dropdownOpen}
              <div class="dropdown-menu">
                <!-- "No tag" option -->
                <button
                  type="button"
                  class="dropdown-item"
                  class:selected={categoryId === null}
                  onclick={() => selectCategory(null)}
                >
                  <span class="cat-dot none"></span>
                  No tag
                </button>

                <!-- Standalone categories -->
                {#each standaloneCategories as cat (cat.id)}
                  <button
                    type="button"
                    class="dropdown-item"
                    class:selected={categoryId === cat.id}
                    onclick={() => selectCategory(cat.id)}
                  >
                    <span class="cat-dot" style="--cat-color: {cat.color}"></span>
                    {cat.name}
                  </button>
                {/each}

                <!-- Project-owned categories (separated by divider with star icon) -->
                {#if projectCategories.length > 0}
                  <div class="dropdown-divider"></div>
                  {#each projectCategories as cat (cat.id)}
                    <button
                      type="button"
                      class="dropdown-item"
                      class:selected={categoryId === cat.id}
                      onclick={() => selectCategory(cat.id)}
                    >
                      <span class="cat-dot" style="--cat-color: {cat.color}"></span>
                      {cat.name}
                      <svg
                        class="project-star"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path
                          d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                        />
                      </svg>
                    </button>
                  {/each}
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- ═══ Status Toggle (hidden for reminders) ═══ -->
      {#if task.type !== 'reminder'}
        <div class="field">
          <span id="task-modal-status-label" class="field-label">Status</span>
          <button
            class="status-toggle"
            class:completed
            onclick={handleToggle}
            aria-labelledby="task-modal-status-label"
          >
            {#if completed}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Completed
            {:else}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10" />
              </svg>
              Mark as Complete
            {/if}
          </button>
        </div>
      {/if}

      <!-- ═══ Danger Zone — Delete Action ═══ -->
      <div class="actions">
        <button class="delete-btn" onclick={handleDelete}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="3 6 5 6 21 6" />
            <path
              d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
            />
          </svg>
          {task.type === 'reminder' ? 'Delete Reminder' : 'Delete Task'}
        </button>
      </div>
    </div>
  {/if}
</Modal>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Styles
     ═══════════════════════════════════════════════════════════════════════════ -->

<style>
  /* ═══ Detail Layout ═══ */

  .task-details {
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

  /* ═══ Field Input ═══ */

  .field-input {
    padding: 0.75rem 1rem;
    background: rgba(15, 15, 30, 0.8);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    color: var(--color-text);
    font-size: 1rem;
    transition: all 0.3s var(--ease-out);
  }

  .field-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .date-input {
    color-scheme: dark;
  }

  /* ═══ Read-Only Field Value ═══ */

  .field-value {
    padding: 0.75rem 1rem;
    background: rgba(15, 15, 30, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    color: var(--color-text);
    font-size: 1rem;
    text-align: left;
    width: 100%;
    cursor: default;
  }

  .field-value.locked-tag {
    display: flex;
    align-items: center;
    opacity: 0.7;
  }

  .field-value.editable {
    cursor: pointer;
    transition: all 0.3s var(--ease-out);
  }

  .field-value.editable:hover {
    border-color: rgba(108, 92, 231, 0.4);
    background: rgba(20, 20, 40, 0.8);
  }

  /* ═══ Status Badges (Overdue / Due Today) ═══ */

  .overdue-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: rgba(255, 107, 107, 0.2);
    border: 1px solid rgba(255, 107, 107, 0.4);
    border-radius: var(--radius-md);
    color: var(--color-red);
    font-size: 0.75rem;
    font-weight: 600;
    margin-top: 0.25rem;
    width: fit-content;
  }

  .due-today-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: rgba(255, 217, 61, 0.2);
    border: 1px solid rgba(255, 217, 61, 0.4);
    border-radius: var(--radius-md);
    color: var(--color-yellow);
    font-size: 0.75rem;
    font-weight: 600;
    margin-top: 0.25rem;
    width: fit-content;
  }

  /* ═══ Category Dropdown ═══ */

  .category-dropdown {
    position: relative;
  }

  .dropdown-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: rgba(15, 15, 30, 0.8);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    color: var(--color-text);
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.3s var(--ease-out);
  }

  .dropdown-trigger:hover {
    border-color: rgba(108, 92, 231, 0.4);
  }

  .dropdown-trigger:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .selected-category,
  .no-tag {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .no-tag {
    color: var(--color-text-muted);
  }

  .chevron {
    transition: transform 0.2s var(--ease-out);
    color: var(--color-text-muted);
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  /* ═══ Dropdown Menu ═══ */

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    background: rgba(15, 15, 28, 0.98);
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    z-index: 100;
    max-height: 250px;
    overflow-y: auto;
    animation: dropdownFadeIn 0.2s var(--ease-out);
  }

  @keyframes dropdownFadeIn {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    color: var(--color-text);
    font-size: 0.9375rem;
    cursor: pointer;
    transition: all 0.2s var(--ease-out);
    text-align: left;
  }

  .dropdown-item:hover {
    background: rgba(108, 92, 231, 0.15);
  }

  .dropdown-item.selected {
    background: rgba(108, 92, 231, 0.2);
    color: var(--color-primary-light);
  }

  /* ═══ Category Dot ═══ */

  .cat-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--cat-color);
    flex-shrink: 0;
  }

  .cat-dot.none {
    background: var(--color-text-muted);
    opacity: 0.3;
  }

  .dropdown-divider {
    height: 1px;
    background: rgba(108, 92, 231, 0.15);
    margin: 0.25rem 0;
  }

  .project-star {
    color: #ffd700;
    opacity: 0.7;
    flex-shrink: 0;
    margin-left: auto;
  }

  /* ═══ Completion Status Toggle ═══ */

  .status-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(15, 15, 30, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-lg);
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .status-toggle:hover {
    border-color: rgba(108, 92, 231, 0.4);
    background: rgba(20, 20, 40, 0.8);
  }

  .status-toggle.completed {
    background: rgba(38, 222, 129, 0.15);
    border-color: rgba(38, 222, 129, 0.4);
    color: var(--color-green);
  }

  /* ═══ Actions (Delete) ═══ */

  .actions {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(108, 92, 231, 0.15);
  }

  .delete-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(255, 107, 107, 0.15);
    border: 1px solid rgba(255, 107, 107, 0.3);
    border-radius: var(--radius-lg);
    color: var(--color-red);
    font-size: 0.9375rem;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .delete-btn:hover {
    background: rgba(255, 107, 107, 0.25);
    border-color: rgba(255, 107, 107, 0.5);
    transform: scale(1.02);
  }
</style>
