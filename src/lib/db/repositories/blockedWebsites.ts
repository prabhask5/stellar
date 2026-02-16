/**
 * @fileoverview Repository for **blocked website** entities.
 *
 * A blocked website is a single domain entry that belongs to a
 * {@link BlockList}.  This module provides CRUD operations against the
 * `blocked_websites` table, including domain normalization on create/update
 * to ensure consistent matching regardless of how the user types the URL.
 *
 * Table: `blocked_websites`
 * Parent: `block_lists` (via `block_list_id`)
 *
 * @module repositories/blockedWebsites
 */

import { generateId, now } from 'stellar-drive/utils';
import { engineCreate, engineUpdate, engineDelete, queryByIndex } from 'stellar-drive/data';
import type { BlockedWebsite } from '$lib/types';

// =============================================================================
//                             Read Operations
// =============================================================================

/**
 * Fetches all non-deleted blocked websites belonging to a specific block list.
 *
 * @param blockListId - The parent {@link BlockList}'s unique identifier
 * @returns An array of active {@link BlockedWebsite} entries
 */
export async function getBlockedWebsites(blockListId: string): Promise<BlockedWebsite[]> {
  return queryByIndex<BlockedWebsite & Record<string, unknown>>(
    'blocked_websites',
    'block_list_id',
    blockListId
  ) as Promise<BlockedWebsite[]>;
}

// =============================================================================
//                            Write Operations
// =============================================================================

/**
 * Creates a new blocked website entry within a block list.
 *
 * The raw `domain` string is passed through {@link normalizeDomain} before
 * storage to strip protocols, `www.` prefixes, paths, and ports.
 *
 * @param blockListId - The parent block list's ID
 * @param domain      - The raw domain string entered by the user
 * @returns The newly created {@link BlockedWebsite} record
 */
export async function createBlockedWebsite(
  blockListId: string,
  domain: string
): Promise<BlockedWebsite> {
  const timestamp = now();

  /* ── Normalize before persisting ──── */
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

/**
 * Updates the domain of an existing blocked website entry.
 *
 * @param id     - The blocked website's unique identifier
 * @param domain - The new raw domain string (will be normalized)
 * @returns The updated {@link BlockedWebsite}, or `undefined` if not found
 */
export async function updateBlockedWebsite(
  id: string,
  domain: string
): Promise<BlockedWebsite | undefined> {
  const normalizedDomain = normalizeDomain(domain);

  const result = await engineUpdate('blocked_websites', id, { domain: normalizedDomain });
  return result as unknown as BlockedWebsite | undefined;
}

/**
 * Soft-deletes a blocked website entry.
 *
 * @param id - The blocked website's unique identifier
 */
export async function deleteBlockedWebsite(id: string): Promise<void> {
  await engineDelete('blocked_websites', id);
}

// =============================================================================
//                              Helpers
// =============================================================================

/**
 * Normalizes a user-supplied domain string to a bare hostname.
 *
 * Transformations applied (in order):
 *   1. Trim whitespace and lowercase
 *   2. Strip `http://` or `https://` protocol prefix
 *   3. Strip leading `www.`
 *   4. Remove any path segments after the first `/`
 *   5. Remove any port number after `:`
 *
 * @param input - The raw URL or domain string
 * @returns A clean, lowercase hostname (e.g. `"example.com"`)
 */
function normalizeDomain(input: string): string {
  let domain = input.trim().toLowerCase();

  /* ── Strip protocol ──── */
  domain = domain.replace(/^https?:\/\//, '');

  /* ── Strip www. prefix ──── */
  domain = domain.replace(/^www\./, '');

  /* ── Remove path and query string ──── */
  domain = domain.split('/')[0];

  /* ── Remove port number ──── */
  domain = domain.split(':')[0];

  return domain;
}
