import type { DeviceInfo } from "@stellar/shared";
import { cookies } from "next/headers";
import { canRevokeDevices } from "@/lib/server/auth";
import { ApiError, api, json, preflight } from "@/lib/server/http";
import { authenticate, DEVICE_COOKIE } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Devices that have signed in, most recently seen first. */
export const GET = api(async (req) => {
  const auth = await authenticate(req);
  const { data, error } = await auth.supabase
    .from("sp_devices")
    .select("id, name, kind, last_seen_at, created_at, revoked_at, auth_session_id")
    .order("last_seen_at", { ascending: false });
  if (error) throw new ApiError("upstream_error", error.message);
  const store = await cookies();
  const cookieDevice = store.get(DEVICE_COOKIE)?.value ?? null;
  const devices: DeviceInfo[] = (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    kind: d.kind as DeviceInfo["kind"],
    last_seen_at: d.last_seen_at,
    created_at: d.created_at,
    revoked_at: d.revoked_at,
    current:
      (auth.sessionId !== null && d.auth_session_id === auth.sessionId) || d.id === cookieDevice,
  }));
  return json({
    data: devices,
    can_revoke: canRevokeDevices(),
    server_time: new Date().toISOString(),
  });
});
