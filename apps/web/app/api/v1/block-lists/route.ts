import { zBlockListCreate } from "@stellar/shared";
import { api, json, preflight } from "@/lib/server/http";
import { create, db, guard, list, unwrap } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Block lists, each with its `sites`. */
export const GET = api(async (req) => {
  const auth = await guard(req);
  const res = await list(req, auth, {
    table: "sp_block_lists",
    softDelete: true,
    order: [
      ["sort_order", true],
      ["created_at", true],
    ],
  });
  const body = (await res.json()) as {
    data: { id: string; sites?: unknown[] }[];
    deleted_ids: string[];
    server_time: string;
  };
  if (body.data.length > 0) {
    const sites = unwrap(
      await db(auth)
        .from("sp_block_list_sites")
        .select("id,block_list_id,pattern")
        .in(
          "block_list_id",
          body.data.map((l) => l.id),
        )
        .order("pattern", { ascending: true })
        .limit(20000),
    );
    for (const l of body.data)
      l.sites = sites
        .filter((s) => s.block_list_id === l.id)
        .map((s) => ({ id: s.id, pattern: s.pattern }));
  }
  return json(body);
});

export const POST = api(async (req) =>
  create(req, await guard(req), "sp_block_lists", zBlockListCreate),
);
