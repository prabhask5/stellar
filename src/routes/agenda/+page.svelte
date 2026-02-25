<script lang="ts">
  /**
   * @fileoverview **Agenda** — Daily tasks + task lists + long-term tasks / reminders page.
   *
   * Split into three sections:
   * 1. **Pending Tasks** — Quick daily tasks with drag-and-drop reordering,
   *    plus a commitments modal for managing ongoing commitments.
   * 2. **Task Lists** — Named containers of simple tasks displayed as
   *    reorderable cards showing "X / Y tasks" completion counts.  Clicking
   *    a card navigates to `/agenda/[id]` for managing items within that list.
   *    Supports create (via modal), delete (with cascade), and reorder.
   * 3. **Long-term Tasks & Reminders** — Calendar view with overdue / due-today /
   *    upcoming / completed task lists. Supports task creation, tag management,
   *    and category creation via modal chaining.
   *
   * On mount, linked daily tasks are auto-spawned for long-term tasks that are
   * due today or before but don't yet have a corresponding daily task.
   */

  // =============================================================================
  //                               IMPORTS
  // =============================================================================

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { resolveUserId } from 'stellar-drive/auth';

  import { goto } from '$app/navigation';
  import {
    taskCategoriesStore,
    commitmentsStore,
    dailyTasksStore,
    longTermTasksStore,
    taskListsStore
  } from '$lib/stores/data';
  import type {
    TaskCategory,
    Commitment,
    DailyTask,
    LongTermTaskWithCategory,
    TaskListWithCounts,
    CommitmentSection,
    AgendaItemType
  } from '$lib/types';
  import * as repo from '$lib/db/repositories';
  import { formatDate } from '$lib/utils/dates';
  import TaskItem from '$lib/components/TaskItem.svelte';
  import DailyTaskForm from '$lib/components/DailyTaskForm.svelte';
  import DraggableList from '$lib/components/DraggableList.svelte';
  import CommitmentsModal from '$lib/components/CommitmentsModal.svelte';
  import LongTermTaskCalendar from '$lib/components/LongTermTaskCalendar.svelte';
  import LongTermTaskList from '$lib/components/LongTermTaskList.svelte';
  import LongTermTaskModal from '$lib/components/LongTermTaskModal.svelte';
  import LongTermTaskForm from '$lib/components/LongTermTaskForm.svelte';
  import CategoryCreateModal from '$lib/components/CategoryCreateModal.svelte';
  import TaskTagsModal from '$lib/components/TaskTagsModal.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import { remoteChangeAnimation } from 'stellar-drive/actions';
  import { truncateTooltip } from 'stellar-drive/actions';

  // =============================================================================
  //                         COMPONENT STATE
  // =============================================================================

  /* ── Store-backed data ──── */
  let categories = $state<TaskCategory[]>([]);
  let commitments = $state<Commitment[]>([]);
  let dailyTasks = $state<DailyTask[]>([]);
  let longTermTasks = $state<LongTermTaskWithCategory[]>([]);

  /* ── Loading flags (prefixed with `_` when unused in template) ──── */
  let _categoriesLoading = $state(true);
  let _commitmentsLoading = $state(true);
  let dailyTasksLoading = $state(true);
  let longTermTasksLoading = $state(true);

  /* ── Task lists state ──── */
  let taskLists = $state<TaskListWithCounts[]>([]);
  let taskListsLoading = $state(true);
  let showCreateTaskListModal = $state(false);
  let newTaskListName = $state('');
  let creatingTaskList = $state(false);

  /**
   * Focus action for accessibility — auto-focuses an input on desktop.
   * Skips on mobile (width <= 640) to prevent the keyboard from popping up.
   * @param node - The HTML element to focus
   */
  function focus(node: HTMLElement) {
    if (window.innerWidth > 640) {
      node.focus();
    }
  }

  /* ── Modal visibility toggles ──── */
  let showCommitmentsModal = $state(false);
  let showTaskForm = $state(false);
  let showReminderForm = $state(false);
  let showTaskModal = $state(false);
  let showCategoryCreate = $state(false);
  let showTagsModal = $state(false);
  let selectedTask = $state<LongTermTaskWithCategory | null>(null);
  let defaultTaskDate = $state<string | undefined>(undefined);
  /** When `true`, closing the task modal will re-open the Tags modal */
  let returnToTagsModal = $state(false);

  /**
   * Preserved task form state while the user creates a new category.
   * Restored when the category modal closes so the user doesn't lose input.
   */
  let savedTaskFormState = $state<{
    name: string;
    dueDate: string;
    categoryId: string | null;
  } | null>(null);

  /** Gate flag — prevents flicker while spawned daily tasks are synced on mount */
  let spawnSyncDone = $state(false);

  /** Keeps backdrop visible during modal-to-modal transitions */
  let modalTransitioning = $state(false);

  /* ── Calendar navigation ──── */
  let currentDate = $state(new Date());

  // =============================================================================
  //                       STORE SUBSCRIPTIONS
  // =============================================================================

  /** Subscribe to all four data stores and mirror values into local state. */
  $effect(() => {
    const unsubs = [
      taskCategoriesStore.subscribe((v) => (categories = v)),
      taskCategoriesStore.loading.subscribe((v) => (_categoriesLoading = v)),
      commitmentsStore.subscribe((v) => (commitments = v)),
      commitmentsStore.loading.subscribe((v) => (_commitmentsLoading = v)),
      dailyTasksStore.subscribe((v) => (dailyTasks = v)),
      dailyTasksStore.loading.subscribe((v) => (dailyTasksLoading = v)),
      longTermTasksStore.subscribe((v) => (longTermTasks = v)),
      longTermTasksStore.loading.subscribe((v) => (longTermTasksLoading = v)),
      taskListsStore.subscribe((v) => (taskLists = v)),
      taskListsStore.loading.subscribe((v) => (taskListsLoading = v))
    ];

    return () => unsubs.forEach((u) => u());
  });

  // =============================================================================
  //                           LIFECYCLE
  // =============================================================================

  /**
   * Load all stores on mount, then auto-spawn linked daily tasks for
   * long-term tasks that are due today or earlier.
   */
  onMount(async () => {
    await Promise.all([
      taskCategoriesStore.load(),
      commitmentsStore.load(),
      dailyTasksStore.load(),
      longTermTasksStore.load(),
      taskListsStore.load()
    ]);

    // Spawn linked daily tasks for long-term tasks due today or before
    const userId = getUserId();
    if (userId) {
      const todayStr = formatDate(new Date());
      let needsDailyRefresh = false;

      // Spawn: create daily tasks for LT tasks due today or before that don't have one yet
      const dueCompletableTasks = longTermTasks.filter(
        (t) => t.due_date <= todayStr && t.type === 'task' && !t.completed
      );
      for (const lt of dueCompletableTasks) {
        const hasSpawned = dailyTasks.some((dt) => dt.long_term_task_id === lt.id);
        if (!hasSpawned) {
          await repo.createDailyTask(lt.name, userId, lt.id);
          needsDailyRefresh = true;
        }
      }

      if (needsDailyRefresh) {
        await dailyTasksStore.refresh();
      }
    }

    spawnSyncDone = true;
  });

  // =============================================================================
  //                      DERIVED DATA
  // =============================================================================

  /** Today's date as a `YYYY-MM-DD` string for task filtering */
  const today = $derived(formatDate(new Date()));

  /** Long-term tasks past their due date and not completed — sorted oldest first */
  const overdueTasks = $derived(
    longTermTasks
      .filter((t) => t.due_date < today && !t.completed)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
  );

  /** Long-term tasks due exactly today — sorted alphabetically */
  const dueTodayTasks = $derived(
    longTermTasks
      .filter((t) => t.due_date === today && !t.completed)
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  /** Long-term tasks with a future due date — sorted soonest first */
  const upcomingTasks = $derived(
    longTermTasks
      .filter((t) => t.due_date > today && !t.completed)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
  );

  /** Already-completed long-term tasks — sorted earliest due date first */
  const completedTasks = $derived(
    longTermTasks.filter((t) => t.completed).sort((a, b) => a.due_date.localeCompare(b.due_date)) // Earliest to latest
  );

  // =============================================================================
  //                         HELPERS
  // =============================================================================

  /**
   * Extract the current user's ID from the auth state.
   * @returns The authenticated user's UUID, or empty string if unavailable
   */
  function getUserId(): string {
    return resolveUserId($page.data.session, $page.data.offlineProfile);
  }

  // =============================================================================
  //                    DAILY TASK HANDLERS
  // =============================================================================

  /**
   * Create a new daily task.
   * @param name - Task name entered by the user
   */
  async function handleCreateDailyTask(name: string) {
    const userId = getUserId();
    if (!userId) return;
    await dailyTasksStore.create(name, userId);
  }

  async function handleToggleDailyTask(id: string) {
    await dailyTasksStore.toggle(id);
  }

  async function handleDeleteDailyTask(id: string) {
    await dailyTasksStore.delete(id);
  }

  async function handleReorderDailyTask(id: string, newOrder: number) {
    await dailyTasksStore.reorder(id, newOrder);
  }

  // =============================================================================
  //                   COMMITMENT HANDLERS
  // =============================================================================

  /**
   * Create a new commitment under the specified section.
   * @param name    - Commitment name
   * @param section - Which section of the commitments modal to place it in
   */
  async function handleCreateCommitment(name: string, section: CommitmentSection) {
    const userId = getUserId();
    if (!userId) return;
    await commitmentsStore.create(name, section, userId);
  }

  async function handleUpdateCommitment(id: string, name: string) {
    await commitmentsStore.update(id, { name });
  }

  async function handleDeleteCommitment(id: string) {
    await commitmentsStore.delete(id);
  }

  async function handleReorderCommitment(id: string, newOrder: number) {
    await commitmentsStore.reorder(id, newOrder);
  }

  // =============================================================================
  //                    CATEGORY HANDLERS
  // =============================================================================

  /**
   * Create a new task category (tag).
   * @param name  - Category display name
   * @param color - Hex color for the category badge
   */
  async function handleCreateCategory(name: string, color: string) {
    const userId = getUserId();
    if (!userId) return;
    await taskCategoriesStore.create(name, color, userId);
  }

  async function handleUpdateCategory(id: string, updates: { name?: string; color?: string }) {
    await taskCategoriesStore.update(id, updates);
    // Immediately update tasks in UI to reflect the category changes
    longTermTasks = longTermTasks.map((task) =>
      task.category_id === id && task.category
        ? { ...task, category: { ...task.category, ...updates } }
        : task
    );
  }

  async function handleDeleteCategory(id: string) {
    await taskCategoriesStore.delete(id);
    // Immediately update tasks in UI to remove the deleted category reference
    longTermTasks = longTermTasks.map((task) =>
      task.category_id === id ? { ...task, category_id: null, category: undefined } : task
    );
  }

  // =============================================================================
  //               MODAL SWAP — Category creation mid-flow
  // =============================================================================

  /**
   * Save the current task form state and swap to the category-create modal.
   * Opens the new modal *before* closing the old one so backdrops overlap
   * seamlessly (no flash of the underlying page).
   * @param formState - Current name / dueDate / categoryId from the task form
   */
  function handleRequestCreateCategory(formState: {
    name: string;
    dueDate: string;
    categoryId: string | null;
  }) {
    savedTaskFormState = formState;
    // Open category modal first (its backdrop appears)
    showCategoryCreate = true;
    // Then close task form (backdrop fades out behind the new one)
    requestAnimationFrame(() => {
      showTaskForm = false;
    });
  }

  function handleCategoryCreateClose() {
    // Open task form first (its backdrop appears)
    showTaskForm = true;
    // Then close category modal (backdrop fades out behind the new one)
    requestAnimationFrame(() => {
      showCategoryCreate = false;
    });
  }

  async function handleCategoryCreateSubmit(name: string, color: string) {
    await handleCreateCategory(name, color);
    // Close category modal and return to task form
    handleCategoryCreateClose();
  }

  // =============================================================================
  //                  LONG-TERM TASK HANDLERS
  // =============================================================================

  /**
   * Create a new long-term task (or reminder).
   * @param name       - Task name
   * @param dueDate    - ISO date string (YYYY-MM-DD)
   * @param categoryId - Optional category/tag ID
   * @param type       - `'task'` (default) or `'reminder'`
   */
  async function handleCreateLongTermTask(
    name: string,
    dueDate: string,
    categoryId: string | null,
    type: AgendaItemType = 'task'
  ) {
    const userId = getUserId();
    if (!userId) return;
    await longTermTasksStore.create(name, dueDate, categoryId, userId, type);
  }

  async function handleCreateLongTermReminder(
    name: string,
    dueDate: string,
    categoryId: string | null
  ) {
    await handleCreateLongTermTask(name, dueDate, categoryId, 'reminder');
  }

  async function handleUpdateLongTermTask(
    id: string,
    updates: { name?: string; due_date?: string; category_id?: string | null }
  ) {
    await longTermTasksStore.update(id, updates);
  }

  async function handleToggleLongTermTask(id: string) {
    await longTermTasksStore.toggle(id);
  }

  async function handleDeleteLongTermTask(id: string) {
    await longTermTasksStore.delete(id);
  }

  // =============================================================================
  //                    TASK LIST HANDLERS
  // =============================================================================

  /**
   * Create a new task list from the modal form.
   *
   * Guards against empty names and double-submits (via `creatingTaskList`
   * flag).  On success, resets the form input and closes the modal.
   * The store optimistically prepends the new list with zero counts.
   *
   * @param event - Form submit event (prevented to avoid page reload)
   */
  async function handleCreateTaskList(event: Event) {
    event.preventDefault();
    if (!newTaskListName.trim() || creatingTaskList) return;

    try {
      creatingTaskList = true;
      const userId = getUserId();
      if (!userId) return;
      await taskListsStore.create(newTaskListName.trim(), userId);
      /* Reset form state and close modal on success */
      newTaskListName = '';
      showCreateTaskListModal = false;
    } catch {
      /* Silent — the store handles optimistic updates and the UI stays
         consistent even if the write fails (sync will reconcile later) */
    } finally {
      creatingTaskList = false;
    }
  }

  /**
   * Delete a task list and all its child items (with confirmation).
   *
   * Shows a browser `confirm()` dialog before proceeding.  The repository
   * cascade-deletes all `task_list_items` atomically via batch write.
   *
   * @param id - The task list's unique identifier
   */
  async function handleDeleteTaskList(id: string) {
    if (!confirm('Delete this task list and all its tasks?')) return;
    await taskListsStore.delete(id);
  }

  /**
   * Persist a drag-and-drop reorder of a task list card.
   *
   * Called by {@link DraggableList}'s `onReorder` callback when the
   * user drops a card at a new position in the grid.
   *
   * @param id       - The dragged task list's unique identifier
   * @param newOrder - The zero-based target position
   */
  async function handleReorderTaskList(id: string, newOrder: number) {
    await taskListsStore.reorder(id, newOrder);
  }

  // =============================================================================
  //                    CALENDAR HANDLERS
  // =============================================================================

  /** Open the task-creation form with the clicked date pre-filled. */
  function handleDayClick(date: Date) {
    defaultTaskDate = formatDate(date);
    showTaskForm = true;
  }

  /** Open the task detail modal for the clicked task. */
  function handleTaskClick(task: LongTermTaskWithCategory) {
    selectedTask = task;
    showTaskModal = true;
  }

  /** Update the calendar's displayed month. */
  function handleMonthChange(date: Date) {
    currentDate = date;
  }
</script>

<svelte:head>
  <title>Agenda - Stellar Planner</title>
</svelte:head>

<!-- ═══ Page Container ═══ -->
<div class="container">
  <!-- ═══ PENDING TASKS Section ═══ -->
  <section class="section">
    <header class="section-header">
      <h2 class="section-title">Pending Tasks</h2>
      <div class="section-actions">
        <button class="btn btn-secondary btn-sm" onclick={() => (showCommitmentsModal = true)}>
          Commitments
        </button>
      </div>
    </header>

    <div class="daily-tasks-section">
      <DailyTaskForm onSubmit={handleCreateDailyTask} />

      {#if dailyTasksLoading || !spawnSyncDone}
        <!-- Daily Tasks Skeleton -->
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
      {:else if dailyTasks.length === 0}
        <div class="empty-inline">No tasks yet. Add one above.</div>
      {:else}
        <DraggableList items={dailyTasks} onReorder={handleReorderDailyTask}>
          {#snippet renderItem({ item, dragHandleProps })}
            <TaskItem
              task={item}
              {dragHandleProps}
              onToggle={() => handleToggleDailyTask(item.id)}
              onDelete={() => handleDeleteDailyTask(item.id)}
            />
          {/snippet}
        </DraggableList>
      {/if}
    </div>
  </section>

  <!-- ═══════════════════════════════════════════════════════════════════════
       TASK LISTS Section — Named containers of simple tasks.
       Cards show list name + "X / Y tasks" count.  Clicking navigates to
       the detail page at /agenda/[id].  Cards can be drag-reordered.
       ═══════════════════════════════════════════════════════════════════════ -->
  <section class="section">
    <header class="section-header">
      <h2 class="section-title">Task Lists</h2>
      <div class="section-actions">
        <button class="btn btn-primary btn-sm" onclick={() => (showCreateTaskListModal = true)}>
          + New List
        </button>
      </div>
    </header>

    {#if taskListsLoading}
      <!-- Skeleton cards (2 placeholders with staggered animation) -->
      <div class="lists-grid">
        {#each Array(2) as _, i (i)}
          <div class="skeleton-card" style="--delay: {i * 0.15}s">
            <div class="skeleton-header">
              <div class="skeleton-title"></div>
              <div class="skeleton-btn"></div>
            </div>
            <div class="skeleton-stats"></div>
            <div class="skeleton-shimmer"></div>
          </div>
        {/each}
      </div>
    {:else if taskLists.length === 0}
      <!-- Empty state — no task lists created yet -->
      <div class="empty-inline">No task lists yet. Create one above.</div>
    {:else}
      <!-- ═══ Draggable Task List Cards ═══
           Each card uses the same `.list-card` design as the Plans page
           goal list cards.  `remoteChangeAnimation` highlights cards
           that arrive from background sync.
      -->
      <DraggableList items={taskLists} onReorder={handleReorderTaskList}>
        {#snippet renderItem({ item: list, dragHandleProps })}
          <div
            class="list-card has-drag-handle"
            role="button"
            tabindex="0"
            onclick={() => goto(`/agenda/${list.id}`)}
            onkeypress={(e) => e.key === 'Enter' && goto(`/agenda/${list.id}`)}
            use:remoteChangeAnimation={{ entityId: list.id, entityType: 'task_lists' }}
          >
            <!-- Drag handle — centered at top of card for vertical reorder -->
            <button
              class="drag-handle card-drag-handle"
              {...dragHandleProps}
              aria-label="Drag to reorder">⋮⋮</button
            >
            <div class="list-header">
              <!-- List name — truncated with tooltip on overflow -->
              <h3 class="list-name" use:truncateTooltip>{list.name}</h3>
              <!-- Delete button — stopPropagation prevents card click/navigation -->
              <button
                class="delete-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  handleDeleteTaskList(list.id);
                }}
                aria-label="Delete list"
              >
                ×
              </button>
            </div>
            <!-- Completion count — "X / Y tasks" in monospace font -->
            <div class="list-stats">
              <span class="stat-text">
                {list.completedItems} / {list.totalItems} tasks
              </span>
            </div>
          </div>
        {/snippet}
      </DraggableList>
    {/if}
  </section>

  <!-- ═══ LONG-TERM TASKS & REMINDERS Section ═══ -->
  <section class="section">
    <header class="section-header">
      <h2 class="section-title">Long-term Tasks & Reminders</h2>
      <div class="section-actions">
        <button class="btn btn-secondary btn-sm btn-tags" onclick={() => (showTagsModal = true)}>
          <span class="btn-tags-full">View Tags</span>
          <span class="btn-tags-short">Tags</span>
        </button>
        <button
          class="btn btn-primary btn-sm"
          onclick={() => {
            defaultTaskDate = undefined;
            showTaskForm = true;
          }}
        >
          + New Task
        </button>
        <button
          class="btn btn-primary btn-sm"
          onclick={() => {
            defaultTaskDate = undefined;
            showReminderForm = true;
          }}
        >
          + New Reminder
        </button>
      </div>
    </header>

    <div class="long-term-section">
      {#if longTermTasksLoading}
        <!-- Long-term Tasks Skeleton -->
        <div class="calendar-skeleton-mini">
          <div class="calendar-skeleton-header">
            <div class="skeleton-nav-btn"></div>
            <div class="skeleton-month-title"></div>
            <div class="skeleton-nav-btn"></div>
          </div>
          <div class="calendar-skeleton-grid">
            {#each Array(35) as _, i (i)}
              <div class="skeleton-day-mini" style="--delay: {(i % 7) * 0.03}s"></div>
            {/each}
          </div>
          <div class="skeleton-shimmer"></div>
        </div>
        <div class="task-list-skeleton">
          {#each Array(3) as _, i (i)}
            <div class="long-task-skeleton" style="--delay: {i * 0.1}s">
              <div class="long-task-skeleton-indicator"></div>
              <div class="long-task-skeleton-content">
                <div class="long-task-skeleton-title"></div>
                <div class="long-task-skeleton-meta">
                  <div class="long-task-skeleton-date"></div>
                  <div class="long-task-skeleton-category"></div>
                </div>
              </div>
              <div class="skeleton-shimmer"></div>
            </div>
          {/each}
        </div>
      {:else}
        <LongTermTaskCalendar
          {currentDate}
          tasks={longTermTasks}
          onDayClick={handleDayClick}
          onTaskClick={handleTaskClick}
          onMonthChange={handleMonthChange}
        />

        <LongTermTaskList
          title="Overdue"
          tasks={overdueTasks}
          variant="overdue"
          onTaskClick={handleTaskClick}
          onToggle={handleToggleLongTermTask}
          onDelete={handleDeleteLongTermTask}
        />

        <LongTermTaskList
          title="Due Today"
          tasks={dueTodayTasks}
          variant="due-today"
          onTaskClick={handleTaskClick}
          onToggle={handleToggleLongTermTask}
          onDelete={handleDeleteLongTermTask}
        />

        <LongTermTaskList
          title="Upcoming"
          tasks={upcomingTasks}
          variant="upcoming"
          onTaskClick={handleTaskClick}
          onToggle={handleToggleLongTermTask}
          onDelete={handleDeleteLongTermTask}
        />

        <LongTermTaskList
          title="Completed"
          tasks={completedTasks}
          variant="completed"
          onTaskClick={handleTaskClick}
          onToggle={handleToggleLongTermTask}
          onDelete={handleDeleteLongTermTask}
        />

        {#if longTermTasks.length === 0}
          <EmptyState
            icon="📅"
            title="No long-term tasks or reminders"
            description="Add tasks or reminders with due dates to track them on the calendar"
          >
            <div class="empty-actions">
              <button
                class="btn btn-primary"
                onclick={() => {
                  defaultTaskDate = undefined;
                  showTaskForm = true;
                }}
              >
                Add First Task
              </button>
              <button
                class="btn btn-primary"
                onclick={() => {
                  defaultTaskDate = undefined;
                  showReminderForm = true;
                }}
              >
                Add Reminder
              </button>
            </div>
          </EmptyState>
        {/if}
      {/if}
    </div>
  </section>
</div>

<!-- ═══ Modals ═══ -->

<!-- Commitments modal — manage ongoing commitment items -->
<CommitmentsModal
  open={showCommitmentsModal}
  {commitments}
  onClose={() => (showCommitmentsModal = false)}
  onCreate={handleCreateCommitment}
  onUpdate={handleUpdateCommitment}
  onDelete={handleDeleteCommitment}
  onReorder={handleReorderCommitment}
/>

<!-- Long-term task creation form (type = task) -->
<LongTermTaskForm
  open={showTaskForm}
  {categories}
  type="task"
  defaultDate={savedTaskFormState?.dueDate ?? defaultTaskDate}
  initialName={savedTaskFormState?.name ?? ''}
  initialCategoryId={savedTaskFormState?.categoryId ?? null}
  onClose={() => {
    showTaskForm = false;
    savedTaskFormState = null;
  }}
  onCreate={handleCreateLongTermTask}
  onDeleteCategory={handleDeleteCategory}
  onRequestCreateCategory={handleRequestCreateCategory}
/>

<!-- Long-term task creation form (type = reminder) -->
<LongTermTaskForm
  open={showReminderForm}
  {categories}
  type="reminder"
  defaultDate={defaultTaskDate}
  onClose={() => {
    showReminderForm = false;
  }}
  onCreate={handleCreateLongTermReminder}
  onDeleteCategory={handleDeleteCategory}
  onRequestCreateCategory={(formState) => {
    savedTaskFormState = formState;
    showCategoryCreate = true;
    requestAnimationFrame(() => {
      showReminderForm = false;
    });
  }}
/>

<!-- Inline category creation — opened mid-task-form flow -->
<CategoryCreateModal
  open={showCategoryCreate}
  onClose={handleCategoryCreateClose}
  onCreate={handleCategoryCreateSubmit}
/>

<!-- Task detail / edit modal — returns to Tags modal if opened from there -->
<LongTermTaskModal
  open={showTaskModal}
  task={selectedTask}
  {categories}
  onClose={() => {
    showTaskModal = false;
    selectedTask = null;
    // Return to Tags modal if we came from there
    if (returnToTagsModal) {
      returnToTagsModal = false;
      showTagsModal = true;
    }
  }}
  onUpdate={handleUpdateLongTermTask}
  onToggle={handleToggleLongTermTask}
  onDelete={handleDeleteLongTermTask}
/>

<!-- Tags management modal — view/edit categories, browse tasks by tag -->
<TaskTagsModal
  open={showTagsModal}
  {categories}
  tasks={longTermTasks}
  onClose={() => (showTagsModal = false)}
  onTaskClick={(task) => {
    // Mark that we should return to Tags modal when task modal closes
    returnToTagsModal = true;
    showTagsModal = false;
    selectedTask = task;
    showTaskModal = true;
  }}
  onToggle={handleToggleLongTermTask}
  onDelete={handleDeleteLongTermTask}
  onDeleteCategory={handleDeleteCategory}
  onUpdateCategory={handleUpdateCategory}
/>

<!-- ═══ Create Task List Modal ═══ -->
<Modal
  open={showCreateTaskListModal}
  title="Create New Task List"
  onClose={() => (showCreateTaskListModal = false)}
>
  <form class="create-form" onsubmit={handleCreateTaskList}>
    <div class="form-group">
      <label for="task-list-name">List Name</label>
      <input
        id="task-list-name"
        type="text"
        bind:value={newTaskListName}
        placeholder="Enter list name..."
        required
        use:focus
      />
    </div>
    <div class="form-actions">
      <button
        type="button"
        class="btn btn-secondary"
        onclick={() => (showCreateTaskListModal = false)}
      >
        Cancel
      </button>
      <button type="submit" class="btn btn-primary" disabled={creatingTaskList}>
        {creatingTaskList ? 'Creating...' : 'Create List'}
      </button>
    </div>
  </form>
</Modal>

<!-- Transition backdrop - stays visible during modal swaps -->
<div class="transition-backdrop" class:visible={modalTransitioning}></div>

<style>
  .transition-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 5, 15, 0.98);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    z-index: 1001;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease-out;
  }

  .transition-backdrop.visible {
    opacity: 1;
    pointer-events: auto;
    transition: none; /* Appear instantly */
  }
  .section {
    margin-bottom: 2.5rem;
    /* Staggered animation for sections */
    animation: sectionFadeIn 0.5s var(--ease-out) backwards;
  }

  .section:first-of-type {
    animation-delay: 0.1s;
  }

  .section:last-of-type {
    animation-delay: 0.2s;
  }

  @keyframes sectionFadeIn {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }

  .section-title {
    font-size: 1.5rem;
    font-weight: 700;
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
    letter-spacing: -0.02em;
  }

  .section-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .daily-tasks-section {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }

  .long-term-section {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SKELETON LOADING STYLES
     ═══════════════════════════════════════════════════════════════════════════════════ */

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

  /* Mini Calendar Skeleton */
  .calendar-skeleton-mini {
    background: linear-gradient(
      165deg,
      rgba(15, 15, 30, 0.95) 0%,
      rgba(10, 10, 22, 0.98) 50%,
      rgba(15, 15, 30, 0.95) 100%
    );
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-xl);
    overflow: hidden;
    position: relative;
    animation: skeletonPulse 2s ease-in-out infinite;
  }

  .calendar-skeleton-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid rgba(108, 92, 231, 0.1);
  }

  .skeleton-nav-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-lg);
    background: rgba(108, 92, 231, 0.1);
  }

  .skeleton-month-title {
    width: 140px;
    height: 1.25rem;
    border-radius: var(--radius-md);
    background: linear-gradient(
      90deg,
      rgba(108, 92, 231, 0.15) 0%,
      rgba(108, 92, 231, 0.25) 50%,
      rgba(108, 92, 231, 0.15) 100%
    );
  }

  .calendar-skeleton-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    padding: 0.5rem;
  }

  .skeleton-day-mini {
    aspect-ratio: 1;
    min-height: 32px;
    border-radius: var(--radius-sm);
    background: rgba(20, 20, 40, 0.6);
    animation: skeletonPulse 2s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  /* Long-term Task List Skeleton */
  .task-list-skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .long-task-skeleton {
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

  .long-task-skeleton-indicator {
    width: 4px;
    height: 36px;
    background: rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-full);
  }

  .long-task-skeleton-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .long-task-skeleton-title {
    width: 65%;
    height: 1rem;
    background: linear-gradient(
      90deg,
      rgba(108, 92, 231, 0.12) 0%,
      rgba(108, 92, 231, 0.2) 50%,
      rgba(108, 92, 231, 0.12) 100%
    );
    border-radius: var(--radius-sm);
  }

  .long-task-skeleton-meta {
    display: flex;
    gap: 0.75rem;
  }

  .long-task-skeleton-date {
    width: 80px;
    height: 0.75rem;
    background: rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-sm);
  }

  .long-task-skeleton-category {
    width: 60px;
    height: 0.75rem;
    background: rgba(108, 92, 231, 0.08);
    border-radius: var(--radius-sm);
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

  /* ═══════════════════════════════════════════════════════════════════════════════════
     TASK LIST CARDS — matches Plans page `.list-card` design
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .list-card {
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-2xl);
    padding: 1.75rem;
    cursor: pointer;
    transition: all 0.4s var(--ease-out);
    position: relative;
    overflow: hidden;
  }

  .list-card.has-drag-handle {
    display: flex;
    flex-direction: column;
  }

  .card-drag-handle {
    align-self: center;
    border-right: none !important;
    border-bottom: 1px solid rgba(108, 92, 231, 0.1);
    margin: -1rem -1rem 0.75rem -1rem;
    padding: 0.375rem 1rem;
    width: auto;
    font-size: 1rem;
    letter-spacing: 0.15em;
  }

  /* Top glow line */
  .list-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 15%;
    right: 15%;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(108, 92, 231, 0.4),
      rgba(255, 255, 255, 0.2),
      rgba(108, 92, 231, 0.4),
      transparent
    );
  }

  /* Hover nebula effect */
  .list-card::after {
    content: '';
    position: absolute;
    top: -50%;
    right: -30%;
    width: 150px;
    height: 200%;
    background: radial-gradient(ellipse, rgba(108, 92, 231, 0.15) 0%, transparent 70%);
    opacity: 0;
    transition: opacity 0.4s;
    pointer-events: none;
  }

  .list-card:hover {
    border-color: rgba(108, 92, 231, 0.5);
    transform: translateY(-8px) scale(1.02);
    box-shadow:
      0 24px 50px rgba(0, 0, 0, 0.5),
      0 0 80px rgba(108, 92, 231, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .list-card:hover::after {
    opacity: 1;
  }

  .list-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 1.25rem;
    position: relative;
    z-index: 1;
  }

  .list-name {
    font-size: 1.375rem;
    font-weight: 700;
    flex: 1;
    margin-right: 1rem;
    letter-spacing: -0.02em;
  }

  .delete-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-lg);
    font-size: 1.375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.35;
    transition: all 0.3s var(--ease-spring);
    border: 1px solid transparent;
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .delete-btn:hover {
    opacity: 1;
    background: linear-gradient(135deg, rgba(255, 107, 107, 0.3) 0%, rgba(255, 107, 107, 0.1) 100%);
    border-color: rgba(255, 107, 107, 0.5);
    color: var(--color-red);
    transform: scale(1.15);
    box-shadow: 0 0 20px rgba(255, 107, 107, 0.3);
  }

  .list-stats {
    position: relative;
    z-index: 1;
  }

  .stat-text {
    font-size: 0.9375rem;
    color: var(--color-text-muted);
    font-weight: 500;
    font-family: var(--font-mono);
  }

  .lists-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* ── Skeleton cards ── */

  .skeleton-card {
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-2xl);
    padding: 1.75rem;
    position: relative;
    overflow: hidden;
    animation: skeletonPulse 2s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  .skeleton-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .skeleton-title {
    width: 60%;
    height: 1.25rem;
    background: rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-sm);
  }

  .skeleton-btn {
    width: 32px;
    height: 32px;
    background: rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-md);
  }

  .skeleton-stats {
    width: 40%;
    height: 0.875rem;
    background: rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-sm);
  }

  /* ── Create form modal styles ── */

  .create-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .form-group label {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .form-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .empty-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
  }

  .empty-inline {
    text-align: center;
    padding: 2rem 1rem;
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    font-style: italic;
    background: rgba(15, 15, 30, 0.6);
    border: 1px dashed rgba(108, 92, 231, 0.25);
    border-radius: var(--radius-lg);
  }

  /* Button styles */
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

  /* Tags button responsive text */
  .btn-tags-short {
    display: none;
  }

  @media (max-width: 400px) {
    .btn-tags-full {
      display: none;
    }
    .btn-tags-short {
      display: inline;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     MOBILE RESPONSIVE — iPhone 16 Pro Optimized
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 640px) {
    .list-card {
      padding: 1.25rem;
      border-radius: var(--radius-xl);
    }

    .list-card:hover {
      transform: translateY(-4px) scale(1.01);
    }

    .list-card:active {
      transform: translateY(0) scale(0.99);
    }

    .section {
      margin-bottom: 2rem;
    }

    .section-header {
      flex-direction: column;
      align-items: stretch;
      gap: 0.625rem;
    }

    .section-title {
      font-size: 1.25rem;
      text-align: center;
    }

    .section-actions {
      justify-content: center;
      gap: 0.375rem;
    }

    .section-actions .btn {
      justify-content: center;
      padding: 0.4375rem 0.625rem;
      font-size: 0.6875rem;
      white-space: nowrap;
    }

    .daily-tasks-section {
      gap: 0.75rem;
    }

    .long-term-section {
      gap: 1rem;
    }

    .empty-inline {
      padding: 1.5rem 1rem;
      font-size: 0.875rem;
    }
  }

  /* iPhone SE and smaller */
  @media (max-width: 375px) {
    .section-title {
      font-size: 1.125rem;
    }

    .section-actions .btn {
      padding: 0.375rem 0.5rem;
      font-size: 0.625rem;
    }
  }

  /* iPhone 16 Pro and similar (402px) */
  @media (min-width: 400px) and (max-width: 430px) {
    .section-title {
      font-size: 1.375rem;
    }
  }

  /* iPhone Pro Max (430px+) */
  @media (min-width: 430px) and (max-width: 640px) {
    .section-title {
      font-size: 1.375rem;
    }

    .section-header {
      flex-direction: row;
      align-items: center;
    }

    .section-actions {
      justify-content: flex-end;
    }
  }
</style>
