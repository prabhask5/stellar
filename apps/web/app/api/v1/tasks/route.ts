import { zDate, zId, zTaskCreate, zTaskView } from "@stellar/shared";
import { api, json, preflight } from "@/lib/server/http";
import { create, guard, list, now, rpc } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * Without `view`: every live task (or the changes since `updated_since`).
 * With `view`: the same filtering and ordering the app's Tasks screen uses.
 */
export const GET = api(async (req) => {
  const auth = await guard(req);
  const p = req.nextUrl.searchParams;
  const view = p.get("view");
  if (!view || p.get("updated_since")) {
    return list(req, auth, {
      table: "sp_tasks",
      softDelete: true,
      order: [
        ["sort_order", true],
        ["created_at", true],
      ],
    });
  }
  const data = await rpc(auth, "sp_tasks_view", {
    p_view: zTaskView.parse(view),
    p_list_id: p.get("list_id") ? zId.parse(p.get("list_id")) : null,
    p_from: p.get("from") ? zDate.parse(p.get("from")) : null,
    p_to: p.get("to") ? zDate.parse(p.get("to")) : null,
    p_include_completed: p.get("include_completed") === "true",
  });
  return json({ data, deleted_ids: [], server_time: now() });
});

export const POST = api(async (req) => create(req, await guard(req), "sp_tasks", zTaskCreate));
