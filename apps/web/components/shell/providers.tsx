"use client";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type ReactNode, useEffect, useMemo } from "react";
import { useKeyboardInset } from "@/components/ui/use-media";
import { ApiRequestError } from "@/lib/client/api";
import { queryClient } from "@/lib/client/cache";
import "@/lib/client/data/core";
import { useReady } from "@/lib/client/data/hooks";
import { deviceKind } from "@/lib/client/device";
import { startOutbox } from "@/lib/client/outbox";
import { createIdbPersister } from "@/lib/client/persist";
import { startRealtime } from "@/lib/client/realtime";
import { getSession, readMeta } from "@/lib/client/session";
import { useSync } from "@/lib/client/sync-store";

const DAY = 86_400_000;
/** Bump when the cached shapes change in an incompatible way. */
const CACHE_VERSION = "1";
/** Away for longer than this, the app refreshes its data when it comes back. */
const RESUME_REFRESH_MS = 20_000;

/**
 * Data plumbing for the signed-in app: persisted query cache, session
 * bootstrap, the outbox and Realtime. Nothing here blocks rendering; with a
 * warm cache the screen is populated before the network answers.
 */
export function Providers({ children }: { children: ReactNode }) {
  const persister = useMemo(() => createIdbPersister(), []);
  useKeyboardInset();

  useEffect(() => {
    let stopRealtime: (() => void) | null = null;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let delay = 2000;
    // Known connection details (from a previous launch) let cached data and queued changes work at once.
    if (readMeta()) useReady.setState({ ready: true });
    const stopOutbox = startOutbox();
    // The first attempt can fail while the browser still says "online" (waking from sleep,
    // a server restart). Keep trying, or Realtime would never start for this launch.
    const connect = () => {
      if (cancelled || stopRealtime) return;
      if (retry) clearTimeout(retry);
      retry = null;
      getSession()
        .then(() => {
          if (cancelled || stopRealtime) return;
          delay = 2000;
          useReady.setState({ ready: true });
          stopRealtime = startRealtime(deviceKind());
        })
        .catch((err: unknown) => {
          // Unauthorized: getSession already left for the PIN screen. Anything else heals.
          if (cancelled || (err instanceof ApiRequestError && err.code === "unauthorized")) return;
          useSync.setState({ realtime: "disconnected" });
          retry = setTimeout(connect, delay);
          delay = Math.min(delay * 2, 30_000);
        });
    };
    connect();
    const onOnline = () => {
      delay = 2000;
      connect();
    };
    // Coming back to the app: whatever is on screen may be minutes or days old.
    let hiddenAt = 0;
    const refresh = () => {
      if (!useReady.getState().ready) return;
      void queryClient.invalidateQueries();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      connect();
      if (hiddenAt && Date.now() - hiddenAt > RESUME_REFRESH_MS) refresh();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refresh();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      stopOutbox();
      stopRealtime?.();
    };
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 14 * DAY,
        buster: CACHE_VERSION,
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => q.state.status === "success" && q.queryKey[0] !== "devices",
        },
      }}
      // The restored cache paints the first frame; it is then checked against the server
      // straight away rather than trusted for as long as it would be within one session.
      onSuccess={() => void queryClient.invalidateQueries()}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
