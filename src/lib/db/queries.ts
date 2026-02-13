import {
  engineGetAll,
  engineGet,
  engineQuery,
  engineQueryRange
} from '@prabhask5/stellar-engine/data';
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
  Project
} from '$lib/types';

// Track if initial hydration has been attempted
let hasHydrated = false;

export function setHasHydrated(val: boolean) {
  hasHydrated = val;
}

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

export async function getGoalLists(): Promise<GoalListWithProgress[]> {
  const lists = (await engineGetAll('goal_lists', {
    orderBy: 'order',
    remoteFallback: !hasHydrated
  })) as unknown as GoalList[];

  const activeLists = lists.filter((l) => !l.deleted);

  const listsWithProgress: GoalListWithProgress[] = await Promise.all(
    activeLists.map(async (list) => {
      const goals = (await engineQuery('goals', 'goal_list_id', list.id)) as unknown as Goal[];
      return { ...list, ...calculateListProgress(goals) };
    })
  );
  return listsWithProgress;
}

export async function getGoalList(id: string): Promise<(GoalList & { goals: Goal[] }) | null> {
  const list = (await engineGet('goal_lists', id, {
    remoteFallback: true
  })) as unknown as GoalList | null;

  if (!list || list.deleted) return null;

  // Also fetch goals with remote fallback
  const goals = (await engineQuery('goals', 'goal_list_id', id, {
    remoteFallback: true
  })) as unknown as Goal[];
  const activeGoals = goals.filter((g) => !g.deleted).sort((a, b) => a.order - b.order);
  return { ...list, goals: activeGoals };
}

export async function getDailyRoutineGoals(): Promise<DailyRoutineGoal[]> {
  const routines = (await engineGetAll('daily_routine_goals', {
    remoteFallback: !hasHydrated
  })) as unknown as DailyRoutineGoal[];

  return routines.filter((r) => !r.deleted).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function getDailyRoutineGoal(id: string): Promise<DailyRoutineGoal | null> {
  const routine = (await engineGet('daily_routine_goals', id, {
    remoteFallback: true
  })) as unknown as DailyRoutineGoal | null;

  if (!routine || routine.deleted) return null;
  return routine;
}

export async function getActiveRoutinesForDate(date: string): Promise<DailyRoutineGoal[]> {
  const allRoutines = (await engineGetAll('daily_routine_goals', {
    remoteFallback: !hasHydrated
  })) as unknown as DailyRoutineGoal[];

  return allRoutines
    .filter((routine) => {
      if (routine.deleted) return false;
      return isRoutineActiveOnDate(routine, date);
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function getDailyProgress(date: string): Promise<DailyGoalProgress[]> {
  const progress = (await engineQuery('daily_goal_progress', 'date', date, {
    remoteFallback: true
  })) as unknown as DailyGoalProgress[];

  return progress.filter((p) => !p.deleted);
}

export async function getMonthProgress(year: number, month: number): Promise<DailyGoalProgress[]> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  const progress = (await engineQueryRange('daily_goal_progress', 'date', startDate, endDate, {
    remoteFallback: true
  })) as unknown as DailyGoalProgress[];

  return progress.filter((p) => !p.deleted);
}

export async function getTaskCategories(): Promise<TaskCategory[]> {
  const categories = (await engineGetAll('task_categories', {
    remoteFallback: !hasHydrated
  })) as unknown as TaskCategory[];

  return categories.filter((c) => !c.deleted).sort((a, b) => a.order - b.order);
}

export async function getCommitments(): Promise<Commitment[]> {
  const commitments = (await engineGetAll('commitments', {
    remoteFallback: !hasHydrated
  })) as unknown as Commitment[];

  return commitments.filter((c) => !c.deleted).sort((a, b) => a.order - b.order);
}

export async function getDailyTasks(): Promise<DailyTask[]> {
  const tasks = (await engineGetAll('daily_tasks', {
    remoteFallback: !hasHydrated
  })) as unknown as DailyTask[];

  const activeTasks = tasks.filter((t) => !t.deleted).sort((a, b) => a.order - b.order);

  // For spawned tasks (those with long_term_task_id), join category info
  const spawnedTasks = activeTasks.filter((t) => t.long_term_task_id);
  if (spawnedTasks.length > 0) {
    const longTermTasks = (await engineGetAll('long_term_agenda')) as unknown as LongTermTask[];
    const ltMap = new Map<string, LongTermTask>();
    for (const lt of longTermTasks) {
      if (!lt.deleted) ltMap.set(lt.id, lt);
    }

    const categories = (await engineGetAll('task_categories')) as unknown as TaskCategory[];
    const catMap = new Map<string, TaskCategory>();
    for (const cat of categories) {
      if (!cat.deleted) catMap.set(cat.id, cat);
    }

    for (const task of spawnedTasks) {
      const lt = ltMap.get(task.long_term_task_id!);
      if (lt?.category_id) {
        task.category = catMap.get(lt.category_id);
      }
    }
  }

  return activeTasks;
}

export async function getLongTermTasks(): Promise<LongTermTaskWithCategory[]> {
  const tasks = (await engineGetAll('long_term_agenda', {
    remoteFallback: !hasHydrated
  })) as unknown as LongTermTaskWithCategory[];

  const activeTasks = tasks.filter((t) => !t.deleted);

  const categories = (await engineGetAll('task_categories')) as unknown as TaskCategory[];
  const categoryMap = new Map<string, TaskCategory>();
  for (const cat of categories) {
    if (!cat.deleted) {
      categoryMap.set(cat.id, cat);
    }
  }

  return activeTasks.map((task) => ({
    ...task,
    category: task.category_id ? categoryMap.get(task.category_id) : undefined
  }));
}

export async function getLongTermTask(id: string): Promise<LongTermTaskWithCategory | null> {
  const task = (await engineGet(
    'long_term_agenda',
    id
  )) as unknown as LongTermTaskWithCategory | null;
  if (!task || task.deleted) return null;

  let category: TaskCategory | undefined;
  if (task.category_id) {
    const cat = (await engineGet(
      'task_categories',
      task.category_id
    )) as unknown as TaskCategory | null;
    if (cat && !cat.deleted) {
      category = cat;
    }
  }

  return { ...task, category };
}

export async function getProjects(): Promise<Project[]> {
  const projects = (await engineGetAll('projects')) as unknown as Project[];
  return projects.filter((p) => !p.deleted).sort((a, b) => a.order - b.order);
}

export async function getProject(id: string): Promise<Project | null> {
  const project = (await engineGet('projects', id)) as unknown as Project | null;
  return project && !project.deleted ? project : null;
}
