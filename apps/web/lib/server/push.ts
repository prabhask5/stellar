import * as webpushModule from "web-push";
import { type ReadyConfig, requireConfig } from "./config";
import { adminClient } from "./supabase";

// web-push is CommonJS; depending on the bundler it arrives as the namespace or under `default`.
type WebPush = typeof webpushModule;
const webpush: WebPush =
  (webpushModule as unknown as { default?: WebPush }).default ?? webpushModule;

export interface PushMessage {
  title: string;
  body: string;
  /** Notifications with the same tag replace each other. */
  tag?: string;
  /** Path opened when the notification is tapped. */
  url?: string;
}

function subject(config: ReadyConfig): string {
  return config.publicAppUrl?.startsWith("https://")
    ? config.publicAppUrl
    : "mailto:owner@stellar.local";
}

export interface PushResult {
  sent: number;
  removed: number;
  failed: number;
  /** Subscriptions the owner has, before any were removed. */
  subscriptions: number;
  /** Why deliveries failed: the push service's host and its HTTP status (or the network error). */
  errors: { service: string; status: number | null; message: string }[];
}

/**
 * Sends a notification to every subscribed device of the owner. Subscriptions
 * the push service reports as gone (404/410) are deleted.
 */
export async function sendPush(
  message: PushMessage,
  config: ReadyConfig = requireConfig(),
): Promise<PushResult> {
  const result: PushResult = { sent: 0, removed: 0, failed: 0, subscriptions: 0, errors: [] };
  if (!config.vapid) return result;
  const admin = adminClient(config);
  const { data: subs, error } = await admin
    .from("sp_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", config.ownerUserId);
  if (error) {
    result.errors.push({ service: "database", status: null, message: error.message });
    return result;
  }
  if (!subs?.length) return result;
  result.subscriptions = subs.length;

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    tag: message.tag ?? "stellar",
    url: message.url ?? "/",
  });
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          {
            vapidDetails: {
              subject: subject(config),
              publicKey: config.vapid!.publicKey,
              privateKey: config.vapid!.privateKey,
            },
            TTL: 120,
            urgency: "high",
          },
        );
        result.sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
        else {
          result.failed++;
          const service = new URL(s.endpoint).host;
          const message = String((err as { body?: string }).body || (err as Error).message).slice(
            0,
            200,
          );
          result.errors.push({ service, status: status ?? null, message });
          console.warn("[push] delivery failed", service, status ?? "", message);
        }
      }
    }),
  );
  if (gone.length) {
    await admin.from("sp_push_subscriptions").delete().in("id", gone);
    result.removed = gone.length;
  }
  return result;
}
