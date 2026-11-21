import { cookies } from "next/headers";
import { clearSessionCookies } from "@/lib/server/auth";
import { getConfig } from "@/lib/server/config";
import { ApiError, api, errorResponse, json } from "@/lib/server/http";
import { authenticate, decodeJwt, DEVICE_COOKIE } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/**
 * Web app only. The refresh token stays in an httpOnly cookie; this hands the
 * page a short-lived access token (kept in memory) so it can talk to Supabase
 * directly. Refreshing happens here, on the server.
 */
export const GET = api(async (req) => {
  const config = getConfig();
  if (!config.configured)
    return errorResponse("not_configured", "Stellar Planner has not been set up yet.");
  if (req.headers.get("authorization"))
    return errorResponse("bad_request", "This endpoint is for the web app's cookie session.");
  // Verified against the auth server, so a revoked or signed-out session ends here
  // rather than living on until its access token expires.
  const auth = await authenticate(req, { verify: true }).catch(async (err) => {
    if (err instanceof ApiError && err.code === "unauthorized") await clearSessionCookies();
    throw err;
  });
  const claims = decodeJwt(auth.token);
  const store = await cookies();
  return json({
    access_token: auth.token,
    expires_at: typeof claims?.exp === "number" ? claims.exp : Math.floor(Date.now() / 1000) + 300,
    user_id: auth.userId,
    device_id: store.get(DEVICE_COOKIE)?.value ?? null,
    supabase_url: config.supabaseUrl,
    supabase_anon_key: config.supabaseAnonKey,
    vapid_public_key: config.vapid?.publicKey ?? null,
    server_time: new Date().toISOString(),
  });
});
