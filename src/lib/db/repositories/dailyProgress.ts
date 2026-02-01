import { generateId, now } from '@prabhask5/stellar-engine/utils';
import { getDb } from '@prabhask5/stellar-engine';
import { engineCreate, engineUpdate, engineIncrement } from '@prabhask5/stellar-engine/data';
import type { DailyGoalProgress } from '$lib/types';

async function getProgressForRoutineAndDate(
  routineId: string,
  date: string
): Promise<DailyGoalProgress | undefined> {
  // Must filter out deleted records to avoid updating tombstones
  // instead of creating new progress records
  const db = getDb();
  const results = await db
    .table('dailyGoalProgress')
    .where('[daily_routine_goal_id+date]')
    .equals([routineId, date])
    .toArray();

  return results.find((p: DailyGoalProgress) => !p.deleted);
}

export async function upsertDailyProgress(
  dailyRoutineGoalId: string,
  date: string,
  currentValue: number,
  completed: boolean
): Promise<DailyGoalProgress> {
  const timestamp = now();

  // Check if progress exists
  const existing = await getProgressForRoutineAndDate(dailyRoutineGoalId, date);

  if (existing) {
    const result = await engineUpdate('daily_goal_progress', existing.id, {
      current_value: currentValue,
      completed
    });

    if (result) {
      return result as unknown as DailyGoalProgress;
    }
  }

  // Create new progress record
  const result = await engineCreate('daily_goal_progress', {
    id: generateId(),
    daily_routine_goal_id: dailyRoutineGoalId,
    date,
    current_value: currentValue,
    completed,
    updated_at: timestamp
  });

  return result as unknown as DailyGoalProgress;
}

export async function incrementDailyProgress(
  dailyRoutineGoalId: string,
  date: string,
  targetValue: number,
  amount: number = 1
): Promise<DailyGoalProgress> {
  const timestamp = now();

  // Get current progress
  const existing = await getProgressForRoutineAndDate(dailyRoutineGoalId, date);

  const currentValue = existing ? existing.current_value : 0;
  const newValue = currentValue + amount;
  const completed = newValue >= targetValue;

  if (existing) {
    const result = await engineIncrement(
      'daily_goal_progress',
      existing.id,
      'current_value',
      amount,
      { completed }
    );
    return (
      (result as unknown as DailyGoalProgress) ?? {
        ...existing,
        current_value: newValue,
        completed,
        updated_at: timestamp
      }
    );
  }

  // Create new progress record
  const result = await engineCreate('daily_goal_progress', {
    id: generateId(),
    daily_routine_goal_id: dailyRoutineGoalId,
    date,
    current_value: newValue,
    completed,
    updated_at: timestamp
  });

  return result as unknown as DailyGoalProgress;
}
