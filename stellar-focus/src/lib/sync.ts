/**
 * Block List Sync for Firefox Extension
 * Handles syncing block lists from Supabase when online
 */

import { getSupabase, getUser } from '../auth/supabase';
import { blockListsCache, blockedWebsitesCache, type CachedBlockList, type CachedBlockedWebsite } from './storage';
import { getNetworkStatus } from './network';

/**
 * Sync block lists from Supabase to local cache
 * Called when extension starts and periodically while online
 */
export async function syncBlockLists(): Promise<void> {
  if (!getNetworkStatus()) {
    console.log('[Sync] Offline - skipping sync');
    return;
  }

  try {
    const user = await getUser();
    if (!user) {
      console.log('[Sync] No user - skipping sync');
      return;
    }

    const supabase = getSupabase();

    // Fetch all block lists for user
    const { data: lists, error: listsError } = await supabase
      .from('block_lists')
      .select('*')
      .eq('user_id', user.id)
      .eq('deleted', false)
      .order('order', { ascending: true });

    if (listsError) {
      console.error('[Sync] Failed to fetch block lists:', listsError);
      return;
    }

    if (!lists) return;

    // Clear and update block lists cache
    await blockListsCache.clear();
    for (const list of lists) {
      await blockListsCache.put({
        id: list.id,
        user_id: list.user_id,
        name: list.name,
        is_enabled: list.is_enabled,
        order: list.order
      });
    }

    // Get IDs of enabled lists
    const enabledListIds = lists.filter(l => l.is_enabled).map(l => l.id);

    if (enabledListIds.length === 0) {
      await blockedWebsitesCache.clear();
      console.log('[Sync] No enabled block lists');
      return;
    }

    // Fetch blocked websites for enabled lists only
    const { data: websites, error: websitesError } = await supabase
      .from('blocked_websites')
      .select('*')
      .in('block_list_id', enabledListIds)
      .eq('deleted', false);

    if (websitesError) {
      console.error('[Sync] Failed to fetch blocked websites:', websitesError);
      return;
    }

    // Clear and update blocked websites cache
    await blockedWebsitesCache.clear();
    if (websites) {
      for (const website of websites) {
        await blockedWebsitesCache.put({
          id: website.id,
          block_list_id: website.block_list_id,
          domain: website.domain
        });
      }
    }

    console.log(`[Sync] Synced ${lists.length} block lists, ${websites?.length || 0} blocked domains`);
  } catch (error) {
    console.error('[Sync] Sync failed:', error);
  }
}

/**
 * Get all cached block lists
 */
export async function getCachedBlockLists(): Promise<CachedBlockList[]> {
  return blockListsCache.getAll();
}

/**
 * Get all cached blocked websites
 */
export async function getCachedBlockedWebsites(): Promise<CachedBlockedWebsite[]> {
  return blockedWebsitesCache.getAll();
}

/**
 * Check if a domain is blocked by any enabled block list
 */
export async function isDomainBlocked(hostname: string): Promise<boolean> {
  try {
    // Normalize hostname
    const normalizedHostname = hostname.toLowerCase().replace(/^www\./, '');

    // Get all cached blocked websites
    const websites = await blockedWebsitesCache.getAll();

    for (const website of websites) {
      const blockedDomain = website.domain.toLowerCase().replace(/^www\./, '');

      // Exact match
      if (normalizedHostname === blockedDomain) {
        return true;
      }

      // Subdomain match
      if (normalizedHostname.endsWith('.' + blockedDomain)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('[Sync] Domain check error:', error);
    return false;
  }
}
