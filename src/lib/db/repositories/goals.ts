import { generateId, now } from '@prabhask5/stellar-engine/utils';
import {
  engineCreate,
  engineUpdate,
  engineDelete,
  engineQuery,
  engineGet,
  engineIncrement
} from '@prabhask5/stellar-engine/data';
import type { Goal, GoalType } from '$lib/types';

export async function createGoal(
  goalListId: string,
  name: string,
  type: GoalType,
  targetValue: number | null
): Promise<Goal> {
  const timestamp = now();

  // Get the current min order to prepend new items at the top
  // This is backwards-compatible: existing items (order 0,1,2...) stay in place,
  // new items get -1,-2,-3... and appear first when sorted ascending
  const existingGoals = (await engineQuery(
    'goals',
    'goal_list_id',
    goalListId
  )) as unknown as Goal[];

  const activeGoals = existingGoals.filter((g) => !g.deleted);
  const minOrder = activeGoals.length > 0 ? Math.min(...activeGoals.map((g) => g.order)) : 0;
  const nextOrder = minOrder - 1;

  const newGoal: Goal = {
    id: generateId(),
    goal_list_id: goalListId,
    name,
    type,
    target_value: type === 'incremental' ? targetValue : null,
    current_value: 0,
    completed: false,
    order: nextOrder,
    created_at: timestamp,
    updated_at: timestamp
  };

  await engineCreate('goals', newGoal as unknown as Record<string, unknown>);

  return newGoal;
}

export async function updateGoal(
  id: string,
  updates: Partial<Pick<Goal, 'name' | 'type' | 'completed' | 'current_value' | 'target_value'>>
): Promise<Goal | undefined> {
  const result = await engineUpdate('goals', id, updates as Record<string, unknown>);
  return result as unknown as Goal | undefined;
}

export async function deleteGoal(id: string): Promise<void> {
  await engineDelete('goals', id);
}

export async function incrementGoal(id: string, amount: number = 1): Promise<Goal | undefined> {
  const goal = (await engineGet('goals', id)) as unknown as Goal | null;
  if (!goal) return undefined;

  const newValue = goal.current_value + amount;
  const completed = goal.target_value ? newValue >= goal.target_value : false;

  const result = await engineIncrement('goals', id, 'current_value', amount, { completed });
  return result as unknown as Goal | undefined;
}

export async function reorderGoal(id: string, newOrder: number): Promise<Goal | undefined> {
  const result = await engineUpdate('goals', id, { order: newOrder });
  return result as unknown as Goal | undefined;
}
