"use client";

import { gpuTierFromRenderer, selectTier, type DeviceSignals } from "@stellar/universe/quality";
import { universeStore } from "@stellar/universe/store";
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

function detectGpu(): { tier: 0 | 1 | 2 | 3; webgl: boolean } {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ??
      canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return { tier: 0, webgl: false };
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
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
        tier: selectTier(setting, signals),
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
            tier: selectTier(setting, signals),
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
