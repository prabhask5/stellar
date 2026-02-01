import { generateId, now } from '@prabhask5/stellar-engine/utils';
import {
  engineCreate,
  engineUpdate,
  engineDelete,
  engineQuery
} from '@prabhask5/stellar-engine/data';
import type { BlockedWebsite } from '$lib/types';

export async function getBlockedWebsites(blockListId: string): Promise<BlockedWebsite[]> {
  const websites = (await engineQuery(
    'blocked_websites',
    'block_list_id',
    blockListId
  )) as unknown as BlockedWebsite[];

  return websites.filter((w) => !w.deleted);
}

export async function createBlockedWebsite(
  blockListId: string,
  domain: string
): Promise<BlockedWebsite> {
  const timestamp = now();

  // Normalize domain (remove protocol, www, trailing slash)
  const normalizedDomain = normalizeDomain(domain);

  const result = await engineCreate('blocked_websites', {
    id: generateId(),
    block_list_id: blockListId,
    domain: normalizedDomain,
    created_at: timestamp,
    updated_at: timestamp
  });

  return result as unknown as BlockedWebsite;
}

export async function updateBlockedWebsite(
  id: string,
  domain: string
): Promise<BlockedWebsite | undefined> {
  const normalizedDomain = normalizeDomain(domain);

  const result = await engineUpdate('blocked_websites', id, { domain: normalizedDomain });
  return result as unknown as BlockedWebsite | undefined;
}

export async function deleteBlockedWebsite(id: string): Promise<void> {
  await engineDelete('blocked_websites', id);
}

// Helper function to normalize domains
function normalizeDomain(input: string): string {
  let domain = input.trim().toLowerCase();

  // Remove protocol
  domain = domain.replace(/^https?:\/\//, '');

  // Remove www.
  domain = domain.replace(/^www\./, '');

  // Remove trailing slash and path
  domain = domain.split('/')[0];

  // Remove port
  domain = domain.split(':')[0];

  return domain;
}
