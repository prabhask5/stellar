<script lang="ts">
  /**
   * @fileoverview LongTermTaskForm — modal form for creating a new long-term task or reminder.
   *
   * Wraps a `Modal` and presents fields for task name, due date, and an optional
   * **tag** (category) assignment via a custom dropdown.  Supports both standalone
   * tags and project-owned tags (shown with a star icon).
   *
   * Key behaviours:
   * - Restores previously-entered form state when returning from category creation.
   * - Custom dropdown with "No tag", standalone tags, project tags, and "Add Tag".
   * - Tags can be deleted inline from the dropdown (standalone only).
   * - Category can be locked (read-only) when opened from a project context.
   * - Auto-focuses the name input on desktop to speed up entry.
   */

  import Modal from './Modal.svelte';
  import type { TaskCategory, AgendaItemType } from '$lib/types';
  import { getTodayDateString } from '$lib/utils/dates';
  import { trackEditing } from 'stellar-drive/actions';
  import { truncateTooltip } from 'stellar-drive/actions';

  // =============================================================================
  //                                  Props
  // =============================================================================

  interface Props {
    /** Whether the modal is currently visible */
    open: boolean;
    /** Available tag categories the user can pick from */
    categories: TaskCategory[];
    /** Whether to create a `task` or a `reminder` */
    type?: AgendaItemType;
    /** Pre-fill the due-date field (ISO string) */
    defaultDate?: string;
    /** Restore the task name when coming back from category creation */
    initialName?: string;
    /** Restore the selected category when coming back from category creation */
    initialCategoryId?: string | null;
    /** When `true`, the tag field is read-only (project-context usage) */
    lockedCategory?: boolean;
    /** Close the modal */
    onClose: () => void;
    /** Create the task — receives name, due date, and optional category ID */
    onCreate: (name: string, dueDate: string, categoryId: string | null) => void;
    /** Delete a standalone tag from the dropdown */
    onDeleteCategory: (id: string) => void;
    /** Switch to the "create category" flow, preserving current form state */
    onRequestCreateCategory: (formState: {
      name: string;
      dueDate: string;
      categoryId: string | null;
    }) => void;
  }

  let {
    open,
    categories,
    type = 'task',
    defaultDate,
    initialName = '',
    initialCategoryId = null,
    lockedCategory = false,
    onClose,
    onCreate,
    onDeleteCategory,
    onRequestCreateCategory
  }: Props = $props();

  // =============================================================================
  //                          Derived Labels
  // =============================================================================

  /** Dynamic modal title based on item type */
  const modalTitle = $derived(type === 'task' ? 'New Long-term Task' : 'New Long-term Reminder');

  /** Dynamic submit button label */
  const submitLabel = $derived(type === 'task' ? 'Create Task' : 'Create Reminder');

  // =============================================================================
  //                          Utility Actions
  // =============================================================================

  /**
   * Svelte action — auto-focuses the node on desktop to avoid triggering the
   * mobile keyboard popup on small screens.
   * @param {HTMLElement} node - The element to focus
   */
  function focus(node: HTMLElement) {
    if (window.innerWidth > 640) {
      node.focus();
    }
  }

  // =============================================================================
  //                           Form State
  // =============================================================================

  let name = $state('');
  let dueDate = $state('');
  let categoryId = $state<string | null>(null);

  /* ── Dropdown visibility ── */
  let dropdownOpen = $state(false);

  /**
   * Reset / restore form state whenever the modal opens.
   * Uses `initialName` and `initialCategoryId` so that returning from the
   * "create tag" flow can re-populate what the user had already typed.
   */
  $effect(() => {
    if (open) {
      name = initialName || '';
      dueDate = defaultDate || getTodayString();
      categoryId = initialCategoryId;
      dropdownOpen = false;
    }
  });

  /**
   * Wrapper around the date utility — produces today's date as an ISO string.
   * @returns {string} Today in `YYYY-MM-DD` format
   */
  function getTodayString(): string {
    return getTodayDateString();
  }

  // =============================================================================
  //                          Event Handlers
  // =============================================================================

  /**
   * Handle form submission — validates inputs then delegates to `onCreate`.
   * @param {Event} e - Native submit event
   */
  function handleSubmit(e: Event) {
    e.preventDefault();
    if (!name.trim() || !dueDate) return;
    onCreate(name.trim(), dueDate, categoryId);
    onClose();
  }

  /**
   * Global keydown — close dropdown first on Escape, then close modal.
   * @param {KeyboardEvent} e - Keyboard event
   */
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (dropdownOpen) {
        dropdownOpen = false;
      } else {
        onClose();
      }
    }
  }

  /**
   * Select a category from the dropdown and close it.
   * @param {string | null} id - Category ID or `null` for "No tag"
   */
  function selectCategory(id: string | null) {
    categoryId = id;
    dropdownOpen = false;
  }

  /**
   * Delete a tag with confirmation, resetting `categoryId` if the deleted tag
   * was currently selected.
   * @param {Event} e     - Click event (propagation stopped)
   * @param {string} id   - Category ID to delete
   */
  function handleDeleteCategory(e: Event, id: string) {
    e.stopPropagation();
    if (confirm('Delete this tag? Tasks will keep their data but lose the tag.')) {
      onDeleteCategory(id);
      if (categoryId === id) {
        categoryId = null;
      }
    }
  }

  /**
   * Transition to the "create category" flow, passing current form state
   * so it can be restored when the user returns.
   */
  function handleAddCategoryClick() {
    dropdownOpen = false;
    onRequestCreateCategory({ name, dueDate, categoryId });
  }

  // =============================================================================
  //                          Derived State
  // =============================================================================

  /** The full category object matching the current `categoryId` selection */
  const selectedCategory = $derived(categories.find((c) => c.id === categoryId));

  /** Tags not owned by a project — can be edited/deleted */
  const standaloneCategories = $derived(categories.filter((c) => !c.project_id));

  /** Tags auto-created by a project — shown with a star icon */
  const projectCategories = $derived(categories.filter((c) => !!c.project_id));

  /**
   * Close dropdown when clicking anywhere outside the `.category-dropdown`.
   * @param {MouseEvent} e - Window click event
   */
  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.category-dropdown')) {
      dropdownOpen = false;
    }
  }
</script>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Template — Long-Term Task Creation Modal
     ═══════════════════════════════════════════════════════════════════════════ -->

<svelte:window onkeydown={handleKeydown} onclick={handleClickOutside} />

<Modal {open} title={modalTitle} {onClose}>
  <form
    class="form"
    onsubmit={handleSubmit}
    use:trackEditing={{
      entityId: 'new-long-term-task',
      entityType: 'long_term_agenda',
      formType: 'manual-save'
    }}
  >
    <!-- ═══ Task Name ═══ -->
    <div class="field">
      <label class="field-label" for="task-name">Task Name</label>
      <input
        id="task-name"
        type="text"
        bind:value={name}
        class="field-input"
        placeholder="What needs to be done?"
        use:focus
      />
    </div>

    <!-- ═══ Due Date ═══ -->
    <div class="field">
      <label class="field-label" for="due-date">Due Date</label>
      <input id="due-date" type="date" bind:value={dueDate} class="field-input date-input" />
    </div>

    <!-- ═══ Tag / Category Selector ═══ -->
    <div class="field" class:field-dropdown={!lockedCategory}>
      <span id="task-form-tag-label" class="field-label">Tag</span>

      {#if lockedCategory}
        <!-- Read-only tag display when category is locked by a project -->
        <div class="locked-tag" role="group" aria-labelledby="task-form-tag-label">
          {#if selectedCategory}
            <span class="selected-category" use:truncateTooltip>
              <span class="cat-dot" style="--cat-color: {selectedCategory.color}"></span>
              {selectedCategory.name}
            </span>
          {:else}
            <span class="placeholder">No tag</span>
          {/if}
        </div>
      {:else}
        <!-- Custom Dropdown for tag selection -->
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
              <span class="placeholder">Select a tag...</span>
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

          {#if dropdownOpen}
            <div class="dropdown-menu">
              <!-- "No tag" option -->
              <button
                type="button"
                class="dropdown-item"
                class:selected={categoryId === null}
                onclick={() => selectCategory(null)}
              >
                <span class="item-content">
                  <span class="cat-dot none"></span>
                  No tag
                </span>
              </button>

              <!-- Standalone tags (user-created, editable) -->
              {#each standaloneCategories as cat (cat.id)}
                <div class="dropdown-item-wrapper">
                  <button
                    type="button"
                    class="dropdown-item"
                    class:selected={categoryId === cat.id}
                    onclick={() => selectCategory(cat.id)}
                  >
                    <span class="item-content">
                      <span class="cat-dot" style="--cat-color: {cat.color}"></span>
                      {cat.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    class="delete-btn"
                    onclick={(e) => handleDeleteCategory(e, cat.id)}
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
              {/each}

              <!-- Project-owned tags (non-deletable from here, shown with star) -->
              {#if projectCategories.length > 0}
                <div class="dropdown-divider"></div>
                {#each projectCategories as cat (cat.id)}
                  <button
                    type="button"
                    class="dropdown-item"
                    class:selected={categoryId === cat.id}
                    onclick={() => selectCategory(cat.id)}
                  >
                    <span class="item-content">
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
                    </span>
                  </button>
                {/each}
              {/if}

              <div class="dropdown-divider"></div>

              <!-- "Add Tag" action button -->
              <button
                type="button"
                class="dropdown-item add-category-btn"
                onclick={handleAddCategoryClick}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Tag
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- ═══ Form Actions ═══ -->
    <div class="actions">
      <button type="button" class="cancel-btn" onclick={onClose}> Cancel </button>
      <button type="submit" class="submit-btn" disabled={!name.trim() || !dueDate}>
        {submitLabel}
      </button>
    </div>
  </form>
</Modal>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Styles
     ═══════════════════════════════════════════════════════════════════════════ -->

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

  /* ═══ Text & Date Inputs ═══ */

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

  /* Force dark color-scheme for the native date picker */
  .date-input {
    color-scheme: dark;
  }

  /* ═══ Locked Tag (read-only) ═══ */

  .locked-tag {
    display: flex;
    align-items: center;
    padding: 0.875rem 1rem;
    background: rgba(15, 15, 30, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    color: var(--color-text);
    font-size: 1rem;
    opacity: 0.7;
  }

  /* ═══ Custom Category Dropdown ═══ */

  .category-dropdown {
    position: relative;
  }

  .dropdown-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.875rem 1rem;
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

  .placeholder {
    color: var(--color-text-muted);
    opacity: 0.6;
  }

  .selected-category {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .chevron {
    transition: transform 0.2s var(--ease-out);
    color: var(--color-text-muted);
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  /* ═══ Dropdown Menu (absolutely positioned) ═══ */

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
    max-height: 300px;
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

  .dropdown-item-wrapper {
    display: flex;
    align-items: center;
  }

  .dropdown-item {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    color: var(--color-text);
    font-size: 0.9375rem;
    cursor: pointer;
    transition: all 0.2s var(--ease-out);
    text-align: left;
    width: 100%;
  }

  .dropdown-item:hover {
    background: rgba(108, 92, 231, 0.15);
  }

  .dropdown-item.selected {
    background: rgba(108, 92, 231, 0.2);
    color: var(--color-primary-light);
  }

  .item-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* ═══ Category Color Dot ═══ */

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

  /* ═══ Inline Delete Button (on hover) ═══ */

  .delete-btn {
    padding: 0.5rem;
    margin-right: 0.5rem;
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    opacity: 0;
    transition: all 0.2s var(--ease-out);
    border-radius: var(--radius-sm);
  }

  .dropdown-item-wrapper:hover .delete-btn {
    opacity: 0.5;
  }

  .delete-btn:hover {
    opacity: 1 !important;
    color: var(--color-red);
    background: rgba(255, 107, 107, 0.15);
  }

  .dropdown-divider {
    height: 1px;
    background: rgba(108, 92, 231, 0.15);
    margin: 0.25rem 0;
  }

  /* Star icon marking project-owned tags */
  .project-star {
    color: #ffd700;
    opacity: 0.7;
    flex-shrink: 0;
    margin-left: auto;
  }

  .add-category-btn {
    color: var(--color-primary-light) !important;
    gap: 0.5rem;
  }

  .add-category-btn:hover {
    background: rgba(108, 92, 231, 0.2) !important;
  }

  /* ═══ Form Actions ═══ */

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

  /* Extra bottom margin so the absolute dropdown has room to expand */
  .field-dropdown {
    margin-bottom: 6rem;
  }

  /* ═══ Mobile Adjustments ═══ */

  @media (max-width: 640px) {
    .dropdown-menu {
      max-height: 140px;
    }

    .dropdown-item {
      padding: 0.625rem 1rem;
      font-size: 0.875rem;
    }

    /* More space below dropdown field on mobile for the absolute dropdown */
    .field-dropdown {
      margin-bottom: 10rem;
    }
  }
</style>
