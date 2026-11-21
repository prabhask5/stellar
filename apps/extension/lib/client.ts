import type { Database, FocusSettings, FocusState } from "@stellar/db";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConnection, KEYS, supabaseStorage } from "./storage.ts";
import type { BlockingInfo, Connection, Snapshot } from "./types.ts";

export type Db = SupabaseClient<Database>;

let cached: { key: string; db: Db } | null = null;

/**
 * The extension's Supabase client. The session is kept in extension storage and
 * refreshed automatically; the Realtime heartbeat is shorter than the browser's
 * 30-second idle limit so an active socket keeps the worker alive.
 */
export function clientFor(connection: Connection): Db {
  const key = `${connection.supabaseUrl}|${connection.supabaseAnonKey}`;
  if (cached?.key === key) return cached.db;
  const db = createClient<Database>(connection.supabaseUrl, connection.supabaseAnonKey, {
    auth: {
      storage: supabaseStorage,
      storageKey: KEYS.auth,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: { heartbeatIntervalMs: 20_000 },
  });
  cached = { key, db };
  return db;
}

export async function getClient(): Promise<{ db: Db; connection: Connection } | null> {
  const connection = await getConnection();
  return connection ? { db: clientFor(connection), connection } : null;
}

export function forgetClient(): void {
  cached = null;
}

interface FocusGet {
  state: FocusState;
  settings: FocusSettings;
  blocking: BlockingInfo;
  server_time: string;
}

/** One round trip for everything the extension shows and enforces. */
export async function fetchSnapshot(db: Db): Promise<Snapshot> {
  const startedAt = Date.now();
  const { data, error } = await db.rpc("sp_focus_get");
  if (error)
    throw Object.assign(new Error(error.message), {
      code: error.code,
      status: (error as { status?: number }).status,
    });
  const got = data as unknown as FocusGet;
  const localMid = (startedAt + Date.now()) / 2;
  return {
    state: got.state,
    settings: got.settings,
    blocking: got.blocking,
    skewMs: Date.parse(got.server_time) - localMid,
    fetchedAt: Date.now(),
  };
}

export interface ActionResult {
  ok: boolean;
  error: string | null;
}

/** Sends a timer action with the version it was based on. The server decides; callers refetch. */
export async function timerAction(
  db: Db,
  action: string,
  expectedVersion: number,
): Promise<ActionResult> {
  const { data, error } = await db.rpc("sp_timer_action", {
    p_action: action,
    p_expected_version: expectedVersion,
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  const result = data as unknown as { ok: boolean; error: string | null };
  return { ok: result.ok, error: result.error };
}

/** True for failures caused by being offline rather than by the server's answer. */
export function isOffline(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = (err as { message?: string } | null)?.message ?? "";
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(
    message,
  );
}

export function isAuthFailure(err: unknown): boolean {
  const e = err as { message?: string; code?: string; status?: number } | null;
  return (
    e?.status === 401 ||
    e?.code === "PGRST301" ||
    e?.code === "28000" ||
    /jwt|not authenticated|invalid refresh token|refresh token not found/i.test(e?.message ?? "")
  );
}
