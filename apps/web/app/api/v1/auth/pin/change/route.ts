import { zChangePinRequest } from "@stellar/shared";
import { changePin } from "@/lib/server/auth";
import { api, json, preflight, readJson } from "@/lib/server/http";
import { authenticate } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Changes the PIN. Requires a session and the current PIN. */
export const POST = api(async (req) => {
  await authenticate(req, { verify: true });
  const body = zChangePinRequest.parse(await readJson(req));
  await changePin(req, body.current_pin, body.new_pin);
  return json({ ok: true });
});
