import { z } from "zod";
import { getConfig, updateStoredConfig } from "@/lib/server/config";
import { api, json, readJson } from "@/lib/server/http";
import { probeSupabase } from "@/lib/server/probe";
import { guardSetup } from "@/lib/server/setup-guard";

export const dynamic = "force-dynamic";

const zBody = z.object({
  url: z.string().max(2000).default(""),
  anonKey: z.string().max(4000).default(""),
  serviceRoleKey: z.string().max(4000).default(""),
  databaseUrl: z.string().max(4000).default(""),
  /** Probe only; do not save. Used by "Test connection" in Settings. */
  dryRun: z.boolean().default(false),
});

/** Normalises the URL, probes the instance and, when every check passes, saves the connection. */
export const POST = api(async (req) => {
  await guardSetup(req);
  const body = zBody.parse(await readJson(req));
  const current = getConfig();
  // Values supplied through the environment win and are not editable here.
  const input = {
    url: current.fromEnv.supabaseUrl
      ? (current.supabaseUrl ?? "")
      : body.url || current.supabaseUrl || "",
    anonKey: current.fromEnv.anonKey
      ? (current.supabaseAnonKey ?? "")
      : body.anonKey || current.supabaseAnonKey || "",
    serviceRoleKey: current.fromEnv.serviceRoleKey
      ? (current.supabaseServiceRoleKey ?? "")
      : body.serviceRoleKey || current.supabaseServiceRoleKey || "",
  };
  const databaseUrl = body.databaseUrl.trim();
  if (databaseUrl && !/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    return json({
      ok: false,
      url: null,
      saved: false,
      checks: [
        {
          id: "url",
          label: "Postgres connection string",
          ok: false,
          message: "The connection string should start with postgres:// or postgresql://.",
          hint: "It looks like postgresql://postgres:password@host:5432/postgres.",
        },
      ],
    });
  }
  const result = await probeSupabase(input);
  let saved = false;
  if (result.ok && result.url && !body.dryRun) {
    const changed =
      result.url !== current.supabaseUrl ||
      input.anonKey.trim() !== current.supabaseAnonKey ||
      input.serviceRoleKey.trim() !== current.supabaseServiceRoleKey;
    updateStoredConfig({
      supabaseUrl: result.url,
      supabaseAnonKey: input.anonKey.trim(),
      supabaseServiceRoleKey: input.serviceRoleKey.trim(),
      ...(databaseUrl ? { databaseUrl } : {}),
      // A different instance must be verified again.
      ...(changed ? { schemaVerified: false } : {}),
    });
    saved = true;
  }
  return json({ ...result, saved });
});
