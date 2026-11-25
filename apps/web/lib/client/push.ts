import { api } from "./api";
import { isStandalone } from "./device";
import { readMeta } from "./session";

export type PushSupport = "supported" | "needs-install" | "unsupported";

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** iOS only delivers web push to an app added to the Home Screen (16.4+). */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (isIos() && !isStandalone()) return "needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    return "unsupported";
  return "supported";
}

function toBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) return null;
  return navigator.serviceWorker.ready;
}

export interface PushStatus {
  support: PushSupport;
  permission: NotificationPermission | "default";
  subscribed: boolean;
}

export async function pushStatus(): Promise<PushStatus> {
  const support = pushSupport();
  if (support !== "supported") return { support, permission: "default", subscribed: false };
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return { support, permission: Notification.permission, subscribed: Boolean(sub) };
}

export class PushError extends Error {}

function sameKey(sub: PushSubscription, key: string): boolean {
  const current = sub.options.applicationServerKey;
  if (!current) return true; // the browser does not say; assume it is ours
  const a = new Uint8Array(current);
  const b = toBytes(key);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function register(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth)
    throw new PushError("The browser returned an incomplete subscription.");
  await api("/api/v1/push/subscriptions", {
    body: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
  });
}

/** A subscription for the server's current key, replacing one made for an older key. */
async function subscribe(reg: ServiceWorkerRegistration, key: string): Promise<PushSubscription> {
  const existing = await reg.pushManager.getSubscription();
  if (existing && sameKey(existing, key)) return existing;
  // Made for keys the server no longer has (it was set up again): the push service would
  // refuse everything sent to it.
  if (existing) await existing.unsubscribe().catch(() => {});
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) });
}

/**
 * Keeps a device that has notifications on actually reachable. The browser remembers its
 * subscription for good, but the server can lose its copy (a restored database) or change
 * its keys (set up again); either way the switch would say "on" and nothing would arrive.
 * Runs quietly once per app start; never asks for permission.
 */
export async function syncPush(): Promise<void> {
  if (pushSupport() !== "supported" || Notification.permission !== "granted") return;
  const key = readMeta()?.vapidPublicKey;
  const reg = await registration();
  if (!key || !reg) return;
  if (!(await reg.pushManager.getSubscription())) return; // off on this device
  await register(await subscribe(reg, key));
}

/** Asks for permission (only ever from a button press), subscribes, and registers the subscription with the server. */
export async function enablePush(): Promise<void> {
  if (pushSupport() !== "supported")
    throw new PushError("Notifications are not available in this browser.");
  const key = readMeta()?.vapidPublicKey;
  if (!key) throw new PushError("The server has no notification keys yet. Reload and try again.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new PushError(
      permission === "denied"
        ? "Notifications are blocked for this site. Allow them in your browser settings, then try again."
        : "Notifications were not allowed.",
    );
  }
  const reg = await registration();
  if (!reg)
    throw new PushError("The app is still installing itself. Reload the page and try again.");
  await register(await subscribe(reg, key));
}

export async function disablePush(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  await api("/api/v1/push/subscriptions", { method: "DELETE", body: { endpoint } }).catch(() => {});
}

export interface TestPushResult {
  sent: number;
  failed: number;
  removed: number;
  subscriptions: number;
  configured: boolean;
  errors: { service: string; status: number | null; message: string }[];
}

export async function sendTestPush(): Promise<TestPushResult> {
  return api<TestPushResult>("/api/v1/push/test", { method: "POST" });
}

/** What a test did, in words the owner can act on. */
export function describeTest(r: TestPushResult): { message: string; ok: boolean } {
  const devices = (n: number) => `${n} ${n === 1 ? "device" : "devices"}`;
  if (!r.configured) return { ok: false, message: "The server has no notification keys." };
  if (r.subscriptions === 0)
    return { ok: false, message: "No device is registered. Turn notifications off and on again." };
  if (r.sent > 0 && r.failed === 0 && r.removed === 0)
    return { ok: true, message: `Test sent to ${devices(r.sent)}` };
  const parts = [`Sent to ${devices(r.sent)}`];
  if (r.removed)
    parts.push(
      `${devices(r.removed)} had an outdated registration, now removed. If one of yours got nothing, open the app there and turn notifications off and on`,
    );
  if (r.failed) {
    const e = r.errors[0];
    parts.push(
      `${devices(r.failed)} refused${e ? ` by ${e.service}${e.status ? ` (${e.status})` : ""}${e.message ? `: ${e.message.slice(0, 80)}` : ""}` : ""}. Turn notifications off and on again there`,
    );
  }
  return { ok: r.sent > 0, message: parts.join(". ") };
}
