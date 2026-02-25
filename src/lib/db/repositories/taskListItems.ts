/**
 * @fileoverview Repository for **task list item** entities.
 *
 * A task list item is a simple task within a {@link TaskList} — it has a
 * name, a boolean `completed` flag, and an `order` for drag-to-reorder.
 * Items are the leaf-level entities in the task list hierarchy:
 *
 *   `task_lists` (parent) → `task_list_items` (children)
 *
 * Unlike goals which have types and progress tracking, task list items
 * are intentionally minimal — just a name and a done/not-done state.
 * This makes them ideal for quick checklists and simple task tracking.
 *
 * Ordering:
 * - New items are **prepended** (lowest `order` value) so they appear at
 *   the top of the list, consistent with how daily tasks and goals work.
 *
 * Toggle behaviour:
 * - {@link toggleTaskListItem} reads the current `completed` value and
 *   flips it.  This is a read-then-write pattern; the engine handles
 *   conflict resolution if a concurrent sync arrives.
 *
 * Table: `task_list_items`
 * Parent: `task_lists` (via `task_list_id`)
 *
 * @module repositories/taskListItems
 */

import { generateId, now, debug } from 'stellar-drive/utils';
import {
  engineCreate,
  engineUpdate,
  engineDelete,
  engineGet,
  reorderEntity,
  prependOrder
} from 'stellar-drive/data';
import type { TaskListItem } from '$lib/types';

// =============================================================================
//                            Write Operations
// =============================================================================

/**
 * Creates a new task list item, prepended at the top of its parent list.
 *
 * The item starts as `completed: false`.  Order is computed via
 * {@link prependOrder} which finds the minimum existing `order` among
 * siblings in the same `task_list_id` and subtracts 1.
 *
 * @param taskListId - The parent {@link TaskList}'s ID
 * @param name       - Display name for the task
 * @returns The newly created {@link TaskListItem} with all fields populated
 */
export async function createTaskListItem(taskListId: string, name: string): Promise<TaskListItem> {
  const timestamp = now();

  /* ── Compute prepend order among sibling items ──── */
  const nextOrder = await prependOrder('task_list_items', 'task_list_id', taskListId);

  const newItem: TaskListItem = {
    id: generateId(),
    task_list_id: taskListId,
    name,
    completed: false,
    order: nextOrder,
    created_at: timestamp,
    updated_at: timestamp
  };

  await engineCreate('task_list_items', newItem as unknown as Record<string, unknown>);

  debug(
    'log',
    `[TaskListItems] Created item "${name}" (id=${newItem.id}, listId=${taskListId}, order=${nextOrder})`
  );

  return newItem;
}

/**
 * Updates mutable fields on a task list item.
 *
 * Only `name` and `completed` are allowed — `task_list_id` and `order`
 * are managed by other functions ({@link reorderTaskListItem} for order,
 * and items cannot be moved between lists).
 *
 * @param id      - The item's unique identifier
 * @param updates - A partial object of `name` and/or `completed` to change
 * @returns The updated {@link TaskListItem}, or `undefined` if not found
 */
export async function updateTaskListItem(
  id: string,
  updates: Partial<Pick<TaskListItem, 'name' | 'completed'>>
): Promise<TaskListItem | undefined> {
  const result = await engineUpdate('task_list_items', id, updates as Record<string, unknown>);

  debug('log', `[TaskListItems] Updated item (id=${id}, updates=${JSON.stringify(updates)})`);

  return result as unknown as TaskListItem | undefined;
}

/**
 * Toggles a task list item's `completed` flag.
 *
 * Reads the current state via {@link engineGet}, flips the `completed`
 * boolean, and persists the change via {@link updateTaskListItem}.
 * Returns `undefined` if the item doesn't exist (already deleted or
 * invalid ID).
 *
 * @param id - The item's unique identifier
 * @returns The updated {@link TaskListItem}, or `undefined` if not found
 */
export async function toggleTaskListItem(id: string): Promise<TaskListItem | undefined> {
  /* ── Read current state to determine flip direction ──── */
  const item = (await engineGet('task_list_items', id)) as unknown as TaskListItem | null;
  if (!item) {
    debug('warn', `[TaskListItems] Toggle failed — item not found (id=${id})`);
    return undefined;
  }

  const newCompleted = !item.completed;
  debug('log', `[TaskListItems] Toggling item (id=${id}, ${item.completed} → ${newCompleted})`);

  return updateTaskListItem(id, { completed: newCompleted });
}

/**
 * Soft-deletes a task list item.
 *
 * The engine marks the record with `deleted: true` and `deleted_at`
 * rather than physically removing it, allowing sync to propagate the
 * deletion to other devices.
 *
 * @param id - The item's unique identifier
 */
export async function deleteTaskListItem(id: string): Promise<void> {
  debug('log', `[TaskListItems] Deleting item (id=${id})`);

  await engineDelete('task_list_items', id);
}

// =============================================================================
//                            Reorder Operations
// =============================================================================

/**
 * Updates the display order of a task list item within its list.
 *
 * Delegates to the generic {@link reorderEntity} helper which handles
 * the `updated_at` timestamp bump automatically.  The store layer
 * re-sorts the items array after this call returns.
 *
 * @param id       - The item's unique identifier
 * @param newOrder - The new ordinal position
 * @returns The updated {@link TaskListItem}, or `undefined` if not found
 */
export async function reorderTaskListItem(
  id: string,
  newOrder: number
): Promise<TaskListItem | undefined> {
  debug('log', `[TaskListItems] Reordering item (id=${id}, newOrder=${newOrder})`);

  return reorderEntity('task_list_items', id, newOrder) as Promise<TaskListItem | undefined>;
}
