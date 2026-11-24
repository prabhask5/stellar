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

/**
 * The contact address signed into every push (the VAPID `sub` claim). Apple's push service
 * rejects the whole request with 403 BadJwtToken when it does not look like a real address:
 * a `.local` or `localhost` host is enough. So it is always a plain mailto on a public
 * host: the instance's own when it has one, a reserved example domain otherwise.
 */
export function vapidSubject(publicAppUrl: string | null): string {
  let host: string;
  try {
    host = publicAppUrl ? new URL(publicAppUrl).hostname.toLowerCase() : "";
  } catch {
    host = "";
  }
  const isPublic =
    /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) &&
    !/^\d+(\.\d+){3}$/.test(host) &&
    !/\.(local|localhost|internal|lan|home|test|invalid|example)$/.test(host);
  return `mailto:notifications@${isPublic ? host : "example.com"}`;
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
  // Push services that accepted our signature in this batch, and the subscriptions each refused.
  const accepted = new Set<string>();
  const refused: { id: string; service: string }[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          {
            vapidDetails: {
              subject: vapidSubject(config.publicAppUrl),
              publicKey: config.vapid!.publicKey,
              privateKey: config.vapid!.privateKey,
            },
            TTL: 120,
            urgency: "high",
          },
        );
        result.sent++;
        accepted.add(new URL(s.endpoint).host);
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
          if (status === 403) refused.push({ id: s.id, service });
          console.warn("[push] delivery failed", service, status ?? "", message);
        }
      }
    }),
  );
  // A 403 means the subscription was made for other keys than ours. When the same service
  // accepted another of our pushes just now, our keys and signature are fine, so that
  // subscription belongs to keys this server no longer has and can never be delivered to.
  // (If the service refused everything, the fault may be ours: nothing is removed.)
  for (const r of refused) {
    if (!accepted.has(r.service)) continue;
    gone.push(r.id);
    result.failed--;
  }
  if (gone.length) {
    await admin.from("sp_push_subscriptions").delete().in("id", gone);
    result.removed = gone.length;
  }
  return result;
}
