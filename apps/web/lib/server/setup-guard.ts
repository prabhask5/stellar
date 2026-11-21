import type { NextRequest } from "next/server";
import { getConfig } from "./config";
import { ApiError, clientIp } from "./http";
import { rateLimit } from "./rate-limit";
import { authenticate } from "./supabase";

/**
 * Connection and migration endpoints are open only during first-run setup.
 * Once setup has completed they belong to Settings → Connection and need a session.
 */
export async function guardSetup(req: NextRequest): Promise<void> {
  const limited = rateLimit(`setup:${clientIp(req)}`, 40, 60_000);
  if (!limited.allowed)
    throw new ApiError(
      "rate_limited",
      "Too many requests. Wait a moment and try again.",
      limited.retryAfterSeconds,
    );
  const c = getConfig();
  if (c.setupCompletedAt === null) return;
  if (!c.configured) throw new ApiError("forbidden", "Create your PIN first.");
  await authenticate(req, { verify: true });
}
