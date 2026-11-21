import { api, json, preflight } from "@/lib/server/http";
import { guard, rpc } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = api(async (req) => json(await rpc(await guard(req), "sp_random_quote")));
