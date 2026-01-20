import { db, generateId, now } from '../client';
import type { DailyTask } from '$lib/types';
import { queueSync } from '$lib/sync/queue';
import { scheduleSyncPush } from '$lib/sync/engine';

export async function createDailyTask(name: string, userId: string): Promise<DailyTask> {
  const timestamp = now();

  // Get the highest order to insert at the bottom
  const existing = await db.dailyTasks.where('user_id').equals(userId).toArray();
  const activeItems = existing.filter(t => !t.deleted);
  const maxOrder = activeItems.length > 0 ? Math.max(...activeItems.map(t => t.order)) + 1 : 0;

  const newTask: DailyTask = {
    id: generateId(),
    user_id: userId,
    name,
    order: maxOrder,
    completed: false,
    created_at: timestamp,
    updated_at: timestamp
  };

  await db.dailyTasks.add(newTask);

  await queueSync('daily_tasks', 'create', newTask.id, {
    name,
    order: maxOrder,
    completed: false,
    user_id: userId,
    created_at: timestamp,
    updated_at: timestamp
  });
  scheduleSyncPush();

  return newTask;
}

export async function updateDailyTask(id: string, updates: Partial<Pick<DailyTask, 'name' | 'completed'>>): Promise<DailyTask | undefined> {
  const timestamp = now();

  await db.dailyTasks.update(id, { ...updates, updated_at: timestamp });

  const updated = await db.dailyTasks.get(id);
  if (!updated) return undefined;

  await queueSync('daily_tasks', 'update', id, { ...updates, updated_at: timestamp });
  scheduleSyncPush();

  return updated;
}

export async function toggleDailyTaskComplete(id: string): Promise<DailyTask | undefined> {
  const task = await db.dailyTasks.get(id);
  if (!task) return undefined;

  const timestamp = now();
  const newCompleted = !task.completed;

  await db.dailyTasks.update(id, { completed: newCompleted, updated_at: timestamp });

  const updated = await db.dailyTasks.get(id);
  if (!updated) return undefined;

  await queueSync('daily_tasks', 'update', id, { completed: newCompleted, updated_at: timestamp });
  scheduleSyncPush();

  return updated;
}

export async function deleteDailyTask(id: string): Promise<void> {
  const timestamp = now();

  // Tombstone delete
  await db.dailyTasks.update(id, { deleted: true, updated_at: timestamp });

  await queueSync('daily_tasks', 'delete', id, { updated_at: timestamp });
  scheduleSyncPush();
}

export async function reorderDailyTask(id: string, newOrder: number): Promise<DailyTask | undefined> {
  const timestamp = now();

  await db.dailyTasks.update(id, { order: newOrder, updated_at: timestamp });

  const updated = await db.dailyTasks.get(id);
  if (!updated) return undefined;

  await queueSync('daily_tasks', 'update', id, { order: newOrder, updated_at: timestamp });
  scheduleSyncPush();

  return updated;
}

export async function clearCompletedDailyTasks(userId: string): Promise<void> {
  const timestamp = now();

  const tasks = await db.dailyTasks.where('user_id').equals(userId).toArray();
  const completedTasks = tasks.filter(t => t.completed && !t.deleted);

  for (const task of completedTasks) {
    await db.dailyTasks.update(task.id, { deleted: true, updated_at: timestamp });
    await queueSync('daily_tasks', 'delete', task.id, { updated_at: timestamp });
  }

  scheduleSyncPush();
}
