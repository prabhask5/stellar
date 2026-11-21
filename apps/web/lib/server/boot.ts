import { runMigrations } from "@stellar/db/runner";
import { applyPinReset, getConfig, updateStoredConfig } from "./config";
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

  try {
    const config = getConfig();
    if (config.databaseUrl && config.supabaseUrl) {
      const result = await runMigrations(config.databaseUrl);
      if (!result.ok) {
        console.error(`[boot] migrations failed: ${result.error}`);
      } else {
        if (result.applied.length > 0)
          console.info(`[boot] applied migrations: ${result.applied.join(", ")}`);
        if (!config.schemaVerified) updateStoredConfig({ schemaVerified: true });
      }
    }
  } catch (err) {
    console.error("[boot] could not run migrations:", err instanceof Error ? err.message : err);
  }

  // The loop itself waits until the app is configured, so it is safe to start now.
  startScheduler();
}
