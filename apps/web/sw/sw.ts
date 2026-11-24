/// <reference lib="webworker" />
/**
 * Stellar Planner service worker.
 *  - Precaches the app shell (every hashed JS/CSS/font file, icons).
 *  - Serves pages stale-while-revalidate, so a cached open is instant and the
 *    app starts offline; any route falls back to the cached shell.
 *  - Runtime-caches static assets.
 *  - Shows phase-end notifications from web push.
 * API calls and Supabase traffic are never cached here: data lives in the
 * app's own IndexedDB cache and outbox.
 */
import {
  CacheFirst,
  ExpirationPlugin,
  type PrecacheEntry,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: (PrecacheEntry | string)[] };

const PAGES = "stellar-pages-v1";
const ASSETS = "stellar-assets-v1";
const SHELL_ROUTES = ["/", "/tasks", "/goals", "/routines", "/focus", "/settings"];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true, concurrency: 8 },
  // The page asks the new worker to take over when the owner chooses "Reload".
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: ASSETS,
        plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 60 })],
      }),
    },
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && /^\/(emoji|icons|splash)\//.test(url.pathname),
      handler: new StaleWhileRevalidate({ cacheName: ASSETS }),
    },
  ],
});
serwist.addEventListeners();

// A new version has taken over. The cached page shells belong to the previous build and
// point at script files this version has just removed from the precache, so they go too;
// the reload that follows fetches fresh ones, and the app warms the cache again after it.
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete(PAGES));
});

/** Pages are cached by path alone, so /tasks?tab=all and /tasks share one shell. */
function pageKey(url: URL): string {
  return url.pathname === "" ? "/" : url.pathname;
}

function cacheable(response: Response): boolean {
  return (
    response.ok &&
    !response.redirected &&
    response.type === "basic" &&
    (response.headers.get("content-type") ?? "").includes("text/html")
  );
}

async function refreshPage(request: Request, key: string): Promise<Response> {
  const response = await fetch(request);
  if (cacheable(response)) {
    const cache = await caches.open(PAGES);
    await cache.put(key, response.clone());
  }
  return response;
}

async function servePage(event: FetchEvent): Promise<Response> {
  const url = new URL(event.request.url);
  const key = pageKey(url);
  const cache = await caches.open(PAGES);
  const cached = await cache.match(key);
  if (cached) {
    // Instant from cache; refresh in the background for next time.
    event.waitUntil(refreshPage(event.request, key).catch(() => undefined));
    return cached;
  }
  try {
    return await refreshPage(event.request, key);
  } catch {
    // Offline and never visited: any app route can boot from the home shell.
    const shell = (await cache.match("/")) ?? (await cache.match("/tasks"));
    if (shell) return shell;
    return new Response(
      "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Stellar Planner</title><body style='margin:0;background:#070615;color:#F5F3FF;font:17px -apple-system,system-ui,sans-serif;display:grid;place-items:center;height:100dvh;text-align:center;padding:24px'><p>You are offline, and this device has not opened Stellar Planner yet.<br>Connect once and it will be here next time.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Setup, sign-in and the API always go to the network.
  if (url.pathname.startsWith("/api/") || url.pathname === "/setup" || url.pathname === "/lock")
    return;
  event.respondWith(servePage(event));
});

self.addEventListener("message", (event) => {
  const data = event.data as { type?: string; urls?: string[] } | null;
  if (data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  } else if (data?.type === "WARM_SHELL") {
    // Fetch every app route once so each opens offline even if never visited.
    event.waitUntil(
      Promise.all(
        SHELL_ROUTES.map(async (path) => {
          try {
            await refreshPage(new Request(path, { credentials: "same-origin" }), path);
          } catch {
            // offline: try again on the next launch
          }
        }),
      ),
    );
  } else if (data?.type === "CLEAR_PAGES") {
    event.waitUntil(caches.delete(PAGES));
  }
});

interface PushPayload {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
}

self.addEventListener("push", (event) => {
  const read = (): PushPayload => {
    try {
      return (event.data?.json() as PushPayload) ?? {};
    } catch {
      return { body: event.data?.text() };
    }
  };
  const payload = read();
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Stellar Planner", {
      body: payload.body ?? "",
      tag: payload.tag ?? "stellar",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { url: payload.url ?? "/" },
      silent: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = String((event.notification.data as { url?: string } | null)?.url ?? "/");
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          // Already showing the right screen: bringing it forward is enough. A navigation
          // would reload the whole app and throw away what was on screen.
          const here = new URL(client.url);
          if (
            here.pathname !== new URL(target, self.location.origin).pathname &&
            "navigate" in client
          )
            await client.navigate(target).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
