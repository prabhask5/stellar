import { zFocusSettingsUpdate } from "@stellar/shared";
import { ApiError, api, json, preflight, readJson } from "@/lib/server/http";
import { db, guard, rpc, unwrap } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = api(async (req) => {
  const got = await rpc<{ settings: unknown }>(await guard(req), "sp_focus_get");
  return json(got.settings);
});

export const PUT = api(async (req) => {
  const auth = await guard(req);
  const patch = zFocusSettingsUpdate.parse(await readJson(req));
  if (Object.keys(patch).length === 0)
    throw new ApiError("bad_request", "Send at least one field to change.");
  await rpc(auth, "sp_focus_get"); // makes sure the row exists
  return json(
    unwrap(
      await db(auth)
        .from("sp_focus_settings")
        .update(patch)
        .eq("user_id", auth.userId)
        .select()
        .single(),
    ),
  );
});
