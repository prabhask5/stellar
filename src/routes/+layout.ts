import { browser } from '$app/environment';
import { getSession } from '$lib/supabase/auth';
import type { LayoutLoad } from './$types';

export const ssr = true;
export const prerender = false;

// Register service worker
if (browser) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }
}

export const load: LayoutLoad = async () => {
  if (browser) {
    const session = await getSession();
    return { session };
  }
  return { session: null };
};
