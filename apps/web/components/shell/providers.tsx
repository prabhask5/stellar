"use client";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type ReactNode, useEffect, useMemo } from "react";
import { useKeyboardInset } from "@/components/ui/use-media";
import { queryClient } from "@/lib/client/cache";
import "@/lib/client/data/core";
import { useReady } from "@/lib/client/data/hooks";
import { deviceKind } from "@/lib/client/device";
import { startOutbox } from "@/lib/client/outbox";
import { createIdbPersister } from "@/lib/client/persist";
import { startRealtime } from "@/lib/client/realtime";
import { getSession, readMeta } from "@/lib/client/session";

const DAY = 86_400_000;
/** Bump when the cached shapes change in an incompatible way. */
const CACHE_VERSION = "1";

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
    // Known connection details (from a previous launch) let cached data and queued changes work at once.
    if (readMeta()) useReady.setState({ ready: true });
    const stopOutbox = startOutbox();
    getSession()
      .then(() => {
        if (cancelled) return;
        useReady.setState({ ready: true });
        stopRealtime = startRealtime(deviceKind());
      })
      .catch(() => {
        // Offline: keep running from the cache. Unauthorized: getSession already redirected.
      });
    const onOnline = () => {
      if (!stopRealtime) {
        getSession()
          .then(() => {
            if (!cancelled && !stopRealtime) {
              useReady.setState({ ready: true });
              stopRealtime = startRealtime(deviceKind());
            }
          })
          .catch(() => {});
      }
    };
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
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
    >
      {children}
    </PersistQueryClientProvider>
  );
}
