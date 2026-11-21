import { zFocusActionRequest } from "@stellar/shared";
import { api, json, preflight, readJson } from "@/lib/server/http";
import { guard, rpc } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * The only way to change the timer. The database applies the transition if
 * `expectedVersion` still matches; otherwise `ok` is false and the current
 * state comes back so the client can adopt it.
 */
export const POST = api(async (req) => {
  const auth = await guard(req);
  const body = zFocusActionRequest.parse(await readJson(req));
  const result = await rpc<{ ok: boolean }>(auth, "sp_timer_action", {
    p_action: body.action,
    p_expected_version: body.expectedVersion,
  });
  return json(result, { status: result.ok ? 200 : 409 });
});
