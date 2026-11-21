import { api, json, preflight } from "@/lib/server/http";
import { guard, rpc } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Everything needed to draw the universe: score, era, and the bodies earned so far. */
export const GET = api(async (req) => json(await rpc(await guard(req), "sp_universe_snapshot")));
