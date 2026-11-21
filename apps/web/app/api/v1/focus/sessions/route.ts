import { api, preflight } from "@/lib/server/http";
import { guard, list } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Finished timer phases, newest first. `from` and `to` bound `started_at` (ISO dates or timestamps). */
export const GET = api(async (req) =>
  list(req, await guard(req), {
    table: "sp_focus_sessions",
    softDelete: false,
    order: [["started_at", false]],
    limit: 2000,
    filter: (q, p) => {
      let out = q;
      const from = p.get("from");
      const to = p.get("to");
      if (from) out = out.gte("started_at", from);
      if (to)
        out = out.lte("started_at", /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to);
      return out;
    },
  }),
);
