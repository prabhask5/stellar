import { generateId, now } from '@prabhask5/stellar-engine/utils';
import {
  engineCreate,
  engineUpdate,
  engineQuery,
  engineGet,
  engineBatchWrite
} from '@prabhask5/stellar-engine/data';
import type { BlockList, DayOfWeek } from '$lib/types';

export async function getBlockLists(userId: string): Promise<BlockList[]> {
  const lists = (await engineQuery('block_lists', 'user_id', userId)) as unknown as BlockList[];

  return lists.filter((l) => !l.deleted).sort((a, b) => a.order - b.order);
}

export async function getBlockList(id: string): Promise<BlockList | null> {
  const list = (await engineGet('block_lists', id)) as unknown as BlockList | null;
  if (!list || list.deleted) return null;
  return list;
}

export async function createBlockList(
  name: string,
  userId: string,
  activeDays: DayOfWeek[] | null = null
): Promise<BlockList> {
  const timestamp = now();

  // Get the current min order to prepend new items at the top
  const existingLists = (await engineQuery(
    'block_lists',
    'user_id',
    userId
  )) as unknown as BlockList[];

  const activeLists = existingLists.filter((l) => !l.deleted);
  const minOrder = activeLists.length > 0 ? Math.min(...activeLists.map((l) => l.order)) : 0;
  const nextOrder = minOrder - 1;

  const newList: BlockList = {
    id: generateId(),
    user_id: userId,
    name,
    active_days: activeDays,
    is_enabled: true,
    order: nextOrder,
    created_at: timestamp,
    updated_at: timestamp
  };

  await engineCreate('block_lists', newList as unknown as Record<string, unknown>);

  return newList;
}

export async function updateBlockList(
  id: string,
  updates: Partial<Pick<BlockList, 'name' | 'active_days' | 'is_enabled'>>
): Promise<BlockList | undefined> {
  const result = await engineUpdate('block_lists', id, updates as Record<string, unknown>);
  return result as unknown as BlockList | undefined;
}

export async function toggleBlockList(id: string): Promise<BlockList | undefined> {
  const list = (await engineGet('block_lists', id)) as unknown as BlockList | null;
  if (!list) return undefined;

  return updateBlockList(id, { is_enabled: !list.is_enabled });
}

export async function deleteBlockList(id: string): Promise<void> {
  // Get all blocked websites for this list to soft delete them
  const websites = (await engineQuery(
    'blocked_websites',
    'block_list_id',
    id
  )) as unknown as Array<{ id: string }>;

  const ops: Array<{ type: 'delete'; table: string; id: string }> = [];

  // Delete all websites in this list
  for (const website of websites) {
    ops.push({ type: 'delete', table: 'blocked_websites', id: website.id });
  }

  // Delete the list itself
  ops.push({ type: 'delete', table: 'block_lists', id });

  await engineBatchWrite(ops);
}

export async function reorderBlockList(
  id: string,
  newOrder: number
): Promise<BlockList | undefined> {
  const result = await engineUpdate('block_lists', id, { order: newOrder });
  return result as unknown as BlockList | undefined;
}
