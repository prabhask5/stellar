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

export async function updateLongTermTask(
  id: string,
  updates: Partial<Pick<LongTermTask, 'name' | 'due_date' | 'category_id' | 'completed'>>
): Promise<LongTermTask | undefined> {
  const existing = (await engineGet('long_term_agenda', id)) as unknown as LongTermTask | undefined;
  if (!existing) return undefined;

  const result = await engineUpdate('long_term_agenda', id, updates as Record<string, unknown>);

  // Handle spawned daily task based on due_date or name changes
  if (updates.due_date !== undefined || updates.name !== undefined) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
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
      // Due date moved from future to today or before -> spawn a new daily task
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
      // Name changed -> update spawned task name
      await engineUpdate('daily_tasks', linkedDaily.id, { name: updates.name });
    }
  }

  return result as unknown as LongTermTask | undefined;
}

export async function toggleLongTermTaskComplete(id: string): Promise<LongTermTask | undefined> {
  const task = (await engineGet('long_term_agenda', id)) as unknown as LongTermTask | undefined;
  if (!task) return undefined;

  // Reminders cannot be toggled
  if (task.type === 'reminder') return task;

  const newCompleted = !task.completed;
  const result = await engineUpdate('long_term_agenda', id, { completed: newCompleted });

  // Bi-directional sync: find and update the spawned daily task
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

export async function deleteLongTermTask(id: string): Promise<void> {
  // Find and delete any spawned daily task linked to this long-term task
  const dailyTasks = (await engineQuery(
    'daily_tasks',
    'long_term_task_id',
    id
  )) as unknown as DailyTask[];
  const linkedDaily = dailyTasks.find((dt) => !dt.deleted);

  if (linkedDaily) {
    await engineBatchWrite([
      { type: 'delete' as const, table: 'long_term_agenda', id },
      { type: 'delete' as const, table: 'daily_tasks', id: linkedDaily.id }
    ] as BatchOperation[]);
  } else {
    await engineDelete('long_term_agenda', id);
  }
}
