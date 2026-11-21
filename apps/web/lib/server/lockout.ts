import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dataPath } from "./paths";

/**
 * Escalating PIN lockout, persisted so a restart does not reset it.
 * 5 failed attempts → 30s; every further failure doubles it; capped at 1 hour.
 */
export interface LockoutState {
  failures: number;
  lockedUntil: number; // epoch ms, 0 when not locked
  lastFailureAt: number;
}

export const FREE_ATTEMPTS = 5;
export const BASE_LOCK_MS = 30_000;
export const MAX_LOCK_MS = 3_600_000;

const FILE = "lockout.json";
const EMPTY: LockoutState = { failures: 0, lockedUntil: 0, lastFailureAt: 0 };

/** Lock duration after the nth consecutive failure (0 while attempts remain). */
export function lockDurationMs(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  const doublings = Math.min(failures - FREE_ATTEMPTS, 20);
  return Math.min(BASE_LOCK_MS * 2 ** doublings, MAX_LOCK_MS);
}

export function nextOnFailure(state: LockoutState, now: number): LockoutState {
  const failures = state.failures + 1;
  const duration = lockDurationMs(failures);
  return { failures, lockedUntil: duration ? now + duration : 0, lastFailureAt: now };
}

export function remainingLockMs(state: LockoutState, now: number): number {
  return Math.max(0, state.lockedUntil - now);
}

export function readLockout(): LockoutState {
  const file = dataPath(FILE);
  if (!existsSync(file)) return EMPTY;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<LockoutState>;
    return {
      failures: Number(raw.failures) || 0,
      lockedUntil: Number(raw.lockedUntil) || 0,
      lastFailureAt: Number(raw.lastFailureAt) || 0,
    };
  } catch {
    // A corrupt file must not unlock the app: treat it as freshly locked.
    return {
      failures: FREE_ATTEMPTS,
      lockedUntil: Date.now() + BASE_LOCK_MS,
      lastFailureAt: Date.now(),
    };
  }
}

function write(state: LockoutState): void {
  const file = dataPath(FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  renameSync(tmp, file);
}

export function recordFailure(now = Date.now()): LockoutState {
  const next = nextOnFailure(readLockout(), now);
  write(next);
  return next;
}

export function clearLockout(): void {
  write(EMPTY);
}
