/**
 * @fileoverview Repository for **goal list** entities.
 *
 * A goal list is a named container for {@link Goal} items.  Lists can be
 * standalone or linked to a {@link Project} (via `project_id`).  When a
 * project-linked list is renamed, the change cascades to the project,
 * its tag, and its commitment to keep names in sync.
 *
 * Cascade behaviour:
 * - **Rename** — if `project_id` is set, batch-updates project + tag +
 *   commitment names
 * - **Delete** — soft-deletes all child goals, then the list itself
 *
 * Table: `goal_lists`
 * Children: `goals` (via `goal_list_id`)
 * Parent (optional): `projects` (via `project_id`)
 *
 * @module repositories/goalLists
 */

import { generateId, now } from '@prabhask5/stellar-engine/utils';
import {
  engineCreate,
  engineUpdate,
  engineQuery,
  engineGet,
  engineBatchWrite,
  reorderEntity,
  prependOrder
} from '@prabhask5/stellar-engine/data';
import type { BatchOperation } from '@prabhask5/stellar-engine/types';
import type { GoalList, Goal } from '$lib/types';

// =============================================================================
//                            Write Operations
// =============================================================================

/**
 * Creates a new standalone goal list, prepended at the top of the user's lists.
 *
 * @param name   - Display name for the goal list
 * @param userId - The owning user's identifier
 * @returns The newly created {@link GoalList}
 */
export async function createGoalList(name: string, userId: string): Promise<GoalList> {
  const timestamp = now();
  const order = await prependOrder('goal_lists', 'user_id', userId);
  const newList: GoalList = {
    id: generateId(),
    user_id: userId,
    name,
    order,
    created_at: timestamp,
    updated_at: timestamp
  };

  await engineCreate('goal_lists', newList as unknown as Record<string, unknown>);

  return newList;
}

/**
 * Renames a goal list, with project cascade when applicable.
 *
 * If the list belongs to a project (`project_id` is set), the rename is
 * propagated to the project, its tag ({@link TaskCategory}), and its
 * commitment via a single batch write — keeping all entities in sync.
 *
 * @param id   - The goal list's unique identifier
 * @param name - The new display name
 * @returns The updated {@link GoalList}, or `undefined` if not found
 */
export async function updateGoalList(id: string, name: string): Promise<GoalList | undefined> {
  /* ── Check if the list belongs to a project ──── */
  const goalList = (await engineGet('goal_lists', id)) as unknown as GoalList | null;
  if (!goalList) return undefined;

  if (goalList.project_id) {
    /* ── Cascade name change to project, tag, and commitment ──── */
    const project = (await engineGet('projects', goalList.project_id)) as Record<
      string,
      unknown
    > | null;
    if (project) {
      const ops: BatchOperation[] = [
        { type: 'update', table: 'goal_lists', id, fields: { name } },
        { type: 'update', table: 'projects', id: project.id as string, fields: { name } }
      ];

      if (project.tag_id) {
        ops.push({
          type: 'update',
          table: 'task_categories',
          id: project.tag_id as string,
          fields: { name }
        });
      }
      if (project.commitment_id) {
        ops.push({
          type: 'update',
          table: 'commitments',
          id: project.commitment_id as string,
          fields: { name }
        });
      }

      await engineBatchWrite(ops);

      /* ── Read back the updated goal list ──── */
      const updated = (await engineGet('goal_lists', id)) as unknown as GoalList | null;
      return updated ?? undefined;
    }
  }

  /* ── No project cascade needed — simple update ──── */
  const result = await engineUpdate('goal_lists', id, { name });
  return result as unknown as GoalList | undefined;
}

// =============================================================================
//                            Reorder Operations
// =============================================================================

/**
 * Updates the display order of a goal list.
 *
 * @param id       - The goal list's unique identifier
 * @param newOrder - The new ordinal position
 * @returns The updated {@link GoalList}, or `undefined` if not found
 */
export async function reorderGoalList(id: string, newOrder: number): Promise<GoalList | undefined> {
  return reorderEntity('goal_lists', id, newOrder) as Promise<GoalList | undefined>;
}

// =============================================================================
//                           Delete Operations
// =============================================================================

/**
 * Deletes a goal list **and** all its child goals atomically.
 *
 * Uses {@link engineBatchWrite} to soft-delete every goal in the list
 * followed by the list itself in a single transaction.
 *
 * @param id - The goal list's unique identifier
 */
export async function deleteGoalList(id: string): Promise<void> {
  /* ── Gather child goals for cascade delete ──── */
  const goals = (await engineQuery('goals', 'goal_list_id', id)) as unknown as Goal[];

  const ops: Array<{ type: 'delete'; table: string; id: string }> = [];

  for (const goal of goals) {
    ops.push({ type: 'delete', table: 'goals', id: goal.id });
  }

  /* ── Delete the list itself ──── */
  ops.push({ type: 'delete', table: 'goal_lists', id });

  await engineBatchWrite(ops);
}
