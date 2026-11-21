import { mkdirSync, rmSync } from "node:fs";
import { DATA_DIR, DATABASE_URL, SHOTS_DIR, sql } from "./helpers";

/** Starts every run from an unconfigured instance and checks that the local stack is up. */
export default async function globalSetup() {
  rmSync(SHOTS_DIR, { recursive: true, force: true });
  mkdirSync(DATA_DIR, { recursive: true });
  for (const f of ["config.json", "lockout.json", "secret"])
    rmSync(`${DATA_DIR}/${f}`, { force: true });
  try {
    await sql(
      "delete from auth.users where email = 'owner@stellar.local' or email like 'test-%@stellar.test'",
    );
  } catch (err) {
    throw new Error(
      `The local Supabase stack is not reachable at ${DATABASE_URL}. Run \`pnpm stack:up\` first.`,
      { cause: err },
    );
  }
}
