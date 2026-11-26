"use client";

/**
 * The universe layer for the web app: one container, mounted once behind the interface. It
 * creates the host when the app is signed in, tells it which page is showing, and marks the
 * document once the first galaxy frame is up so the CSS starfield can step back.
 *
 * This file and everything it imports is a lazy chunk; nothing here is in a route's
 * initial JavaScript.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cosmicLog, emitCosmic } from "./bus.ts";
import { createUniverseHost, type EnginePath, type UniverseHost } from "./host.ts";
import { pageFor } from "./modes.ts";
import type { PageView } from "./protocol.ts";
import { getUniverseState, onUniverseState } from "./state.ts";

/** How long the canvas takes to fade in over the CSS starfield. */
const FADE_IN_MS = 400;

/**
 * Where the galaxy's centre belongs, in clip space: the middle of the gap Home leaves for it, or of the
 * area the navigation leaves free. Read from the layout, so it follows every breakpoint.
 */
function centreOf(pathname: string): { shiftX: number; shiftY: number } {
  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  if (pathname === "/") {
    const stage = document.querySelector("[data-universe-gap]")?.getBoundingClientRect();
    if (stage && stage.width > 0 && stage.height > 0) {
      return {
        shiftX: round(((stage.left + stage.width / 2) / vw) * 2 - 1),
        shiftY: round(1 - ((stage.top + stage.height / 2) / vh) * 2),
      };
    }
  }
  const app = document.querySelector(".sp-app");
  const inset = app ? parseFloat(getComputedStyle(app).paddingLeft) || 0 : 0;
  // On Focus the core sits below the timer's ring, so the time is never read against it.
  return { shiftX: round(inset / vw), shiftY: pathname === "/focus" ? -0.24 : 0 };
}

function viewOf(pathname: string): PageView {
  return { ...pageFor(pathname), ...centreOf(pathname) };
}

interface Hook {
  events: () => readonly string[];
  emit?: typeof emitCosmic;
  /** From the idle moment the app started loading the universe to its first galaxy frame. */
  firstFrameMs?: number;
  probe?: () => ReturnType<UniverseHost["probe"]>;
}

export interface UniverseLayerProps {
  workerUrl?: string;
  /** `performance.now()` when the app began loading this layer, to time the first frame from. */
  startedAt?: number;
}

export default function UniverseLayer({ workerUrl, startedAt }: UniverseLayerProps) {
  const state = useSyncExternalStore(onUniverseState, getUniverseState, getUniverseState);
  const container = useRef<HTMLDivElement>(null);
  const host = useRef<UniverseHost | null>(null);
  const [ready, setReady] = useState<{ path: EnginePath } | null>(null);
  const { active, pathname, setting, focusing } = state;

  // One host for as long as the app is signed in. It never remounts on navigation.
  useEffect(() => {
    const el = container.current;
    if (!active || !el) return;
    const now = getUniverseState();
    let settle: ReturnType<typeof setTimeout> | null = null;
    const hook = ((window as Window & { __stellarUniverse?: Hook }).__stellarUniverse ??= {
      events: cosmicLog,
    });
    const created = createUniverseHost({
      container: el,
      workerUrl,
      page: viewOf(now.pathname),
      setting: now.setting,
      focusing: now.focusing,
      onReady: (info) => {
        document.documentElement.dataset.tier = info.tier;
        setReady({ path: info.path });
        hook.firstFrameMs ??= performance.now() - (startedAt ?? performance.now());
        // The starfield stays until the canvas has faded in over it.
        settle = setTimeout(() => {
          document.documentElement.dataset.sky = "3d";
        }, FADE_IN_MS + 50);
      },
      onQuality: (tier) => {
        document.documentElement.dataset.tier = tier;
      },
      onFailed: () => {
        setReady(null);
        document.documentElement.dataset.sky = "css";
      },
    });
    host.current = created;
    hook.emit = emitCosmic;
    hook.probe = () => created.probe();
    return () => {
      if (settle) clearTimeout(settle);
      created.destroy();
      host.current = null;
      delete hook.probe;
      setReady(null);
      document.documentElement.dataset.sky = "css";
    };
  }, [active, workerUrl, startedAt]);

  // Which page is showing, and where its free space is. The layout of a page that was just
  // navigated to is only measurable after it has painted.
  useEffect(() => {
    if (!active) return;
    let frame = requestAnimationFrame(() => host.current?.setPage(viewOf(pathname)));
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => host.current?.setPage(viewOf(pathname)));
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [active, pathname, ready]);

  useEffect(() => {
    host.current?.setQuality(setting);
  }, [setting, ready]);

  useEffect(() => {
    host.current?.setFocusing(focusing);
  }, [focusing, ready]);

  return (
    <div
      ref={container}
      className="sp-universe"
      aria-hidden="true"
      data-ready={ready !== null}
      data-mode={pageFor(pathname).mode}
      data-path={ready?.path}
      style={{ opacity: ready ? 1 : 0, transitionDuration: `${FADE_IN_MS}ms` }}
    />
  );
}
