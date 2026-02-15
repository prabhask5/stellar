/**
 * @fileoverview Repository for **daily routine goal** entities.
 *
 * A daily routine goal is a recurring habit or metric the user tracks each
 * day (e.g. "Drink 8 glasses of water").  Routines support three goal types:
 * `completion` (boolean), `incremental` (fixed target), and `progressive`
 * (target that ramps over time).
 *
 * Cascade behaviour: deleting a routine also soft-deletes all its child
 * `daily_goal_progress` records via a batch write.
 *
 * Table: `daily_routine_goals`
 * Children: `daily_goal_progress` (via `daily_routine_goal_id`)
 *
 * @module repositories/dailyRoutines
 */

import { generateId, now } from '@prabhask5/stellar-engine/utils';
import {
  engineCreate,
  engineUpdate,
  engineQuery,
  engineBatchWrite,
  reorderEntity,
  prependOrder
} from '@prabhask5/stellar-engine/data';
import type { BatchOperation } from '@prabhask5/stellar-engine/types';
import type { DailyRoutineGoal, GoalType, DayOfWeek } from '$lib/types';

// =============================================================================
//                            Write Operations
// =============================================================================

/**
 * Creates a new daily routine goal, prepended at the top of the user's list.
 *
 * The `order` is computed as `min(existing orders) - 1` so new routines
 * appear first when sorted ascending — backwards-compatible with older items
 * that start at `0, 1, 2, ...`.
 *
 * Type-specific fields are conditionally set:
 * - `incremental` → `target_value`
 * - `progressive` → `start_target_value`, `end_target_value`, `progression_schedule`
 * - `completion`  → all target fields set to `null`
 *
 * @param name               - Display name for the routine
 * @param type               - The {@link GoalType} (`completion` | `incremental` | `progressive`)
 * @param targetValue        - Fixed target for incremental goals
 * @param startDate          - ISO date when the routine becomes active
 * @param endDate            - Optional ISO date when the routine expires
 * @param userId             - The owning user's identifier
 * @param activeDays         - Optional day-of-week restriction (`null` → all days)
 * @param startTargetValue   - Starting target for progressive goals
 * @param endTargetValue     - Ending target for progressive goals
 * @param progressionSchedule - Number of days between target increases
 * @returns The newly created {@link DailyRoutineGoal}
 */
export async function createDailyRoutineGoal(
  name: string,
  type: GoalType,
  targetValue: number | null,
  startDate: string,
  endDate: string | null,
  userId: string,
  activeDays: DayOfWeek[] | null = null,
  startTargetValue: number | null = null,
  endTargetValue: number | null = null,
  progressionSchedule: number | null = null
): Promise<DailyRoutineGoal> {
  const timestamp = now();

  /* ── Compute prepend order ──── */
  const nextOrder = await prependOrder('daily_routine_goals', 'user_id', userId);

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

/**
 * Updates mutable fields on a daily routine goal.
 *
 * @param id      - The routine goal's unique identifier
 * @param updates - A partial object of allowed fields to update
 * @returns The updated {@link DailyRoutineGoal}, or `undefined` if not found
 */
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

/**
 * Deletes a daily routine goal **and** all its child progress records atomically.
 *
 * Uses {@link engineBatchWrite} to ensure the routine and every associated
 * `daily_goal_progress` row are soft-deleted together.
 *
 * @param id - The routine goal's unique identifier
 */
export async function deleteDailyRoutineGoal(id: string): Promise<void> {
  /* ── Gather child progress records for cascade delete ──── */
  const progressRecords = await engineQuery('daily_goal_progress', 'daily_routine_goal_id', id);

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

// =============================================================================
//                            Reorder Operations
// =============================================================================

/**
 * Updates the display order of a daily routine goal.
 *
 * @param id       - The routine goal's unique identifier
 * @param newOrder - The new ordinal position
 * @returns The updated {@link DailyRoutineGoal}, or `undefined` if not found
 */
export async function reorderDailyRoutineGoal(
  id: string,
  newOrder: number
): Promise<DailyRoutineGoal | undefined> {
  return reorderEntity('daily_routine_goals', id, newOrder) as Promise<
    DailyRoutineGoal | undefined
  >;
}
