import { normalizeSupabaseUrl } from "@stellar/shared";
import { decodeJwt } from "./supabase";

export type CheckId = "url" | "auth" | "rest" | "service";

export interface Check {
  id: CheckId;
  label: string;
  ok: boolean;
  message: string;
  hint?: string;
}

export interface ProbeResult {
  ok: boolean;
  url: string | null;
  checks: Check[];
}

export interface ProbeInput {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

const TIMEOUT_MS = 8000;

async function get(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string } | { error: string }> {
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      cache: "no-store",
    });
    return { status: res.status, body: (await res.text()).slice(0, 2000) };
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    if (e.name === "TimeoutError") return { error: "timed out" };
    return { error: e.cause?.code ?? e.message };
  }
}

function roleOf(key: string): string | null {
  if (key.startsWith("sb_publishable_")) return "anon";
  if (key.startsWith("sb_secret_")) return "service_role";
  const role = decodeJwt(key)?.role;
  return typeof role === "string" ? role : null;
}

/** True when a 401/403 is about the key itself rather than about what the key may read. */
function keyRejected(status: number, body: string): boolean {
  if (status !== 401 && status !== 403) return false;
  return (
    /JWSError|JWT|PGRST30\d|invalid api key|no api key|invalid authentication|unauthorized/i.test(
      body,
    ) || body.trim() === ""
  );
}

function keyHeaders(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

/**
 * Checks a Supabase connection the way the wizard reports it: one clear
 * pass/fail per check, each with a hint about how to fix it.
 */
export async function probeSupabase(input: ProbeInput): Promise<ProbeResult> {
  const checks: Check[] = [];
  const anonKey = input.anonKey.trim();
  const serviceRoleKey = input.serviceRoleKey.trim();

  const normalized = normalizeSupabaseUrl(input.url);
  if (!normalized.ok) {
    checks.push({
      id: "url",
      label: "Supabase URL",
      ok: false,
      message: normalized.message,
      hint: "It looks like https://database.example.com.",
    });
    return { ok: false, url: null, checks };
  }
  const { url, changed, entered } = normalized.value;

  // Auth health
  const health = await get(`${url}/auth/v1/health`, anonKey ? keyHeaders(anonKey) : {});
  if ("error" in health) {
    checks.push({
      id: "url",
      label: "Supabase URL",
      ok: false,
      message: `Could not reach ${url} (${health.error}).`,
      hint: "Check the address, and that this server can reach it. If Supabase runs on the same host, use its public URL rather than localhost.",
    });
    return { ok: false, url, checks };
  }
  const looksLikeGoTrue = health.status === 200 && /gotrue|"version"|"name"/i.test(health.body);
  checks.push({
    id: "url",
    label: "Supabase URL",
    ok: true,
    message: changed ? `Found Supabase at ${url} (you entered ${entered}).` : `Reached ${url}.`,
  });
  if (looksLikeGoTrue) {
    checks.push({ id: "auth", label: "Auth service", ok: true, message: "Auth is healthy." });
  } else if (health.status === 401 || health.status === 403) {
    checks.push({
      id: "auth",
      label: "Auth service",
      ok: false,
      message: `Auth rejected the anon key (HTTP ${health.status}).`,
      hint: "Copy the anon key again from your Supabase settings (ANON_KEY in a self-hosted .env).",
    });
  } else {
    checks.push({
      id: "auth",
      label: "Auth service",
      ok: false,
      message: `${url}/auth/v1/health answered HTTP ${health.status}, which is not a Supabase auth service.`,
      hint: "Use the API URL (the Kong gateway, often port 8000), not the Studio dashboard address.",
    });
  }

  // REST with the anon key
  const anonRole = roleOf(anonKey);
  const serviceRole = roleOf(serviceRoleKey);
  if (!anonKey) {
    checks.push({
      id: "rest",
      label: "Database API (anon key)",
      ok: false,
      message: "Enter the anon key.",
    });
  } else if (anonRole === "service_role") {
    checks.push({
      id: "rest",
      label: "Database API (anon key)",
      ok: false,
      message: "That is a service role key, not the anon key.",
      hint: "The two keys look alike. The anon key is the public one; they may be swapped.",
    });
  } else {
    const rest = await get(`${url}/rest/v1/`, keyHeaders(anonKey));
    if ("error" in rest) {
      checks.push({
        id: "rest",
        label: "Database API (anon key)",
        ok: false,
        message: `Could not reach ${url}/rest/v1/ (${rest.error}).`,
      });
    } else if (rest.status === 200 || (rest.status < 500 && !keyRejected(rest.status, rest.body))) {
      // Some instances hide the schema root from anon; anything but a key error means the key was accepted.
      checks.push({
        id: "rest",
        label: "Database API (anon key)",
        ok: true,
        message: "The database API accepted the anon key.",
      });
    } else if (rest.status === 401 || rest.status === 403) {
      checks.push({
        id: "rest",
        label: "Database API (anon key)",
        ok: false,
        message: `The database API rejected the anon key (HTTP ${rest.status}).`,
        hint: "Make sure the key belongs to this Supabase instance and was copied in full.",
      });
    } else {
      checks.push({
        id: "rest",
        label: "Database API (anon key)",
        ok: false,
        message: `${url}/rest/v1/ answered HTTP ${rest.status}.`,
        hint: "PostgREST may be down, or the URL points somewhere other than the Supabase API.",
      });
    }
  }

  // Service role via the admin API
  if (!serviceRoleKey) {
    checks.push({
      id: "service",
      label: "Service role key",
      ok: false,
      message: "Enter the service role key.",
    });
  } else if (serviceRole === "anon") {
    checks.push({
      id: "service",
      label: "Service role key",
      ok: false,
      message: "That is an anon key, not the service role key.",
      hint: "Use SERVICE_ROLE_KEY. It is only stored on this server, encrypted.",
    });
  } else {
    // Looking up a user that cannot exist: 404 proves the key has admin rights without listing anyone.
    const adminRes = await get(
      `${url}/auth/v1/admin/users/00000000-0000-0000-0000-000000000000`,
      keyHeaders(serviceRoleKey),
    );
    if ("error" in adminRes) {
      checks.push({
        id: "service",
        label: "Service role key",
        ok: false,
        message: `Could not reach the admin API (${adminRes.error}).`,
      });
    } else if (adminRes.status === 404 || adminRes.status === 200) {
      checks.push({
        id: "service",
        label: "Service role key",
        ok: true,
        message: "The service role key works.",
      });
    } else {
      checks.push({
        id: "service",
        label: "Service role key",
        ok: false,
        message: `The admin API rejected the service role key (HTTP ${adminRes.status}).`,
        hint: "Copy SERVICE_ROLE_KEY again. It must be signed with the same JWT secret as this instance.",
      });
    }
  }

  return { ok: checks.every((c) => c.ok), url, checks };
}
