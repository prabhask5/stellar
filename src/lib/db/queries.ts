/**
 * @fileoverview Aggregate query layer for the Stellar data model.
 *
 * This module sits **above** the individual repository files and provides
 * read-only, cross-entity queries that the UI consumes directly.  Every
 * function fetches data through the {@link stellar-drive/data}
 * abstraction (local-first with optional remote fallback) and applies
 * soft-delete filtering, ordering, and any necessary cross-table joins
 * (e.g. enriching goal lists with progress stats, or attaching category
 * info to spawned daily tasks).
 *
 * Tables touched: `goal_lists`, `goals`, `daily_routine_goals`,
 * `daily_goal_progress`, `task_categories`, `commitments`, `daily_tasks`,
 * `long_term_agenda`, `task_lists`, `task_list_items`, `projects`.
 *
 * @module queries
 */

import { engineGetAll, queryAll, queryOne, queryByIndex, queryByRange } from 'stellar-drive/data';
import { calculateGoalProgressCapped } from '$lib/utils/colors';
import { isRoutineActiveOnDate } from '$lib/utils/dates';
import type {
  Goal,
  GoalList,
  GoalListWithProgress,
  DailyRoutineGoal,
  DailyGoalProgress,
  TaskCategory,
  Commitment,
  DailyTask,
  LongTermTask,
  LongTermTaskWithCategory,
  TaskList,
  TaskListItem,
  TaskListWithCounts,
  Project
} from '$lib/types';

// =============================================================================
//                           Goal List Queries
// =============================================================================

/**
 * Computes aggregate progress stats for a list of {@link Goal} items.
 *
 * Progress for each goal is capped via {@link calculateGoalProgressCapped}
 * so that over-completed incremental goals don't inflate the percentage
 * beyond 100 %.
 *
 * @param goals - The raw goals belonging to a single goal list
 * @returns An object with `totalGoals`, `completedGoals`, and a rounded
 *          `completionPercentage` (0 – 100)
 */
function calculateListProgress(goals: Goal[]): {
  totalGoals: number;
  completedGoals: number;
  completionPercentage: number;
} {
  const activeGoals = goals.filter((g) => !g.deleted);
  const totalGoals = activeGoals.length;
  const completedProgress = activeGoals.reduce((sum: number, goal: Goal) => {
    return (
      sum +
      calculateGoalProgressCapped(goal.type, goal.completed, goal.current_value, goal.target_value)
    );
  }, 0);
  const completionPercentage = totalGoals > 0 ? completedProgress / totalGoals : 0;

  return {
    totalGoals,
    completedGoals: activeGoals.filter((g: Goal) =>
      g.type === 'completion' ? g.completed : g.current_value >= (g.target_value || 0)
    ).length,
    completionPercentage: Math.round(completionPercentage)
  };
}

/**
 * Fetches **all** goal lists with their computed progress statistics.
 *
 * For each active list the function queries its child goals and merges in
 * `totalGoals`, `completedGoals`, and `completionPercentage`.
 *
 * @returns An array of {@link GoalListWithProgress} sorted by `order`
 */
export async function getGoalLists(): Promise<GoalListWithProgress[]> {
  const lists = await queryAll<GoalList & Record<string, unknown>>('goal_lists', {
    autoRemoteFallback: true
  });

  const listsWithProgress: GoalListWithProgress[] = await Promise.all(
    lists.map(async (list) => {
      const goals = await queryByIndex<Goal & Record<string, unknown>>(
        'goals',
        'goal_list_id',
        list.id
      );
      return { ...list, ...calculateListProgress(goals as Goal[]) };
    })
  );
  return listsWithProgress as GoalListWithProgress[];
}

/**
 * Fetches a single goal list by ID together with its active, ordered goals.
 *
 * Uses `remoteFallback: true` so that deep-linked pages can load even if the
 * local cache hasn't been fully populated yet.
 *
 * @param id - The goal list's unique identifier
 * @returns The {@link GoalList} merged with a `goals` array, or `null` if
 *          the list doesn't exist or is soft-deleted
 */
export async function getGoalList(id: string): Promise<(GoalList & { goals: Goal[] }) | null> {
  const list = await queryOne<GoalList & Record<string, unknown>>('goal_lists', id, {
    remoteFallback: true
  });

  if (!list) return null;

  /* ── Fetch child goals with remote fallback ──── */
  const goals = await queryByIndex<Goal & Record<string, unknown>>('goals', 'goal_list_id', id, {
    remoteFallback: true,
    sortByOrder: true
  });
  return { ...(list as GoalList), goals: goals as Goal[] };
}

// =============================================================================
//                        Daily Routine Queries
// =============================================================================

/**
 * Fetches all non-deleted daily routine goals, sorted by `order`.
 *
 * @returns An array of {@link DailyRoutineGoal} items
 */
export async function getDailyRoutineGoals(): Promise<DailyRoutineGoal[]> {
  return queryAll<DailyRoutineGoal & Record<string, unknown>>('daily_routine_goals', {
    autoRemoteFallback: true
  }) as Promise<DailyRoutineGoal[]>;
}

/**
 * Fetches a single daily routine goal by ID.
 *
 * @param id - The routine goal's unique identifier
 * @returns The {@link DailyRoutineGoal}, or `null` if not found / deleted
 */
export async function getDailyRoutineGoal(id: string): Promise<DailyRoutineGoal | null> {
  return queryOne<DailyRoutineGoal & Record<string, unknown>>('daily_routine_goals', id, {
    remoteFallback: true
  }) as Promise<DailyRoutineGoal | null>;
}

/**
 * Returns only the routines that are **active** on the given calendar date.
 *
 * Activity is determined by {@link isRoutineActiveOnDate} which checks the
 * routine's `start_date`, `end_date`, and `active_days` fields against the
 * supplied date string.
 *
 * @param date - An ISO date string (`YYYY-MM-DD`)
 * @returns Active routines sorted ascending by `order`
 */
export async function getActiveRoutinesForDate(date: string): Promise<DailyRoutineGoal[]> {
  const allRoutines = await queryAll<DailyRoutineGoal & Record<string, unknown>>(
    'daily_routine_goals',
    { autoRemoteFallback: true }
  );

  return (allRoutines as DailyRoutineGoal[]).filter((routine) =>
    isRoutineActiveOnDate(routine, date)
  );
}

// =============================================================================
//                       Daily Progress Queries
// =============================================================================

/**
 * Fetches all progress records for a specific date.
 *
 * Each record links a {@link DailyRoutineGoal} to its tracked value for that
 * day via the `daily_goal_progress` table.
 *
 * @param date - An ISO date string (`YYYY-MM-DD`)
 * @returns Non-deleted {@link DailyGoalProgress} records for the given date
 */
export async function getDailyProgress(date: string): Promise<DailyGoalProgress[]> {
  return queryByIndex<DailyGoalProgress & Record<string, unknown>>(
    'daily_goal_progress',
    'date',
    date,
    { remoteFallback: true }
  ) as Promise<DailyGoalProgress[]>;
}

/**
 * Fetches progress records for an entire calendar month using a range query.
 *
 * The range is inclusive from the 1st to the 31st (safe for any month since
 * non-existent dates like Feb 31 simply return no rows).
 *
 * @param year  - The four-digit year
 * @param month - The month number (1 – 12)
 * @returns Non-deleted {@link DailyGoalProgress} records within the month
 */
export async function getMonthProgress(year: number, month: number): Promise<DailyGoalProgress[]> {
  /* ── Build inclusive date range for the month ──── */
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  return queryByRange<DailyGoalProgress & Record<string, unknown>>(
    'daily_goal_progress',
    'date',
    startDate,
    endDate,
    { remoteFallback: true }
  ) as Promise<DailyGoalProgress[]>;
}

// =============================================================================
//                       Task Category Queries
// =============================================================================

/**
 * Fetches all task categories (tags), ordered by `order`.
 *
 * @returns Non-deleted {@link TaskCategory} items sorted ascending
 */
export async function getTaskCategories(): Promise<TaskCategory[]> {
  return queryAll<TaskCategory & Record<string, unknown>>('task_categories', {
    autoRemoteFallback: true
  }) as Promise<TaskCategory[]>;
}

// =============================================================================
//                         Commitment Queries
// =============================================================================

/**
 * Fetches all commitments, ordered by `order`.
 *
 * @returns Non-deleted {@link Commitment} items sorted ascending
 */
export async function getCommitments(): Promise<Commitment[]> {
  return queryAll<Commitment & Record<string, unknown>>('commitments', {
    autoRemoteFallback: true
  }) as Promise<Commitment[]>;
}

// =============================================================================
//                         Daily Task Queries
// =============================================================================

/**
 * Fetches all daily tasks with category info joined from linked long-term tasks.
 *
 * For "spawned" tasks (those created from a long-term task via
 * `long_term_task_id`), this function performs a manual join:
 *   1. Loads all `long_term_agenda` items into a lookup map
 *   2. Loads all `task_categories` into a lookup map
 *   3. Attaches the resolved {@link TaskCategory} onto each spawned task's
 *      `category` property
 *
 * @returns Non-deleted {@link DailyTask} items sorted ascending by `order`,
 *          with `category` populated for spawned tasks
 */
export async function getDailyTasks(): Promise<DailyTask[]> {
  const activeTasks = await queryAll<DailyTask & Record<string, unknown>>('daily_tasks', {
    autoRemoteFallback: true
  });

  /* ── Join category info for spawned tasks ──── */
  const spawnedTasks = activeTasks.filter((t) => t.long_term_task_id);
  if (spawnedTasks.length > 0) {
    /* Build long-term task lookup → id ➜ LongTermTask */
    const longTermTasks = (await engineGetAll('long_term_agenda')) as unknown as LongTermTask[];
    const ltMap = new Map<string, LongTermTask>();
    for (const lt of longTermTasks) {
      if (!lt.deleted) ltMap.set(lt.id, lt);
    }

    /* Build category lookup → id ➜ TaskCategory */
    const categories = (await engineGetAll('task_categories')) as unknown as TaskCategory[];
    const catMap = new Map<string, TaskCategory>();
    for (const cat of categories) {
      if (!cat.deleted) catMap.set(cat.id, cat);
    }

    /* Resolve: daily task → long-term task → category */
    for (const task of spawnedTasks) {
      const lt = ltMap.get(task.long_term_task_id!);
      if (lt?.category_id) {
        (task as DailyTask).category = catMap.get(lt.category_id);
      }
    }
  }

  return activeTasks as DailyTask[];
}

// =============================================================================
//                       Long-Term Task Queries
// =============================================================================

/**
 * Fetches all long-term tasks with their resolved {@link TaskCategory}.
 *
 * Performs an in-memory join between `long_term_agenda` and `task_categories`
 * so each returned task includes a `category` object when `category_id` is set.
 *
 * @returns Non-deleted {@link LongTermTaskWithCategory} items
 */
export async function getLongTermTasks(): Promise<LongTermTaskWithCategory[]> {
  const activeTasks = await queryAll<LongTermTaskWithCategory & Record<string, unknown>>(
    'long_term_agenda',
    { autoRemoteFallback: true }
  );

  /* ── Build category lookup map ──── */
  const categories = (await engineGetAll('task_categories')) as unknown as TaskCategory[];
  const categoryMap = new Map<string, TaskCategory>();
  for (const cat of categories) {
    if (!cat.deleted) {
      categoryMap.set(cat.id, cat);
    }
  }

  return (activeTasks as LongTermTaskWithCategory[]).map((task) => ({
    ...task,
    category: task.category_id ? categoryMap.get(task.category_id) : undefined
  }));
}

/**
 * Fetches a single long-term task by ID with its resolved category.
 *
 * @param id - The long-term task's unique identifier
 * @returns The {@link LongTermTaskWithCategory}, or `null` if not found / deleted
 */
export async function getLongTermTask(id: string): Promise<LongTermTaskWithCategory | null> {
  const task = await queryOne<LongTermTaskWithCategory & Record<string, unknown>>(
    'long_term_agenda',
    id
  );
  if (!task) return null;

  /* ── Resolve category if linked ──── */
  let category: TaskCategory | undefined;
  if (task.category_id) {
    const cat = await queryOne<TaskCategory & Record<string, unknown>>(
      'task_categories',
      task.category_id
    );
    if (cat) {
      category = cat as TaskCategory;
    }
  }

  return { ...(task as LongTermTaskWithCategory), category };
}

// =============================================================================
//                         Task List Queries
// =============================================================================

/**
 * Fetches all task lists with aggregate item counts.
 *
 * For each active (non-deleted) list, queries its child `task_list_items`
 * by the `task_list_id` index and computes two aggregate counts:
 * - `totalItems`     — number of non-deleted items in the list
 * - `completedItems` — number of non-deleted items where `completed === true`
 *
 * These counts power the "X / Y tasks" display on the agenda page cards.
 *
 * The `autoRemoteFallback` option ensures the query falls back to the
 * remote database on first load before the local cache is populated.
 *
 * @returns An array of {@link TaskListWithCounts} sorted ascending by `order`
 */
export async function getTaskLists(): Promise<TaskListWithCounts[]> {
  /* ── Fetch all non-deleted task lists ──── */
  const lists = await queryAll<TaskList & Record<string, unknown>>('task_lists', {
    autoRemoteFallback: true
  });

  /* ── Enrich each list with child item counts ──── */
  const listsWithCounts = await Promise.all(
    lists.map(async (list) => {
      /* Query child items by the task_list_id index */
      const items = await queryByIndex<TaskListItem & Record<string, unknown>>(
        'task_list_items',
        'task_list_id',
        list.id
      );

      /* Filter out soft-deleted items before counting */
      const active = (items as TaskListItem[]).filter((i) => !i.deleted);

      return {
        ...list,
        totalItems: active.length,
        completedItems: active.filter((i) => i.completed).length
      };
    })
  );

  return listsWithCounts as TaskListWithCounts[];
}

/**
 * Fetches a single task list by ID together with its active, ordered items.
 *
 * Used by the `/agenda/[id]` detail page.  The query uses
 * `remoteFallback: true` so that deep-linked pages (e.g. shared URLs or
 * bookmarks) can load even if the local IndexedDB cache hasn't been
 * fully populated by background sync yet.
 *
 * Items are returned sorted ascending by `order` via the `sortByOrder`
 * option, matching the drag-to-reorder display order.
 *
 * @param id - The task list's unique identifier
 * @returns The {@link TaskList} merged with an `items` array, or `null` if
 *          the list doesn't exist or is soft-deleted
 */
export async function getTaskList(
  id: string
): Promise<(TaskList & { items: TaskListItem[] }) | null> {
  /* ── Fetch the parent list record ──── */
  const list = await queryOne<TaskList & Record<string, unknown>>('task_lists', id, {
    remoteFallback: true
  });

  if (!list) return null;

  /* ── Fetch child items sorted by order for display ──── */
  const items = await queryByIndex<TaskListItem & Record<string, unknown>>(
    'task_list_items',
    'task_list_id',
    id,
    { remoteFallback: true, sortByOrder: true }
  );

  return { ...(list as TaskList), items: items as TaskListItem[] };
}

// =============================================================================
//                           Project Queries
// =============================================================================

/**
 * Fetches all projects, ordered by `order`.
 *
 * @returns Non-deleted {@link Project} items sorted ascending by `order`
 */
export async function getProjects(): Promise<Project[]> {
  return queryAll<Project & Record<string, unknown>>('projects') as Promise<Project[]>;
}

/**
 * Fetches a single project by ID.
 *
 * @param id - The project's unique identifier
 * @returns The {@link Project}, or `null` if not found / deleted
 */
export async function getProject(id: string): Promise<Project | null> {
  return queryOne<Project & Record<string, unknown>>('projects', id) as Promise<Project | null>;
}
