/**
 * The universe on the main thread: one canvas, and everything the engine needs to know
 * forwarded as messages (size, page, quality, focus, events with their screen origins,
 * pointer input, visibility, reduced motion).
 *
 * The engine runs in a worker on the canvas's OffscreenCanvas wherever a worker can draw
 * WebGL2. Where it cannot, the same engine is loaded here and fed the same messages.
 * Capabilities are detected by trying them, never by reading the user agent.
 */
import { type CosmicEvent, onCosmic } from "./bus.ts";
import type {
  EngineInfo,
  FromEngine,
  HostSignals,
  PageView,
  ProbeResult,
  ToEngine,
} from "./protocol.ts";
import type { QualitySetting, QualityTier } from "./renderer/quality.ts";
import { onStageInput, type StageInput } from "./state.ts";

export type EnginePath = "worker" | "inline";

export interface UniverseHostOptions {
  container: HTMLElement;
  /**
   * Where the worker script (this package's `worker.ts`, bundled by the app) is served.
   * Without one the engine runs on the main thread.
   */
  workerUrl?: string;
  page: PageView;
  setting: QualitySetting;
  focusing: boolean;
  /** The first galaxy frame is on the canvas. */
  onReady: (info: EngineInfo & { path: EnginePath }) => void;
  onQuality?: (tier: QualityTier, still: boolean) => void;
  /** No WebGL2 here at all: the CSS starfield stays. */
  onFailed: () => void;
}

export interface UniverseHost {
  setPage: (page: PageView) => void;
  setQuality: (setting: QualitySetting) => void;
  setFocusing: (focusing: boolean) => void;
  /** What the engine is doing right now. Resolves null when there is no engine. */
  probe: () => Promise<(ProbeResult & { path: EnginePath }) | null>;
  destroy: () => void;
}

/** How long a worker gets to present its first frame before the main thread takes over. */
const WORKER_FIRST_FRAME_MS = 6000;
const CAP_KEY = "sp-tier-cap";
const CAP_DAYS = 7;

/** A tier Auto stepped down to on this device, remembered for a week. */
function readCap(): QualityTier | undefined {
  try {
    const raw = localStorage.getItem(CAP_KEY);
    if (!raw) return undefined;
    const cap = JSON.parse(raw) as { tier: QualityTier; at: number };
    if (Date.now() - cap.at > CAP_DAYS * 86_400_000) {
      localStorage.removeItem(CAP_KEY);
      return undefined;
    }
    return cap.tier === "balanced" || cap.tier === "low" ? cap.tier : undefined;
  } catch {
    return undefined;
  }
}

function saveCap(tier: QualityTier): void {
  try {
    localStorage.setItem(CAP_KEY, JSON.stringify({ tier, at: Date.now() }));
  } catch {
    // ignored
  }
}

async function readSignals(): Promise<HostSignals> {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
    getBattery?: () => Promise<{ level: number; charging: boolean }>;
  };
  let battery: HostSignals["battery"];
  try {
    const b = await nav.getBattery?.();
    if (b) battery = { level: b.level, charging: b.charging };
  } catch {
    battery = undefined;
  }
  return {
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: nav.connection?.saveData === true,
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    battery,
    cap: readCap(),
  };
}

function makeCanvas(container: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "sp-universe__canvas";
  canvas.setAttribute("aria-hidden", "true");
  container.replaceChildren(canvas);
  return canvas;
}

/** Starts the worker and asks whether it can draw. Resolves null when it cannot. */
function startWorker(url: string | undefined): Promise<Worker | null> {
  return new Promise((resolve) => {
    if (
      !url ||
      typeof Worker === "undefined" ||
      typeof OffscreenCanvas === "undefined" ||
      !("transferControlToOffscreen" in HTMLCanvasElement.prototype)
    ) {
      resolve(null);
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(url);
    } catch {
      resolve(null);
      return;
    }
    const give = (ok: boolean) => {
      clearTimeout(timer);
      worker.onmessage = null;
      worker.onerror = null;
      if (!ok) worker.terminate();
      resolve(ok ? worker : null);
    };
    // A worker that never answers (a blocked script, a stalled download) must not hold the sky up.
    const timer = setTimeout(() => give(false), 4000);
    worker.onmessage = (e: MessageEvent<{ type: string; ok?: boolean }>) => {
      if (e.data.type === "supported") give(e.data.ok === true);
    };
    worker.onerror = () => give(false);
    worker.postMessage({ type: "check" });
  });
}

export function createUniverseHost(options: UniverseHostOptions): UniverseHost {
  const { container } = options;
  let page = options.page;
  let setting = options.setting;
  let focusing = options.focusing;
  let destroyed = false;
  let path: EnginePath = "worker";
  let send: ((message: ToEngine) => void) | null = null;
  let stop = () => {};
  let drawn = false;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let nextProbe = 1;
  const probes = new Map<number, (result: ProbeResult | null) => void>();

  const size = () => ({
    width: Math.max(1, container.clientWidth || window.innerWidth),
    height: Math.max(1, container.clientHeight || window.innerHeight),
    dpr: window.devicePixelRatio || 1,
  });

  const onMessage = (message: FromEngine) => {
    if (destroyed) return;
    if (message.type === "ready") {
      drawn = true;
      options.onReady({ ...message, path });
    } else if (message.type === "quality") options.onQuality?.(message.tier, message.still);
    else if (message.type === "suggest") saveCap(message.tier);
    else if (message.type === "probe") {
      const { type: _type, id, ...result } = message;
      probes.get(id)?.(result);
      probes.delete(id);
    } else if (message.type === "failed") {
      // The worker had the canvas and could not use it after all: start over without one.
      if (path === "worker") {
        console.warn(
          "[universe] the worker could not draw; using the main thread:",
          message.reason,
        );
        stop();
        void startInline();
      } else fail(message.reason);
    }
  };

  const fail = (reason: unknown) => {
    // The sky is optional, but why it is missing should not be a mystery.
    console.warn("[universe] no galaxy here; the static sky stays:", String(reason));
    stop();
    send = null;
    container.replaceChildren();
    for (const resolve of probes.values()) resolve(null);
    probes.clear();
    if (!destroyed) options.onFailed();
  };

  const init = async (
    canvas: OffscreenCanvas | HTMLCanvasElement,
    deliver: (message: ToEngine, transfer?: Transferable[]) => void,
  ) => {
    const signals = await readSignals();
    if (destroyed) return;
    deliver(
      {
        type: "init",
        canvas,
        ...size(),
        setting,
        signals,
        page,
        focusing,
        visible: !document.hidden,
      },
      canvas instanceof HTMLCanvasElement ? undefined : [canvas],
    );
    send = deliver;
  };

  const startInline = async () => {
    path = "inline";
    try {
      const { Engine } = await import("./renderer/engine.ts");
      if (destroyed) return;
      const canvas = makeCanvas(container);
      const engine = new Engine(canvas, onMessage);
      stop = () => engine.dispose();
      await init(canvas, (message) => {
        try {
          engine.handle(message);
        } catch (error) {
          fail(error);
        }
      });
    } catch (error) {
      fail(error);
    }
  };

  const start = async () => {
    const worker = await startWorker(options.workerUrl);
    if (destroyed) {
      worker?.terminate();
      return;
    }
    if (!worker) {
      await startInline();
      return;
    }
    path = "worker";
    worker.onmessage = (e: MessageEvent<FromEngine>) => onMessage(e.data);
    worker.onerror = () => onMessage({ type: "failed", reason: "worker" });
    stop = () => worker.terminate();
    let offscreen: OffscreenCanvas;
    try {
      offscreen = makeCanvas(container).transferControlToOffscreen();
    } catch {
      stop();
      await startInline();
      return;
    }
    await init(offscreen, (message, transfer) => worker.postMessage(message, transfer ?? []));
    // A worker can say it is able to draw and then never present a frame (no animation
    // frames reach it, a driver that stalls). The page is not left without a galaxy for that.
    const watch = () => {
      watchdog = setTimeout(() => {
        if (destroyed || drawn || path !== "worker") return;
        if (document.hidden) return watch();
        console.warn("[universe] the worker drew nothing in time; using the main thread");
        stop();
        send = null;
        void startInline();
      }, WORKER_FIRST_FRAME_MS);
    };
    watch();
  };

  // ── forwarding ────────────────────────────────────────────────────────────
  const onResize = () => send?.({ type: "resize", ...size() });
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onResize);
  observer?.observe(container);
  window.addEventListener("resize", onResize);

  const onVisible = () => send?.({ type: "visible", visible: !document.hidden });
  document.addEventListener("visibilitychange", onVisible);
  // A page restored from the back/forward cache comes back without a visibility change.
  window.addEventListener("pageshow", onVisible);

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sendQuality = () =>
    void readSignals().then((signals) => send?.({ type: "quality", setting, signals }));
  motion.addEventListener("change", sendQuality);

  const offCosmic = onCosmic((event: CosmicEvent) => {
    if (!send || document.hidden) return;
    const origin = "origin" in event ? event.origin : undefined;
    if (!origin) {
      send({ type: "event", event });
      return;
    }
    // The engine has no DOM: it gets the control's place as a share of the viewport.
    send({
      type: "event",
      event,
      u: origin.x / Math.max(1, window.innerWidth),
      v: origin.y / Math.max(1, window.innerHeight),
    });
  });

  onStageInput((input: StageInput) => send?.({ type: "input", input }));

  void start();

  return {
    setPage(next) {
      if (
        next.mode === page.mode &&
        next.framing === page.framing &&
        next.shiftX === page.shiftX &&
        next.shiftY === page.shiftY
      )
        return;
      page = next;
      send?.({ type: "page", page });
    },
    setQuality(next) {
      if (next === setting) return;
      setting = next;
      sendQuality();
    },
    setFocusing(next) {
      if (next === focusing) return;
      focusing = next;
      send?.({ type: "focus", active: focusing });
    },
    probe() {
      if (!send) return Promise.resolve(null);
      const id = nextProbe++;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          probes.delete(id);
          resolve(null);
        }, 3000);
        probes.set(id, (result) => {
          clearTimeout(timer);
          resolve(result ? { ...result, path } : null);
        });
        send?.({ type: "probe", id });
      });
    },
    destroy() {
      destroyed = true;
      if (watchdog) clearTimeout(watchdog);
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      motion.removeEventListener("change", sendQuality);
      offCosmic();
      onStageInput(null);
      send?.({ type: "dispose" });
      stop();
      send = null;
      container.replaceChildren();
    },
  };
}
