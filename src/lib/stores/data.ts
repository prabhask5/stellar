import { writable, type Writable } from 'svelte/store';
import type { GoalListWithProgress, Goal, GoalList, DailyRoutineGoal, DailyGoalProgress, DayProgress } from '$lib/types';
import * as repo from '$lib/db/repositories';
import * as sync from '$lib/sync/engine';
import { calculateGoalProgress } from '$lib/utils/colors';
import { browser } from '$app/environment';

// ============================================================
// LOCAL-FIRST STORES
//
// All reads come from local DB via sync engine functions.
// Writes go to local DB immediately via repositories.
// Background sync updates local, stores can refresh from local.
// ============================================================

// Goal Lists Store
function createGoalListsStore() {
  const { subscribe, set, update }: Writable<GoalListWithProgress[]> = writable([]);
  let loading = writable(true);
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    load: async () => {
      loading.set(true);
      try {
        // Always read from local DB
        const lists = await sync.getGoalLists();
        set(lists);

        // Register for sync complete to auto-refresh
        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            const refreshed = await sync.getGoalLists();
            set(refreshed);
          });
        }
      } finally {
        loading.set(false);
      }
    },
    create: async (name: string, userId: string) => {
      // Write to local DB immediately
      const newList = await repo.createGoalList(name, userId);
      update(lists => [
        { ...newList, totalGoals: 0, completedGoals: 0, completionPercentage: 0 },
        ...lists
      ]);
      return newList;
    },
    update: async (id: string, name: string) => {
      const updated = await repo.updateGoalList(id, name);
      if (updated) {
        update(lists => lists.map(l => l.id === id ? { ...l, name } : l));
      }
      return updated;
    },
    delete: async (id: string) => {
      await repo.deleteGoalList(id);
      update(lists => lists.filter(l => l.id !== id));
    },
    refresh: async () => {
      const lists = await sync.getGoalLists();
      set(lists);
    }
  };
}

export const goalListsStore = createGoalListsStore();

// Single Goal List with Goals Store
function createGoalListStore() {
  const { subscribe, set, update }: Writable<(GoalList & { goals: Goal[] }) | null> = writable(null);
  let loading = writable(true);
  let currentId: string | null = null;
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    load: async (id: string) => {
      loading.set(true);
      currentId = id;
      try {
        // Always read from local DB
        const list = await sync.getGoalList(id);
        set(list);

        // Register for sync complete to auto-refresh
        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            if (currentId) {
              const refreshed = await sync.getGoalList(currentId);
              set(refreshed);
            }
          });
        }
      } finally {
        loading.set(false);
      }
    },
    updateName: async (id: string, name: string) => {
      await repo.updateGoalList(id, name);
      update(list => list ? { ...list, name } : null);
    },
    addGoal: async (goalListId: string, name: string, type: 'completion' | 'incremental', targetValue: number | null) => {
      const newGoal = await repo.createGoal(goalListId, name, type, targetValue);
      update(list => list ? { ...list, goals: [...list.goals, newGoal] } : null);
      return newGoal;
    },
    updateGoal: async (goalId: string, updates: Partial<Pick<Goal, 'name' | 'type' | 'completed' | 'current_value' | 'target_value'>>) => {
      const updated = await repo.updateGoal(goalId, updates);
      if (updated) {
        update(list => list ? {
          ...list,
          goals: list.goals.map(g => g.id === goalId ? updated : g)
        } : null);
      }
      return updated;
    },
    deleteGoal: async (goalId: string) => {
      await repo.deleteGoal(goalId);
      update(list => list ? {
        ...list,
        goals: list.goals.filter(g => g.id !== goalId)
      } : null);
    },
    incrementGoal: async (goalId: string, amount: number = 1) => {
      const updated = await repo.incrementGoal(goalId, amount);
      if (updated) {
        update(list => list ? {
          ...list,
          goals: list.goals.map(g => g.id === goalId ? updated : g)
        } : null);
      }
      return updated;
    },
    clear: () => {
      currentId = null;
      set(null);
    }
  };
}

export const goalListStore = createGoalListStore();

// Daily Routines Store
function createDailyRoutinesStore() {
  const { subscribe, set, update }: Writable<DailyRoutineGoal[]> = writable([]);
  let loading = writable(true);
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    load: async () => {
      loading.set(true);
      try {
        // Always read from local DB
        const routines = await sync.getDailyRoutineGoals();
        set(routines);

        // Register for sync complete to auto-refresh
        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            const refreshed = await sync.getDailyRoutineGoals();
            set(refreshed);
          });
        }
      } finally {
        loading.set(false);
      }
    },
    create: async (
      name: string,
      type: 'completion' | 'incremental',
      targetValue: number | null,
      startDate: string,
      endDate: string | null,
      userId: string
    ) => {
      const newRoutine = await repo.createDailyRoutineGoal(name, type, targetValue, startDate, endDate, userId);
      update(routines => [newRoutine, ...routines]);
      return newRoutine;
    },
    update: async (id: string, updates: Partial<Pick<DailyRoutineGoal, 'name' | 'type' | 'target_value' | 'start_date' | 'end_date'>>) => {
      const updated = await repo.updateDailyRoutineGoal(id, updates);
      if (updated) {
        update(routines => routines.map(r => r.id === id ? updated : r));
      }
      return updated;
    },
    delete: async (id: string) => {
      await repo.deleteDailyRoutineGoal(id);
      update(routines => routines.filter(r => r.id !== id));
    },
    refresh: async () => {
      const routines = await sync.getDailyRoutineGoals();
      set(routines);
    }
  };
}

export const dailyRoutinesStore = createDailyRoutinesStore();

// Single Routine Store
function createRoutineStore() {
  const { subscribe, set }: Writable<DailyRoutineGoal | null> = writable(null);
  let loading = writable(true);
  let currentId: string | null = null;
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    load: async (id: string) => {
      loading.set(true);
      currentId = id;
      try {
        // Always read from local DB
        const routine = await sync.getDailyRoutineGoal(id);
        set(routine);

        // Register for sync complete to auto-refresh
        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            if (currentId) {
              const refreshed = await sync.getDailyRoutineGoal(currentId);
              set(refreshed);
            }
          });
        }
      } finally {
        loading.set(false);
      }
    },
    update: async (id: string, updates: Partial<Pick<DailyRoutineGoal, 'name' | 'type' | 'target_value' | 'start_date' | 'end_date'>>) => {
      const updated = await repo.updateDailyRoutineGoal(id, updates);
      if (updated) {
        set(updated);
      }
      return updated;
    },
    clear: () => {
      currentId = null;
      set(null);
    }
  };
}

export const routineStore = createRoutineStore();

// Daily Progress Store (for a specific date)
interface DailyProgressState {
  date: string;
  routines: DailyRoutineGoal[];
  progress: Map<string, DailyGoalProgress>;
}

function createDailyProgressStore() {
  const { subscribe, set, update }: Writable<DailyProgressState | null> = writable(null);
  let loading = writable(true);
  let currentDate: string | null = null;
  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    load: async (date: string) => {
      loading.set(true);
      currentDate = date;
      try {
        // Always read from local DB
        const [routines, progressList] = await Promise.all([
          sync.getActiveRoutinesForDate(date),
          sync.getDailyProgress(date)
        ]);

        const progressMap = new Map<string, DailyGoalProgress>();
        for (const p of progressList) {
          progressMap.set(p.daily_routine_goal_id, p);
        }

        set({ date, routines, progress: progressMap });

        // Register for sync complete to auto-refresh
        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            if (currentDate) {
              const [r, p] = await Promise.all([
                sync.getActiveRoutinesForDate(currentDate),
                sync.getDailyProgress(currentDate)
              ]);
              const pMap = new Map<string, DailyGoalProgress>();
              for (const prog of p) {
                pMap.set(prog.daily_routine_goal_id, prog);
              }
              set({ date: currentDate, routines: r, progress: pMap });
            }
          });
        }
      } finally {
        loading.set(false);
      }
    },
    toggleComplete: async (routineId: string, date: string) => {
      let state: DailyProgressState | null = null;
      update(s => { state = s; return s; });

      if (!state) return;
      const current = (state as DailyProgressState).progress.get(routineId);
      const newCompleted = !current?.completed;

      const updated = await repo.upsertDailyProgress(routineId, date, current?.current_value || 0, newCompleted);

      update(s => {
        if (!s) return s;
        const newProgress = new Map(s.progress);
        newProgress.set(routineId, updated);
        return { ...s, progress: newProgress };
      });
    },
    increment: async (routineId: string, date: string, targetValue: number, amount: number = 1) => {
      let state: DailyProgressState | null = null;
      update(s => { state = s; return s; });

      if (!state) return;

      const updated = await repo.incrementDailyProgress(routineId, date, targetValue, amount);

      update(s => {
        if (!s) return s;
        const newProgress = new Map(s.progress);
        newProgress.set(routineId, updated);
        return { ...s, progress: newProgress };
      });
    },
    clear: () => {
      currentDate = null;
      set(null);
    }
  };
}

export const dailyProgressStore = createDailyProgressStore();

// Month Progress Store (for calendar view)
interface MonthProgressState {
  year: number;
  month: number;
  dayProgress: Map<string, DayProgress>;
}

function createMonthProgressStore() {
  const { subscribe, set }: Writable<MonthProgressState | null> = writable(null);
  let loading = writable(true);
  let currentYear: number | null = null;
  let currentMonth: number | null = null;
  let unsubscribe: (() => void) | null = null;

  async function loadMonthData(year: number, month: number): Promise<MonthProgressState> {
    // Always read from local DB
    const [routines, progressList] = await Promise.all([
      sync.getDailyRoutineGoals(),
      sync.getMonthProgress(year, month)
    ]);

    // Group progress by date
    const progressByDate = new Map<string, DailyGoalProgress[]>();
    for (const p of progressList) {
      const list = progressByDate.get(p.date) || [];
      list.push(p);
      progressByDate.set(p.date, list);
    }

    // Calculate day progress
    const dayProgress = new Map<string, DayProgress>();
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // Get active routines for this date
      const activeRoutines = routines.filter(r => {
        if (r.start_date > dateStr) return false;
        if (r.end_date && r.end_date < dateStr) return false;
        return true;
      });

      if (activeRoutines.length === 0) continue;

      const dayProgressList = progressByDate.get(dateStr) || [];
      const progressMap = new Map<string, DailyGoalProgress>();
      for (const p of dayProgressList) {
        progressMap.set(p.daily_routine_goal_id, p);
      }

      let completedProgress = 0;
      let completedGoals = 0;

      for (const routine of activeRoutines) {
        const progress = progressMap.get(routine.id);
        const currentValue = progress?.current_value || 0;
        const isCompleted = progress?.completed || false;

        const progressPercent = calculateGoalProgress(
          routine.type,
          isCompleted,
          currentValue,
          routine.target_value
        );
        completedProgress += progressPercent;

        if (routine.type === 'completion' ? isCompleted : currentValue >= (routine.target_value || 0)) {
          completedGoals++;
        }
      }

      dayProgress.set(dateStr, {
        date: dateStr,
        totalGoals: activeRoutines.length,
        completedGoals,
        completionPercentage: Math.round(completedProgress / activeRoutines.length)
      });
    }

    return { year, month, dayProgress };
  }

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    load: async (year: number, month: number) => {
      loading.set(true);
      currentYear = year;
      currentMonth = month;
      try {
        const state = await loadMonthData(year, month);
        set(state);

        // Register for sync complete to auto-refresh
        if (browser && !unsubscribe) {
          unsubscribe = sync.onSyncComplete(async () => {
            if (currentYear !== null && currentMonth !== null) {
              const refreshed = await loadMonthData(currentYear, currentMonth);
              set(refreshed);
            }
          });
        }
      } finally {
        loading.set(false);
      }
    },
    clear: () => {
      currentYear = null;
      currentMonth = null;
      set(null);
    }
  };
}

export const monthProgressStore = createMonthProgressStore();
