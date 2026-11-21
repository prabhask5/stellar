import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/** AES-256-GCM envelope for the config file. The key is derived from APP_SECRET with HKDF-SHA256. */
export interface Envelope {
  v: 1;
  alg: "aes-256-gcm";
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

const INFO = "stellar-planner/config/v1";

function deriveKey(secret: string, salt: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), salt, INFO, 32));
}

export function encryptJson(value: unknown, secret: string): Envelope {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret, salt), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    v: 1,
    alg: "aes-256-gcm",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

export class DecryptError extends Error {
  constructor() {
    super(
      "The saved configuration could not be decrypted. APP_SECRET (or /data/secret) does not match the one it was saved with.",
    );
    this.name = "DecryptError";
  }
}

export function decryptJson<T>(envelope: Envelope, secret: string): T {
  try {
    if (envelope.v !== 1 || envelope.alg !== "aes-256-gcm") throw new Error("unsupported envelope");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(secret, Buffer.from(envelope.salt, "base64")),
      Buffer.from(envelope.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(plain.toString("utf8")) as T;
  } catch {
    throw new DecryptError();
  }
}
