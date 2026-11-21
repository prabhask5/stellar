import { zGoalIncrement, zId } from "@stellar/shared";
import { api, json, preflight, readJson } from "@/lib/server/http";
import { guard, rpc } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Adds `delta` (may be negative) to a progress goal. Completion follows from the new amount. */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const auth = await guard(req);
  const { delta } = zGoalIncrement.parse(await readJson(req));
  return json(await rpc(auth, "sp_goal_increment", { p_goal_id: zId.parse(id), p_delta: delta }));
});
