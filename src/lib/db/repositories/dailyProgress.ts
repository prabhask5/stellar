/**
 * @fileoverview Repository for **daily goal progress** entities.
 *
 * Each record in the `daily_goal_progress` table tracks a user's progress
 * on a specific {@link DailyRoutineGoal} for a given calendar date.  This
 * module provides upsert and increment semantics — there is no standalone
 * "create" because progress records are lazily created on first interaction.
 *
 * A compound index `[daily_routine_goal_id+date]` is used to efficiently
 * locate existing records and avoid duplicates.
 *
 * Table: `daily_goal_progress`
 * Parent: `daily_routine_goals` (via `daily_routine_goal_id`)
 *
 * @module repositories/dailyProgress
 */

import { generateId, now } from '@prabhask5/stellar-engine/utils';
import { getDb } from '@prabhask5/stellar-engine';
import { engineCreate, engineUpdate, engineIncrement } from '@prabhask5/stellar-engine/data';
import type { DailyGoalProgress } from '$lib/types';

// =============================================================================
//                           Internal Helpers
// =============================================================================

/**
 * Looks up an existing, non-deleted progress record for a routine + date pair.
 *
 * Uses the Dexie compound index `[daily_routine_goal_id+date]` for an
 * efficient point query.  Soft-deleted (tombstone) records are filtered out
 * to prevent accidentally updating a record that has already been removed.
 *
 * @param routineId - The daily routine goal's ID
 * @param date      - The ISO date string (`YYYY-MM-DD`)
 * @returns The matching {@link DailyGoalProgress}, or `undefined` if none exists
 */
async function getProgressForRoutineAndDate(
  routineId: string,
  date: string
): Promise<DailyGoalProgress | undefined> {
  /* Must filter out deleted records to avoid updating tombstones
     instead of creating new progress records */
  const db = getDb();
  const results = await db
    .table('dailyGoalProgress')
    .where('[daily_routine_goal_id+date]')
    .equals([routineId, date])
    .toArray();

  return results.find((p: DailyGoalProgress) => !p.deleted);
}

// =============================================================================
//                            Write Operations
// =============================================================================

/**
 * Creates or updates a daily progress record (upsert).
 *
 * If a non-deleted record already exists for the given routine + date, it is
 * updated in place.  Otherwise a new record is inserted.  This ensures at
 * most one active progress row per routine per day.
 *
 * @param dailyRoutineGoalId - The parent routine's ID
 * @param date               - The ISO date string (`YYYY-MM-DD`)
 * @param currentValue       - The absolute progress value to set
 * @param completed          - Whether the goal is marked as complete
 * @returns The upserted {@link DailyGoalProgress} record
 */
export async function upsertDailyProgress(
  dailyRoutineGoalId: string,
  date: string,
  currentValue: number,
  completed: boolean
): Promise<DailyGoalProgress> {
  const timestamp = now();

  /* ── Check for existing record ──── */
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

  /* ── No existing record — create a new one ──── */
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

/**
 * Atomically increments a daily progress record's `current_value`.
 *
 * If no record exists yet for the routine + date, one is created with the
 * incremented value.  The `completed` flag is automatically set to `true`
 * when `current_value` reaches or exceeds `targetValue`.
 *
 * Uses {@link engineIncrement} for atomic counter updates when the record
 * already exists, falling back to {@link engineCreate} for new records.
 *
 * @param dailyRoutineGoalId - The parent routine's ID
 * @param date               - The ISO date string (`YYYY-MM-DD`)
 * @param targetValue        - The goal's target (used to determine completion)
 * @param amount             - The increment step (default `1`)
 * @returns The updated or newly created {@link DailyGoalProgress} record
 */
export async function incrementDailyProgress(
  dailyRoutineGoalId: string,
  date: string,
  targetValue: number,
  amount: number = 1
): Promise<DailyGoalProgress> {
  const timestamp = now();

  /* ── Load current state ──── */
  const existing = await getProgressForRoutineAndDate(dailyRoutineGoalId, date);

  const currentValue = existing ? existing.current_value : 0;
  const newValue = currentValue + amount;
  const completed = newValue >= targetValue;

  if (existing) {
    /* ── Atomic increment on existing record ──── */
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

  /* ── No existing record — create with the incremented value ──── */
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
