import { clearSessionCookies, logAuthEvent, signOutEverywhere } from "@/lib/server/auth";
import { api, clientIp, json, preflight } from "@/lib/server/http";
import { authenticate } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Rotates the hidden owner password and ends every session on every device. */
export const POST = api(async (req) => {
  const auth = await authenticate(req, { verify: true });
  await signOutEverywhere(auth.token);
  await logAuthEvent("signed_out_everywhere", null, clientIp(req));
  await clearSessionCookies();
  return json({ ok: true });
});
