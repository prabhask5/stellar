/**
 * @fileoverview Repository for **block list** entities.
 *
 * A block list is a named collection of {@link BlockedWebsite} entries that
 * can be toggled on/off and optionally restricted to specific days of the
 * week.  This module provides full CRUD plus toggle and reorder operations
 * against the `block_lists` table.
 *
 * Cascade behaviour: deleting a block list also soft-deletes all child
 * `blocked_websites` entries via a batch write.
 *
 * Table: `block_lists`
 * Children: `blocked_websites` (via `block_list_id`)
 *
 * @module repositories/blockLists
 */

import { generateId, now } from '@prabhask5/stellar-engine/utils';
import {
  engineCreate,
  engineUpdate,
  engineQuery,
  engineGet,
  engineBatchWrite,
  reorderEntity,
  prependOrder,
  queryOne
} from '@prabhask5/stellar-engine/data';
import type { BlockList, DayOfWeek } from '$lib/types';

// =============================================================================
//                             Read Operations
// =============================================================================

/**
 * Fetches all non-deleted block lists for a user, sorted by `order`.
 *
 * @param userId - The owning user's identifier
 * @returns An array of active {@link BlockList} entries sorted ascending
 */
export async function getBlockLists(userId: string): Promise<BlockList[]> {
  const lists = (await engineQuery('block_lists', 'user_id', userId)) as unknown as BlockList[];

  return lists.filter((l) => !l.deleted).sort((a, b) => a.order - b.order);
}

/**
 * Fetches a single block list by ID.
 *
 * @param id - The block list's unique identifier
 * @returns The {@link BlockList}, or `null` if not found / deleted
 */
export async function getBlockList(id: string): Promise<BlockList | null> {
  return queryOne<BlockList & Record<string, unknown>>(
    'block_lists',
    id
  ) as Promise<BlockList | null>;
}

// =============================================================================
//                            Write Operations
// =============================================================================

/**
 * Creates a new block list, prepended at the top of the user's list.
 *
 * New items receive an `order` value one less than the current minimum,
 * so they appear first when sorted ascending — existing items keep their
 * original positions.
 *
 * @param name       - Display name for the block list
 * @param userId     - The owning user's identifier
 * @param activeDays - Optional day-of-week restriction (`null` → all days)
 * @returns The newly created {@link BlockList}
 */
export async function createBlockList(
  name: string,
  userId: string,
  activeDays: DayOfWeek[] | null = null
): Promise<BlockList> {
  const timestamp = now();

  /* ── Compute prepend order (min - 1) ──── */
  const nextOrder = await prependOrder('block_lists', 'user_id', userId);

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

/**
 * Updates mutable fields on a block list (name, active days, enabled state).
 *
 * @param id      - The block list's unique identifier
 * @param updates - A partial object of allowed fields to update
 * @returns The updated {@link BlockList}, or `undefined` if not found
 */
export async function updateBlockList(
  id: string,
  updates: Partial<Pick<BlockList, 'name' | 'active_days' | 'is_enabled'>>
): Promise<BlockList | undefined> {
  const result = await engineUpdate('block_lists', id, updates as Record<string, unknown>);
  return result as unknown as BlockList | undefined;
}

/**
 * Toggles a block list's `is_enabled` flag.
 *
 * Reads the current state, flips it, and delegates to {@link updateBlockList}.
 *
 * @param id - The block list's unique identifier
 * @returns The updated {@link BlockList}, or `undefined` if not found
 */
export async function toggleBlockList(id: string): Promise<BlockList | undefined> {
  const list = (await engineGet('block_lists', id)) as unknown as BlockList | null;
  if (!list) return undefined;

  return updateBlockList(id, { is_enabled: !list.is_enabled });
}

/**
 * Deletes a block list **and** all its child blocked websites atomically.
 *
 * Uses {@link engineBatchWrite} to ensure the list and its websites are
 * soft-deleted together in a single transaction.
 *
 * @param id - The block list's unique identifier
 */
export async function deleteBlockList(id: string): Promise<void> {
  /* ── Gather child websites for cascade delete ──── */
  const websites = (await engineQuery(
    'blocked_websites',
    'block_list_id',
    id
  )) as unknown as Array<{ id: string }>;

  const ops: Array<{ type: 'delete'; table: string; id: string }> = [];

  /* ── Delete all websites in this list ──── */
  for (const website of websites) {
    ops.push({ type: 'delete', table: 'blocked_websites', id: website.id });
  }

  /* ── Delete the list itself ──── */
  ops.push({ type: 'delete', table: 'block_lists', id });

  await engineBatchWrite(ops);
}

// =============================================================================
//                            Reorder Operations
// =============================================================================

/**
 * Updates the display order of a block list.
 *
 * @param id       - The block list's unique identifier
 * @param newOrder - The new ordinal position
 * @returns The updated {@link BlockList}, or `undefined` if not found
 */
export async function reorderBlockList(
  id: string,
  newOrder: number
): Promise<BlockList | undefined> {
  return reorderEntity('block_lists', id, newOrder) as Promise<BlockList | undefined>;
}
