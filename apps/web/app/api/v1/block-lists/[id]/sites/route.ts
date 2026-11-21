import { zId, zSitePattern, zSitesAdd, zSitesRemove } from "@stellar/shared";
import type { NextRequest } from "next/server";
import { ApiError, api, json, preflight, readJson } from "@/lib/server/http";
import { db, guard, unwrap } from "@/lib/server/resource";
import type { AuthContext } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

async function sitesOf(auth: AuthContext, listId: string) {
  const list = unwrap(
    await db(auth)
      .from("sp_block_lists")
      .select("id")
      .eq("id", listId)
      .is("deleted_at", null)
      .maybeSingle(),
  );
  if (!list) throw new ApiError("not_found", "Not found.");
  const sites = unwrap(
    await db(auth)
      .from("sp_block_list_sites")
      .select("id,pattern")
      .eq("block_list_id", listId)
      .order("pattern", { ascending: true }),
  );
  return json({ id: listId, sites });
}

async function patterns(req: NextRequest, schema: typeof zSitesAdd): Promise<string[]> {
  const body = schema.parse(await readJson(req));
  // Anything pasted from an address bar becomes a bare domain: "https://www.YouTube.com/watch" → "youtube.com".
  return [...new Set(body.patterns.map((p) => zSitePattern.parse(p)))];
}

/** Adds sites to a list. Duplicates are ignored. Returns the list's sites. */
export const POST = api<{ id: string }>(async (req, params) => {
  const auth = await guard(req);
  const id = zId.parse(params.id);
  const rows = (await patterns(req, zSitesAdd)).map((pattern) => ({ block_list_id: id, pattern }));
  unwrap(
    await db(auth)
      .from("sp_block_list_sites")
      .upsert(rows, { onConflict: "block_list_id,pattern", ignoreDuplicates: true })
      .select("id"),
  );
  return sitesOf(auth, id);
});

/** Removes sites from a list. Returns the list's remaining sites. */
export const DELETE = api<{ id: string }>(async (req, params) => {
  const auth = await guard(req);
  const id = zId.parse(params.id);
  unwrap(
    await db(auth)
      .from("sp_block_list_sites")
      .delete()
      .eq("block_list_id", id)
      .in("pattern", await patterns(req, zSitesRemove))
      .select("id"),
  );
  return sitesOf(auth, id);
});
