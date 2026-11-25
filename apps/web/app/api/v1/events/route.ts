import { zEventCreate } from "@stellar/shared";
import { api, preflight } from "@/lib/server/http";
import { create, guard, list } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = api(async (req) =>
  list(req, await guard(req), {
    table: "sp_events",
    softDelete: false,
    order: [
      ["date", true],
      ["time", true],
      ["created_at", true],
    ],
  }),
);

export const POST = api(async (req) => create(req, await guard(req), "sp_events", zEventCreate));
