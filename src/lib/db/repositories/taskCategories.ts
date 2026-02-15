/**
 * @fileoverview Repository for **task category** (tag) entities.
 *
 * Task categories are colour-coded labels used to organize long-term tasks.
 * Each category has a `name`, a hex `color`, and a display `order`.
 * Categories can also be owned by a {@link Project} (via `project_id`),
 * in which case they are managed through the project lifecycle.
 *
 * Cascade behaviour on delete: any `long_term_agenda` items referencing the
 * deleted category have their `category_id` set to `null` (unlinked) rather
 * than being deleted themselves.
 *
 * Table: `task_categories`
 * Referenced by: `long_term_agenda` (via `category_id`)
 *
 * @module repositories/taskCategories
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
import type { TaskCategory } from '$lib/types';

// =============================================================================
//                            Write Operations
// =============================================================================

/**
 * Creates a new task category, prepended at the top of the user's categories.
 *
 * The `order` is computed as `min(existing orders) - 1` so the new category
 * appears first when sorted ascending.
 *
 * @param name   - Display name for the category
 * @param color  - Hex colour string (e.g. `"#6c5ce7"`)
 * @param userId - The owning user's identifier
 * @returns The newly created {@link TaskCategory}
 */
export async function createTaskCategory(
  name: string,
  color: string,
  userId: string
): Promise<TaskCategory> {
  const timestamp = now();

  /* ── Compute prepend order ──── */
  const minOrder = await prependOrder('task_categories', 'user_id', userId);

  const newCategory: TaskCategory = {
    id: generateId(),
    user_id: userId,
    name,
    color,
    order: minOrder,
    created_at: timestamp,
    updated_at: timestamp
  };

  await engineCreate('task_categories', newCategory as unknown as Record<string, unknown>);

  return newCategory;
}

/**
 * Updates mutable fields on a task category (name and/or colour).
 *
 * @param id      - The category's unique identifier
 * @param updates - A partial object of allowed fields to update
 * @returns The updated {@link TaskCategory}, or `undefined` if not found
 */
export async function updateTaskCategory(
  id: string,
  updates: Partial<Pick<TaskCategory, 'name' | 'color'>>
): Promise<TaskCategory | undefined> {
  const result = await engineUpdate('task_categories', id, updates as Record<string, unknown>);
  return result as unknown as TaskCategory | undefined;
}

// =============================================================================
//                           Delete Operations
// =============================================================================

/**
 * Deletes a task category and unlinks all referencing long-term tasks.
 *
 * Rather than deleting the long-term tasks, their `category_id` is set to
 * `null` — preserving the tasks while removing the tag association.  Both
 * operations happen atomically via a single batch write.
 *
 * @param id - The category's unique identifier
 */
export async function deleteTaskCategory(id: string): Promise<void> {
  /* ── Find tasks that reference this category ──── */
  const tasks = (await engineQuery('long_term_agenda', 'category_id', id)) as unknown as Array<{
    id: string;
  }>;

  const ops: BatchOperation[] = [];

  /* ── Delete the category ──── */
  ops.push({ type: 'delete', table: 'task_categories', id });

  /* ── Unlink referencing long-term tasks ──── */
  for (const task of tasks) {
    ops.push({
      type: 'update',
      table: 'long_term_agenda',
      id: task.id,
      fields: { category_id: null }
    });
  }

  await engineBatchWrite(ops);
}

// =============================================================================
//                            Reorder Operations
// =============================================================================

/**
 * Updates the display order of a task category.
 *
 * @param id       - The category's unique identifier
 * @param newOrder - The new ordinal position
 * @returns The updated {@link TaskCategory}, or `undefined` if not found
 */
export async function reorderTaskCategory(
  id: string,
  newOrder: number
): Promise<TaskCategory | undefined> {
  return reorderEntity('task_categories', id, newOrder) as Promise<TaskCategory | undefined>;
}
