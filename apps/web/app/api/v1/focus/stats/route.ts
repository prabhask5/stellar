import { api, json, preflight } from "@/lib/server/http";
import { guard, rpc } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Focus minutes today, in total, the current day streak, and a per-day series (`days`, default 30, max 366). */
export const GET = api(async (req) => {
  const auth = await guard(req);
  const days = Number(req.nextUrl.searchParams.get("days") ?? 30);
  return json(
    await rpc(auth, "sp_focus_stats", { p_days: Number.isFinite(days) ? Math.trunc(days) : 30 }),
  );
});
