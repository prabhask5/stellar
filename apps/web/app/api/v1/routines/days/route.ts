import { zDate } from "@stellar/shared";
import { api, json, preflight } from "@/lib/server/http";
import { guard, rpc } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Scheduled routine instances and the day's completion, for each date in the range (max 400 days). */
export const GET = api(async (req) => {
  const auth = await guard(req);
  const p = req.nextUrl.searchParams;
  const days = await rpc(auth, "sp_routine_days", {
    p_from: zDate.parse(p.get("from")),
    p_to: zDate.parse(p.get("to")),
  });
  return json({ data: days, streaks: await rpc(auth, "sp_routine_streaks") });
});
