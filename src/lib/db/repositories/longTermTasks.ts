import { generateId, now } from '@prabhask5/stellar-engine/utils';
import {
  engineCreate,
  engineUpdate,
  engineDelete,
  engineGet
} from '@prabhask5/stellar-engine/data';
import type { LongTermTask } from '$lib/types';

export async function createLongTermTask(
  name: string,
  dueDate: string,
  categoryId: string | null,
  userId: string
): Promise<LongTermTask> {
  const timestamp = now();

  const result = await engineCreate('long_term_tasks', {
    id: generateId(),
    user_id: userId,
    name,
    due_date: dueDate,
    category_id: categoryId,
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
  const result = await engineUpdate('long_term_tasks', id, updates as Record<string, unknown>);
  return result as unknown as LongTermTask | undefined;
}

export async function toggleLongTermTaskComplete(id: string): Promise<LongTermTask | undefined> {
  const task = (await engineGet('long_term_tasks', id)) as unknown as LongTermTask | undefined;
  if (!task) return undefined;

  const newCompleted = !task.completed;
  const result = await engineUpdate('long_term_tasks', id, { completed: newCompleted });
  return result as unknown as LongTermTask | undefined;
}

export async function deleteLongTermTask(id: string): Promise<void> {
  await engineDelete('long_term_tasks', id);
}
