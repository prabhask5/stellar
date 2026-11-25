import { zSettingsUpdate } from "@stellar/shared";
import { ApiError, api, json, preflight, readJson } from "@/lib/server/http";
import { authenticate } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const COLUMNS =
  "timezone, week_start, birthdate, lifespan_years, quality_tier, show_completed, lock_after_minutes, updated_at";

export const GET = api(async (req) => {
  const auth = await authenticate(req);
  const { error: bootError } = await auth.supabase.rpc("sp_bootstrap");
  if (bootError) throw new ApiError("upstream_error", bootError.message);
  const { data, error } = await auth.supabase.from("sp_settings").select(COLUMNS).single();
  if (error) throw new ApiError("upstream_error", error.message);
  return json(data);
});

export const PUT = api(async (req) => {
  const auth = await authenticate(req);
  const patch = zSettingsUpdate.parse(await readJson(req));
  if (Object.keys(patch).length === 0)
    throw new ApiError("bad_request", "Send at least one setting to change.");
  const { error: bootError } = await auth.supabase.rpc("sp_bootstrap", {
    p_timezone: patch.timezone,
  });
  if (bootError) throw new ApiError("upstream_error", bootError.message);
  const { data, error } = await auth.supabase
    .from("sp_settings")
    .update(patch)
    .eq("user_id", auth.userId)
    .select(COLUMNS)
    .single();
  if (error)
    throw new ApiError(
      error.code?.startsWith("22") ? "bad_request" : "upstream_error",
      error.message,
    );
  return json(data);
});
