import { db, generateId, now } from '../client';
import type { LongTermTask } from '$lib/types';
import { queueSync } from '$lib/sync/queue';
import { scheduleSyncPush } from '$lib/sync/engine';

export async function createLongTermTask(
  name: string,
  dueDate: string,
  categoryId: string | null,
  userId: string
): Promise<LongTermTask> {
  const timestamp = now();

  const newTask: LongTermTask = {
    id: generateId(),
    user_id: userId,
    name,
    due_date: dueDate,
    category_id: categoryId,
    completed: false,
    created_at: timestamp,
    updated_at: timestamp
  };

  await db.longTermTasks.add(newTask);

  await queueSync('long_term_tasks', 'create', newTask.id, {
    name,
    due_date: dueDate,
    category_id: categoryId,
    completed: false,
    user_id: userId,
    created_at: timestamp,
    updated_at: timestamp
  });
  scheduleSyncPush();

  return newTask;
}

export async function updateLongTermTask(
  id: string,
  updates: Partial<Pick<LongTermTask, 'name' | 'due_date' | 'category_id' | 'completed'>>
): Promise<LongTermTask | undefined> {
  const timestamp = now();

  await db.longTermTasks.update(id, { ...updates, updated_at: timestamp });

  const updated = await db.longTermTasks.get(id);
  if (!updated) return undefined;

  await queueSync('long_term_tasks', 'update', id, { ...updates, updated_at: timestamp });
  scheduleSyncPush();

  return updated;
}

export async function toggleLongTermTaskComplete(id: string): Promise<LongTermTask | undefined> {
  const task = await db.longTermTasks.get(id);
  if (!task) return undefined;

  const timestamp = now();
  const newCompleted = !task.completed;

  await db.longTermTasks.update(id, { completed: newCompleted, updated_at: timestamp });

  const updated = await db.longTermTasks.get(id);
  if (!updated) return undefined;

  await queueSync('long_term_tasks', 'update', id, { completed: newCompleted, updated_at: timestamp });
  scheduleSyncPush();

  return updated;
}

export async function deleteLongTermTask(id: string): Promise<void> {
  const timestamp = now();

  // Tombstone delete
  await db.longTermTasks.update(id, { deleted: true, updated_at: timestamp });

  await queueSync('long_term_tasks', 'delete', id, { updated_at: timestamp });
  scheduleSyncPush();
}
