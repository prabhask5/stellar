"use client";

import { gpuTierFromRenderer, selectTier, type DeviceSignals } from "@stellar/universe/quality";
import { capTier, sceneSignals, universeStore } from "@stellar/universe/store";
import { Component, type ComponentType, type ReactNode, useEffect, useState } from "react";
import { useStore } from "zustand";

type Idle = (cb: () => void) => void;
const whenIdle: Idle = (cb) => {
  const ric = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (ric) ric(cb, { timeout: 2500 });
  else setTimeout(cb, 600);
};

/** The tier for a setting on this device; Auto also respects what the frame governor learned. */
function resolveTier(setting: Parameters<typeof selectTier>[0], signals: DeviceSignals) {
  const tier = selectTier(setting, signals);
  return setting === "auto" ? capTier(tier) : tier;
}

type Gpu = { tier: 0 | 1 | 2 | 3; webgl: boolean };
const GPU_KEY = "sp-gpu";

/**
 * Classifies the GPU once per browser session. Probing needs a throwaway WebGL context;
 * doing that on every page load is wasted work (and Firefox logs each one as a lost
 * context), so the answer is kept for the session.
 */
function detectGpu(): Gpu {
  try {
    const saved = sessionStorage.getItem(GPU_KEY);
    if (saved) return JSON.parse(saved) as Gpu;
  } catch {
    // no storage: probe every time
  }
  const result = probeGpu();
  try {
    sessionStorage.setItem(GPU_KEY, JSON.stringify(result));
  } catch {
    // ignored
  }
  return result;
}

function probeGpu(): Gpu {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ??
      canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return { tier: 0, webgl: false };
    // Firefox reports the real renderer through RENDERER and warns that the debug
    // extension is deprecated; other engines mask RENDERER and need the extension.
    let renderer = String(gl.getParameter(gl.RENDERER) ?? "");
    if (!/firefox/i.test(navigator.userAgent)) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      if (info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    }
    const tier = gpuTierFromRenderer(renderer, Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { tier, webgl: true };
  } catch {
    return { tier: 0, webgl: false };
  }
}

async function readSignals(): Promise<DeviceSignals> {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
    getBattery?: () => Promise<{ level: number; charging: boolean }>;
  };
  let battery: DeviceSignals["battery"];
  try {
    const b = await nav.getBattery?.();
    if (b) battery = { level: b.level, charging: b.charging };
  } catch {
    battery = undefined;
  }
  const gpu = detectGpu();
  return {
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: nav.connection?.saveData === true,
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    gpuTier: gpu.tier,
    webgl: gpu.webgl,
    battery,
  };
}

/**
 * The sky is decoration. If WebGL fails (a lost context, a driver bug, an old GPU),
 * the error stops here and the CSS starfield stays; it must never take the planner down.
 */
class SkyBoundary extends Component<
  { onFail: () => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.warn("[universe] rendering failed; staying on the static sky", error);
    this.props.onFail();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The persistent universe layer. Mounted once in the root layout: it sits
 * behind every page, full-bleed under the safe areas, and never remounts on
 * navigation. Nothing here delays first paint: the CSS starfield is already
 * on screen, and three.js is fetched only once the browser is idle.
 */
export function UniverseHost() {
  const tier = useStore(universeStore, (s) => s.tier);
  const setting = useStore(universeStore, (s) => s.setting);
  const mode = useStore(universeStore, (s) => s.mode);
  const ready = useStore(universeStore, (s) => s.ready);
  const hover = useStore(universeStore, (s) => s.hover);
  const [Canvas, setCanvas] = useState<ComponentType | null>(null);
  const [Overlay, setOverlay] = useState<ComponentType | null>(null);
  const active = mode !== "off";

  // Resolve the tier from the setting and this device.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void readSignals().then((signals) => {
      if (cancelled) return;
      universeStore.setState({
        tier: resolveTier(setting, signals),
        reducedMotion: signals.reducedMotion,
        ready: false,
      });
    });
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => {
      void readSignals().then(
        (signals) =>
          !cancelled &&
          universeStore.setState({
            tier: resolveTier(setting, signals),
            reducedMotion: signals.reducedMotion,
          }),
      );
    };
    media.addEventListener("change", onMotion);
    return () => {
      cancelled = true;
      media.removeEventListener("change", onMotion);
    };
  }, [setting, active]);

  useEffect(() => {
    document.documentElement.dataset.tier = tier;
    document.documentElement.dataset.sky = ready && tier !== "minimal" ? "3d" : "css";
  }, [tier, ready]);

  // Fetch the heavy chunks only when the browser has nothing better to do.
  useEffect(() => {
    if (!active || Overlay) return;
    // A failed download (offline, a deploy in between) is tried again later; the sky is optional.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const load = (attempt: number) =>
      whenIdle(
        () =>
          void import("@stellar/universe/event-overlay")
            .then((m) => !cancelled && setOverlay(() => m.EventOverlay))
            .catch(() => {
              if (!cancelled && attempt < 4) timer = setTimeout(() => load(attempt + 1), 15_000);
            }),
      );
    load(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, Overlay]);
  useEffect(() => {
    if (!active || tier === "minimal" || Canvas) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const load = (attempt: number) =>
      whenIdle(
        () =>
          void import("@stellar/universe/canvas")
            .then((m) => !cancelled && setCanvas(() => m.default))
            .catch(() => {
              if (!cancelled && attempt < 4) timer = setTimeout(() => load(attempt + 1), 15_000);
            }),
      );
    load(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, tier, Canvas]);

  // The sky yields to the interface: while a finger is scrolling or dragging, while keys
  // are being typed and while a sheet is moving, the scene holds its frame so the main
  // thread and the GPU belong to the interaction. It picks up again a moment after.
  useEffect(() => {
    const yieldFor = (ms: number) => {
      sceneSignals.yieldUntil = Math.max(sceneSignals.yieldUntil, performance.now() + ms);
    };
    const onScroll = () => yieldFor(220);
    const onTouch = (e: Event) => {
      // Dragging the universe itself on the home stage is the one touch that needs frames.
      if ((e.target as Element | null)?.closest?.("[data-universe-stage]")) return;
      yieldFor(260);
    };
    const onKey = () => yieldFor(300);
    const opts = { passive: true, capture: true } as const;
    window.addEventListener("scroll", onScroll, opts);
    window.addEventListener("wheel", onScroll, opts);
    window.addEventListener("touchstart", onTouch, opts);
    window.addEventListener("touchmove", onTouch, opts);
    window.addEventListener("keydown", onKey, opts);
    // Sheets, dialogs and popovers mount in portals on <body>: their arrival and
    // departure is the start of an animation.
    const portals = new MutationObserver(() => yieldFor(450));
    portals.observe(document.body, { childList: true });
    return () => {
      window.removeEventListener("scroll", onScroll, opts);
      window.removeEventListener("wheel", onScroll, opts);
      window.removeEventListener("touchstart", onTouch, opts);
      window.removeEventListener("touchmove", onTouch, opts);
      window.removeEventListener("keydown", onKey, opts);
      portals.disconnect();
    };
  }, []);

  // Pause rendering while the tab is hidden, and while typing on a phone.
  useEffect(() => {
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const isField = (el: EventTarget | null) => {
      const t = el as HTMLElement | null;
      return Boolean(
        t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable),
      );
    };
    const update = () =>
      universeStore.setState({
        paused: document.hidden || (touch && isField(document.activeElement)),
      });
    document.addEventListener("visibilitychange", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);

  const show = active && tier !== "minimal" && Canvas !== null;
  return (
    <>
      <div
        className="sp-universe"
        aria-hidden="true"
        data-ready={ready}
        data-mode={mode}
        style={{
          opacity: show && ready ? (mode === "home" ? 1 : 0.55) : 0,
          filter: mode === "page" && tier === "cinematic" ? "blur(1.5px)" : undefined,
        }}
      >
        {show && Canvas && (
          <SkyBoundary onFail={() => universeStore.setState({ tier: "minimal", ready: false })}>
            <Canvas />
          </SkyBoundary>
        )}
      </div>
      {hover && mode === "home" && (
        <div
          className="sp-universe-label"
          style={{ left: hover.x, top: hover.y }}
          role="status"
          data-testid="universe-label"
        >
          <span className="sp-universe-label__title">{hover.title}</span>
          <span className="sp-universe-label__subtitle">{hover.subtitle}</span>
        </div>
      )}
      {Overlay && (
        <SkyBoundary onFail={() => setOverlay(null)}>
          <Overlay />
        </SkyBoundary>
      )}
    </>
  );
}
