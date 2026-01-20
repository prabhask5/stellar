/**
 * Network state detection for the extension
 * Determines if blocking should be active (only when online)
 */

import { config } from '../config';

let isOnline = navigator.onLine;
let listeners: Array<(online: boolean) => void> = [];

// Listen for network changes
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true;
    notifyListeners();
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    notifyListeners();
  });
}

function notifyListeners() {
  listeners.forEach(fn => fn(isOnline));
}

export function getNetworkStatus(): boolean {
  return isOnline;
}

export function onNetworkChange(callback: (online: boolean) => void): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter(fn => fn !== callback);
  };
}

/**
 * Check if the extension can reach Supabase
 * More reliable than navigator.onLine for actual connectivity
 */
export async function checkConnectivity(supabaseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      mode: 'no-cors'
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the Supabase URL for connectivity checks
 * This should match your main app's Supabase URL
 */
export function getSupabaseUrl(): string {
  return config.supabaseUrl;
}
