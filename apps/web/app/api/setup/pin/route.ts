import { zDeviceInput } from "@stellar/shared";
import { z } from "zod";
import { logAuthEvent, pinLogin } from "@/lib/server/auth";
import { getConfig, resetPinRequested } from "@/lib/server/config";
import { ApiError, api, clientIp, json, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { createPin } from "@/lib/server/setup";

export const dynamic = "force-dynamic";

const zBody = z.object({
  pin: z.string().min(1).max(64),
  confirm: z.string().min(1).max(64),
  device: zDeviceInput,
});

/**
 * Creates the PIN (first run, or after RESET_PIN), creates or re-keys the
 * hidden owner, generates VAPID keys, then signs this browser in.
 */
export const POST = api(async (req) => {
  const limited = rateLimit(`setup-pin:${clientIp(req)}`, 10, 60_000);
  if (!limited.allowed)
    throw new ApiError(
      "rate_limited",
      "Too many requests. Wait a moment and try again.",
      limited.retryAfterSeconds,
    );
  const body = zBody.parse(await readJson(req));
  const wasReset = getConfig().setupCompletedAt !== null;
  await createPin(body.pin, body.confirm);
  const result = await pinLogin(req, { pin: body.pin, device: body.device });
  if (wasReset) await logAuthEvent("pin_reset", body.device.kind, clientIp(req));
  return json({
    ok: true,
    device_id: result.deviceId,
    reset: wasReset,
    resetPinEnv: resetPinRequested(),
  });
});
