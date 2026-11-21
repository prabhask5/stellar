import { zPinRequest } from "@stellar/shared";
import { pinLogin } from "@/lib/server/auth";
import { api, json, preflight, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * Verifies the PIN and signs the hidden owner in. Web and PWA clients receive
 * httpOnly cookies and no tokens; extension and iOS clients receive the session.
 */
export const POST = api(async (req) => {
  const body = zPinRequest.parse(await readJson(req));
  const result = await pinLogin(req, body);
  return json({
    ok: true as const,
    device_id: result.deviceId,
    ...(result.session ? { session: result.session } : {}),
  });
});
