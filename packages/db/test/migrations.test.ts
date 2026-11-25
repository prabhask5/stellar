import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderBundle } from "../src/bundle-render.ts";
import {
  fullMigrationSql,
  LATEST_SCHEMA_VERSION,
  MIGRATIONS,
  pendingMigrations,
} from "../src/migrations.ts";
import { runMigrations, runMigrationsWith } from "../src/runner.ts";
import { available, DATABASE_URL, open } from "./helpers.ts";
import type pg from "pg";

const root = resolve(import.meta.dirname, "..");

describe("migration bundle", () => {
  it("is in sync with migrations/*.sql", () => {
    const dir = resolve(root, "migrations");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const expected = renderBundle(
      files.map((f) => ({ file: f, sql: readFileSync(resolve(dir, f), "utf8") })),
    );
    expect(readFileSync(resolve(root, "src/bundle.generated.ts"), "utf8")).toBe(expected);
  });

  it("numbers migrations contiguously from 1", () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(MIGRATIONS.map((_, i) => i + 1));
    expect(LATEST_SCHEMA_VERSION).toBe(MIGRATIONS.length);
  });

  it("prefixes every object with sp_", () => {
    const sql = MIGRATIONS.map((m) => m.sql).join("\n");
    const created = [
      ...sql.matchAll(
        /create (?:or replace )?(?:table|function|unique index|index|policy|trigger)(?: if not exists)? (?:public\.)?([a-z_0-9]+)/g,
      ),
    ].map((m) => m[1]);
    expect(created.length).toBeGreaterThan(100);
    expect(created.filter((n) => !n?.startsWith("sp_"))).toEqual([]);
  });

  it("computes pending migrations", () => {
    expect(pendingMigrations([]).length).toBe(MIGRATIONS.length);
    expect(pendingMigrations(MIGRATIONS.map((m) => m.version))).toEqual([]);
    expect(pendingMigrations([1, 2]).map((m) => m.version)).toEqual(
      MIGRATIONS.slice(2).map((m) => m.version),
    );
  });

  it("produces one paste-able script", () => {
    const sql = fullMigrationSql();
    expect(sql.startsWith("-- Stellar Planner")).toBe(true);
    expect(sql).toContain("sp_schema_version");
    expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });
});

describe.skipIf(!available)("migration runner", () => {
  let db: pg.Client;
  beforeAll(async () => {
    db = await open();
    const first = await runMigrations(DATABASE_URL);
    expect(first.error).toBeUndefined();
  });
  afterAll(async () => {
    await db.end();
  });

  it("is idempotent: a second run applies nothing", async () => {
    const events: string[] = [];
    const again = await runMigrations(DATABASE_URL, (p) => events.push(p.status));
    expect(again.ok).toBe(true);
    expect(again.applied).toEqual([]);
    expect(again.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(new Set(events)).toEqual(new Set(["skipped"]));
  });

  it("the full script can be pasted repeatedly", async () => {
    await db.query(fullMigrationSql());
    await db.query(fullMigrationSql());
    const r = await db.query(
      "select max(version)::int as v, count(*)::int as n from public.sp_schema_version",
    );
    expect(r.rows[0]).toEqual({ v: LATEST_SCHEMA_VERSION, n: LATEST_SCHEMA_VERSION });
  });

  it("applies through a generic SQL executor (pg-meta path)", async () => {
    const result = await runMigrationsWith(
      (sql) => db.query(sql),
      async () =>
        (await db.query("select version from public.sp_schema_version")).rows.map(
          (r) => r.version as number,
        ),
    );
    expect(result).toMatchObject({ ok: true, applied: [], schemaVersion: LATEST_SCHEMA_VERSION });
  });

  it("reports a clear error for an unreachable database", async () => {
    const bad = await runMigrations("postgres://postgres:postgres@127.0.0.1:1/postgres");
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/Could not connect/);
  });

  it("publishes the realtime tables with full replica identity", async () => {
    const r = await db.query(
      "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by 1",
    );
    expect(r.rows.map((x) => x.tablename)).toEqual([
      "sp_block_list_sites",
      "sp_block_lists",
      "sp_events",
      "sp_focus_settings",
      "sp_focus_state",
      "sp_goal_lists",
      "sp_goals",
      "sp_routine_logs",
      "sp_routines",
      "sp_task_lists",
      "sp_tasks",
    ]);
    const ri = await db.query(
      "select count(*)::int as n from pg_class where relname like 'sp\\_%' and relkind = 'r' and relreplident = 'f'",
    );
    expect(ri.rows[0].n).toBe(11);
  });

  it("enables row level security on every sp_ table", async () => {
    const r = await db.query(
      "select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'sp\\_%' and not c.relrowsecurity",
    );
    expect(r.rows).toEqual([]);
  });

  it("seeds at least 100 attributed built-in quotes", async () => {
    const r = await db.query(
      "select count(*)::int as n, count(*) filter (where author = '')::int as blank from public.sp_quotes where is_builtin",
    );
    expect(r.rows[0].n).toBeGreaterThanOrEqual(100);
    expect(r.rows[0].blank).toBe(0);
  });

  it("grants nothing to anon", async () => {
    const r = await db.query(
      "select table_name, privilege_type from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public' and table_name like 'sp\\_%'",
    );
    expect(r.rows).toEqual([]);
    const f = await db.query(
      "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'sp\\_%' and p.prorettype <> 'trigger'::regtype and has_function_privilege('anon', p.oid, 'execute')",
    );
    expect(f.rows).toEqual([]);
  });
});
