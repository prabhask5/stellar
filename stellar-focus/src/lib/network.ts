/**
 * Network state detection for the extension
 * Determines if blocking should be active (only when online)
 */

import { getConfig } from '../config';

let isOnline = navigator.onLine;

// Listen for network changes
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true;
  });

  window.addEventListener('offline', () => {
    isOnline = false;
  });
}

export function getNetworkStatus(): boolean {
  return isOnline;
}

/**
 * Check if the extension can reach Supabase
 * More reliable than navigator.onLine for actual connectivity
 */
export async function checkConnectivity(supabaseUrl: string): Promise<boolean> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      mode: 'no-cors'
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the Supabase URL for connectivity checks (async)
 */
export async function getSupabaseUrl(): Promise<string> {
  const config = await getConfig();
  return config?.supabaseUrl || '';
}
