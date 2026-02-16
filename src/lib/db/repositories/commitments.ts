/**
 * @fileoverview Repository for **commitment** entities.
 *
 * Commitments represent pledges or areas of focus organized into sections
 * (e.g. `"projects"`, `"personal"`).  This module provides CRUD and reorder
 * operations against the `commitments` table.
 *
 * New commitments are prepended within their section by assigning an `order`
 * value one less than the current minimum for that section.
 *
 * Table: `commitments`
 *
 * @module repositories/commitments
 */

import { generateId, now } from 'stellar-drive/utils';
import {
  engineCreate,
  engineUpdate,
  engineDelete,
  engineQuery,
  reorderEntity
} from 'stellar-drive/data';
import type { Commitment, CommitmentSection } from '$lib/types';

// =============================================================================
//                            Write Operations
// =============================================================================

/**
 * Creates a new commitment, prepended at the top of its section.
 *
 * The `order` is computed as `min(section orders) - 1` so that the new item
 * appears first when sorted ascending, while existing items retain their
 * positions.
 *
 * @param name    - Display name for the commitment
 * @param section - The {@link CommitmentSection} the commitment belongs to
 * @param userId  - The owning user's identifier
 * @returns The newly created {@link Commitment}
 */
export async function createCommitment(
  name: string,
  section: CommitmentSection,
  userId: string
): Promise<Commitment> {
  const timestamp = now();

  /* ── Compute prepend order within the target section ──── */
  const existing = (await engineQuery('commitments', 'user_id', userId)) as unknown as Commitment[];
  const sectionItems = existing.filter((c) => c.section === section && !c.deleted);
  const minOrder = sectionItems.length > 0 ? Math.min(...sectionItems.map((c) => c.order)) - 1 : 0;

  const result = await engineCreate('commitments', {
    id: generateId(),
    user_id: userId,
    name,
    section,
    order: minOrder,
    created_at: timestamp,
    updated_at: timestamp
  });

  return result as unknown as Commitment;
}

/**
 * Updates mutable fields on a commitment (name and/or section).
 *
 * @param id      - The commitment's unique identifier
 * @param updates - A partial object of allowed fields to update
 * @returns The updated {@link Commitment}, or `undefined` if not found
 */
export async function updateCommitment(
  id: string,
  updates: Partial<Pick<Commitment, 'name' | 'section'>>
): Promise<Commitment | undefined> {
  const result = await engineUpdate('commitments', id, updates as Record<string, unknown>);
  return result as unknown as Commitment | undefined;
}

/**
 * Soft-deletes a commitment.
 *
 * @param id - The commitment's unique identifier
 */
export async function deleteCommitment(id: string): Promise<void> {
  await engineDelete('commitments', id);
}

// =============================================================================
//                            Reorder Operations
// =============================================================================

/**
 * Updates the display order of a commitment.
 *
 * @param id       - The commitment's unique identifier
 * @param newOrder - The new ordinal position
 * @returns The updated {@link Commitment}, or `undefined` if not found
 */
export async function reorderCommitment(
  id: string,
  newOrder: number
): Promise<Commitment | undefined> {
  return reorderEntity('commitments', id, newOrder) as Promise<Commitment | undefined>;
}
