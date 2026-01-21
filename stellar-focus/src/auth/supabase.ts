/**
 * Supabase client for the browser extension
 * Uses the same project as the main Stellar app
 */

import browser from 'webextension-polyfill';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
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
  }
  return supabaseInstance;
}

export async function getSession() {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

export async function getUser() {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}
