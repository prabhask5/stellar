import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@stellar/db";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getConfig, type ReadyConfig, requireConfig } from "./config";
import { ApiError, isSecure } from "./http";
import { AUTH_COOKIE, DEVICE_COOKIE } from "./supabase-cookie";

export { AUTH_COOKIE, DEVICE_COOKIE };

export type Db = SupabaseClient<Database>;

const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

let admin: { key: string; client: Db } | null = null;

/** Service-role client. Server only; bypasses RLS. */
export function adminClient(
  config: { supabaseUrl: string; supabaseServiceRoleKey: string } = requireConfig(),
): Db {
  const key = `${config.supabaseUrl}|${config.supabaseServiceRoleKey}`;
  if (admin?.key === key) return admin.client;
  const client = createClient<Database>(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  admin = { key, client };
  return client;
}

/** A client with no stored session, for password sign-in and token refresh. */
export function statelessClient(
  config: { supabaseUrl: string; supabaseAnonKey: string } = requireConfig(),
): Db {
  return createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** A client acting as the owner of an access token; RLS applies. */
export function tokenClient(
  token: string,
  config: { supabaseUrl: string; supabaseAnonKey: string } = requireConfig(),
): Db {
  return createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * Cookie-backed client for the web app. The session lives in httpOnly cookies,
 * so page scripts can never read the refresh token.
 */
export async function cookieClient(
  req: NextRequest,
  config: ReadyConfig = requireConfig(),
): Promise<Db> {
  const store = await cookies();
  return createServerClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    cookieOptions: {
      name: AUTH_COOKIE,
      httpOnly: true,
      secure: isSecure(req),
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) {
          store.set(name, value, {
            ...options,
            httpOnly: true,
            secure: isSecure(req),
            sameSite: "lax",
            path: "/",
          });
        }
      },
    },
  });
}

export function decodeJwt(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface AuthContext {
  supabase: Db;
  token: string;
  userId: string;
  sessionId: string | null;
  via: "bearer" | "cookie";
}

// Serialises cookie-session refreshes so two tabs never race the same refresh token.
let refreshChain: Promise<unknown> = Promise.resolve();

/**
 * Resolves the caller: `Authorization: Bearer <access_token>` (extension, iOS,
 * integrations) or the httpOnly session cookie (web app). Only the instance
 * owner is accepted, since the Supabase project may host other users.
 */
export async function authenticate(
  req: NextRequest,
  opts: { verify?: boolean } = {},
): Promise<AuthContext> {
  const config = requireConfig();
  const header = req.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  const via: AuthContext["via"] = bearer ? "bearer" : "cookie";
  const token = bearer ?? (await cookieToken(req, config));
  if (!token) throw new ApiError("unauthorized", "Sign in with your PIN to continue.");

  const claims = decodeJwt(token);
  const sub = typeof claims?.sub === "string" ? claims.sub : null;
  const exp = typeof claims?.exp === "number" ? claims.exp : 0;
  if (!sub || sub !== config.ownerUserId || exp * 1000 < Date.now()) {
    throw new ApiError("unauthorized", "Your session has expired. Enter your PIN again.");
  }
  if (opts.verify) {
    // Ask the auth server, which also rejects revoked sessions.
    const { data, error } = await statelessClient(config).auth.getUser(token);
    if (error || data.user?.id !== config.ownerUserId) {
      throw new ApiError("unauthorized", "Your session has expired. Enter your PIN again.");
    }
  }
  return {
    supabase: tokenClient(token, config),
    token,
    userId: sub,
    sessionId: typeof claims?.session_id === "string" ? claims.session_id : null,
    via,
  };
}

async function cookieToken(req: NextRequest, config: ReadyConfig): Promise<string | null> {
  const run = refreshChain.then(async () => {
    const client = await cookieClient(req, config);
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  });
  refreshChain = run.catch(() => null);
  return run;
}

export function hasSupabase(): boolean {
  const c = getConfig();
  return Boolean(c.supabaseUrl && c.supabaseAnonKey && c.supabaseServiceRoleKey);
}
