import { api, json, preflight } from "@/lib/server/http";
import { guard, rpc } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Moves every overdue, incomplete task to today. Returns what moved, so it can be undone. */
export const POST = api(async (req) =>
  json(await rpc(await guard(req), "sp_postpone_overdue_to_today")),
);
