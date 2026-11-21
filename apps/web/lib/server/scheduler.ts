import { phaseEndMessage, type TimerPhase, type TimerSettings } from "@stellar/shared";
import { getConfig, type ReadyConfig } from "./config";
import { sendPush } from "./push";
import { adminClient } from "./supabase";

declare global {
  var __stellarScheduler: { timer: NodeJS.Timeout; startedAt: number } | undefined;
}

const TICK_MS = 2000;
const PURGE_EVERY_MS = 24 * 60 * 60 * 1000;

interface PhaseEnd {
  user_id: string;
  completed_phase: TimerPhase;
  completed_at: string;
  next_phase: TimerPhase;
  status: string;
  stale: boolean;
  settings: TimerSettings;
}

let running = false;
let lastPurge = 0;
let lastError = "";

async function tick(): Promise<void> {
  if (running) return; // never overlap a slow tick
  let config;
  try {
    config = getConfig();
  } catch {
    return;
  }
  if (!config.configured) return;
  running = true;
  try {
    const ready = config as ReadyConfig;
    const admin = adminClient(ready);
    // Advances every due timer and returns each completed phase exactly once.
    const { data, error } = await admin.rpc("sp_scheduler_tick");
    if (error) throw new Error(error.message);
    for (const end of (data ?? []) as unknown as PhaseEnd[]) {
      if (end.user_id !== ready.ownerUserId || end.stale) continue;
      const message = phaseEndMessage(end.completed_phase, end.next_phase, end.settings);
      await sendPush({ ...message, tag: "focus-phase", url: "/focus" }, ready);
    }
    if (Date.now() - lastPurge > PURGE_EVERY_MS) {
      lastPurge = Date.now();
      await admin.rpc("sp_purge_deleted");
    }
    lastError = "";
  } catch (err) {
    // Log a failure once, not every two seconds.
    const message = err instanceof Error ? err.message : String(err);
    if (message !== lastError) {
      lastError = message;
      console.error("[scheduler]", message);
    }
  } finally {
    running = false;
  }
}

/**
 * The scheduler loop: the authoritative advancer for focus phases, and the
 * sender of phase-end notifications. Started once per process; a second call
 * (hot reload, repeated register) is a no-op.
 */
export function startScheduler(): void {
  if (globalThis.__stellarScheduler) return;
  const timer = setInterval(() => void tick(), TICK_MS);
  timer.unref?.();
  globalThis.__stellarScheduler = { timer, startedAt: Date.now() };
}

export function stopScheduler(): void {
  if (!globalThis.__stellarScheduler) return;
  clearInterval(globalThis.__stellarScheduler.timer);
  globalThis.__stellarScheduler = undefined;
}

export function schedulerRunning(): boolean {
  return Boolean(globalThis.__stellarScheduler);
}
