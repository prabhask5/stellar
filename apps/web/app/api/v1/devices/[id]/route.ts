import { zId } from "@stellar/shared";
import { logAuthEvent, revokeDevice } from "@/lib/server/auth";
import { ApiError, api, clientIp, json, preflight } from "@/lib/server/http";
import { authenticate } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Revokes one device by deleting its auth session. Needs DATABASE_URL. */
export const DELETE = api<{ id: string }>(async (req, params) => {
  await authenticate(req, { verify: true });
  const id = zId.parse(params.id);
  const found = await revokeDevice(id);
  if (!found) throw new ApiError("not_found", "That device was not found.");
  await logAuthEvent("device_revoked", null, clientIp(req));
  return json({ ok: true });
});
