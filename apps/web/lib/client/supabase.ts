import type { Database } from "@stellar/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccessToken, readMeta } from "./session";

export type Db = SupabaseClient<Database>;

let client: { key: string; db: Db } | null = null;

/**
 * Browser Supabase client. It talks to PostgREST and Realtime directly with a
 * short-lived access token supplied by `getAccessToken`; it holds no session
 * and never sees a refresh token. The library is loaded on first use, so it is
 * not part of the JavaScript a page needs before it can paint.
 */
export async function getSupabase(): Promise<Db> {
  const meta = readMeta();
  if (!meta) throw new Error("No session yet");
  const key = `${meta.supabaseUrl}|${meta.supabaseAnonKey}`;
  if (client?.key === key) return client.db;
  const { createClient } = await import("@supabase/supabase-js");
  if (client?.key === key) return client.db;
  const db = createClient<Database>(meta.supabaseUrl, meta.supabaseAnonKey, {
    accessToken: getAccessToken,
    global: { fetch: fetchWithTimeout },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  client = { key, db };
  return db;
}

/** How long any single request may take before it counts as a network failure. */
export const REQUEST_TIMEOUT_MS = 20_000;

/**
 * `fetch` that gives up. Without a limit, one request that never answers (a
 * captive portal, a dead socket after sleep) would hold the sync queue and
 * every query behind it for good.
 */
export function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("Request timed out", "TimeoutError")),
    REQUEST_TIMEOUT_MS,
  );
  const outer = init?.signal;
  if (outer) {
    if (outer.aborted) controller.abort(outer.reason);
    else outer.addEventListener("abort", () => controller.abort(outer.reason), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export function hasSupabase(): boolean {
  return readMeta() !== null;
}

/** PostgREST and network errors as one message. */
export function describeError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string")
    return err.message;
  return "Something went wrong.";
}

/** True for failures that are worth retrying later (offline, timeouts, 5xx). */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const e = err as { message?: string; code?: string; status?: number; name?: string } | null;
  if (!e) return false;
  if (e.name === "AbortError" || e.name === "TimeoutError" || e.name === "TypeError") return true;
  if (typeof e.status === "number" && (e.status === 0 || e.status >= 500)) return true;
  const msg = e.message ?? "";
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|timed? ?out|aborted/i.test(
    msg,
  );
}
