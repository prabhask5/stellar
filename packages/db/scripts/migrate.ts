// CLI: DATABASE_URL=postgres://… pnpm --filter @stellar/db migrate
import { runMigrations } from "../src/runner.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL to your Postgres connection string.");
  process.exit(1);
}
const result = await runMigrations(url, (p) => {
  if (p.status !== "skipped")
    console.info(`${String(p.version).padStart(4, "0")} ${p.name}: ${p.status}`);
});
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}
console.info(
  result.applied.length === 0
    ? `Already up to date (schema version ${result.schemaVersion}).`
    : `Applied ${result.applied.length} migration(s). Schema version ${result.schemaVersion}.`,
);
