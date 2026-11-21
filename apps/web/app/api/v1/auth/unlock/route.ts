import { z } from "zod";
import { checkPin } from "@/lib/server/auth";
import { api, json, readJson } from "@/lib/server/http";
import { authenticate } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/** Re-checks the PIN for the inactivity lock. Needs an existing session; shares the PIN lockout. */
export const POST = api(async (req) => {
  await authenticate(req);
  const { pin } = z.object({ pin: z.string().min(1).max(64) }).parse(await readJson(req));
  await checkPin(req, pin, "web");
  return json({ ok: true });
});
