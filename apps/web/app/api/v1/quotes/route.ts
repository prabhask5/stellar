import { zId, zQuoteCreate } from "@stellar/shared";
import { ApiError, api, preflight, readJson } from "@/lib/server/http";
import { create, guard, list, remove } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Built-in quotes plus your own. */
export const GET = api(async (req) =>
  list(req, await guard(req), {
    table: "sp_quotes",
    softDelete: false,
    order: [
      ["is_builtin", true],
      ["created_at", true],
    ],
  }),
);

export const POST = api(async (req) => create(req, await guard(req), "sp_quotes", zQuoteCreate));

/** Deletes one of your own quotes: `DELETE /quotes?id=…` (or `{ "id": … }` in the body). Built-in quotes can't be deleted. */
export const DELETE = api(async (req) => {
  const auth = await guard(req);
  const id = req.nextUrl.searchParams.get("id") ?? ((await readJson(req)) as { id?: string }).id;
  if (!id) throw new ApiError("bad_request", "Say which quote to delete: ?id=<uuid>.");
  return remove(auth, "sp_quotes", zId.parse(id), false);
});
