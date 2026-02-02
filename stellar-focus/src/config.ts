/**
 * Extension Configuration
 *
 * Reads config from browser.storage.local instead of compiled config.local.ts.
 * Config is set via the options page (options/options.html).
 */

import browser from 'webextension-polyfill';
import { debugError } from './lib/debug';

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
    debugError('[Stellar Focus] Failed to read config:', e);
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
        return (cachedConfig as unknown as Record<string, string>)[prop];
      }
      // Return empty strings as fallback — callers should use async getConfig() for reliability
      return '';
    }
  }
);

// ============================================================
// Gate Config (PIN-based auth for extension)
// ============================================================

const GATE_CONFIG_KEY = 'stellar_gate_config';
const UNLOCKED_KEY = 'stellar_unlocked';

export interface GateConfig {
  gateType: 'code' | 'password';
  codeLength?: number;
  email: string;
  profile: Record<string, unknown>;
}

/**
 * Get cached gate config from browser.storage.local
 */
export async function getGateConfig(): Promise<GateConfig | null> {
  try {
    const result = await browser.storage.local.get(GATE_CONFIG_KEY);
    const stored = result[GATE_CONFIG_KEY];
    if (stored && stored.email) {
      return stored as GateConfig;
    }
  } catch (e) {
    debugError('[Stellar Focus] Failed to read gate config:', e);
  }
  return null;
}

/**
 * Save gate config to browser.storage.local
 */
export async function setGateConfig(config: GateConfig): Promise<void> {
  await browser.storage.local.set({ [GATE_CONFIG_KEY]: config });
}

/**
 * Clear cached gate config
 */
export async function clearGateConfig(): Promise<void> {
  await browser.storage.local.remove(GATE_CONFIG_KEY);
}

/**
 * Check if the extension is unlocked
 */
export async function isUnlocked(): Promise<boolean> {
  try {
    const result = await browser.storage.local.get(UNLOCKED_KEY);
    return result[UNLOCKED_KEY] === true;
  } catch {
    return false;
  }
}

/**
 * Set the unlocked state
 */
export async function setUnlocked(value: boolean): Promise<void> {
  await browser.storage.local.set({ [UNLOCKED_KEY]: value });
}
