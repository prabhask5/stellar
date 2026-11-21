import { zGoalCreate, zId } from "@stellar/shared";
import { api, preflight } from "@/lib/server/http";
import { create, guard, list } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = api(async (req) =>
  list(req, await guard(req), {
    table: "sp_goals",
    softDelete: true,
    order: [
      ["sort_order", true],
      ["created_at", true],
    ],
    filter: (q, p) => (p.get("list_id") ? q.eq("list_id", zId.parse(p.get("list_id"))) : q),
  }),
);

export const POST = api(async (req) => create(req, await guard(req), "sp_goals", zGoalCreate));
