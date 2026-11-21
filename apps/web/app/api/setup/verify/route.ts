import { api, json } from "@/lib/server/http";
import { verifySchema } from "@/lib/server/setup";
import { guardSetup } from "@/lib/server/setup-guard";

export const dynamic = "force-dynamic";

/** Checks sp_schema_version through the service role and records the result. */
export const POST = api(async (req) => {
  await guardSetup(req);
  return json(await verifySchema());
});
