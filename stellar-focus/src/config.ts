/**
 * Extension Configuration
 *
 * Reads config from browser.storage.local instead of compiled config.local.ts.
 * Config is set via the options page (options/options.html).
 */

import browser from 'webextension-polyfill';

export interface StellarExtConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  appUrl: string;
}

const STORAGE_KEY = 'stellar_config';

// In-memory cache for the service worker's lifetime
let cachedConfig: StellarExtConfig | null = null;

/**
 * Get config from browser.storage.local (async)
 */
export async function getConfig(): Promise<StellarExtConfig | null> {
  if (cachedConfig) return cachedConfig;

  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY];
    if (stored && stored.supabaseUrl && stored.supabaseAnonKey && stored.appUrl) {
      cachedConfig = stored as StellarExtConfig;
      return cachedConfig;
    }
  } catch (e) {
    console.error('[Stellar Focus] Failed to read config:', e);
  }

  return null;
}

/**
 * Save config to browser.storage.local
 */
export async function setConfig(config: StellarExtConfig): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: config });
  cachedConfig = config;
}

/**
 * Check if the extension is configured
 */
export async function isConfigured(): Promise<boolean> {
  const config = await getConfig();
  return config !== null;
}

/**
 * Clear cached config
 */
export async function clearConfig(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEY);
  cachedConfig = null;
}

/**
 * Synchronous proxy for backward compatibility with existing code.
 * Returns placeholder values until getConfig() is called.
 * Use getConfig() for reliable access.
 */
export const config = new Proxy(
  {} as { supabaseUrl: string; supabaseAnonKey: string; appUrl: string },
  {
    get(_target, prop: string) {
      if (cachedConfig) {
        return (cachedConfig as Record<string, string>)[prop];
      }
      // Return empty strings as fallback — callers should use async getConfig() for reliability
      return '';
    }
  }
);
