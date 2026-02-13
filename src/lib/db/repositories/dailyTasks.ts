import { generateId, now } from '@prabhask5/stellar-engine/utils';
import {
  engineCreate,
  engineUpdate,
  engineDelete,
  engineQuery,
  engineGet,
  engineBatchWrite
} from '@prabhask5/stellar-engine/data';
import type { BatchOperation } from '@prabhask5/stellar-engine/types';
import type { DailyTask, LongTermTask } from '$lib/types';

export async function createDailyTask(
  name: string,
  userId: string,
  longTermTaskId?: string | null
): Promise<DailyTask> {
  const timestamp = now();

  // Get the lowest order to prepend new items at the top
  // This is backwards-compatible: existing items (order 0,1,2...) stay in place,
  // new items get -1,-2,-3... and appear first when sorted ascending
  const existing = (await engineQuery('daily_tasks', 'user_id', userId)) as unknown as DailyTask[];
  const activeItems = existing.filter((t) => !t.deleted);
  const minOrder = activeItems.length > 0 ? Math.min(...activeItems.map((t) => t.order)) : 0;
  const nextOrder = minOrder - 1;

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

export async function updateDailyTask(
  id: string,
  updates: Partial<Pick<DailyTask, 'name' | 'completed'>>
): Promise<DailyTask | undefined> {
  const result = await engineUpdate('daily_tasks', id, updates as Record<string, unknown>);
  return result as unknown as DailyTask | undefined;
}

export async function toggleDailyTaskComplete(id: string): Promise<DailyTask | undefined> {
  const task = (await engineGet('daily_tasks', id)) as unknown as DailyTask | undefined;
  if (!task) return undefined;

  const newCompleted = !task.completed;
  const result = await engineUpdate('daily_tasks', id, { completed: newCompleted });

  // Bi-directional sync: if this is a spawned task, also update the linked long-term task
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

export async function deleteDailyTask(id: string): Promise<void> {
  const task = (await engineGet('daily_tasks', id)) as unknown as DailyTask | undefined;

  if (task?.long_term_task_id) {
    // Cascade delete: delete both the daily task and the linked long-term task
    await engineBatchWrite([
      { type: 'delete' as const, table: 'daily_tasks', id },
      { type: 'delete' as const, table: 'long_term_agenda', id: task.long_term_task_id }
    ] as BatchOperation[]);
  } else {
    await engineDelete('daily_tasks', id);
  }
}

export async function reorderDailyTask(
  id: string,
  newOrder: number
): Promise<DailyTask | undefined> {
  const result = await engineUpdate('daily_tasks', id, { order: newOrder });
  return result as unknown as DailyTask | undefined;
}

export async function clearCompletedDailyTasks(userId: string): Promise<void> {
  const tasks = (await engineQuery('daily_tasks', 'user_id', userId)) as unknown as DailyTask[];
  const completedTasks = tasks.filter((t) => t.completed && !t.deleted);

  if (completedTasks.length === 0) return;

  const ops: BatchOperation[] = completedTasks.map((task) => ({
    type: 'delete' as const,
    table: 'daily_tasks',
    id: task.id
  })) as BatchOperation[];

  // Also delete linked long-term tasks for spawned completed tasks
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
