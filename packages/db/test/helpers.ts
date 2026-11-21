import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * SQL tests need a Postgres with the Supabase roles and `auth` schema.
 * `pnpm stack:up` starts one locally; otherwise set TEST_DATABASE_URL.
 * When no database is reachable the SQL suites are skipped.
 */
export const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:54322/postgres";

export async function probe(): Promise<boolean> {
  const client = new pg.Client({ connectionString: DATABASE_URL, connectionTimeoutMillis: 2000 });
  client.on("error", () => {});
  try {
    await client.connect();
    const r = await client.query("select to_regclass('auth.users') as t");
    return r.rows[0]?.t !== null;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

export const available = await probe();
if (!available) {
  console.warn(
    "[db tests] No Supabase-compatible Postgres reachable. SQL suites are skipped. Run `pnpm stack:up`.",
  );
}

export async function open(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  client.on("error", () => {});
  await client.connect();
  return client;
}

export async function createUser(admin: pg.Client, timezone = "UTC"): Promise<string> {
  const id = randomUUID();
  await admin.query(
    `insert into auth.users (id, instance_id, aud, role, email)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`,
    [id, `test-${id}@stellar.test`],
  );
  await admin.query("insert into public.sp_settings (user_id, timezone) values ($1, $2)", [
    id,
    timezone,
  ]);
  return id;
}

export async function dropUser(admin: pg.Client, id: string): Promise<void> {
  await admin.query("delete from auth.users where id = $1", [id]);
}

export type Q = <T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>;

/** Runs `fn` in one transaction as the given user, exactly as PostgREST would. */
export async function asUser<R>(
  admin: pg.Client,
  userId: string | null,
  fn: (q: Q) => Promise<R>,
): Promise<R> {
  await admin.query("begin");
  try {
    if (userId) {
      await admin.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
      await admin.query("set local role authenticated");
    } else {
      await admin.query("set local role anon");
    }
    const q: Q = async (sql, params) => (await admin.query(sql, params as never[])).rows as never;
    const result = await fn(q);
    await admin.query("commit");
    return result;
  } catch (err) {
    await admin.query("rollback");
    throw err;
  }
}

export async function points(admin: pg.Client, userId: string): Promise<number> {
  const r = await admin.query(
    "select coalesce(sum(points), 0)::int as p from public.sp_universe_events where user_id = $1",
    [userId],
  );
  return r.rows[0].p as number;
}

export async function kinds(admin: pg.Client, userId: string): Promise<string[]> {
  const r = await admin.query(
    "select kind from public.sp_universe_events where user_id = $1 order by created_at, id",
    [userId],
  );
  return r.rows.map((x) => x.kind as string);
}
