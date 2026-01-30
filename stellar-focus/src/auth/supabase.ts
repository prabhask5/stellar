/**
 * Supabase client for the browser extension
 * Uses async config from browser.storage.local
 */

import browser from 'webextension-polyfill';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from '../config';

let supabaseInstance: SupabaseClient | null = null;

export async function getSupabase(): Promise<SupabaseClient> {
  if (supabaseInstance) return supabaseInstance;

  const config = await getConfig();
  if (!config) {
    throw new Error('Extension not configured. Please set up your Stellar instance in the options page.');
  }

  supabaseInstance = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      storage: {
        // Use browser.storage.local for extension
        getItem: async (key: string) => {
          const result = await browser.storage.local.get(key);
          return result[key] || null;
        },
        setItem: async (key: string, value: string) => {
          await browser.storage.local.set({ [key]: value });
        },
        removeItem: async (key: string) => {
          await browser.storage.local.remove(key);
        },
      },
    },
  });

  return supabaseInstance;
}

/**
 * Reset the Supabase client (for config updates)
 */
export function resetSupabase(): void {
  supabaseInstance = null;
}

export async function getSession() {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

export async function getUser() {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}
