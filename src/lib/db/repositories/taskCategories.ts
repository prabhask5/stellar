import { generateId, now } from '@prabhask5/stellar-engine/utils';
import {
  engineCreate,
  engineUpdate,
  engineQuery,
  engineBatchWrite
} from '@prabhask5/stellar-engine/data';
import type { BatchOperation } from '@prabhask5/stellar-engine/types';
import type { TaskCategory } from '$lib/types';

export async function createTaskCategory(
  name: string,
  color: string,
  userId: string
): Promise<TaskCategory> {
  const timestamp = now();

  // Get the lowest order to insert at the top
  const existing = (await engineQuery(
    'task_categories',
    'user_id',
    userId
  )) as unknown as TaskCategory[];
  const minOrder = existing.length > 0 ? Math.min(...existing.map((c) => c.order)) - 1 : 0;

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

export async function updateTaskCategory(
  id: string,
  updates: Partial<Pick<TaskCategory, 'name' | 'color'>>
): Promise<TaskCategory | undefined> {
  const result = await engineUpdate('task_categories', id, updates as Record<string, unknown>);
  return result as unknown as TaskCategory | undefined;
}

export async function deleteTaskCategory(id: string): Promise<void> {
  // Get tasks that reference this category to unlink them
  const tasks = (await engineQuery('long_term_agenda', 'category_id', id)) as unknown as Array<{
    id: string;
  }>;

  const ops: BatchOperation[] = [];

  // Delete the category
  ops.push({ type: 'delete', table: 'task_categories', id });

  // Unlink long_term_agenda items that reference this category
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

export async function reorderTaskCategory(
  id: string,
  newOrder: number
): Promise<TaskCategory | undefined> {
  const result = await engineUpdate('task_categories', id, { order: newOrder });
  return result as unknown as TaskCategory | undefined;
}
