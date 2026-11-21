import { LATEST_SCHEMA_VERSION } from "@stellar/db";
import { getConfig, resetPinRequested } from "@/lib/server/config";
import { api, json } from "@/lib/server/http";
import { appSecret } from "@/lib/server/secret";
import { APP_VERSION } from "@/lib/server/version";

export const dynamic = "force-dynamic";

/** What the wizard needs to resume at the right step. Never includes secrets. */
export const GET = api(async () => {
  const c = getConfig();
  const firstRun = c.setupCompletedAt === null;
  return json({
    stage: c.stage,
    configured: c.configured,
    firstRun,
    pinReset: !firstRun && c.stage === "pin",
    resetPinEnv: resetPinRequested(),
    version: APP_VERSION,
    latestSchemaVersion: LATEST_SCHEMA_VERSION,
    appSecretSource: appSecret().source,
    fromEnv: c.fromEnv,
    hasDatabaseUrl: Boolean(c.databaseUrl),
    // Shown back to the owner while they are still in the wizard.
    supabaseUrl: firstRun ? c.supabaseUrl : null,
  });
});
