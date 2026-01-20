import Dexie, { type Table } from 'dexie';
import type { Goal, GoalList, DailyRoutineGoal, DailyGoalProgress, SyncQueueItem } from '$lib/types';

export class GoalPlannerDB extends Dexie {
  goalLists!: Table<GoalList, string>;
  goals!: Table<Goal, string>;
  dailyRoutineGoals!: Table<DailyRoutineGoal, string>;
  dailyGoalProgress!: Table<DailyGoalProgress, string>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super('GoalPlannerDB');

    this.version(2).stores({
      // Primary key is id, indexed by user_id, created_at for sorting, updated_at for sync
      goalLists: 'id, user_id, created_at, updated_at',
      // Primary key is id, indexed by goal_list_id for fetching goals in a list
      goals: 'id, goal_list_id, created_at, updated_at',
      // Primary key is id, indexed by user_id, start_date, end_date for date filtering, created_at for sorting
      dailyRoutineGoals: 'id, user_id, start_date, end_date, created_at, updated_at',
      // Primary key is id, compound index for finding progress by goal+date
      dailyGoalProgress: 'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
      // Auto-increment id for sync queue, indexed by table for batch operations
      syncQueue: '++id, table, timestamp'
    });

    this.version(3).stores({
      goalLists: 'id, user_id, created_at, updated_at',
      goals: 'id, goal_list_id, created_at, updated_at',
      dailyRoutineGoals: 'id, user_id, start_date, end_date, created_at, updated_at',
      dailyGoalProgress: 'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
      // Added entityId index for coalescing updates to the same entity
      syncQueue: '++id, table, entityId, timestamp'
    });

    // Version 4: Add order index to dailyRoutineGoals for drag-drop reordering
    this.version(4).stores({
      goalLists: 'id, user_id, created_at, updated_at',
      goals: 'id, goal_list_id, order, created_at, updated_at',
      dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
      dailyGoalProgress: 'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
      syncQueue: '++id, table, entityId, timestamp'
    }).upgrade(async (tx) => {
      // Assign sequential order to existing daily routine goals
      const routines = await tx.table('dailyRoutineGoals').toArray();
      // Sort by created_at descending (newest first, matching current display order)
      const sorted = routines.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      for (let i = 0; i < sorted.length; i++) {
        await tx.table('dailyRoutineGoals').update(sorted[i].id, { order: i });
      }
    });
  }
}

export const db = new GoalPlannerDB();
