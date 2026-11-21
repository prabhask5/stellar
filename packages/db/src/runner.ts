import pg from "pg";
import {
  LATEST_SCHEMA_VERSION,
  type Migration,
  migrationSql,
  pendingMigrations,
  recordVersionSql,
  versionTableSql,
} from "./migrations.ts";

export type MigrationStatus = "pending" | "running" | "done" | "skipped" | "failed";

export interface MigrationProgress {
  version: number;
  name: string;
  status: MigrationStatus;
  error?: string;
}

export interface MigrationResult {
  ok: boolean;
  applied: number[];
  skipped: number[];
  schemaVersion: number;
  latestVersion: number;
  error?: string;
}

const LOCK_KEY = 815_260_301; // arbitrary, unique to Stellar Planner migrations

function needsSslRetry(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /SSL|ssl|pg_hba\.conf|encryption/.test(msg);
}

/** Connects with the URL as given; retries with TLS when the server demands it. */
export async function connect(connectionString: string): Promise<pg.Client> {
  const base = { connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 120_000 };
  const first = new pg.Client(base);
  // An idle connection error must never crash the process.
  first.on("error", () => {});
  try {
    await first.connect();
    return first;
  } catch (err) {
    await first.end().catch(() => {});
    if (!needsSslRetry(err) || /sslmode=/.test(connectionString)) throw err;
    const second = new pg.Client({ ...base, ssl: { rejectUnauthorized: false } });
    second.on("error", () => {});
    await second.connect();
    return second;
  }
}

async function appliedVersions(client: pg.Client): Promise<number[]> {
  await client.query(versionTableSql());
  const res = await client.query<{ version: number }>(
    "select version from public.sp_schema_version order by version",
  );
  return res.rows.map((r) => r.version);
}

/**
 * Applies every pending migration, each in its own transaction, under an
 * advisory lock so concurrent boots cannot interleave. Idempotent: a second
 * run applies nothing.
 */
export async function runMigrations(
  connectionString: string,
  onProgress?: (p: MigrationProgress) => void,
): Promise<MigrationResult> {
  let client: pg.Client;
  try {
    client = await connect(connectionString);
  } catch (err) {
    return {
      ok: false,
      applied: [],
      skipped: [],
      schemaVersion: 0,
      latestVersion: LATEST_SCHEMA_VERSION,
      error: `Could not connect to Postgres: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const applied: number[] = [];
  let current: Migration | null = null;
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    const before = await appliedVersions(client);
    const pending = pendingMigrations(before);
    for (const v of before) onProgress?.({ version: v, name: "", status: "skipped" });
    for (const m of pending) {
      current = m;
      onProgress?.({ version: m.version, name: m.name, status: "running" });
      await client.query("begin");
      try {
        await client.query(m.sql);
        await client.query(recordVersionSql(m.version));
        await client.query("commit");
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      }
      applied.push(m.version);
      onProgress?.({ version: m.version, name: m.name, status: "done" });
    }
    if (applied.length > 0) await client.query("notify pgrst, 'reload schema'");
    const after = await appliedVersions(client);
    return {
      ok: true,
      applied,
      skipped: before,
      schemaVersion: after.reduce((m, v) => Math.max(m, v), 0),
      latestVersion: LATEST_SCHEMA_VERSION,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (current) {
      onProgress?.({
        version: current.version,
        name: current.name,
        status: "failed",
        error: message,
      });
    }
    return {
      ok: false,
      applied,
      skipped: [],
      schemaVersion: applied.reduce((m, v) => Math.max(m, v), 0),
      latestVersion: LATEST_SCHEMA_VERSION,
      error: current
        ? `Migration ${current.version} (${current.name}) failed: ${message}`
        : message,
    };
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    await client.end().catch(() => {});
  }
}

export type SqlExecutor = (sql: string) => Promise<unknown>;

/**
 * Applies pending migrations through any "run this SQL" endpoint, such as the
 * self-hosted pg-meta `/pg/query` route. Each migration is one transaction.
 */
export async function runMigrationsWith(
  exec: SqlExecutor,
  readVersions: () => Promise<number[]>,
  onProgress?: (p: MigrationProgress) => void,
): Promise<MigrationResult> {
  const applied: number[] = [];
  let current: Migration | null = null;
  try {
    await exec(versionTableSql());
    const before = await readVersions();
    for (const m of pendingMigrations(before)) {
      current = m;
      onProgress?.({ version: m.version, name: m.name, status: "running" });
      await exec(migrationSql(m));
      applied.push(m.version);
      onProgress?.({ version: m.version, name: m.name, status: "done" });
    }
    if (applied.length > 0) await exec("notify pgrst, 'reload schema';");
    const after = await readVersions();
    return {
      ok: true,
      applied,
      skipped: before,
      schemaVersion: after.reduce((m, v) => Math.max(m, v), 0),
      latestVersion: LATEST_SCHEMA_VERSION,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (current) {
      onProgress?.({
        version: current.version,
        name: current.name,
        status: "failed",
        error: message,
      });
    }
    return {
      ok: false,
      applied,
      skipped: [],
      schemaVersion: 0,
      latestVersion: LATEST_SCHEMA_VERSION,
      error: current
        ? `Migration ${current.version} (${current.name}) failed: ${message}`
        : message,
    };
  }
}
