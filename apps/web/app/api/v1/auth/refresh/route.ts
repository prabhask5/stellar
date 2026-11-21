import { zRefreshRequest } from "@stellar/shared";
import { refreshTokens } from "@/lib/server/auth";
import { api, json, preflight, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Exchanges a refresh token for a new session (extension, iOS). */
export const POST = api(async (req) => {
  const { refresh_token } = zRefreshRequest.parse(await readJson(req));
  return json({ session: await refreshTokens(req, refresh_token) });
});
