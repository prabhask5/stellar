// Dev-only: seeds the LOCAL test instance with realistic data for polish passes.
//   node scripts/seed-polish.mts [--keep]
// See apps/web/e2e/seed-polish.ts for what it creates. Refuses non-loopback databases.
import { runCli } from "../apps/web/e2e/seed-polish.ts";

runCli();
