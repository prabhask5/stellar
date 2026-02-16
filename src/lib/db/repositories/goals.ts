/**
 * @fileoverview Repository for **goal** entities.
 *
 * A goal is an individual item within a {@link GoalList}.  Goals come in
 * two types:
 * - `completion` — a simple boolean (done / not done)
 * - `incremental` — tracks `current_value` against a `target_value`
 *
 * This module provides full CRUD, atomic increment, and reorder operations
 * against the `goals` table.
 *
 * Table: `goals`
 * Parent: `goal_lists` (via `goal_list_id`)
 *
 * @module repositories/goals
 */

import { generateId, now } from 'stellar-drive/utils';
import {
  engineCreate,
  engineUpdate,
  engineDelete,
  engineGet,
  engineIncrement,
  reorderEntity,
  prependOrder
} from 'stellar-drive/data';
import type { Goal, GoalType } from '$lib/types';

// =============================================================================
//                            Write Operations
// =============================================================================

/**
 * Creates a new goal within a goal list, prepended at the top.
 *
 * The `order` is computed as `min(existing orders) - 1` so new goals appear
 * first when sorted ascending — backwards-compatible with older items that
 * start at `0, 1, 2, ...`.
 *
 * For `incremental` goals, `target_value` is stored; for `completion` goals
 * it is set to `null`.
 *
 * @param goalListId  - The parent {@link GoalList}'s ID
 * @param name        - Display name for the goal
 * @param type        - The {@link GoalType} (`completion` | `incremental`)
 * @param targetValue - Target for incremental goals (`null` for completion)
 * @returns The newly created {@link Goal}
 */
export async function createGoal(
  goalListId: string,
  name: string,
  type: GoalType,
  targetValue: number | null
): Promise<Goal> {
  const timestamp = now();

  /* ── Compute prepend order ──── */
  const nextOrder = await prependOrder('goals', 'goal_list_id', goalListId);

  const newGoal: Goal = {
    id: generateId(),
    goal_list_id: goalListId,
    name,
    type,
    target_value: type === 'incremental' ? targetValue : null,
    current_value: 0,
    completed: false,
    order: nextOrder,
    created_at: timestamp,
    updated_at: timestamp
  };

  await engineCreate('goals', newGoal as unknown as Record<string, unknown>);

  return newGoal;
}

/**
 * Updates mutable fields on a goal.
 *
 * @param id      - The goal's unique identifier
 * @param updates - A partial object of allowed fields to update
 * @returns The updated {@link Goal}, or `undefined` if not found
 */
export async function updateGoal(
  id: string,
  updates: Partial<Pick<Goal, 'name' | 'type' | 'completed' | 'current_value' | 'target_value'>>
): Promise<Goal | undefined> {
  const result = await engineUpdate('goals', id, updates as Record<string, unknown>);
  return result as unknown as Goal | undefined;
}

/**
 * Soft-deletes a goal.
 *
 * @param id - The goal's unique identifier
 */
export async function deleteGoal(id: string): Promise<void> {
  await engineDelete('goals', id);
}

/**
 * Atomically increments a goal's `current_value` and auto-completes if target is reached.
 *
 * Uses {@link engineIncrement} for an atomic counter update.  The `completed`
 * flag is set to `true` when `current_value + amount >= target_value`.
 *
 * @param id     - The goal's unique identifier
 * @param amount - The increment step (default `1`)
 * @returns The updated {@link Goal}, or `undefined` if not found
 */
export async function incrementGoal(id: string, amount: number = 1): Promise<Goal | undefined> {
  const goal = (await engineGet('goals', id)) as unknown as Goal | null;
  if (!goal) return undefined;

  const newValue = goal.current_value + amount;
  /* Auto-complete when target is reached or exceeded */
  const completed = goal.target_value ? newValue >= goal.target_value : false;

  const result = await engineIncrement('goals', id, 'current_value', amount, { completed });
  return result as unknown as Goal | undefined;
}

// =============================================================================
//                            Reorder Operations
// =============================================================================

/**
 * Updates the display order of a goal within its list.
 *
 * @param id       - The goal's unique identifier
 * @param newOrder - The new ordinal position
 * @returns The updated {@link Goal}, or `undefined` if not found
 */
export async function reorderGoal(id: string, newOrder: number): Promise<Goal | undefined> {
  return reorderEntity('goals', id, newOrder) as Promise<Goal | undefined>;
}
