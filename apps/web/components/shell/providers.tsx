"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useKeyboardInset, useSettledViewport } from "@/components/ui/use-media";
import { ApiRequestError } from "@/lib/client/api";
import { queryClient } from "@/lib/client/cache";
import "@/lib/client/data/core";
import { useReady } from "@/lib/client/data/hooks";
import { isDemo } from "@/lib/client/demo";
import { whenIdle } from "@/lib/client/idle";
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
  // Read once, on the client. The two branches render the same markup on the first frame
  // (no data yet), so hydration is unaffected and the live app pays nothing for this.
  const [demo] = useState(isDemo);
  return demo ? (
    <DemoProviders>{children}</DemoProviders>
  ) : (
    <LiveProviders>{children}</LiveProviders>
  );
}

/**
 * Demo mode: sample data in memory, and none of the machinery that talks to the server or
 * to this browser's stored copy of the owner's data (no persisted cache, no session, no
 * sync queue, no Realtime).
 */
function DemoProviders({ children }: { children: ReactNode }) {
  useKeyboardInset();
  useSettledViewport();
  useEffect(() => {
    let cancelled = false;
    // Nothing may refetch: there is nowhere to fetch from.
    queryClient.setDefaultOptions({
      queries: {
        staleTime: Infinity,
        gcTime: Infinity,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    });
    void import("@/lib/client/demo-data").then((m) => {
      if (cancelled) return;
      m.seedDemo();
      useReady.setState({ ready: true });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function LiveProviders({ children }: { children: ReactNode }) {
  const persister = useMemo(() => createIdbPersister(), []);
  useKeyboardInset();
  useSettledViewport();

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
    // A device with notifications on makes sure the server still has a working
    // registration for it (see syncPush), whichever screen the app opens on.
    const cancelSync = whenIdle(() => {
      void import("@/lib/client/push").then((m) => m.syncPush()).catch(() => {});
    }, 6000);
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
      cancelSync();
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
