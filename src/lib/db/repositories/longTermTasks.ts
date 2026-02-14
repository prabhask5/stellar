/**
 * @fileoverview Repository for **long-term task** (agenda) entities.
 *
 * Long-term tasks live in the `long_term_agenda` table and represent items
 * with a due date that may be categorized by a {@link TaskCategory} tag.
 * They come in two types:
 * - `task`     — a completable item that can spawn a {@link DailyTask} when
 *                its due date arrives
 * - `reminder` — a non-completable date marker (cannot be toggled)
 *
 * Key behaviours:
 * - **Spawning** — when a task's `due_date` is moved from the future to
 *   today (or earlier), a linked daily task is automatically created
 * - **Bi-directional sync** — toggling completion updates the linked daily
 *   task (and vice versa, handled in {@link dailyTasks})
 * - **Cascade delete** — deleting a long-term task also deletes its linked
 *   daily task if one exists
 *
 * Table: `long_term_agenda`
 * Related: `daily_tasks` (via `long_term_task_id`), `task_categories` (via `category_id`)
 *
 * @module repositories/longTermTasks
 */

import { generateId, now } from '@prabhask5/stellar-engine/utils';
import {
  engineCreate,
  engineUpdate,
  engineDelete,
  engineGet,
  engineQuery,
  engineBatchWrite
} from '@prabhask5/stellar-engine/data';
import type { BatchOperation } from '@prabhask5/stellar-engine/types';
import type { LongTermTask, AgendaItemType, DailyTask } from '$lib/types';

// =============================================================================
//                            Write Operations
// =============================================================================

/**
 * Creates a new long-term task (or reminder) in the agenda.
 *
 * @param name       - Display name for the task
 * @param dueDate    - The ISO date string (`YYYY-MM-DD`) when the task is due
 * @param categoryId - Optional {@link TaskCategory} ID for tagging
 * @param userId     - The owning user's identifier
 * @param type       - The {@link AgendaItemType} (`task` | `reminder`), defaults to `task`
 * @returns The newly created {@link LongTermTask}
 */
export async function createLongTermTask(
  name: string,
  dueDate: string,
  categoryId: string | null,
  userId: string,
  type: AgendaItemType = 'task'
): Promise<LongTermTask> {
  const timestamp = now();

  const result = await engineCreate('long_term_agenda', {
    id: generateId(),
    user_id: userId,
    name,
    due_date: dueDate,
    category_id: categoryId,
    type,
    completed: false,
    created_at: timestamp,
    updated_at: timestamp
  });

  return result as unknown as LongTermTask;
}

/**
 * Updates mutable fields on a long-term task, with smart daily-task spawning.
 *
 * When `due_date` or `name` changes, this function checks for side effects:
 *   1. **Due date moved to today/past** — if the task had a future due date
 *      and now becomes due, a new daily task is automatically spawned
 *      (only for `task` type, not `reminder`)
 *   2. **Name changed** — if a linked daily task already exists, its name
 *      is updated to match
 *
 * @param id      - The long-term task's unique identifier
 * @param updates - A partial object of allowed fields to update
 * @returns The updated {@link LongTermTask}, or `undefined` if not found
 */
export async function updateLongTermTask(
  id: string,
  updates: Partial<Pick<LongTermTask, 'name' | 'due_date' | 'category_id' | 'completed'>>
): Promise<LongTermTask | undefined> {
  const existing = (await engineGet('long_term_agenda', id)) as unknown as LongTermTask | undefined;
  if (!existing) return undefined;

  const result = await engineUpdate('long_term_agenda', id, updates as Record<string, unknown>);

  /* ── Handle spawned daily task side effects ──── */
  if (updates.due_date !== undefined || updates.name !== undefined) {
    const today = new Date().toISOString().split('T')[0]; /* YYYY-MM-DD */
    const dailyTasks = (await engineQuery(
      'daily_tasks',
      'long_term_task_id',
      id
    )) as unknown as DailyTask[];
    const linkedDaily = dailyTasks.find((dt) => !dt.deleted);

    const newDueDate = updates.due_date ?? existing.due_date;
    const wasFuture = existing.due_date > today;
    const isNowDueOrPast = newDueDate <= today;

    if (wasFuture && isNowDueOrPast && !linkedDaily && existing.type === 'task') {
      /* ── Due date moved from future → today/past: spawn a daily task ──── */
      const timestamp = now();
      const allDailyTasks = (await engineQuery(
        'daily_tasks',
        'user_id',
        existing.user_id
      )) as unknown as DailyTask[];
      const activeItems = allDailyTasks.filter((t) => !t.deleted);
      const minOrder = activeItems.length > 0 ? Math.min(...activeItems.map((t) => t.order)) : 0;
      await engineCreate('daily_tasks', {
        id: generateId(),
        user_id: existing.user_id,
        name: updates.name ?? existing.name,
        long_term_task_id: id,
        order: minOrder - 1,
        completed: existing.completed,
        created_at: timestamp,
        updated_at: timestamp
      });
    } else if (linkedDaily && updates.name !== undefined) {
      /* ── Name changed: propagate to the linked daily task ──── */
      await engineUpdate('daily_tasks', linkedDaily.id, { name: updates.name });
    }
  }

  return result as unknown as LongTermTask | undefined;
}

/**
 * Toggles a long-term task's `completed` flag with bi-directional sync.
 *
 * Reminders cannot be toggled — if the task type is `reminder`, the original
 * task is returned unchanged.
 *
 * When toggled, any linked daily task is updated to match the new completion
 * state, keeping both sides in sync.
 *
 * @param id - The long-term task's unique identifier
 * @returns The updated {@link LongTermTask}, or `undefined` if not found
 */
export async function toggleLongTermTaskComplete(id: string): Promise<LongTermTask | undefined> {
  const task = (await engineGet('long_term_agenda', id)) as unknown as LongTermTask | undefined;
  if (!task) return undefined;

  /* Reminders are non-completable */
  if (task.type === 'reminder') return task;

  const newCompleted = !task.completed;
  const result = await engineUpdate('long_term_agenda', id, { completed: newCompleted });

  /* ── Bi-directional sync with linked daily task ──── */
  const dailyTasks = (await engineQuery(
    'daily_tasks',
    'long_term_task_id',
    id
  )) as unknown as DailyTask[];
  const linkedDaily = dailyTasks.find((dt) => !dt.deleted);
  if (linkedDaily && linkedDaily.completed !== newCompleted) {
    await engineUpdate('daily_tasks', linkedDaily.id, { completed: newCompleted });
  }

  return result as unknown as LongTermTask | undefined;
}

// =============================================================================
//                           Delete Operations
// =============================================================================

/**
 * Deletes a long-term task, with cascade delete for its linked daily task.
 *
 * If a spawned daily task exists, both are deleted atomically via batch write.
 * Otherwise, only the long-term task is deleted.
 *
 * @param id - The long-term task's unique identifier
 */
export async function deleteLongTermTask(id: string): Promise<void> {
  /* ── Find linked daily task for cascade delete ──── */
  const dailyTasks = (await engineQuery(
    'daily_tasks',
    'long_term_task_id',
    id
  )) as unknown as DailyTask[];
  const linkedDaily = dailyTasks.find((dt) => !dt.deleted);

  if (linkedDaily) {
    /* ── Cascade delete: long-term task + linked daily task ──── */
    await engineBatchWrite([
      { type: 'delete' as const, table: 'long_term_agenda', id },
      { type: 'delete' as const, table: 'daily_tasks', id: linkedDaily.id }
    ] as BatchOperation[]);
  } else {
    await engineDelete('long_term_agenda', id);
  }
}
