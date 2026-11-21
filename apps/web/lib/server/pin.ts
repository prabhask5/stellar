import { timingSafeEqual } from "node:crypto";
import { hash, type Options, verify } from "@node-rs/argon2";

/** argon2id with OWASP-recommended parameters (19 MiB, 2 passes). */
// algorithm 2 = Argon2id (the enum is ambient-const, so its value is written out).
const OPTIONS: Options = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const PIN_RE = /^\d{6,12}$/;

export function isValidPin(pin: string): boolean {
  return PIN_RE.test(pin);
}

export function hashPin(pin: string): Promise<string> {
  return hash(pin, OPTIONS);
}

export async function verifyPin(pinHash: string, pin: string): Promise<boolean> {
  try {
    return await verify(pinHash, pin);
  } catch {
    return false;
  }
}

/** Constant-time string comparison for tokens. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
