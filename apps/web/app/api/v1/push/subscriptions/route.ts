import { zPushSubscribe, zPushUnsubscribe } from "@stellar/shared";
import { cookies } from "next/headers";
import { ApiError, api, json, preflight, readJson } from "@/lib/server/http";
import { authenticate, DEVICE_COOKIE } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Registers (or refreshes) this device's push subscription. */
export const POST = api(async (req) => {
  const auth = await authenticate(req);
  const body = zPushSubscribe.parse(await readJson(req));
  const store = await cookies();
  const deviceId = body.device_id ?? store.get(DEVICE_COOKIE)?.value ?? null;
  const { data, error } = await auth.supabase
    .from("sp_push_subscriptions")
    .upsert(
      {
        user_id: auth.userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        device_id: deviceId,
      },
      { onConflict: "endpoint" },
    )
    .select("id, endpoint, created_at")
    .single();
  if (error) throw new ApiError("upstream_error", error.message);
  return json(data, { status: 201 });
});

/** Removes a subscription by endpoint. Idempotent. */
export const DELETE = api(async (req) => {
  const auth = await authenticate(req);
  const body = zPushUnsubscribe.parse(await readJson(req));
  const { error } = await auth.supabase
    .from("sp_push_subscriptions")
    .delete()
    .eq("endpoint", body.endpoint);
  if (error) throw new ApiError("upstream_error", error.message);
  return json({ ok: true });
});

/** The subscriptions registered for the owner (endpoints only). */
export const GET = api(async (req) => {
  const auth = await authenticate(req);
  const { data, error } = await auth.supabase
    .from("sp_push_subscriptions")
    .select("id, endpoint, device_id, created_at")
    .order("created_at");
  if (error) throw new ApiError("upstream_error", error.message);
  return json({ data: data ?? [], deleted_ids: [], server_time: new Date().toISOString() });
});
