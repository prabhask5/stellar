import { generateId, now } from '@prabhask5/stellar-engine/utils';
import {
  engineCreate,
  engineUpdate,
  engineQuery,
  engineGet,
  engineBatchWrite
} from '@prabhask5/stellar-engine/data';
import type { BatchOperation } from '@prabhask5/stellar-engine/types';
import type { GoalList, Goal } from '$lib/types';

async function getNextGoalListOrder(userId: string): Promise<number> {
  const existing = (await engineQuery('goal_lists', 'user_id', userId)) as unknown as GoalList[];
  const active = existing.filter((l) => !l.deleted);
  if (active.length === 0) return 0;
  return Math.min(...active.map((l) => l.order ?? 0)) - 1;
}

export async function createGoalList(name: string, userId: string): Promise<GoalList> {
  const timestamp = now();
  const order = await getNextGoalListOrder(userId);
  const newList: GoalList = {
    id: generateId(),
    user_id: userId,
    name,
    order,
    created_at: timestamp,
    updated_at: timestamp
  };

  await engineCreate('goal_lists', newList as unknown as Record<string, unknown>);

  return newList;
}

export async function updateGoalList(id: string, name: string): Promise<GoalList | undefined> {
  // Get the goal list first to check if it belongs to a project
  const goalList = (await engineGet('goal_lists', id)) as unknown as GoalList | null;
  if (!goalList) return undefined;

  if (goalList.project_id) {
    // Cascade name change to project, tag, and commitment
    const project = (await engineGet('projects', goalList.project_id)) as Record<
      string,
      unknown
    > | null;
    if (project) {
      const ops: BatchOperation[] = [
        { type: 'update', table: 'goal_lists', id, fields: { name } },
        { type: 'update', table: 'projects', id: project.id as string, fields: { name } }
      ];

      if (project.tag_id) {
        ops.push({
          type: 'update',
          table: 'task_categories',
          id: project.tag_id as string,
          fields: { name }
        });
      }
      if (project.commitment_id) {
        ops.push({
          type: 'update',
          table: 'commitments',
          id: project.commitment_id as string,
          fields: { name }
        });
      }

      await engineBatchWrite(ops);

      // Read back the updated goal list
      const updated = (await engineGet('goal_lists', id)) as unknown as GoalList | null;
      return updated ?? undefined;
    }
  }

  // No project cascade needed, simple update
  const result = await engineUpdate('goal_lists', id, { name });
  return result as unknown as GoalList | undefined;
}

export async function reorderGoalList(id: string, newOrder: number): Promise<GoalList | undefined> {
  const result = await engineUpdate('goal_lists', id, { order: newOrder });
  return result as unknown as GoalList | undefined;
}

export async function deleteGoalList(id: string): Promise<void> {
  // Get goals first to cascade delete
  const goals = (await engineQuery('goals', 'goal_list_id', id)) as unknown as Goal[];

  const ops: Array<{ type: 'delete'; table: string; id: string }> = [];

  // Delete all goals in this list
  for (const goal of goals) {
    ops.push({ type: 'delete', table: 'goals', id: goal.id });
  }

  // Delete the list itself
  ops.push({ type: 'delete', table: 'goal_lists', id });

  await engineBatchWrite(ops);
}
