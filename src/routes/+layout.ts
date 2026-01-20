import { browser } from '$app/environment';
import { getSession } from '$lib/supabase/auth';
import { isOnline } from '$lib/stores/network';
import { startSyncEngine, performSync } from '$lib/sync/engine';
import type { LayoutLoad } from './$types';

export const ssr = true;
export const prerender = false;

// Initialize browser-only features once
if (browser) {
  // Initialize network status monitoring
  isOnline.init();

  // Register callback to sync when coming back online
  isOnline.onReconnect(() => {
    console.log('[App] Back online - triggering sync');
    performSync();
  });
}

export const load: LayoutLoad = async () => {
  if (browser) {
    const session = await getSession();

    // If user is logged in, start sync engine for background writes
    if (session) {
      startSyncEngine();
    }

    return { session };
  }
  return { session: null };
};
