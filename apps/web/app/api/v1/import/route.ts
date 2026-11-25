import { zExport } from "@stellar/shared";
import type { Json } from "@stellar/db";
import { ApiError, api, json, preflight, readJson } from "@/lib/server/http";
import { authenticate } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Merges an export into the account. Rows are matched by id, so importing twice changes nothing. */
export const POST = api(async (req) => {
  const auth = await authenticate(req);
  const body = zExport.parse(await readJson(req, 100_000_000));
  const { data, error } = await auth.supabase.rpc("sp_import", { p_data: body as unknown as Json });
  if (error) {
    const bad =
      error.code === "22023" ||
      error.code === "23503" ||
      error.code?.startsWith("23") ||
      error.code?.startsWith("22");
    throw new ApiError(
      bad ? "bad_request" : "upstream_error",
      bad ? `This file could not be imported: ${error.message}` : error.message,
    );
  }
  return json(data);
});
