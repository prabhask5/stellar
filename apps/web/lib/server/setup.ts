import { createECDH, randomBytes } from "node:crypto";
import { LATEST_SCHEMA_VERSION } from "@stellar/db";
import {
  connect,
  type MigrationProgress,
  type MigrationResult,
  runMigrations,
  runMigrationsWith,
} from "@stellar/db/runner";
import { getConfig, readStoredConfig, type StoredConfig, updateStoredConfig } from "./config";
import { ApiError } from "./http";
import { clearLockout } from "./lockout";
import { hashPin, isValidPin } from "./pin";
import { adminClient } from "./supabase";

export const OWNER_EMAIL = "owner@stellar.local";

function requireSupabase() {
  const c = getConfig();
  if (!c.supabaseUrl || !c.supabaseAnonKey || !c.supabaseServiceRoleKey) {
    throw new ApiError("bad_request", "Connect Supabase first.");
  }
  return c as typeof c & {
    supabaseUrl: string;
    supabaseAnonKey: string;
    supabaseServiceRoleKey: string;
  };
}

function serviceHeaders(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

/** Reads the applied schema version through PostgREST with the service role. Null when the table is missing. */
export async function readSchemaVersion(): Promise<number | null> {
  const c = requireSupabase();
  const res = await fetch(
    `${c.supabaseUrl}/rest/v1/sp_schema_version?select=version&order=version.desc&limit=1`,
    {
      headers: serviceHeaders(c.supabaseServiceRoleKey),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    // PostgREST reports a missing relation (or a stale schema cache) as PGRST205 / 42P01.
    if (/PGRST205|42P01|schema cache/i.test(body)) return null;
    throw new ApiError(
      "upstream_error",
      `Supabase answered HTTP ${res.status} while checking the schema.`,
    );
  }
  const rows = (await res.json()) as { version: number }[];
  return rows[0]?.version ?? 0;
}

export interface VerifyResult {
  ok: boolean;
  schemaVersion: number | null;
  latestVersion: number;
  message: string;
}

/** The Verify button: checks sp_schema_version and records the result. */
export async function verifySchema(): Promise<VerifyResult> {
  let version = await readSchemaVersion();
  if (version === null) {
    // PostgREST caches the schema; ask it to reload and look once more.
    await reloadSchemaCache().catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));
    version = await readSchemaVersion();
  }
  const ok = version !== null && version >= LATEST_SCHEMA_VERSION;
  // Once setup has finished, a failed check never takes the instance out of service: the
  // database may be briefly unreachable, or simply one app update behind. Only the first-run
  // wizard, which has nothing to lose, records a negative result.
  const stored = readStoredConfig();
  if (ok && !stored?.schemaVerified) updateStoredConfig({ schemaVerified: true });
  else if (!ok && stored?.schemaVerified && !stored.setupCompletedAt)
    updateStoredConfig({ schemaVerified: false });
  return {
    ok,
    schemaVersion: version,
    latestVersion: LATEST_SCHEMA_VERSION,
    message: ok
      ? `Database is ready (schema version ${version}).`
      : version === null
        ? "The Stellar Planner tables were not found yet. Run the SQL, then verify again."
        : `The database is at schema version ${version}; version ${LATEST_SCHEMA_VERSION} is needed. Run the SQL again.`,
  };
}

async function pgMetaQuery(sql: string): Promise<unknown> {
  const c = requireSupabase();
  const res = await fetch(`${c.supabaseUrl}/pg/query`, {
    method: "POST",
    headers: serviceHeaders(c.supabaseServiceRoleKey),
    body: JSON.stringify({ query: sql }),
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      message = parsed.message ?? parsed.error ?? message;
    } catch {
      // keep the raw text
    }
    throw new Error(`pg-meta HTTP ${res.status}: ${message}`);
  }
  return text ? JSON.parse(text) : null;
}

async function reloadSchemaCache(): Promise<void> {
  const c = getConfig();
  if (c.databaseUrl) return; // the runner already notified PostgREST
  await pgMetaQuery("notify pgrst, 'reload schema';");
}

/** True when the self-hosted pg-meta route answers for the service role. */
export async function pgMetaAvailable(): Promise<boolean> {
  try {
    await pgMetaQuery("select 1 as ok");
    return true;
  } catch {
    return false;
  }
}

export type MigrationMethod = "connection" | "pg-meta" | "manual";

export interface MigrateOutcome extends MigrationResult {
  method: MigrationMethod;
}

/**
 * Runs migrations automatically when possible: the Postgres connection string
 * first, then the pg-meta endpoint. "manual" means the owner must paste the SQL.
 */
export async function migrate(
  onProgress?: (p: MigrationProgress) => void,
): Promise<MigrateOutcome> {
  const c = requireSupabase();
  if (c.databaseUrl) {
    const result = await runMigrations(c.databaseUrl, onProgress);
    if (result.ok) updateStoredConfig({ schemaVerified: true });
    return { ...result, method: "connection" };
  }
  if (await pgMetaAvailable()) {
    const result = await runMigrationsWith(
      pgMetaQuery,
      async () =>
        (
          (await pgMetaQuery("select version from public.sp_schema_version order by version")) as {
            version: number;
          }[]
        ).map((r) => r.version),
      onProgress,
    );
    if (result.ok) updateStoredConfig({ schemaVerified: true });
    return { ...result, method: "pg-meta" };
  }
  return {
    ok: false,
    method: "manual",
    applied: [],
    skipped: [],
    schemaVersion: 0,
    latestVersion: LATEST_SCHEMA_VERSION,
    error: "No automatic route to the database is available.",
  };
}

/** Finds the hidden owner's id: directly in Postgres when possible, else by paging the admin API. */
async function findOwner(): Promise<string | null> {
  const c = requireSupabase();
  if (c.databaseUrl) {
    try {
      const pg = await connect(c.databaseUrl);
      try {
        const res = await pg.query<{ id: string }>(
          "select id from auth.users where email = $1 limit 1",
          [OWNER_EMAIL],
        );
        return res.rows[0]?.id ?? null;
      } finally {
        await pg.end().catch(() => {});
      }
    } catch {
      // fall through to the admin API
    }
  }
  const admin = adminClient(c);
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error)
      throw new ApiError("upstream_error", `Could not look up the owner account: ${error.message}`);
    const hit = data.users.find((u) => u.email === OWNER_EMAIL);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/**
 * Creates (or re-keys) the hidden owner user. The 64-character password is
 * random and stored only in the encrypted config.
 */
export async function ensureOwner(): Promise<Pick<StoredConfig, "ownerUserId" | "ownerPassword">> {
  const admin = adminClient(requireSupabase());
  const password = randomBytes(48).toString("base64url").slice(0, 64);

  const rekey = async (id: string) => {
    const { error } = await admin.auth.admin.updateUserById(id, { password, email_confirm: true });
    return error;
  };

  const known = readStoredConfig()?.ownerUserId ?? null;
  if (known) {
    const error = await rekey(known);
    if (!error) return { ownerUserId: known, ownerPassword: password };
    if (!/not found/i.test(error.message)) {
      throw new ApiError("upstream_error", `Could not update the owner account: ${error.message}`);
    }
  }

  const created = await admin.auth.admin.createUser({
    email: OWNER_EMAIL,
    password,
    email_confirm: true,
    user_metadata: { stellar_planner: "owner" },
  });
  if (created.data.user) return { ownerUserId: created.data.user.id, ownerPassword: password };

  // The account already exists (for example after /data was lost): take it over.
  if (/already|exists|registered/i.test(created.error?.message ?? "")) {
    const existing = await findOwner();
    if (existing) {
      const error = await rekey(existing);
      if (!error) return { ownerUserId: existing, ownerPassword: password };
      throw new ApiError("upstream_error", `Could not update the owner account: ${error.message}`);
    }
  }
  throw new ApiError(
    "upstream_error",
    `Could not create the owner account: ${created.error?.message ?? "unknown error"}`,
  );
}

/** A P-256 key pair in the URL-safe base64 form the Push API and VAPID expect. */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const priv = ecdh.getPrivateKey();
  const padded = Buffer.concat([Buffer.alloc(32 - priv.length), priv]);
  return {
    publicKey: ecdh.getPublicKey().toString("base64url"),
    privateKey: padded.toString("base64url"),
  };
}

/** The "Create your PIN" step. Also the landing point after RESET_PIN. */
export async function createPin(pin: string, confirm: string): Promise<void> {
  const c = getConfig();
  if (c.stage === "connect" || c.stage === "database")
    throw new ApiError("bad_request", "Finish connecting the database first.");
  if (c.stage === "complete")
    throw new ApiError("forbidden", "A PIN is already set. Change it in Settings.");
  if (!isValidPin(pin)) throw new ApiError("bad_request", "Your PIN must be 6 to 12 digits.");
  if (pin !== confirm) throw new ApiError("bad_request", "The two PINs don't match.");

  // A reset re-keys the owner, which also invalidates every existing session.
  const owner = await ensureOwner();
  const stored = readStoredConfig();
  const vapid = stored?.vapid ?? generateVapidKeys();
  updateStoredConfig({
    ...owner,
    pinHash: await hashPin(pin),
    vapid: { publicKey: vapid.publicKey, privateKey: vapid.privateKey },
    setupCompletedAt: stored?.setupCompletedAt ?? new Date().toISOString(),
  });
  clearLockout();
}
