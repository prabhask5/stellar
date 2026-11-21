import { api, preflight } from "@/lib/server/http";
import { guard, reorder } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const POST = api(async (req) => reorder(req, await guard(req), "sp_goal_lists"));
