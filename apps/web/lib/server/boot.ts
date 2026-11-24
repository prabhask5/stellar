import { applyPinReset, getConfig } from "./config";
import { migrate } from "./setup";
import { startScheduler } from "./scheduler";

declare global {
  var __stellarBooted: boolean | undefined;
}

/** Idempotent boot sequence. Never throws: a failed step is logged and the server still starts. */
export async function boot(): Promise<void> {
  if (globalThis.__stellarBooted) return;
  globalThis.__stellarBooted = true;

  try {
    if (applyPinReset()) {
      console.info(
        "[boot] RESET_PIN is set: the PIN was cleared. Open the app to create a new one, then remove RESET_PIN.",
      );
    }
  } catch (err) {
    console.error("[boot] could not apply RESET_PIN:", err instanceof Error ? err.message : err);
  }

  // Database migrations never need the owner: every start brings the schema up to date by
  // whichever automatic route this instance has. It runs beside the server starting, not
  // before it, so a slow or briefly unreachable database cannot hold up the health check.
  void migrateOnBoot();

  // The loop itself waits until the app is configured, so it is safe to start now.
  startScheduler();
}

/** Waits between attempts when the database is not reachable yet (it may still be starting). */
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 300_000];

/**
 * Applies pending migrations after an update, with no manual step:
 *  1. over the Postgres connection string, when one is configured;
 *  2. otherwise through the instance's own pg-meta endpoint with the service role, which
 *     every self-hosted Supabase exposes.
 * Only an instance with neither (a hosted project without a connection string) is left
 * for Settings → Connection, and the app keeps working against the older schema meanwhile.
 * Every migration is idempotent, so running this on each start is safe.
 */
export async function migrateOnBoot(
  delays: readonly number[] = RETRY_DELAYS_MS,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<"applied" | "current" | "manual" | "failed" | "unconfigured"> {
  for (let attempt = 0; ; attempt++) {
    try {
      const config = getConfig();
      // Before the setup wizard has connected Supabase there is nothing to migrate.
      if (!config.supabaseUrl || !config.supabaseServiceRoleKey) return "unconfigured";
      const result = await migrate();
      if (result.ok) {
        if (result.applied.length > 0)
          console.info(
            `[boot] applied migrations ${result.applied.join(", ")} (${result.method}); schema version ${result.schemaVersion}`,
          );
        return result.applied.length > 0 ? "applied" : "current";
      }
      if (result.method === "manual") {
        console.warn(
          "[boot] no automatic route to the database (no connection string, no pg-meta). Add the Postgres connection string under Settings → Connection and migrations will run on every start.",
        );
        return "manual";
      }
      console.error(`[boot] migrations failed (${result.method}): ${result.error}`);
    } catch (err) {
      console.error("[boot] could not run migrations:", err instanceof Error ? err.message : err);
    }
    const delay = delays[attempt];
    if (delay === undefined) return "failed";
    await wait(delay);
  }
}
