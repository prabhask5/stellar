import { zEventUpdate } from "@stellar/shared";
import { api, preflight } from "@/lib/server/http";
import { guard, remove, update } from "@/lib/server/resource";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const PATCH = api<{ id: string }>(async (req, { id }) =>
  update(req, await guard(req), "sp_events", id, zEventUpdate),
);

export const DELETE = api<{ id: string }>(async (req, { id }) =>
  remove(await guard(req), "sp_events", id, false),
);
