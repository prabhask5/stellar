import { generateId, now } from '@prabhask5/stellar-engine/utils';
import {
  engineCreate,
  engineUpdate,
  engineQuery,
  engineBatchWrite
} from '@prabhask5/stellar-engine/data';
import type { BatchOperation } from '@prabhask5/stellar-engine/types';
import type { DailyRoutineGoal, GoalType, DayOfWeek } from '$lib/types';

export async function createDailyRoutineGoal(
  name: string,
  type: GoalType,
  targetValue: number | null,
  startDate: string,
  endDate: string | null,
  userId: string,
  activeDays: DayOfWeek[] | null = null, // null = all days (backwards compatible)
  startTargetValue: number | null = null,
  endTargetValue: number | null = null,
  progressionSchedule: number | null = null
): Promise<DailyRoutineGoal> {
  const timestamp = now();

  // Get the current min order to prepend new items at the top
  // This is backwards-compatible: existing items (order 0,1,2...) stay in place,
  // new items get -1,-2,-3... and appear first when sorted ascending
  const existingRoutines = (await engineQuery(
    'daily_routine_goals',
    'user_id',
    userId
  )) as unknown as DailyRoutineGoal[];

  const activeRoutines = existingRoutines.filter((r) => !r.deleted);
  const minOrder =
    activeRoutines.length > 0 ? Math.min(...activeRoutines.map((r) => r.order ?? 0)) : 0;
  const nextOrder = minOrder - 1;

  const result = await engineCreate('daily_routine_goals', {
    id: generateId(),
    user_id: userId,
    name,
    type,
    target_value: type === 'incremental' ? targetValue : null,
    start_date: startDate,
    end_date: endDate,
    active_days: activeDays,
    start_target_value: type === 'progressive' ? startTargetValue : null,
    end_target_value: type === 'progressive' ? endTargetValue : null,
    progression_schedule: type === 'progressive' ? progressionSchedule : null,
    order: nextOrder,
    created_at: timestamp,
    updated_at: timestamp
  });

  return result as unknown as DailyRoutineGoal;
}

export async function updateDailyRoutineGoal(
  id: string,
  updates: Partial<
    Pick<
      DailyRoutineGoal,
      | 'name'
      | 'type'
      | 'target_value'
      | 'start_date'
      | 'end_date'
      | 'active_days'
      | 'start_target_value'
      | 'end_target_value'
      | 'progression_schedule'
    >
  >
): Promise<DailyRoutineGoal | undefined> {
  const result = await engineUpdate('daily_routine_goals', id, updates as Record<string, unknown>);
  return result as unknown as DailyRoutineGoal | undefined;
}

export async function deleteDailyRoutineGoal(id: string): Promise<void> {
  // Get all progress records for this routine to soft delete them
  const progressRecords = await engineQuery('daily_goal_progress', 'daily_routine_goal_id', id);

  // Use batch write to atomically delete the routine and all its progress records
  const ops: BatchOperation[] = [
    ...progressRecords.map((progress) => ({
      type: 'delete' as const,
      table: 'daily_goal_progress',
      id: (progress as Record<string, unknown>).id as string
    })),
    {
      type: 'delete' as const,
      table: 'daily_routine_goals',
      id
    }
  ];

  await engineBatchWrite(ops);
}

export async function reorderDailyRoutineGoal(
  id: string,
  newOrder: number
): Promise<DailyRoutineGoal | undefined> {
  const result = await engineUpdate('daily_routine_goals', id, { order: newOrder });
  return result as unknown as DailyRoutineGoal | undefined;
}
