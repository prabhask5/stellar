import { LATEST_SCHEMA_VERSION } from "@stellar/db";
import { requireConfig, resetPinRequested } from "@/lib/server/config";
import { api, json } from "@/lib/server/http";
import { appSecret } from "@/lib/server/secret";
import { readSchemaVersion } from "@/lib/server/setup";
import { authenticate } from "@/lib/server/supabase";
import { APP_VERSION } from "@/lib/server/version";

export const dynamic = "force-dynamic";

/** Settings → Connection: where the data lives and whether the schema is current. Never returns keys. */
export const GET = api(async (req) => {
  await authenticate(req);
  const c = requireConfig();
  let schemaVersion: number | null = null;
  let reachable = true;
  try {
    schemaVersion = await readSchemaVersion();
  } catch {
    reachable = false;
  }
  return json({
    supabaseUrl: c.supabaseUrl,
    reachable,
    schemaVersion,
    latestSchemaVersion: LATEST_SCHEMA_VERSION,
    upToDate: schemaVersion !== null && schemaVersion >= LATEST_SCHEMA_VERSION,
    hasDatabaseUrl: Boolean(c.databaseUrl),
    fromEnv: c.fromEnv,
    appSecretSource: appSecret().source,
    resetPinEnv: resetPinRequested(),
    publicAppUrl: c.publicAppUrl,
    version: APP_VERSION,
  });
});
