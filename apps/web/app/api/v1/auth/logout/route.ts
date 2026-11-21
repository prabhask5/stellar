import { clearSessionCookies, logAuthEvent, signOut } from "@/lib/server/auth";
import { api, clientIp, json, preflight } from "@/lib/server/http";
import { adminClient, authenticate } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Ends the caller's session and clears the web cookies. Safe to call when already signed out. */
export const POST = api(async (req) => {
  try {
    const auth = await authenticate(req);
    await signOut(auth.token, "local");
    if (auth.sessionId) {
      await adminClient()
        .from("sp_devices")
        .update({ revoked_at: new Date().toISOString(), auth_session_id: null })
        .eq("auth_session_id", auth.sessionId);
    }
    await logAuthEvent("signed_out", null, clientIp(req));
  } catch {
    // no valid session: still clear cookies below
  }
  await clearSessionCookies();
  return json({ ok: true });
});
