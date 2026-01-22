import { db, generateId, now } from '../client';
import type { Goal, GoalType } from '$lib/types';
import { queueSyncDirect, queueIncrement } from '$lib/sync/queue';
import { scheduleSyncPush } from '$lib/sync/engine';
import { notifyLocalWrite } from '$lib/sync/tabCoordinator';

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
  const existingGoals = await db.goals
    .where('goal_list_id')
    .equals(goalListId)
    .toArray();

  const activeGoals = existingGoals.filter(g => !g.deleted);
  const minOrder = activeGoals.length > 0
    ? Math.min(...activeGoals.map(g => g.order))
    : 0;
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

  // Use transaction to ensure atomicity of local write + queue operation
  await db.transaction('rw', [db.goals, db.syncQueue], async () => {
    await db.goals.add(newGoal);
    await queueSyncDirect('goals', 'create', newGoal.id, {
      goal_list_id: goalListId,
      name,
      type,
      target_value: newGoal.target_value,
      current_value: 0,
      completed: false,
      order: nextOrder,
      created_at: timestamp,
      updated_at: timestamp
    });
  });
  scheduleSyncPush();

  return newGoal;
}

export async function updateGoal(
  id: string,
  updates: Partial<Pick<Goal, 'name' | 'type' | 'completed' | 'current_value' | 'target_value'>>
): Promise<Goal | undefined> {
  const timestamp = now();

  // Use transaction to ensure atomicity - prevents sync pull from overwriting during the gap
  let updated: Goal | undefined;
  await db.transaction('rw', [db.goals, db.syncQueue], async () => {
    await db.goals.update(id, { ...updates, updated_at: timestamp });
    updated = await db.goals.get(id);
    if (updated) {
      await queueSyncDirect('goals', 'update', id, { ...updates, updated_at: timestamp });
    }
  });

  if (updated) {
    scheduleSyncPush();
  }

  return updated;
}

export async function deleteGoal(id: string): Promise<void> {
  const timestamp = now();

  // Use transaction to ensure atomicity of delete + queue operation
  await db.transaction('rw', [db.goals, db.syncQueue], async () => {
    // Tombstone delete: mark as deleted instead of actually deleting
    await db.goals.update(id, { deleted: true, updated_at: timestamp });
    await queueSyncDirect('goals', 'delete', id, { updated_at: timestamp });
  });

  scheduleSyncPush();
}

export async function incrementGoal(id: string, amount: number = 1): Promise<Goal | undefined> {
  const goal = await db.goals.get(id);
  if (!goal) return undefined;

  const timestamp = now();
  const newValue = goal.current_value + amount;
  const completed = goal.target_value ? newValue >= goal.target_value : false;
  const baseVersion = goal.updated_at;

  // Use transaction to ensure atomicity - prevents sync pull from overwriting during rapid clicks
  let updated: Goal | undefined;
  await db.transaction('rw', [db.goals, db.syncQueue], async () => {
    await db.goals.update(id, { current_value: newValue, completed, updated_at: timestamp });
    updated = await db.goals.get(id);
    if (updated) {
      // Use increment operation for proper multi-device conflict resolution
      // The delta will be summed server-side, enabling true merge of concurrent increments
      await queueIncrement('goals', id, 'current_value', amount, baseVersion, { completed });
    }
  });

  if (updated) {
    scheduleSyncPush();
    notifyLocalWrite('goals', id);
  }

  return updated;
}

export async function reorderGoal(id: string, newOrder: number): Promise<Goal | undefined> {
  const timestamp = now();

  // Use transaction to ensure atomicity
  let updated: Goal | undefined;
  await db.transaction('rw', [db.goals, db.syncQueue], async () => {
    await db.goals.update(id, { order: newOrder, updated_at: timestamp });
    updated = await db.goals.get(id);
    if (updated) {
      await queueSyncDirect('goals', 'update', id, { order: newOrder, updated_at: timestamp });
    }
  });

  if (updated) {
    scheduleSyncPush();
  }

  return updated;
}

