import { BUNDLED_MIGRATIONS } from "./bundle.generated.ts";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [...BUNDLED_MIGRATIONS].sort(
  (a, b) => a.version - b.version,
);

export const LATEST_SCHEMA_VERSION: number = MIGRATIONS.reduce((m, x) => Math.max(m, x.version), 0);

const VERSION_TABLE_SQL = `create table if not exists public.sp_schema_version (
  version int primary key,
  applied_at timestamptz not null default now()
);`;

export function versionTableSql(): string {
  return VERSION_TABLE_SQL;
}

export function recordVersionSql(version: number): string {
  return `insert into public.sp_schema_version (version) values (${Math.trunc(version)}) on conflict (version) do nothing;`;
}

/** SQL for one migration, wrapped in a transaction and recorded in sp_schema_version. */
export function migrationSql(m: Migration): string {
  return `begin;\n${VERSION_TABLE_SQL}\n${m.sql}\n${recordVersionSql(m.version)}\ncommit;`;
}

/**
 * Every migration as one script, for pasting into the Supabase Studio SQL
 * editor. Each migration is idempotent, so running the script twice is safe.
 */
export function fullMigrationSql(): string {
  const parts = [
    "-- Stellar Planner: full database setup.",
    "-- Paste into your Supabase Studio SQL editor and run. Safe to run more than once.",
    "begin;",
    VERSION_TABLE_SQL,
  ];
  for (const m of MIGRATIONS) {
    parts.push(
      `\n-- ━━ ${String(m.version).padStart(4, "0")} ${m.name} ━━`,
      m.sql,
      recordVersionSql(m.version),
    );
  }
  parts.push("commit;", "notify pgrst, 'reload schema';", "");
  return parts.join("\n");
}

export function pendingMigrations(applied: readonly number[]): Migration[] {
  const done = new Set(applied);
  return MIGRATIONS.filter((m) => !done.has(m.version));
}
