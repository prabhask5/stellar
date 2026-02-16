<script lang="ts">
  /**
   * @fileoverview **Plan Detail** — Single goal list / project detail page.
   *
   * Reached via `/plans/:id` where `:id` is a goal list UUID.
   *
   * Features:
   * - Editable list name (inline edit)
   * - Aggregate progress bar combining goals + project tasks
   * - **Goals column** — Draggable goal items with completion / increment controls
   * - **Tasks column** (project only) — Long-term tasks filtered by the project's
   *   tag, displayed in overdue / due-today / upcoming / completed sections
   * - Mobile: collapsible sections with animated chevrons
   * - Two-column layout on desktop; single-column stacked on mobile
   */

  // =============================================================================
  //                               IMPORTS
  // =============================================================================

  import { page } from '$app/stores';
  import { resolveUserId } from 'stellar-drive/auth';

  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { goalListStore, longTermTasksStore, taskCategoriesStore } from '$lib/stores/data';
  import type {
    GoalList,
    Goal,
    GoalType,
    LongTermTaskWithCategory,
    TaskCategory,
    Project
  } from '$lib/types';
  import { getProjects } from '$lib/db/queries';
  import { calculateGoalProgressCapped } from '$lib/utils/colors';
  import GoalItem from '$lib/components/GoalItem.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import GoalForm from '$lib/components/GoalForm.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import DraggableList from '$lib/components/DraggableList.svelte';
  import LongTermTaskList from '$lib/components/LongTermTaskList.svelte';
  import LongTermTaskModal from '$lib/components/LongTermTaskModal.svelte';
  import LongTermTaskForm from '$lib/components/LongTermTaskForm.svelte';
  import { truncateTooltip } from 'stellar-drive/actions';

  // =============================================================================
  //                         COMPONENT STATE
  // =============================================================================

  /* ── Goal list data ──── */
  let list = $state<(GoalList & { goals: Goal[] }) | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let showAddModal = $state(false);
  /** ID of the goal currently being edited — `null` when not editing */
  let editingGoalId = $state<string | null>(null);
  let editingListName = $state(false);

  /* ── Long-term tasks state (only populated for project-owned lists) ──── */
  let project = $state<Project | null>(null);
  let longTermTasks = $state<LongTermTaskWithCategory[]>([]);
  let categories = $state<TaskCategory[]>([]);
  let selectedTask = $state<LongTermTaskWithCategory | null>(null);
  let showTaskModal = $state(false);
  let showTaskForm = $state(false);

  /* ── Mobile collapsible section toggles ──── */
  let goalsExpanded = $state(true);
  let tasksExpanded = $state(true);

  // =============================================================================
  //                       DERIVED DATA
  // =============================================================================

  /**
   * The goal currently being edited — derived from the live store so that
   * props update immediately when remote changes arrive.
   */
  const editingGoal = $derived(
    editingGoalId && list ? (list.goals.find((g) => g.id === editingGoalId) ?? null) : null
  );
  let newListName = $state('');

  /**
   * Focus action for accessibility — skips on mobile to avoid keyboard popup.
   * @param node - The HTML element to focus
   */
  function focus(node: HTMLElement) {
    if (window.innerWidth > 640) {
      node.focus();
    }
  }

  /** Route parameter — the goal list UUID */
  const listId = $derived($page.params.id!);

  /**
   * Aggregate completion percentage across goals *and* project tasks.
   * Each goal is scored 0–100 via `calculateGoalProgressCapped`; each
   * task is 0 or 100 based on completion.
   */
  const totalProgress = $derived(() => {
    const goals = list?.goals ?? [];
    const tasks = longTermTasks;
    const totalItems = goals.length + tasks.length;
    if (totalItems === 0) return 0;
    let sum = 0;
    for (const goal of goals) {
      sum += calculateGoalProgressCapped(
        goal.type,
        goal.completed,
        goal.current_value,
        goal.target_value
      );
    }
    for (const task of tasks) {
      sum += task.completed ? 100 : 0;
    }
    return Math.round(sum / totalItems);
  });

  /** Convert a `Date` to `YYYY-MM-DD` string for comparison with task due dates. */
  function formatDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /** Today's date as `YYYY-MM-DD` — boundary for overdue / due-today filtering */
  const today = $derived(formatDateString(new Date()));

  /* ── Task groups — derived from `longTermTasks` filtered by date ──── */

  /** Tasks with `due_date` before today and not completed */
  const overdueTasks = $derived(
    longTermTasks
      .filter((t) => t.due_date < today && !t.completed)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
  );

  /** Tasks due exactly today and not completed */
  const dueTodayTasks = $derived(
    longTermTasks
      .filter((t) => t.due_date === today && !t.completed)
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  /** Tasks with `due_date` after today and not completed */
  const upcomingTasks = $derived(
    longTermTasks
      .filter((t) => t.due_date > today && !t.completed)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
  );

  /** All completed tasks, sorted by due date */
  const completedTasks = $derived(
    longTermTasks.filter((t) => t.completed).sort((a, b) => a.due_date.localeCompare(b.due_date))
  );

  /** Whether the project has any associated long-term tasks */
  const hasAnyTasks = $derived(longTermTasks.length > 0);

  /** Categories narrowed to just the project's own tag — used by task forms */
  const projectCategories = $derived(
    project?.tag_id ? categories.filter((c) => c.id === project!.tag_id) : []
  );

  // =============================================================================
  //                    STORE SUBSCRIPTIONS
  // =============================================================================

  /** Subscribe to the single goal-list store and sync loading state. */
  $effect(() => {
    const unsubList = goalListStore.subscribe((value) => {
      list = value;
      if (value) newListName = value.name;
    });
    const unsubLoading = goalListStore.loading.subscribe((value) => {
      loading = value;
    });

    return () => {
      unsubList();
      unsubLoading();
    };
  });

  /** Subscribe to long-term tasks store, filtered by the project's tag ID. */
  $effect(() => {
    if (!project?.tag_id) return;
    const tagId = project.tag_id;

    const unsubTasks = longTermTasksStore.subscribe((allTasks) => {
      longTermTasks = allTasks.filter((t) => t.category_id === tagId);
    });
    const unsubCategories = taskCategoriesStore.subscribe((cats) => {
      categories = cats;
    });

    return () => {
      unsubTasks();
      unsubCategories();
    };
  });

  // =============================================================================
  //                           LIFECYCLE
  // =============================================================================

  onMount(async () => {
    await goalListStore.load(listId);

    // Find the project that owns this goal list
    const projects = await getProjects();
    const owningProject = projects.find((p) => p.goal_list_id === listId);
    if (owningProject) {
      project = owningProject;
      if (owningProject.tag_id) {
        await Promise.all([longTermTasksStore.load(), taskCategoriesStore.load()]);
      }
    }
  });

  onDestroy(() => {
    goalListStore.clear();
  });

  // =============================================================================
  //                      GOAL HANDLERS
  // =============================================================================

  /**
   * Add a new goal to the current list.
   * @param data - Goal creation payload from `GoalForm`
   */
  async function handleAddGoal(data: { name: string; type: GoalType; targetValue: number | null }) {
    if (!list) return;

    try {
      await goalListStore.addGoal(list.id, data.name, data.type, data.targetValue);
      showAddModal = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create goal';
    }
  }

  /**
   * Save edits to an existing goal. Resets progress when the goal type changes.
   * @param data - Updated goal payload from `GoalForm`
   */
  async function handleUpdateGoal(data: {
    name: string;
    type: GoalType;
    targetValue: number | null;
  }) {
    if (!editingGoal || !list) return;

    try {
      const typeChanged = editingGoal.type !== data.type;

      // Calculate updates
      const updates: Partial<Goal> = {
        name: data.name,
        type: data.type,
        target_value: data.targetValue
      };

      if (typeChanged) {
        // Reset progress when changing type
        updates.current_value = 0;
        updates.completed = false;
      }

      await goalListStore.updateGoal(editingGoal.id, updates);
      editingGoalId = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update goal';
    }
  }

  /**
   * Toggle a completion-type goal's done / undone state.
   * @param goal - The goal to toggle
   */
  async function handleToggleComplete(goal: Goal) {
    if (!list) return;

    try {
      await goalListStore.updateGoal(goal.id, { completed: !goal.completed });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update goal';
    }
  }

  /**
   * Increment or decrement an incremental goal's current value.
   * @param goal   - The goal to update
   * @param amount - Positive to increment, negative to decrement (default `1`)
   */
  async function handleIncrement(goal: Goal, amount: number = 1) {
    if (!list || goal.type !== 'incremental') return;

    try {
      if (amount > 0) {
        await goalListStore.incrementGoal(goal.id, amount);
      } else {
        const newValue = Math.max(0, goal.current_value + amount);
        const completed = goal.target_value ? newValue >= goal.target_value : false;
        await goalListStore.updateGoal(goal.id, { current_value: newValue, completed });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update goal';
    }
  }

  /**
   * Set an incremental goal to an exact value (clamped at 0 minimum).
   * @param goal  - The goal to update
   * @param value - The new absolute value
   */
  async function handleSetValue(goal: Goal, value: number) {
    if (!list || goal.type !== 'incremental') return;

    try {
      // Only prevent negative - allow overflow above target
      const clamped = Math.max(0, value);
      const completed = goal.target_value ? clamped >= goal.target_value : false;
      await goalListStore.updateGoal(goal.id, { current_value: clamped, completed });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update goal';
    }
  }

  /**
   * Delete a goal after user confirmation.
   * @param goal - The goal to remove
   */
  async function handleDeleteGoal(goal: Goal) {
    if (!list || !confirm('Delete this goal?')) return;

    try {
      await goalListStore.deleteGoal(goal.id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete goal';
    }
  }

  // =============================================================================
  //                  LONG-TERM TASK HANDLERS
  // =============================================================================

  /** Extract the current user's ID from the auth state. */
  function getUserId(): string {
    return resolveUserId($page.data.session, $page.data.offlineProfile);
  }

  /**
   * Create a new long-term task scoped to this project's tag.
   * @param name       - Task name
   * @param dueDate    - Due date as `YYYY-MM-DD`
   * @param categoryId - Category (tag) UUID, or `null`
   */
  async function handleCreateLongTermTask(
    name: string,
    dueDate: string,
    categoryId: string | null
  ) {
    const userId = getUserId();
    if (!userId) return;
    await longTermTasksStore.create(name, dueDate, categoryId, userId);
  }

  /** Toggle a long-term task's completed state. */
  async function handleToggleLongTermTask(id: string) {
    await longTermTasksStore.toggle(id);
  }

  /** Delete a long-term task by ID. */
  async function handleDeleteLongTermTask(id: string) {
    await longTermTasksStore.delete(id);
  }

  /** Update a long-term task's name, due date, or category. */
  async function handleUpdateLongTermTask(
    id: string,
    updates: { name?: string; due_date?: string; category_id?: string | null }
  ) {
    await longTermTasksStore.update(id, updates);
  }

  /** Open the task detail modal for a clicked task. */
  function handleTaskClick(task: LongTermTaskWithCategory) {
    selectedTask = task;
    showTaskModal = true;
  }

  /** Persist the inline-edited list name and exit edit mode. */
  async function handleUpdateListName() {
    if (!list || !newListName.trim()) return;

    try {
      await goalListStore.updateName(list.id, newListName.trim());
      editingListName = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update list name';
    }
  }

  /**
   * Persist a drag-and-drop reorder of a goal within the list.
   * @param goalId   - UUID of the dragged goal
   * @param newOrder - Zero-based target position
   */
  async function handleReorderGoal(goalId: string, newOrder: number) {
    try {
      await goalListStore.reorderGoal(goalId, newOrder);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to reorder goal';
    }
  }
</script>

<svelte:head>
  <title>{list?.name ?? 'Goal List'} - Stellar Planner</title>
</svelte:head>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Page Header — Back button + editable list name
     ═══════════════════════════════════════════════════════════════════════════ -->
<div class="container">
  <header class="page-header">
    <div class="header-left">
      <button class="back-btn" onclick={() => goto('/plans')} aria-label="Back to lists">
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
          <h1 use:truncateTooltip>{list?.name ?? 'List'}</h1>
        </button>
      {/if}
    </div>
  </header>

  {#if error}
    <div class="error-banner">
      <p>{error}</p>
      <button onclick={() => (error = null)}>Dismiss</button>
    </div>
  {/if}

  <!-- ═══ Loading skeleton / Content switch ═══ -->
  {#if loading}
    <!-- List Detail Skeleton -->
    <div class="skeleton-progress-section">
      <div class="skeleton-progress-bar"></div>
      <div class="skeleton-shimmer"></div>
    </div>
    <div class="content-columns">
      <div class="skeleton-column">
        <div class="skeleton-section-header"></div>
        {#each Array(3) as _, i (i)}
          <div class="goal-skeleton-card" style="--delay: {i * 0.1}s">
            <div class="goal-skeleton-handle"></div>
            <div class="goal-skeleton-content">
              <div class="goal-skeleton-header">
                <div class="goal-skeleton-checkbox"></div>
                <div class="goal-skeleton-info">
                  <div class="goal-skeleton-title"></div>
                  <div class="goal-skeleton-subtitle"></div>
                </div>
              </div>
              <div class="goal-skeleton-progress-container">
                <div class="goal-skeleton-progress"></div>
              </div>
              <div class="goal-skeleton-actions">
                <div class="goal-skeleton-btn"></div>
                <div class="goal-skeleton-btn"></div>
              </div>
            </div>
            <div class="skeleton-shimmer"></div>
          </div>
        {/each}
      </div>
      <div class="skeleton-column">
        <div class="skeleton-section-header"></div>
        {#each Array(3) as _, i (i)}
          <div class="goal-skeleton-card" style="--delay: {(i + 3) * 0.1}s">
            <div class="goal-skeleton-content" style="border-radius: var(--radius-xl);">
              <div class="goal-skeleton-header">
                <div class="goal-skeleton-checkbox"></div>
                <div class="goal-skeleton-info">
                  <div class="goal-skeleton-title"></div>
                  <div class="goal-skeleton-subtitle"></div>
                </div>
              </div>
            </div>
            <div class="skeleton-shimmer"></div>
          </div>
        {/each}
      </div>
    </div>
  {:else if list}
    <div class="progress-section">
      <ProgressBar percentage={totalProgress()} />
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════════
         Two-column layout — Goals (left) + Tasks (right, project-only)
         ═══════════════════════════════════════════════════════════════════════ -->
    <div class="content-columns" class:single-column={!project?.tag_id}>
      <!-- ═══ Goals Column — Draggable goal items ═══ -->
      <section class="content-section" class:collapsed-section={!goalsExpanded}>
        <div class="section-header">
          <button class="section-toggle" onclick={() => (goalsExpanded = !goalsExpanded)}>
            <h2>Goals</h2>
            <svg
              class="chevron-icon"
              class:collapsed={!goalsExpanded}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <button class="btn btn-primary btn-sm" onclick={() => (showAddModal = true)}>
            + Add Goal
          </button>
        </div>
        <div class="section-body" class:collapsed={!goalsExpanded}>
          <div class="section-body-inner">
            {#if list.goals.length === 0}
              <EmptyState
                icon="🎯"
                title="No goals yet"
                description="Add your first goal to start tracking progress"
              >
                <button class="btn btn-primary" onclick={() => (showAddModal = true)}>
                  Add First Goal
                </button>
              </EmptyState>
            {:else}
              <div class="section-content">
                <DraggableList items={list.goals} onReorder={handleReorderGoal}>
                  {#snippet renderItem({ item: goal, dragHandleProps })}
                    <div class="goal-with-handle">
                      <button class="drag-handle" {...dragHandleProps} aria-label="Drag to reorder">
                        ⋮⋮
                      </button>
                      <div class="goal-item-wrapper">
                        <GoalItem
                          {goal}
                          onToggleComplete={() => handleToggleComplete(goal)}
                          onIncrement={() => handleIncrement(goal, 1)}
                          onDecrement={() => handleIncrement(goal, -1)}
                          onSetValue={(value) => handleSetValue(goal, value)}
                          onEdit={() => (editingGoalId = goal.id)}
                          onDelete={() => handleDeleteGoal(goal)}
                        />
                      </div>
                    </div>
                  {/snippet}
                </DraggableList>
              </div>
            {/if}
          </div>
        </div>
      </section>

      <!-- ═══ Tasks Column — overdue / due-today / upcoming / completed ═══ -->
      {#if project?.tag_id}
        <section class="content-section" class:collapsed-section={!tasksExpanded}>
          <div class="section-header">
            <button class="section-toggle" onclick={() => (tasksExpanded = !tasksExpanded)}>
              <h2>Tasks</h2>
              <svg
                class="chevron-icon"
                class:collapsed={!tasksExpanded}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <button class="btn btn-primary btn-sm" onclick={() => (showTaskForm = true)}>
              + New Task
            </button>
          </div>
          <div class="section-body" class:collapsed={!tasksExpanded}>
            <div class="section-body-inner">
              {#if hasAnyTasks}
                <div class="section-content">
                  <div class="tasks-lists">
                    {#if overdueTasks.length > 0}
                      <LongTermTaskList
                        title="Overdue"
                        tasks={overdueTasks}
                        variant="overdue"
                        onTaskClick={handleTaskClick}
                        onToggle={handleToggleLongTermTask}
                        onDelete={handleDeleteLongTermTask}
                      />
                    {/if}

                    {#if dueTodayTasks.length > 0}
                      <LongTermTaskList
                        title="Due Today"
                        tasks={dueTodayTasks}
                        variant="due-today"
                        onTaskClick={handleTaskClick}
                        onToggle={handleToggleLongTermTask}
                        onDelete={handleDeleteLongTermTask}
                      />
                    {/if}

                    {#if upcomingTasks.length > 0}
                      <LongTermTaskList
                        title="Upcoming"
                        tasks={upcomingTasks}
                        variant="upcoming"
                        onTaskClick={handleTaskClick}
                        onToggle={handleToggleLongTermTask}
                        onDelete={handleDeleteLongTermTask}
                      />
                    {/if}

                    {#if completedTasks.length > 0}
                      <LongTermTaskList
                        title="Completed"
                        tasks={completedTasks}
                        variant="completed"
                        onTaskClick={handleTaskClick}
                        onToggle={handleToggleLongTermTask}
                        onDelete={handleDeleteLongTermTask}
                      />
                    {/if}
                  </div>
                </div>
              {:else}
                <EmptyState
                  icon="📅"
                  title="No project tasks yet"
                  description="Add tasks with due dates to track work for this project"
                >
                  <button class="btn btn-primary" onclick={() => (showTaskForm = true)}>
                    Add First Task
                  </button>
                </EmptyState>
              {/if}
            </div>
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Modals — Add Goal / Edit Goal / Task Detail / New Task
     ═══════════════════════════════════════════════════════════════════════════ -->
<Modal open={showAddModal} title="Add Goal" onClose={() => (showAddModal = false)}>
  <GoalForm onSubmit={handleAddGoal} onCancel={() => (showAddModal = false)} />
</Modal>

<Modal open={editingGoal !== null} title="Edit Goal" onClose={() => (editingGoalId = null)}>
  {#if editingGoal}
    <GoalForm
      name={editingGoal.name}
      type={editingGoal.type}
      targetValue={editingGoal.target_value}
      submitLabel="Save Changes"
      entityId={editingGoal.id}
      entityType="goals"
      onSubmit={handleUpdateGoal}
      onCancel={() => (editingGoalId = null)}
    />
  {/if}
</Modal>

<LongTermTaskModal
  open={showTaskModal}
  task={selectedTask}
  categories={projectCategories}
  lockedCategory
  onClose={() => {
    showTaskModal = false;
    selectedTask = null;
  }}
  onUpdate={handleUpdateLongTermTask}
  onToggle={handleToggleLongTermTask}
  onDelete={handleDeleteLongTermTask}
/>

<LongTermTaskForm
  open={showTaskForm}
  categories={projectCategories}
  initialCategoryId={project?.tag_id ?? null}
  lockedCategory
  onClose={() => (showTaskForm = false)}
  onCreate={handleCreateLongTermTask}
  onDeleteCategory={() => {}}
  onRequestCreateCategory={() => {}}
/>

<style>
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    animation: textShimmer 8s linear infinite;
  }

  @keyframes textShimmer {
    0% {
      background-position: 0% center;
    }
    100% {
      background-position: 200% center;
    }
  }

  .page-header h1:hover,
  .title-edit-btn:hover h1 {
    background: linear-gradient(
      135deg,
      var(--color-primary-light) 0%,
      var(--color-accent) 50%,
      var(--color-primary-light) 100%
    );
    background-size: 200% auto;
    -webkit-background-clip: text;
    background-clip: text;
    filter: drop-shadow(0 0 30px var(--color-primary-glow));
    animation: textShimmer 4s linear infinite;
  }

  .edit-name-form {
    display: flex;
    align-items: center;
    gap: 0.875rem;
  }

  .edit-name-form input {
    font-size: 1.375rem;
    font-weight: 700;
    padding: 0.625rem 1rem;
    width: 250px;
    background: rgba(108, 92, 231, 0.15);
    border: 2px solid var(--color-primary);
    box-shadow: 0 0 30px var(--color-primary-glow);
    letter-spacing: -0.01em;
  }

  .error-banner {
    background: linear-gradient(
      135deg,
      rgba(255, 107, 107, 0.18) 0%,
      rgba(255, 107, 107, 0.06) 100%
    );
    border: 1px solid rgba(255, 107, 107, 0.4);
    border-radius: var(--radius-xl);
    padding: 1.25rem 1.5rem;
    margin-bottom: 2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    backdrop-filter: blur(16px);
    box-shadow: 0 0 30px rgba(255, 107, 107, 0.1);
  }

  .error-banner button {
    color: var(--color-red);
    font-weight: 600;
    padding: 0.375rem 1rem;
    border-radius: var(--radius-lg);
    transition: all 0.25s var(--ease-spring);
  }

  .error-banner button:hover {
    background: rgba(255, 107, 107, 0.25);
    transform: scale(1.05);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SKELETON LOADING STYLES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .skeleton-progress-section {
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-2xl);
    padding: 1.5rem 1.75rem;
    margin-bottom: 2.5rem;
    position: relative;
    overflow: hidden;
  }

  .skeleton-progress-bar {
    height: 8px;
    background: rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-full);
  }

  .goals-skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .goal-skeleton-card {
    display: flex;
    align-items: stretch;
    gap: 0;
    position: relative;
    overflow: hidden;
    animation: skeletonPulse 2s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  .goal-skeleton-handle {
    width: 32px;
    min-height: 100px;
    background: linear-gradient(135deg, rgba(37, 37, 61, 0.9) 0%, rgba(26, 26, 46, 0.95) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-right: none;
    border-radius: var(--radius-xl) 0 0 var(--radius-xl);
  }

  .goal-skeleton-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 1.25rem 1.5rem;
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-left: none;
    border-radius: 0 var(--radius-xl) var(--radius-xl) 0;
    position: relative;
  }

  .goal-skeleton-header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .goal-skeleton-checkbox {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    background: rgba(108, 92, 231, 0.15);
    flex-shrink: 0;
  }

  .goal-skeleton-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .goal-skeleton-title {
    width: 60%;
    height: 1.125rem;
    background: linear-gradient(
      90deg,
      rgba(108, 92, 231, 0.15) 0%,
      rgba(108, 92, 231, 0.25) 50%,
      rgba(108, 92, 231, 0.15) 100%
    );
    border-radius: var(--radius-md);
  }

  .goal-skeleton-subtitle {
    width: 40%;
    height: 0.875rem;
    background: rgba(108, 92, 231, 0.08);
    border-radius: var(--radius-sm);
  }

  .goal-skeleton-progress-container {
    padding-left: 2.75rem;
  }

  .goal-skeleton-progress {
    height: 6px;
    width: 80%;
    background: rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-full);
  }

  .goal-skeleton-actions {
    position: absolute;
    top: 1rem;
    right: 1rem;
    display: flex;
    gap: 0.5rem;
  }

  .goal-skeleton-btn {
    width: 36px;
    height: 36px;
    background: rgba(108, 92, 231, 0.08);
    border-radius: var(--radius-lg);
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

  .title-skeleton {
    width: 200px;
    height: 2rem;
    background: linear-gradient(
      90deg,
      rgba(108, 92, 231, 0.15) 0%,
      rgba(108, 92, 231, 0.25) 50%,
      rgba(108, 92, 231, 0.15) 100%
    );
    border-radius: var(--radius-lg);
    animation: skeletonPulse 2s ease-in-out infinite;
  }

  .progress-section {
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-2xl);
    padding: 1.5rem 1.75rem;
    margin-bottom: 2.5rem;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
    position: relative;
    overflow: hidden;
  }

  .progress-section::before {
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

  .goal-with-handle {
    display: flex;
    align-items: stretch;
    gap: 0;
  }

  .goal-item-wrapper {
    flex: 1;
    min-width: 0;
  }

  .goal-item-wrapper :global(.goal-item) {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: none;
  }

  .goal-with-handle .drag-handle {
    background: linear-gradient(135deg, rgba(37, 37, 61, 0.9) 0%, rgba(26, 26, 46, 0.95) 100%);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-right: none;
    border-radius: var(--radius-xl) 0 0 var(--radius-xl);
    font-size: 0.875rem;
    letter-spacing: 1px;
    color: var(--color-text-muted);
    min-width: 32px;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     CONTENT COLUMNS — Side-by-side layout
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .content-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3rem;
    align-items: start;
    position: relative;
  }

  /* Vertical divider between columns on desktop */
  .content-columns:not(.single-column)::before {
    content: '';
    position: absolute;
    top: 1rem;
    bottom: 1rem;
    left: 50%;
    width: 1px;
    background: linear-gradient(
      180deg,
      transparent 0%,
      rgba(108, 92, 231, 0.3) 15%,
      rgba(255, 255, 255, 0.1) 50%,
      rgba(108, 92, 231, 0.3) 85%,
      transparent 100%
    );
    pointer-events: none;
    z-index: 1;
  }

  .content-columns.single-column {
    grid-template-columns: 1fr;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     CONTENT SECTION — Glass panel cards
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .content-section {
    min-width: 0;
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.6) 0%, rgba(20, 20, 40, 0.4) 100%);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-2xl);
    overflow: hidden;
    position: relative;
  }

  /* Top glow line on each section */
  .content-section::before {
    content: '';
    position: absolute;
    top: 0;
    left: 15%;
    right: 15%;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(108, 92, 231, 0.35),
      rgba(255, 255, 255, 0.15),
      rgba(108, 92, 231, 0.35),
      transparent
    );
    z-index: 1;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid rgba(108, 92, 231, 0.12);
    background: linear-gradient(165deg, rgba(20, 20, 40, 0.4) 0%, rgba(15, 15, 30, 0.3) 100%);
  }

  .section-header h2 {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-text-muted);
    letter-spacing: 0.02em;
  }

  .section-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    pointer-events: none;
  }

  /* SVG chevron icon — hidden on desktop */
  .chevron-icon {
    display: none;
    width: 18px;
    height: 18px;
    color: var(--color-text-muted);
  }

  .section-content {
    padding: 1rem 1.25rem 1.25rem;
  }

  /* Section body — always visible on desktop */
  .section-body {
    display: grid;
    grid-template-rows: 1fr;
  }

  .section-body-inner {
    overflow: hidden;
  }

  .tasks-lists {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .skeleton-column {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .skeleton-section-header {
    width: 80px;
    height: 1.25rem;
    background: rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-md);
    margin-bottom: 0.5rem;
    animation: skeletonPulse 2s ease-in-out infinite;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     MOBILE RESPONSIVE STYLES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 640px) {
    .page-header {
      flex-direction: column;
      align-items: stretch;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .header-left {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }

    .back-btn {
      width: 100%;
      justify-content: center;
      padding: 0.875rem;
    }

    .back-btn:hover {
      transform: none;
    }

    .back-btn:active {
      transform: scale(0.98);
    }

    .page-header h1 {
      font-size: 1.5rem;
      text-align: center;
      padding: 0.5rem;
      margin: 0;
    }

    .page-header h1:hover {
      filter: none;
    }

    .edit-name-form {
      flex-direction: column;
      width: 100%;
      gap: 0.75rem;
    }

    .edit-name-form input {
      width: 100%;
      font-size: 1.125rem;
    }

    .edit-name-form .btn {
      width: 100%;
    }

    .progress-section {
      padding: 1.25rem;
      margin-bottom: 1.5rem;
      border-radius: var(--radius-xl);
    }

    .error-banner {
      flex-direction: column;
      gap: 1rem;
      text-align: center;
    }

    .error-banner button {
      width: 100%;
    }

    .loading {
      padding: 3rem;
    }

    .content-columns {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    /* Hide vertical divider on mobile (not side-by-side) */
    .content-columns:not(.single-column)::before {
      display: none;
    }

    .content-section {
      border-radius: var(--radius-xl);
      transition:
        border-color 0.5s var(--ease-out),
        box-shadow 0.5s var(--ease-out),
        background 0.5s var(--ease-out);
    }

    .content-section.collapsed-section {
      background: linear-gradient(165deg, rgba(12, 12, 25, 0.5) 0%, rgba(15, 15, 30, 0.3) 100%);
      border-color: rgba(108, 92, 231, 0.08);
    }

    .content-section:not(.collapsed-section) {
      box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.3),
        0 0 40px rgba(108, 92, 231, 0.06);
    }

    .section-header {
      padding: 1rem 1.25rem;
    }

    .collapsed-section .section-header {
      border-bottom-color: transparent;
    }

    .section-toggle {
      pointer-events: auto;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      gap: 0.625rem;
    }

    /* Glow pulse on tap */
    .section-toggle:active h2 {
      text-shadow: 0 0 20px rgba(108, 92, 231, 0.6);
    }

    /* SVG chevron — mobile cinematic */
    .chevron-icon {
      display: block;
      width: 20px;
      height: 20px;
      color: rgba(108, 92, 231, 0.7);
      transition:
        transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
        color 0.4s var(--ease-out),
        filter 0.4s var(--ease-out);
      filter: drop-shadow(0 0 4px rgba(108, 92, 231, 0.3));
    }

    .chevron-icon.collapsed {
      transform: rotate(-90deg);
      color: rgba(108, 92, 231, 0.4);
      filter: drop-shadow(0 0 0 transparent);
    }

    .section-toggle:active .chevron-icon {
      filter: drop-shadow(0 0 12px rgba(108, 92, 231, 0.8));
      color: rgba(108, 92, 231, 1);
    }

    /* Section body — animated collapse */
    .section-body {
      transition: grid-template-rows 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .section-body.collapsed {
      grid-template-rows: 0fr;
    }

    .section-body-inner {
      transition: opacity 0.35s var(--ease-out);
    }

    .section-body.collapsed .section-body-inner {
      opacity: 0;
    }

    .goal-with-handle .drag-handle {
      min-width: 44px;
      font-size: 1rem;
    }
  }

  /* iPhone 14/15/16 Pro Max specific (430px) */
  @media (min-width: 430px) and (max-width: 640px) {
    .page-header h1 {
      font-size: 1.75rem;
    }

    .progress-section {
      padding: 1.5rem;
    }

    .edit-name-form input {
      font-size: 1.25rem;
    }
  }

  /* Very small devices (iPhone SE) */
  @media (max-width: 375px) {
    .page-header h1 {
      font-size: 1.25rem;
    }

    .progress-section {
      padding: 1rem;
    }

    .edit-name-form input {
      font-size: 1rem;
    }
  }
</style>
