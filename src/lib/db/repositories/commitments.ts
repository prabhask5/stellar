import { generateId, now } from '@prabhask5/stellar-engine/utils';
import {
  engineCreate,
  engineUpdate,
  engineDelete,
  engineQuery
} from '@prabhask5/stellar-engine/data';
import type { Commitment, CommitmentSection } from '$lib/types';

export async function createCommitment(
  name: string,
  section: CommitmentSection,
  userId: string
): Promise<Commitment> {
  const timestamp = now();

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

export async function updateCommitment(
  id: string,
  updates: Partial<Pick<Commitment, 'name' | 'section'>>
): Promise<Commitment | undefined> {
  const result = await engineUpdate('commitments', id, updates as Record<string, unknown>);
  return result as unknown as Commitment | undefined;
}

export async function deleteCommitment(id: string): Promise<void> {
  await engineDelete('commitments', id);
}

export async function reorderCommitment(
  id: string,
  newOrder: number
): Promise<Commitment | undefined> {
  const result = await engineUpdate('commitments', id, { order: newOrder });
  return result as unknown as Commitment | undefined;
}
