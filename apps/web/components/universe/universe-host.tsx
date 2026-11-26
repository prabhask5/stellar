"use client";

import { cosmicLog } from "@stellar/universe/bus";
import type { UniverseLayerProps } from "@stellar/universe/react";
import { getUniverseState, onUniverseState } from "@stellar/universe/state";
import { Component, type ComponentType, type ReactNode, useEffect, useState } from "react";
import { useSyncExternalStore } from "react";
import { whenIdle } from "@/lib/client/idle";

/**
 * The galaxy is decoration. If it fails (a lost context, a driver bug, an old GPU), the
 * error stops here and the CSS starfield stays; it must never take the planner down.
 */
class SkyBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.warn("[universe] rendering failed; staying on the static sky", error);
    document.documentElement.dataset.sky = "css";
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

const active = () => getUniverseState().active;

/** Built by `scripts/build-universe-worker.mjs`; precached by the service worker. */
const WORKER_URL = "/universe-worker.js";

/**
 * The persistent universe layer, mounted once in the root layout: it sits behind every page,
 * full-bleed under the safe areas, and never remounts on navigation. Nothing here delays
 * first paint. The CSS starfield is already on screen; the renderer (a lazy chunk, and the
 * worker it starts) is fetched only once the app is signed in and the browser is idle.
 */
export function UniverseHost() {
  const signedIn = useSyncExternalStore(onUniverseState, active, () => false);
  const [layer, setLayer] = useState<{
    Layer: ComponentType<UniverseLayerProps>;
    at: number;
  } | null>(null);

  // The event log exists from the first render, before the renderer does.
  useEffect(() => {
    (window as Window & { __stellarUniverse?: object }).__stellarUniverse ??= {
      events: cosmicLog,
    };
  }, []);

  useEffect(() => {
    if (!signedIn || layer) return;
    // A failed download (offline, a deploy in between) is tried again later; the sky is optional.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancel = () => {};
    let cancelled = false;
    const load = (attempt: number) => {
      cancel = whenIdle(() => {
        // The first galaxy frame is timed from here: the idle moment the load begins.
        const at = performance.now();
        void import("@stellar/universe/react")
          .then((m) => !cancelled && setLayer({ Layer: m.default, at }))
          .catch(() => {
            if (!cancelled && attempt < 4) timer = setTimeout(() => load(attempt + 1), 15_000);
          });
      });
    };
    load(0);
    return () => {
      cancelled = true;
      cancel();
      if (timer) clearTimeout(timer);
    };
  }, [signedIn, layer]);

  return layer ? (
    <SkyBoundary>
      <layer.Layer workerUrl={WORKER_URL} startedAt={layer.at} />
    </SkyBoundary>
  ) : null;
}
