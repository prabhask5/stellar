import { runMigrations } from "../src/runner.ts";
import { available, DATABASE_URL } from "./helpers.ts";

/** Brings the test database up to date before any suite runs. */
export default async function setup() {
  if (!available) return;
  const result = await runMigrations(DATABASE_URL);
  if (!result.ok) throw new Error(result.error);
}
