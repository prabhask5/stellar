/**
 * @fileoverview Repository for **task list** entities.
 *
 * A task list is a named container for {@link TaskListItem} items — simple
 * tasks with a name, completion flag, and drag-to-reorder support.  Task
 * lists live on the Agenda page and provide a lightweight alternative to
 * goal lists when the user just needs a basic checklist.
 *
 * Cascade behaviour:
 * - **Delete** — soft-deletes all child `task_list_items`, then the list
 *   itself, via a single {@link engineBatchWrite} call.  This ensures
 *   atomicity so orphaned items can never exist without their parent.
 *
 * Ordering:
 * - New lists are **prepended** (lowest `order` value) so they appear at
 *   the top of the agenda's Task Lists section.
 *
 * Table: `task_lists`
 * Children: `task_list_items` (via `task_list_id`)
 *
 * @module repositories/taskLists
 */

import { generateId, now, debug } from 'stellar-drive/utils';
import {
  engineCreate,
  engineUpdate,
  engineQuery,
  engineBatchWrite,
  reorderEntity,
  prependOrder
} from 'stellar-drive/data';
import type { TaskList } from '$lib/types';

// =============================================================================
//                            Write Operations
// =============================================================================

/**
 * Creates a new task list, prepended at the top of the user's lists.
 *
 * Computes the prepend order via {@link prependOrder} which finds the
 * minimum existing `order` value among the user's lists and subtracts 1,
 * ensuring the new list sorts first when ordered ascending.
 *
 * @param name   - Display name for the task list
 * @param userId - The owning user's identifier (from auth state)
 * @returns The newly created {@link TaskList} with all fields populated
 */
export async function createTaskList(name: string, userId: string): Promise<TaskList> {
  const timestamp = now();

  /* ── Compute prepend order (min existing - 1) ──── */
  const order = await prependOrder('task_lists', 'user_id', userId);

  const newList: TaskList = {
    id: generateId(),
    user_id: userId,
    name,
    order,
    created_at: timestamp,
    updated_at: timestamp
  };

  await engineCreate('task_lists', newList as unknown as Record<string, unknown>);

  debug('log', `[TaskLists] Created task list "${name}" (id=${newList.id}, order=${order})`);

  return newList;
}

/**
 * Renames a task list.
 *
 * Only the `name` field is mutable via this function; `order` changes
 * go through {@link reorderTaskList} instead.
 *
 * @param id   - The task list's unique identifier
 * @param name - The new display name
 * @returns The updated {@link TaskList}, or `undefined` if not found
 */
export async function updateTaskList(id: string, name: string): Promise<TaskList | undefined> {
  const result = await engineUpdate('task_lists', id, { name });

  debug('log', `[TaskLists] Renamed task list (id=${id}, newName="${name}")`);

  return result as unknown as TaskList | undefined;
}

// =============================================================================
//                            Reorder Operations
// =============================================================================

/**
 * Updates the display order of a task list.
 *
 * Delegates to the generic {@link reorderEntity} helper which handles
 * the `updated_at` timestamp bump automatically.
 *
 * @param id       - The task list's unique identifier
 * @param newOrder - The new ordinal position
 * @returns The updated {@link TaskList}, or `undefined` if not found
 */
export async function reorderTaskList(id: string, newOrder: number): Promise<TaskList | undefined> {
  debug('log', `[TaskLists] Reordering task list (id=${id}, newOrder=${newOrder})`);

  return reorderEntity('task_lists', id, newOrder) as Promise<TaskList | undefined>;
}

// =============================================================================
//                           Delete Operations
// =============================================================================

/**
 * Deletes a task list **and** all its child items atomically.
 *
 * Uses {@link engineBatchWrite} to soft-delete every `task_list_item`
 * that references this list, followed by the list itself, in a single
 * transaction.  This prevents orphaned items from appearing in queries
 * if the delete were to fail partway through individual calls.
 *
 * @param id - The task list's unique identifier
 */
export async function deleteTaskList(id: string): Promise<void> {
  /* ── Gather child items for cascade delete ──── */
  const items = (await engineQuery('task_list_items', 'task_list_id', id)) as unknown as Array<{
    id: string;
  }>;

  /* ── Build batch: delete children first, then parent ──── */
  const ops: Array<{ type: 'delete'; table: string; id: string }> = [];

  for (const item of items) {
    ops.push({ type: 'delete', table: 'task_list_items', id: item.id });
  }

  /* ── Delete the list itself ──── */
  ops.push({ type: 'delete', table: 'task_lists', id });

  debug(
    'log',
    `[TaskLists] Deleting task list (id=${id}) with ${items.length} child item(s) — ${ops.length} total ops`
  );

  await engineBatchWrite(ops);
}
