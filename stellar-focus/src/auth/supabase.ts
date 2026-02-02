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
    realtime: {
      // Shorter heartbeat interval (15s vs default 30s) to keep the WebSocket
      // alive and signal activity to Firefox's event page lifecycle.
      // Heartbeats are WebSocket pings — no Supabase API/egress cost.
      heartbeatIntervalMs: 15000,
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

/**
 * Pad a PIN to meet Supabase's minimum password length.
 * Must match the engine's padPin() implementation.
 */
function padPin(pin: string): string {
  return `${pin}_stellar`;
}

/**
 * Sign in with email + PIN (real Supabase email/password auth).
 * The same user as the main app — same auth.uid(), same RLS access.
 */
export async function signInWithCredentials(
  email: string,
  pin: string
): Promise<{ session: Awaited<ReturnType<typeof getSession>>; error: string | null }> {
  const supabase = await getSupabase();

  // Check for existing valid session first
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session) {
    return { session: sessionData.session, error: null };
  }

  // Sign in with real credentials
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: padPin(pin),
  });

  if (error) {
    return { session: null, error: error.message };
  }

  return { session: data.session, error: null };
}

/**
 * Sign out of Supabase
 */
export async function signOut(): Promise<void> {
  const supabase = await getSupabase();
  await supabase.auth.signOut();
}
