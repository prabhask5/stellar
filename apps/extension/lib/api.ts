import { normalizeAppUrl } from "@stellar/shared/normalize";

export interface InstanceInfo {
  name: string;
  version: string;
  apiVersion: number;
  configured: boolean;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
}

export class ApiError extends Error {
  readonly code: string;
  readonly retryAfterSeconds: number | null;
  constructor(code: string, message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Step 1 of connecting: confirm that the address is a Stellar Planner instance. */
export async function findInstance(
  input: string,
): Promise<{ appUrl: string; instance: InstanceInfo }> {
  const normalized = normalizeAppUrl(input);
  if (!normalized.ok) throw new ApiError("bad_request", normalized.message);
  const appUrl = normalized.value;
  let res: Response;
  try {
    res = await fetch(`${appUrl}/api/v1/instance`, { cache: "no-store" });
  } catch {
    throw new ApiError(
      "network",
      `Can't reach ${new URL(appUrl).host}. Check the address and your connection.`,
    );
  }
  if (!res.ok)
    throw new ApiError("not_found", "That address answered, but it isn't Stellar Planner.");
  const instance = (await res.json().catch(() => null)) as InstanceInfo | null;
  if (!instance || instance.name !== "Stellar Planner")
    throw new ApiError("not_found", "That address answered, but it isn't Stellar Planner.");
  if (!instance.configured || !instance.supabaseUrl || !instance.supabaseAnonKey) {
    throw new ApiError(
      "not_configured",
      "This Stellar Planner hasn't been set up yet. Open it in a tab and finish setup first.",
    );
  }
  return { appUrl, instance };
}

export interface PinSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user_id: string;
}

/** Step 2: exchange the PIN for a Supabase session. */
export async function pinLogin(
  appUrl: string,
  pin: string,
  deviceName: string,
): Promise<{ session: PinSession; deviceId: string | null }> {
  let res: Response;
  try {
    res = await fetch(`${appUrl}/api/v1/auth/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, device: { name: deviceName, kind: "extension" } }),
    });
  } catch {
    throw new ApiError("network", "Can't reach your Stellar Planner. Check your connection.");
  }
  const body = (await res.json().catch(() => null)) as {
    session?: PinSession;
    device_id?: string | null;
    error?: { code: string; message: string; retry_after_seconds?: number };
  } | null;
  if (!res.ok || !body?.session) {
    throw new ApiError(
      body?.error?.code ?? "internal_error",
      body?.error?.message ?? "That didn't work. Try again.",
      body?.error?.retry_after_seconds ?? null,
    );
  }
  return { session: body.session, deviceId: body.device_id ?? null };
}
