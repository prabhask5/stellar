import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyPinReset,
  emptyConfig,
  getConfig,
  readStoredConfig,
  requireConfig,
  stageOf,
  updateStoredConfig,
  writeStoredConfig,
} from "@web/lib/server/config";
import { decryptJson, DecryptError, encryptJson } from "@web/lib/server/crypto";
import {
  BASE_LOCK_MS,
  clearLockout,
  lockDurationMs,
  MAX_LOCK_MS,
  nextOnFailure,
  readLockout,
  recordFailure,
  remainingLockMs,
} from "@web/lib/server/lockout";
import { dataPath, resetDataDirCache } from "@web/lib/server/paths";
import { hashPin, isValidPin, safeEqual, verifyPin } from "@web/lib/server/pin";
import { rateLimit, resetRateLimits } from "@web/lib/server/rate-limit";
import { appSecret } from "@web/lib/server/secret";

const ENV_KEYS = [
  "STELLAR_DATA_DIR",
  "APP_SECRET",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "PUBLIC_APP_URL",
  "RESET_PIN",
];
let dir: string;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  dir = mkdtempSync(path.join(tmpdir(), "stellar-test-"));
  process.env.STELLAR_DATA_DIR = dir;
  resetDataDirCache();
  resetRateLimits();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetDataDirCache();
  rmSync(dir, { recursive: true, force: true });
});

const complete = {
  supabaseUrl: "https://db.example.com",
  supabaseAnonKey: "anon",
  supabaseServiceRoleKey: "service",
  schemaVerified: true,
  ownerUserId: "0b1e7c9e-1111-4222-8333-444455556666",
  ownerPassword: "p".repeat(64),
  pinHash: "$argon2id$stub",
};

describe("config encryption", () => {
  it("round-trips JSON through AES-256-GCM", () => {
    const env = encryptJson({ hello: "world", n: 1 }, "a-long-enough-secret");
    expect(env.alg).toBe("aes-256-gcm");
    expect(JSON.stringify(env)).not.toContain("world");
    expect(decryptJson(env, "a-long-enough-secret")).toEqual({ hello: "world", n: 1 });
  });

  it("uses a fresh salt and IV every time", () => {
    const a = encryptJson({ x: 1 }, "secret-secret-secret");
    const b = encryptJson({ x: 1 }, "secret-secret-secret");
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).not.toBe(b.salt);
    expect(a.data).not.toBe(b.data);
  });

  it("detects a wrong key and tampering", () => {
    const env = encryptJson({ x: 1 }, "secret-secret-secret");
    expect(() => decryptJson(env, "another-secret-value")).toThrow(DecryptError);
    const flipped = Buffer.from(env.data, "base64");
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    expect(() =>
      decryptJson({ ...env, data: flipped.toString("base64") }, "secret-secret-secret"),
    ).toThrow(DecryptError);
    expect(() =>
      decryptJson({ ...env, tag: Buffer.alloc(16).toString("base64") }, "secret-secret-secret"),
    ).toThrow(DecryptError);
  });
});

describe("app secret", () => {
  it("generates and persists a secret when none is provided", () => {
    const first = appSecret();
    expect(first.source).toBe("file");
    expect(first.value.length).toBeGreaterThanOrEqual(32);
    expect(appSecret().value).toBe(first.value);
    expect(readFileSync(dataPath("secret"), "utf8").trim()).toBe(first.value);
    expect(statSync(dataPath("secret")).mode & 0o077).toBe(0);
  });

  it("prefers APP_SECRET from the environment", () => {
    process.env.APP_SECRET = "from-the-environment-123";
    expect(appSecret()).toEqual({ value: "from-the-environment-123", source: "env" });
    process.env.APP_SECRET = "short";
    expect(() => appSecret()).toThrow(/at least 16/);
  });
});

describe("config store", () => {
  it("starts unconfigured", () => {
    expect(readStoredConfig()).toBeNull();
    expect(getConfig()).toMatchObject({ configured: false, stage: "connect" });
    expect(() => requireConfig()).toThrow(/not been set up/);
  });

  it("writes an encrypted file and reads it back", () => {
    writeStoredConfig({ ...emptyConfig(), ...complete });
    const raw = readFileSync(dataPath("config.json"), "utf8");
    expect(raw).not.toContain("db.example.com");
    expect(raw).not.toContain("service");
    expect(statSync(dataPath("config.json")).mode & 0o077).toBe(0);
    expect(getConfig()).toMatchObject({
      configured: true,
      stage: "complete",
      supabaseUrl: "https://db.example.com",
    });
    expect(requireConfig().ownerUserId).toBe(complete.ownerUserId);
  });

  it("moves through the setup stages", () => {
    expect(stageOf({ ...emptyConfig() })).toBe("connect");
    expect(
      stageOf({
        ...emptyConfig(),
        supabaseUrl: "u",
        supabaseAnonKey: "a",
        supabaseServiceRoleKey: "s",
      }),
    ).toBe("database");
    expect(stageOf({ ...emptyConfig(), ...complete, pinHash: null })).toBe("pin");
    expect(stageOf({ ...emptyConfig(), ...complete })).toBe("complete");
  });

  it("lets environment variables override the stored values", () => {
    writeStoredConfig({ ...emptyConfig(), ...complete });
    process.env.SUPABASE_URL = "https://override.example.com/";
    process.env.PUBLIC_APP_URL = "https://planner.example.com/";
    const c = getConfig();
    expect(c.supabaseUrl).toBe("https://override.example.com");
    expect(c.publicAppUrl).toBe("https://planner.example.com");
    expect(c.fromEnv).toMatchObject({ supabaseUrl: true, anonKey: false });
  });

  it("can be bootstrapped from the environment alone up to the database stage", () => {
    process.env.SUPABASE_URL = "https://db.example.com";
    process.env.SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    expect(getConfig().stage).toBe("database");
  });

  it("sees changes written by another module instance (mtime cache)", () => {
    writeStoredConfig({ ...emptyConfig(), ...complete });
    expect(getConfig().configured).toBe(true);
    const other = encryptJson({ ...emptyConfig(), ...complete, pinHash: null }, appSecret().value);
    writeFileSync(dataPath("config.json"), JSON.stringify(other) + " ");
    expect(getConfig().stage).toBe("pin");
  });

  it("refuses to read a config saved with a different secret", () => {
    process.env.APP_SECRET = "the-original-secret-value";
    writeStoredConfig({ ...emptyConfig(), ...complete });
    process.env.APP_SECRET = "a-different-secret-value";
    writeFileSync(dataPath("config.json"), readFileSync(dataPath("config.json"), "utf8") + "\n");
    expect(() => getConfig()).toThrow(DecryptError);
  });
});

describe("RESET_PIN recovery", () => {
  it("clears the PIN on boot and returns the app to the PIN step", () => {
    writeStoredConfig({ ...emptyConfig(), ...complete });
    expect(applyPinReset()).toBe(false);
    process.env.RESET_PIN = "true";
    expect(applyPinReset()).toBe(true);
    const c = getConfig();
    expect(c.pinHash).toBeNull();
    expect(c.stage).toBe("pin");
    expect(c.ownerUserId).toBe(complete.ownerUserId);
    expect(applyPinReset()).toBe(false);
  });

  it("does nothing before setup", () => {
    process.env.RESET_PIN = "true";
    expect(applyPinReset()).toBe(false);
    updateStoredConfig({ supabaseUrl: "https://db.example.com" });
    expect(applyPinReset()).toBe(false);
  });
});

describe("PIN lockout", () => {
  it("allows 5 attempts, then locks 30s and doubles up to an hour", () => {
    expect([1, 2, 3, 4].map(lockDurationMs)).toEqual([0, 0, 0, 0]);
    expect(lockDurationMs(5)).toBe(BASE_LOCK_MS);
    expect(lockDurationMs(6)).toBe(60_000);
    expect(lockDurationMs(7)).toBe(120_000);
    expect(lockDurationMs(11)).toBe(1_920_000);
    expect(lockDurationMs(12)).toBe(MAX_LOCK_MS);
    expect(lockDurationMs(500)).toBe(MAX_LOCK_MS);
  });

  it("computes the next state purely", () => {
    let s = { failures: 0, lockedUntil: 0, lastFailureAt: 0 };
    for (let i = 0; i < 4; i++) s = nextOnFailure(s, 1000);
    expect(remainingLockMs(s, 1000)).toBe(0);
    s = nextOnFailure(s, 1000);
    expect(remainingLockMs(s, 1000)).toBe(30_000);
    expect(remainingLockMs(s, 31_000)).toBe(0);
    s = nextOnFailure(s, 31_000);
    expect(remainingLockMs(s, 31_000)).toBe(60_000);
  });

  it("persists across restarts and clears on success", () => {
    for (let i = 0; i < 5; i++) recordFailure(10_000);
    expect(readLockout()).toMatchObject({ failures: 5, lockedUntil: 40_000 });
    expect(JSON.parse(readFileSync(dataPath("lockout.json"), "utf8")).failures).toBe(5);
    clearLockout();
    expect(readLockout().failures).toBe(0);
  });

  it("fails closed when the file is corrupt", () => {
    writeFileSync(dataPath("lockout.json"), "{not json");
    expect(remainingLockMs(readLockout(), Date.now())).toBeGreaterThan(0);
  });
});

describe("PIN hashing", () => {
  it("accepts 6–12 digits", () => {
    expect(isValidPin("123456")).toBe(true);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("1234567890123")).toBe(false);
    expect(isValidPin("12345a")).toBe(false);
  });

  it("hashes with argon2id and verifies", async () => {
    const h = await hashPin("246810");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(h).not.toContain("246810");
    expect(await verifyPin(h, "246810")).toBe(true);
    expect(await verifyPin(h, "246811")).toBe(false);
    expect(await verifyPin("garbage", "246810")).toBe(false);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("rate limiter", () => {
  it("limits within a sliding window", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, 100 + i).allowed).toBe(true);
    const blocked = rateLimit("k", 3, 1000, 200);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(rateLimit("k", 3, 1000, 1101).allowed).toBe(true);
    expect(rateLimit("other", 3, 1000, 200).allowed).toBe(true);
  });
});

describe("server hardening", () => {
  it("a lockout decays after a quiet day (P2: it never did)", async () => {
    const { DECAY_MS, nextOnFailure } = await import("@web/lib/server/lockout");
    const now = 1_800_000_000_000;
    const old = { failures: 9, lockedUntil: 0, lastFailureAt: now - DECAY_MS - 1 };
    expect(nextOnFailure(old, now)).toEqual({ failures: 1, lockedUntil: 0, lastFailureAt: now });
    const recent = { failures: 9, lockedUntil: 0, lastFailureAt: now - 60_000 };
    expect(nextOnFailure(recent, now).failures).toBe(10);
  });

  it("PUBLIC_APP_URL without a scheme is understood, and nonsense is ignored (P2: bare 500s)", async () => {
    const { normalizePublicUrl } = await import("@web/lib/server/config");
    expect(normalizePublicUrl("planner.example.com")).toBe("https://planner.example.com");
    expect(normalizePublicUrl(" https://planner.example.com/ ")).toBe(
      "https://planner.example.com",
    );
    expect(normalizePublicUrl("http://192.168.1.20:3000")).toBe("http://192.168.1.20:3000");
    expect(normalizePublicUrl("ftp://x")).toBeNull();
    expect(normalizePublicUrl("")).toBeNull();
    expect(normalizePublicUrl(undefined)).toBeNull();
  });
});

describe("vapidSubject", () => {
  it("is always a mailto on a public-looking host (Apple refuses anything else)", async () => {
    const { vapidSubject } = await import("@web/lib/server/push");
    expect(vapidSubject("https://planner.example.org")).toBe(
      "mailto:notifications@planner.example.org",
    );
    expect(vapidSubject("https://planner.example.org:8443/app")).toBe(
      "mailto:notifications@planner.example.org",
    );
    for (const url of [
      null,
      "http://localhost:3000",
      "https://stellar.local",
      "https://192.168.1.20",
      "nonsense",
    ])
      expect(vapidSubject(url)).toBe("mailto:notifications@example.com");
  });
});
