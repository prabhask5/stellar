import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dataPath } from "./paths";

export interface AppSecret {
  value: string;
  /** "env" is preferable: the key then never sits beside the data it protects. */
  source: "env" | "file";
}

/** APP_SECRET from the environment, or a generated one persisted at /data/secret. */
export function appSecret(): AppSecret {
  const fromEnv = process.env.APP_SECRET?.trim();
  if (fromEnv) {
    if (fromEnv.length < 16) throw new Error("APP_SECRET must be at least 16 characters.");
    return { value: fromEnv, source: "env" };
  }
  const file = dataPath("secret");
  if (existsSync(file)) {
    const value = readFileSync(file, "utf8").trim();
    if (value.length >= 32) return { value, source: "file" };
  }
  const value = randomBytes(48).toString("base64url");
  writeFileSync(file, `${value}\n`, { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // best effort on filesystems without POSIX modes
  }
  return { value, source: "file" };
}
