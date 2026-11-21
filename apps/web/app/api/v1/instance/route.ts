import type { Instance } from "@stellar/shared";
import { getConfig } from "@/lib/server/config";
import { api, json, preflight } from "@/lib/server/http";
import { API_VERSION, APP_VERSION } from "@/lib/server/version";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Public. Lets a client that only knows the app URL bootstrap everything else. */
export const GET = api(async () => {
  const c = getConfig();
  const body: Instance = {
    name: "Stellar Planner",
    version: APP_VERSION,
    apiVersion: API_VERSION,
    configured: c.configured,
    supabaseUrl: c.configured ? c.supabaseUrl : null,
    supabaseAnonKey: c.configured ? c.supabaseAnonKey : null,
    vapidPublicKey: c.configured ? (c.vapid?.publicKey ?? null) : null,
  };
  const res = json(body);
  // Instance discovery is public by design (it only exposes the anon key).
  res.headers.set("Access-Control-Allow-Origin", "*");
  return res;
});
