import { zRoutineCreate } from "@stellar/shared";
import { api, preflight } from "@/lib/server/http";
import { create, guard, list } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = api(async (req) =>
  list(req, await guard(req), {
    table: "sp_routines",
    softDelete: true,
    order: [
      ["sort_order", true],
      ["created_at", true],
    ],
  }),
);

export const POST = api(async (req) =>
  create(req, await guard(req), "sp_routines", zRoutineCreate),
);
