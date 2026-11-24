import { randomBytes } from "node:crypto";
import type { PinRequest, SessionTokens } from "@stellar/shared";
import type { Session } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { connect } from "@stellar/db/runner";
import { type ReadyConfig, requireConfig, updateStoredConfig } from "./config";
import { ApiError, clientIp, isSecure } from "./http";
import { clearLockout, readLockout, recordFailure, remainingLockMs } from "./lockout";
import { hashPin, isValidPin, verifyPin } from "./pin";
import { rateLimit } from "./rate-limit";
import {
  adminClient,
  AUTH_COOKIE,
  cookieClient,
  decodeJwt,
  DEVICE_COOKIE,
  statelessClient,
} from "./supabase";

type AuthEventKind =
  | "pin_success"
  | "pin_failure"
  | "pin_locked"
  | "pin_changed"
  | "pin_reset"
  | "signed_out"
  | "signed_out_everywhere"
  | "device_revoked";

export async function logAuthEvent(
  kind: AuthEventKind,
  deviceKind: string | null,
  ip: string | null,
): Promise<void> {
  try {
    const config = requireConfig();
    await adminClient(config)
      .from("sp_auth_events")
      .insert({ user_id: config.ownerUserId, kind, device_kind: deviceKind, ip });
  } catch (err) {
    console.warn("[auth] could not record auth event", err);
  }
}

function lockedError(ms: number): ApiError {
  const seconds = Math.ceil(ms / 1000);
  const wait = seconds >= 120 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`;
  return new ApiError("locked", `Too many attempts. Try again in ${wait}.`, seconds);
}

/**
 * Checks a PIN under the escalating lockout. Throws generic errors only, so a
 * caller learns nothing beyond "that didn't work".
 */
export async function checkPin(
  req: NextRequest,
  pin: string,
  deviceKind: string | null,
): Promise<ReadyConfig> {
  const ip = clientIp(req);
  const limited = rateLimit(`pin:${ip}`, 20, 60_000);
  if (!limited.allowed)
    throw new ApiError(
      "rate_limited",
      "Too many requests. Wait a moment and try again.",
      limited.retryAfterSeconds,
    );

  const config = requireConfig();
  // One guess at a time. The lock is read before the (slow) hash check and written after
  // it, so guesses sent in parallel would all be checked before any of them counted.
  // Queueing them makes "five attempts" mean five, however they arrive.
  const turn = pinQueue.then(async () => {
    const locked = remainingLockMs(readLockout(), Date.now());
    if (locked > 0) return { kind: "locked" as const, ms: locked };
    const ok = isValidPin(pin) && (await verifyPin(config.pinHash, pin));
    if (ok) {
      clearLockout();
      return { kind: "ok" as const };
    }
    return { kind: "failed" as const, ms: remainingLockMs(recordFailure(), Date.now()) };
  });
  pinQueue = turn.then(
    () => undefined,
    () => undefined,
  );
  const outcome = await turn;
  if (outcome.kind === "locked") {
    await logAuthEvent("pin_locked", deviceKind, ip);
    throw lockedError(outcome.ms);
  }
  if (outcome.kind === "failed") {
    await logAuthEvent("pin_failure", deviceKind, ip);
    if (outcome.ms > 0) throw lockedError(outcome.ms);
    throw new ApiError("unauthorized", "That PIN didn't work. Try again.");
  }
  return config;
}

/** Serialises PIN checks within this process (the app runs as a single instance). */
let pinQueue: Promise<void> = Promise.resolve();

function toTokens(session: Session, userId: string): SessionTokens {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
    expires_in: session.expires_in,
    token_type: "bearer",
    user_id: userId,
  };
}

async function recordDevice(
  config: ReadyConfig,
  device: PinRequest["device"],
  session: Session,
  existingId: string | null,
): Promise<string | null> {
  const admin = adminClient(config);
  const claims = decodeJwt(session.access_token);
  const sessionId = typeof claims?.session_id === "string" ? claims.session_id : null;
  const now = new Date().toISOString();
  if (existingId) {
    const { data } = await admin
      .from("sp_devices")
      .update({
        name: device.name,
        kind: device.kind,
        auth_session_id: sessionId,
        last_seen_at: now,
        revoked_at: null,
      })
      .eq("id", existingId)
      .eq("user_id", config.ownerUserId)
      .select("id")
      .maybeSingle();
    if (data) return data.id;
  }
  const { data, error } = await admin
    .from("sp_devices")
    .insert({
      user_id: config.ownerUserId,
      name: device.name,
      kind: device.kind,
      auth_session_id: sessionId,
      last_seen_at: now,
    })
    .select("id")
    .single();
  if (error) {
    console.warn("[auth] could not record device", error.message);
    return null;
  }
  return data.id;
}

export interface PinLoginResult {
  deviceId: string | null;
  /** Only for extension and iOS clients. Web clients get httpOnly cookies. */
  session?: SessionTokens;
}

/** Signs the hidden owner in after a correct PIN. */
export async function pinLogin(req: NextRequest, body: PinRequest): Promise<PinLoginResult> {
  const config = await checkPin(req, body.pin, body.device.kind);
  const usesCookies = body.device.kind === "web" || body.device.kind === "pwa";
  const client = usesCookies ? await cookieClient(req, config) : statelessClient(config);
  const { data, error } = await client.auth.signInWithPassword({
    email: "owner@stellar.local",
    password: config.ownerPassword,
  });
  if (error || !data.session) {
    console.error("[auth] owner sign-in failed", error?.message);
    throw new ApiError(
      "upstream_error",
      "Could not reach Supabase to sign in. Check the connection in Settings.",
    );
  }
  const store = await cookies();
  const existing = usesCookies ? (store.get(DEVICE_COOKIE)?.value ?? null) : null;
  const deviceId = await recordDevice(config, body.device, data.session, existing);
  if (usesCookies && deviceId) {
    store.set(DEVICE_COOKIE, deviceId, {
      httpOnly: true,
      secure: isSecure(req),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
    });
  }
  // First sign-in creates the owner's singleton rows.
  await client
    .rpc("sp_bootstrap")
    .then(({ error: e }) => e && console.warn("[auth] bootstrap failed", e.message));
  await logAuthEvent("pin_success", body.device.kind, clientIp(req));
  return usesCookies
    ? { deviceId }
    : { deviceId, session: toTokens(data.session, config.ownerUserId) };
}

/** Exchanges a refresh token (extension, iOS). */
export async function refreshTokens(
  req: NextRequest,
  refreshToken: string,
): Promise<SessionTokens> {
  const limited = rateLimit(`refresh:${clientIp(req)}`, 60, 60_000);
  if (!limited.allowed)
    throw new ApiError(
      "rate_limited",
      "Too many requests. Wait a moment and try again.",
      limited.retryAfterSeconds,
    );
  const config = requireConfig();
  const { data, error } = await statelessClient(config).auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (error || !data.session || data.user?.id !== config.ownerUserId) {
    throw new ApiError("unauthorized", "Your session has expired. Enter your PIN again.");
  }
  return toTokens(data.session, config.ownerUserId);
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  for (const c of store.getAll()) {
    if (
      c.name === AUTH_COOKIE ||
      c.name.startsWith(`${AUTH_COOKIE}.`) ||
      c.name.startsWith(`${AUTH_COOKIE}-`)
    ) {
      store.delete(c.name);
    }
  }
}

/** Ends one session. Uses the admin API with the caller's own token. */
export async function signOut(token: string, scope: "local" | "global" = "local"): Promise<void> {
  const { error } = await adminClient().auth.admin.signOut(token, scope);
  if (error && !/session.*not.*found|invalid/i.test(error.message)) {
    console.warn("[auth] sign-out failed", error.message);
  }
}

/** Per-device revoke needs direct database access to delete from auth.sessions. */
export function canRevokeDevices(): boolean {
  return Boolean(requireConfig().databaseUrl);
}

export async function revokeDevice(deviceId: string): Promise<boolean> {
  const config = requireConfig();
  if (!config.databaseUrl)
    throw new ApiError(
      "conflict",
      "Per-device revoke needs the Postgres connection string. Add it under Settings, Connection.",
    );
  const admin = adminClient(config);
  const { data: device } = await admin
    .from("sp_devices")
    .select("id, auth_session_id")
    .eq("id", deviceId)
    .eq("user_id", config.ownerUserId)
    .maybeSingle();
  if (!device) return false;
  if (device.auth_session_id) {
    const pg = await connect(config.databaseUrl);
    try {
      await pg.query("delete from auth.sessions where id = $1 and user_id = $2", [
        device.auth_session_id,
        config.ownerUserId,
      ]);
    } finally {
      await pg.end().catch(() => {});
    }
  }
  await admin
    .from("sp_devices")
    .update({ revoked_at: new Date().toISOString(), auth_session_id: null })
    .eq("id", deviceId);
  await admin.from("sp_push_subscriptions").delete().eq("device_id", deviceId);
  return true;
}

/** Rotates the hidden password and ends every session on every device. */
export async function signOutEverywhere(token: string): Promise<void> {
  const config = requireConfig();
  const admin = adminClient(config);
  await signOut(token, "global");
  const password = randomBytes(48).toString("base64url").slice(0, 64);
  const { error } = await admin.auth.admin.updateUserById(config.ownerUserId, { password });
  if (error)
    throw new ApiError("upstream_error", `Could not rotate the owner password: ${error.message}`);
  updateStoredConfig({ ownerPassword: password });
  await admin
    .from("sp_devices")
    .update({ revoked_at: new Date().toISOString(), auth_session_id: null })
    .eq("user_id", config.ownerUserId)
    .is("revoked_at", null);
}

export async function changePin(
  req: NextRequest,
  currentPin: string,
  newPin: string,
): Promise<void> {
  await checkPin(req, currentPin, null);
  if (!isValidPin(newPin)) throw new ApiError("bad_request", "Your PIN must be 6 to 12 digits.");
  updateStoredConfig({ pinHash: await hashPin(newPin) });
  await logAuthEvent("pin_changed", null, clientIp(req));
}
