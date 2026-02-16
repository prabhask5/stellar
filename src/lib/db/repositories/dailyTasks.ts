/**
 * @fileoverview Repository for **daily task** entities.
 *
 * Daily tasks are the user's to-do items for the current day.  They can be
 * standalone or "spawned" from a {@link LongTermTask} (linked via
 * `long_term_task_id`).  When a spawned task is toggled or deleted, the
 * linked long-term task is kept in sync bi-directionally.
 *
 * Key behaviours:
 * - **Toggle sync** — toggling a spawned daily task also toggles its parent
 *   long-term task (and vice versa, handled in {@link longTermTasks})
 * - **Cascade delete** — deleting a spawned daily task also deletes the
 *   linked long-term task
 * - **Bulk clear** — completed tasks can be cleared in batch, respecting
 *   the same cascade rules
 *
 * Table: `daily_tasks`
 * Related: `long_term_agenda` (via `long_term_task_id`)
 *
 * @module repositories/dailyTasks
 */

import { generateId, now } from 'stellar-drive/utils';
import {
  engineCreate,
  engineUpdate,
  engineDelete,
  engineQuery,
  engineGet,
  engineBatchWrite,
  reorderEntity,
  prependOrder
} from 'stellar-drive/data';
import type { BatchOperation } from 'stellar-drive/types';
import type { DailyTask, LongTermTask } from '$lib/types';

// =============================================================================
//                            Write Operations
// =============================================================================

/**
 * Creates a new daily task, prepended at the top of the user's list.
 *
 * If `longTermTaskId` is provided, the task is marked as "spawned" and will
 * participate in bi-directional sync with its parent long-term task.
 *
 * @param name           - Display name for the task
 * @param userId         - The owning user's identifier
 * @param longTermTaskId - Optional link to a parent {@link LongTermTask}
 * @returns The newly created {@link DailyTask}
 */
export async function createDailyTask(
  name: string,
  userId: string,
  longTermTaskId?: string | null
): Promise<DailyTask> {
  const timestamp = now();

  /* ── Compute prepend order (min - 1) ──── */
  const nextOrder = await prependOrder('daily_tasks', 'user_id', userId);

  const result = await engineCreate('daily_tasks', {
    id: generateId(),
    user_id: userId,
    name,
    long_term_task_id: longTermTaskId ?? null,
    order: nextOrder,
    completed: false,
    created_at: timestamp,
    updated_at: timestamp
  });

  return result as unknown as DailyTask;
}

/**
 * Updates mutable fields on a daily task (name and/or completed status).
 *
 * @param id      - The daily task's unique identifier
 * @param updates - A partial object of allowed fields to update
 * @returns The updated {@link DailyTask}, or `undefined` if not found
 */
export async function updateDailyTask(
  id: string,
  updates: Partial<Pick<DailyTask, 'name' | 'completed'>>
): Promise<DailyTask | undefined> {
  const result = await engineUpdate('daily_tasks', id, updates as Record<string, unknown>);
  return result as unknown as DailyTask | undefined;
}

/**
 * Toggles a daily task's `completed` flag with bi-directional sync.
 *
 * If the task is spawned from a long-term task, the linked long-term task's
 * `completed` field is also updated to match — ensuring both entities stay
 * in sync regardless of which side the user interacts with.
 *
 * @param id - The daily task's unique identifier
 * @returns The updated {@link DailyTask}, or `undefined` if not found
 */
export async function toggleDailyTaskComplete(id: string): Promise<DailyTask | undefined> {
  const task = (await engineGet('daily_tasks', id)) as unknown as DailyTask | undefined;
  if (!task) return undefined;

  const newCompleted = !task.completed;
  const result = await engineUpdate('daily_tasks', id, { completed: newCompleted });

  /* ── Bi-directional sync with linked long-term task ──── */
  if (task.long_term_task_id) {
    const ltTask = (await engineGet('long_term_agenda', task.long_term_task_id)) as unknown as
      | LongTermTask
      | undefined;
    if (ltTask && !ltTask.deleted && ltTask.completed !== newCompleted) {
      await engineUpdate('long_term_agenda', task.long_term_task_id, { completed: newCompleted });
    }
  }

  return result as unknown as DailyTask | undefined;
}

/**
 * Deletes a daily task, with cascade delete for spawned tasks.
 *
 * If the task has a `long_term_task_id`, both the daily task and the linked
 * long-term task are deleted atomically via batch write.  Standalone tasks
 * are deleted individually.
 *
 * @param id - The daily task's unique identifier
 */
export async function deleteDailyTask(id: string): Promise<void> {
  const task = (await engineGet('daily_tasks', id)) as unknown as DailyTask | undefined;

  if (task?.long_term_task_id) {
    /* ── Cascade delete: daily task + linked long-term task ──── */
    await engineBatchWrite([
      { type: 'delete' as const, table: 'daily_tasks', id },
      { type: 'delete' as const, table: 'long_term_agenda', id: task.long_term_task_id }
    ] as BatchOperation[]);
  } else {
    await engineDelete('daily_tasks', id);
  }
}

// =============================================================================
//                            Reorder Operations
// =============================================================================

/**
 * Updates the display order of a daily task.
 *
 * @param id       - The daily task's unique identifier
 * @param newOrder - The new ordinal position
 * @returns The updated {@link DailyTask}, or `undefined` if not found
 */
export async function reorderDailyTask(
  id: string,
  newOrder: number
): Promise<DailyTask | undefined> {
  return reorderEntity('daily_tasks', id, newOrder) as Promise<DailyTask | undefined>;
}

// =============================================================================
//                          Bulk Operations
// =============================================================================

/**
 * Clears (deletes) all completed daily tasks for a user in a single batch.
 *
 * For spawned tasks that are completed, the linked long-term task is also
 * deleted as part of the same batch write — maintaining referential integrity.
 *
 * @param userId - The owning user's identifier
 */
export async function clearCompletedDailyTasks(userId: string): Promise<void> {
  const tasks = (await engineQuery('daily_tasks', 'user_id', userId)) as unknown as DailyTask[];
  const completedTasks = tasks.filter((t) => t.completed && !t.deleted);

  if (completedTasks.length === 0) return;

  const ops: BatchOperation[] = completedTasks.map((task) => ({
    type: 'delete' as const,
    table: 'daily_tasks',
    id: task.id
  })) as BatchOperation[];

  /* ── Also delete linked long-term tasks for spawned completed tasks ──── */
  for (const task of completedTasks) {
    if (task.long_term_task_id) {
      ops.push({
        type: 'delete',
        table: 'long_term_agenda',
        id: task.long_term_task_id
      } as BatchOperation);
    }
  }

  await engineBatchWrite(ops);
}
