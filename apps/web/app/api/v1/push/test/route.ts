import { api, clientIp, json, preflight, ApiError } from "@/lib/server/http";
import { sendPush } from "@/lib/server/push";
import { rateLimit } from "@/lib/server/rate-limit";
import { authenticate } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Sends a test notification to every subscribed device. */
export const POST = api(async (req) => {
  // Acts with the server's own credentials afterwards, so the token is checked with the auth
  // server here (a token that is merely well-formed is not enough).
  await authenticate(req, { verify: true });
  const limited = rateLimit(`push-test:${clientIp(req)}`, 6, 60_000);
  if (!limited.allowed)
    throw new ApiError(
      "rate_limited",
      "Too many test notifications. Wait a moment.",
      limited.retryAfterSeconds,
    );
  const result = await sendPush({
    title: "Stellar Planner",
    body: "Notifications are on. You'll hear from us when a phase ends.",
    tag: "test",
    url: "/focus",
  });
  return json(result);
});
