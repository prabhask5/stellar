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
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toBytes(key),
    }));
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth)
    throw new PushError("The browser returned an incomplete subscription.");
  await api("/api/v1/push/subscriptions", {
    body: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
  });
}

export async function disablePush(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  await api("/api/v1/push/subscriptions", { method: "DELETE", body: { endpoint } }).catch(() => {});
}

export async function sendTestPush(): Promise<{ sent: number }> {
  return api<{ sent: number }>("/api/v1/push/test", { method: "POST" });
}
