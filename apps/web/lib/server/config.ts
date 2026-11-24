import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { decryptJson, encryptJson, type Envelope } from "./crypto";
import { dataPath } from "./paths";
import { appSecret } from "./secret";

/** Everything the server needs to run, stored encrypted at /data/config.json. */
export interface StoredConfig {
  version: 1;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  supabaseServiceRoleKey: string | null;
  databaseUrl: string | null;
  /** True once sp_schema_version reports the latest migration. */
  schemaVerified: boolean;
  ownerUserId: string | null;
  /** Random 64-char password of the hidden owner user. Exists only here. */
  ownerPassword: string | null;
  /** argon2id hash of the PIN. Null until the PIN step, or after RESET_PIN. */
  pinHash: string | null;
  vapid: { publicKey: string; privateKey: string } | null;
  setupCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SetupStage = "connect" | "database" | "pin" | "complete";

/** Config with environment overrides applied. */
export interface EffectiveConfig extends StoredConfig {
  publicAppUrl: string | null;
  /** Which values come from the environment (shown read-only in the UI). */
  fromEnv: {
    supabaseUrl: boolean;
    anonKey: boolean;
    serviceRoleKey: boolean;
    databaseUrl: boolean;
  };
  stage: SetupStage;
  configured: boolean;
}

const FILE = "config.json";

export function emptyConfig(): StoredConfig {
  const now = new Date().toISOString();
  return {
    version: 1,
    supabaseUrl: null,
    supabaseAnonKey: null,
    supabaseServiceRoleKey: null,
    databaseUrl: null,
    schemaVerified: false,
    ownerUserId: null,
    ownerPassword: null,
    pinHash: null,
    vapid: null,
    setupCompletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

interface Cache {
  mtimeMs: number;
  size: number;
  stored: StoredConfig;
}
let cache: Cache | null = null;

/** Reads the stored config (null when the app has never been set up). Cached by file mtime. */
export function readStoredConfig(): StoredConfig | null {
  const file = dataPath(FILE);
  if (!existsSync(file)) {
    cache = null;
    return null;
  }
  const stat = statSync(file);
  if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) return cache.stored;
  const envelope = JSON.parse(readFileSync(file, "utf8")) as Envelope;
  const stored = { ...emptyConfig(), ...decryptJson<StoredConfig>(envelope, appSecret().value) };
  cache = { mtimeMs: stat.mtimeMs, size: stat.size, stored };
  return stored;
}

export function writeStoredConfig(config: StoredConfig): StoredConfig {
  const file = dataPath(FILE);
  const next = { ...config, updatedAt: new Date().toISOString() };
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(encryptJson(next, appSecret().value)), { mode: 0o600 });
  renameSync(tmp, file);
  cache = null;
  return next;
}

export function updateStoredConfig(patch: Partial<StoredConfig>): StoredConfig {
  return writeStoredConfig({ ...(readStoredConfig() ?? emptyConfig()), ...patch });
}

function env(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}

export function stageOf(
  c: Pick<
    StoredConfig,
    | "supabaseUrl"
    | "supabaseAnonKey"
    | "supabaseServiceRoleKey"
    | "schemaVerified"
    | "pinHash"
    | "ownerUserId"
    | "ownerPassword"
  >,
): SetupStage {
  if (!c.supabaseUrl || !c.supabaseAnonKey || !c.supabaseServiceRoleKey) return "connect";
  if (!c.schemaVerified) return "database";
  if (!c.pinHash || !c.ownerUserId || !c.ownerPassword) return "pin";
  return "complete";
}

/** Stored config merged with env overrides (env wins). */
export function getConfig(): EffectiveConfig {
  const stored = readStoredConfig() ?? emptyConfig();
  const merged: StoredConfig = {
    ...stored,
    supabaseUrl: env("SUPABASE_URL")?.replace(/\/+$/, "") ?? stored.supabaseUrl,
    supabaseAnonKey: env("SUPABASE_ANON_KEY") ?? stored.supabaseAnonKey,
    supabaseServiceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY") ?? stored.supabaseServiceRoleKey,
    databaseUrl: env("DATABASE_URL") ?? stored.databaseUrl,
  };
  const stage = stageOf(merged);
  return {
    ...merged,
    publicAppUrl: normalizePublicUrl(env("PUBLIC_APP_URL")),
    fromEnv: {
      supabaseUrl: env("SUPABASE_URL") !== null,
      anonKey: env("SUPABASE_ANON_KEY") !== null,
      serviceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY") !== null,
      databaseUrl: env("DATABASE_URL") !== null,
    },
    stage,
    configured: stage === "complete",
  };
}

/** Config that is guaranteed to be complete; throws otherwise. */
export interface ReadyConfig extends EffectiveConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  ownerUserId: string;
  ownerPassword: string;
  pinHash: string;
}

export class NotConfiguredError extends Error {
  constructor() {
    super("Stellar Planner has not been set up yet.");
    this.name = "NotConfiguredError";
  }
}

export function requireConfig(): ReadyConfig {
  const c = getConfig();
  if (!c.configured) throw new NotConfiguredError();
  return c as ReadyConfig;
}

export function resetPinRequested(): boolean {
  return /^(1|true|yes)$/i.test(process.env.RESET_PIN ?? "");
}

/**
 * RESET_PIN=true recovery: on boot, clear the PIN so the app returns to the
 * "Create your PIN" step. Returns true when a PIN was cleared.
 */
export function applyPinReset(): boolean {
  if (!resetPinRequested()) return false;
  const stored = readStoredConfig();
  if (!stored?.pinHash) return false;
  writeStoredConfig({ ...stored, pinHash: null });
  return true;
}

/**
 * PUBLIC_APP_URL as an origin-safe URL. "planner.example.com" (no scheme) is a common way
 * to write it; left as typed it made `new URL()` throw in every request that looked at it.
 * A missing scheme becomes https, and a value that still is not a URL is ignored.
 */
export function normalizePublicUrl(raw: string | undefined | null): string | null {
  const value = raw?.trim().replace(/\/+$/, "");
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return withScheme;
  } catch {
    return null;
  }
}
