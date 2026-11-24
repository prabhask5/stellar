import { api, ApiRequestError } from "./api";

/** What the page knows about its session. The refresh token never reaches JavaScript. */
export interface WebSession {
  accessToken: string;
  /** Unix seconds. */
  expiresAt: number;
  userId: string;
  deviceId: string | null;
  supabaseUrl: string;
  supabaseAnonKey: string;
  vapidPublicKey: string | null;
}

/** Non-secret values kept across launches so the app can open offline. */
export interface SessionMeta {
  userId: string;
  deviceId: string | null;
  supabaseUrl: string;
  supabaseAnonKey: string;
  vapidPublicKey: string | null;
}

interface SessionResponse {
  access_token: string;
  expires_at: number;
  user_id: string;
  device_id: string | null;
  supabase_url: string;
  supabase_anon_key: string;
  vapid_public_key: string | null;
  server_time: string;
}

const META_KEY = "sp-session-meta";
const REFRESH_MARGIN_S = 90;

let current: WebSession | null = null;
let inflight: Promise<WebSession> | null = null;
let skewMs = 0;
let signedOut = false;

/** Server clock estimate: local clock corrected by the last observed skew. */
export function serverNow(): number {
  return Date.now() + skewMs;
}

export function setServerSkew(serverTime: string | number, localAt = Date.now()): void {
  const t = typeof serverTime === "number" ? serverTime : Date.parse(serverTime);
  if (Number.isFinite(t)) skewMs = t - localAt;
}

export function readMeta(): SessionMeta | null {
  if (current) {
    const { accessToken: _a, expiresAt: _e, ...meta } = current;
    return meta;
  }
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as SessionMeta) : null;
  } catch {
    return null;
  }
}

function writeMeta(meta: SessionMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // storage unavailable: offline boot is simply not possible
  }
}

export function clearSessionState(): void {
  current = null;
  try {
    localStorage.removeItem(META_KEY);
  } catch {
    // ignored
  }
}

function fresh(session: WebSession | null): session is WebSession {
  return session !== null && session.expiresAt - serverNow() / 1000 > REFRESH_MARGIN_S;
}

/** Sends the browser to the PIN screen, remembering where it was. */
export function goToLock(): void {
  if (signedOut || typeof window === "undefined") return;
  signedOut = true;
  clearSessionState();
  const here = window.location.pathname + window.location.search;
  const next =
    here && here !== "/" && !here.startsWith("/lock") ? `?next=${encodeURIComponent(here)}` : "";
  // The server no longer accepts this device (revoked, signed out everywhere, expired): the
  // copy of the owner's data kept for offline use must not outlive the session. Changes
  // still in the outbox stay; they are sent after the PIN is entered again.
  const leave = () => window.location.replace(`/lock${next}`);
  void import("./persist")
    .then((m) => m.clearCachedData())
    .catch(() => {})
    .then(leave);
}

async function fetchSession(): Promise<WebSession> {
  const startedAt = Date.now();
  const res = await api<SessionResponse>("/api/v1/auth/session");
  setServerSkew(res.server_time, (startedAt + Date.now()) / 2);
  const session: WebSession = {
    accessToken: res.access_token,
    expiresAt: res.expires_at,
    userId: res.user_id,
    deviceId: res.device_id,
    supabaseUrl: res.supabase_url,
    supabaseAnonKey: res.supabase_anon_key,
    vapidPublicKey: res.vapid_public_key,
  };
  current = session;
  writeMeta({
    userId: session.userId,
    deviceId: session.deviceId,
    supabaseUrl: session.supabaseUrl,
    supabaseAnonKey: session.supabaseAnonKey,
    vapidPublicKey: session.vapidPublicKey,
  });
  return session;
}

/**
 * The current session, refreshed through the server when it is close to
 * expiring. Rejects with `unauthorized` when the PIN is needed again and with
 * `network` when offline.
 */
export function getSession(force = false): Promise<WebSession> {
  if (!force && fresh(current)) return Promise.resolve(current);
  if (!inflight) {
    inflight = fetchSession()
      .catch((err: unknown) => {
        if (
          err instanceof ApiRequestError &&
          (err.code === "unauthorized" || err.code === "not_configured")
        ) {
          goToLock();
        }
        throw err;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** For supabase-js: the access token, or null when none can be had right now (offline). */
export async function getAccessToken(): Promise<string | null> {
  try {
    return (await getSession()).accessToken;
  } catch {
    return current && current.expiresAt * 1000 > serverNow() ? current.accessToken : null;
  }
}
