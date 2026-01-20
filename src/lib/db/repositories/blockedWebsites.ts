import { db, generateId, now } from '../client';
import type { BlockedWebsite } from '$lib/types';
import { queueSync, queueSyncDirect } from '$lib/sync/queue';
import { scheduleSyncPush } from '$lib/sync/engine';

export async function getBlockedWebsites(blockListId: string): Promise<BlockedWebsite[]> {
  const websites = await db.blockedWebsites
    .where('block_list_id')
    .equals(blockListId)
    .toArray();

  return websites.filter(w => !w.deleted);
}

export async function getBlockedWebsite(id: string): Promise<BlockedWebsite | null> {
  const website = await db.blockedWebsites.get(id);
  if (!website || website.deleted) return null;
  return website;
}

export async function getAllBlockedDomains(userId: string): Promise<string[]> {
  // Get all enabled block lists for this user
  const blockLists = await db.blockLists
    .where('user_id')
    .equals(userId)
    .toArray();

  const enabledListIds = blockLists
    .filter(l => !l.deleted && l.is_enabled)
    .map(l => l.id);

  if (enabledListIds.length === 0) return [];

  // Get all websites from enabled lists
  const allWebsites = await db.blockedWebsites.toArray();

  const domains = allWebsites
    .filter(w => !w.deleted && enabledListIds.includes(w.block_list_id))
    .map(w => w.domain);

  // Return unique domains
  return [...new Set(domains)];
}

export async function createBlockedWebsite(
  blockListId: string,
  domain: string
): Promise<BlockedWebsite> {
  const timestamp = now();

  // Normalize domain (remove protocol, www, trailing slash)
  const normalizedDomain = normalizeDomain(domain);

  const newWebsite: BlockedWebsite = {
    id: generateId(),
    block_list_id: blockListId,
    domain: normalizedDomain,
    created_at: timestamp,
    updated_at: timestamp
  };

  await db.transaction('rw', [db.blockedWebsites, db.syncQueue], async () => {
    await db.blockedWebsites.add(newWebsite);
    await queueSyncDirect('blocked_websites', 'create', newWebsite.id, {
      block_list_id: blockListId,
      domain: normalizedDomain,
      created_at: timestamp,
      updated_at: timestamp
    });
  });
  scheduleSyncPush();

  return newWebsite;
}

export async function updateBlockedWebsite(
  id: string,
  domain: string
): Promise<BlockedWebsite | undefined> {
  const timestamp = now();
  const normalizedDomain = normalizeDomain(domain);

  await db.blockedWebsites.update(id, { domain: normalizedDomain, updated_at: timestamp });

  const updated = await db.blockedWebsites.get(id);
  if (!updated) return undefined;

  await queueSync('blocked_websites', 'update', id, { domain: normalizedDomain, updated_at: timestamp });
  scheduleSyncPush();

  return updated;
}

export async function deleteBlockedWebsite(id: string): Promise<void> {
  const timestamp = now();

  await db.transaction('rw', [db.blockedWebsites, db.syncQueue], async () => {
    await db.blockedWebsites.update(id, { deleted: true, updated_at: timestamp });
    await queueSyncDirect('blocked_websites', 'delete', id, { updated_at: timestamp });
  });

  scheduleSyncPush();
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

// Check if a URL matches any blocked domain
export function isDomainBlocked(url: string, blockedDomains: string[]): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');

    for (const blocked of blockedDomains) {
      // Exact match
      if (hostname === blocked) return true;

      // Subdomain match (e.g., mail.google.com matches google.com)
      if (hostname.endsWith('.' + blocked)) return true;
    }

    return false;
  } catch {
    return false;
  }
}
