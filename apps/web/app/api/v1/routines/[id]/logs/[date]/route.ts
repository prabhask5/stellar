import { zDate, zId, zRoutineLogSet } from "@stellar/shared";
import { api, json, preflight, readJson } from "@/lib/server/http";
import { guard, rpc } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Sets one day's result for a routine: `completed` for to-dos, `amount` for progress routines. */
export const PUT = api<{ id: string; date: string }>(async (req, { id, date }) => {
  const auth = await guard(req);
  const body = zRoutineLogSet.parse(await readJson(req));
  const log = await rpc(auth, "sp_routine_log_set", {
    p_routine_id: zId.parse(id),
    p_date: zDate.parse(date),
    p_completed: body.completed ?? null,
    p_amount: body.amount ?? null,
  });
  return json(log);
});
