/**
 * Scene state shared between the app (which feeds it) and the canvas (which
 * reads it imperatively). The canvas never re-renders through React when this
 * changes: it subscribes and updates buffers and uniforms directly.
 */
import type { UniverseSnapshot } from "@stellar/shared";
import { createStore } from "zustand/vanilla";
import type { QualitySetting, QualityTier } from "./quality.ts";

export type UniverseMode = "home" | "page" | "off";

export interface HoverTarget {
  kind: "planet" | "constellation";
  id: string;
  title: string;
  subtitle: string;
  /** Viewport pixels. */
  x: number;
  y: number;
}

export interface UniverseState {
  snapshot: UniverseSnapshot | null;
  setting: QualitySetting;
  /** The tier actually rendered (resolved from the setting and the device, lowered by the governor). */
  tier: QualityTier;
  /** "home": interactive framing. "page": fixed, dimmed framing. "off": signed out, nothing to show. */
  mode: UniverseMode;
  /** A focus phase is running: show the subtle warp tunnel. */
  focusAmbient: boolean;
  reducedMotion: boolean;
  /** Rendering paused (tab hidden, or typing on a phone). */
  paused: boolean;
  /** True once the 3D scene has drawn its first frame and may cross-fade in. */
  ready: boolean;
  hover: HoverTarget | null;
}

export const universeStore = createStore<UniverseState>(() => ({
  snapshot: null,
  setting: "auto",
  tier: "minimal",
  mode: "off",
  focusAmbient: false,
  reducedMotion: false,
  paused: false,
  ready: false,
  hover: null,
}));

/** Screen-space targets for hover and tap, refreshed by the scene a few times a second. */
export interface ScreenTarget {
  kind: "planet" | "constellation";
  id: string;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  /** Hit radius in pixels. */
  r: number;
}

export const screenTargets: ScreenTarget[] = [];

/** Where the galactic core currently is on screen; sparks fly towards it. */
export const coreScreen = { x: 0, y: 0, known: false };

// Diagnostics: lets the browser console (and the end-to-end tests) see what the scene exposes for hover and tap.
if (typeof window !== "undefined") {
  (window as Window & { __stellarUniverse?: unknown }).__stellarUniverse = {
    screenTargets,
    coreScreen,
    info: () => diagnostics.info?.() ?? null,
    /** Milliseconds for which the scene is still yielding to the interface. */
    yielding: () => Math.max(0, sceneSignals.yieldUntil - performance.now()),
  };
}

/** Finds what is under a point (viewport pixels) and shows its label. Returns true on a hit. */
export function pickAt(x: number, y: number): boolean {
  let best: ScreenTarget | null = null;
  let bestD = Infinity;
  for (const t of screenTargets) {
    const d = Math.hypot(t.x - x, t.y - y);
    if (d <= t.r && d < bestD) {
      best = t;
      bestD = d;
    }
  }
  const current = universeStore.getState().hover;
  if (!best) {
    if (current) universeStore.setState({ hover: null });
    return false;
  }
  if (
    current?.id !== best.id ||
    Math.abs(current.x - best.x) > 2 ||
    Math.abs(current.y - best.y) > 2
  ) {
    universeStore.setState({
      hover: {
        kind: best.kind,
        id: best.id,
        title: best.title,
        subtitle: best.subtitle,
        x: best.x,
        y: best.y,
      },
    });
  }
  return true;
}

export function clearHover(): void {
  if (universeStore.getState().hover) universeStore.setState({ hover: null });
}

/**
 * Camera input from the Universe home: gentle orbit and zoom, with an inertial
 * return to the default framing when released. Plain object so pointer moves
 * never touch React or the store.
 */
export const cameraInput = {
  azimuth: 0,
  polar: 0,
  zoom: 0,
  dragging: false,
  /** Seconds since the last interaction, used to start the return. */
  idle: 10,
};

const LIMIT_AZ = 0.9;
const LIMIT_POLAR = 0.38;
const LIMIT_ZOOM = 0.45;

export function orbitBy(dxPx: number, dyPx: number): void {
  cameraInput.azimuth = Math.max(-LIMIT_AZ, Math.min(LIMIT_AZ, cameraInput.azimuth - dxPx * 0.004));
  cameraInput.polar = Math.max(
    -LIMIT_POLAR,
    Math.min(LIMIT_POLAR, cameraInput.polar - dyPx * 0.003),
  );
  cameraInput.idle = 0;
}

/** factor > 1 zooms in. */
export function zoomBy(factor: number): void {
  cameraInput.zoom = Math.max(
    -LIMIT_ZOOM,
    Math.min(LIMIT_ZOOM, cameraInput.zoom + Math.log(factor) * 0.6),
  );
  cameraInput.idle = 0;
}

export function setDragging(dragging: boolean): void {
  cameraInput.dragging = dragging;
  cameraInput.idle = 0;
}

/** Moments the 3D scene reacts to (set by the event overlay). Seconds on the scene clock; -1 = never. */
export const sceneSignals = {
  /** Core flash: supernova, first light, new era. */
  flashAt: -1,
  flashStrength: 0,
  /** Warp jump burst at the start of a focus phase. */
  warpAt: -1,
  /** Ids of stars that should flare as they ignite, with the scene time to start at. */
  ignite: [] as string[],
  /** Constellation ids to flicker back to life. */
  rekindle: [] as string[],
  /** Monotonic scene clock in seconds, written by the render loop. */
  now: 0,
  /** `performance.now()` until which the scene holds its frame for the interface (scroll, typing, sheets). */
  yieldUntil: 0,
};

/** Read-only renderer statistics, present while a WebGL scene is mounted. */
export const diagnostics: {
  info: (() => { geometries: number; textures: number; programs: number; calls: number }) | null;
} = { info: null };

const CAP_KEY = "sp-tier-cap";
const CAP_DAYS = 7;
const ORDER: readonly QualityTier[] = ["minimal", "balanced", "cinematic"];

/**
 * When Auto had to step down because this device could not hold the frame rate, the lower
 * tier is remembered for a week. The next launch then starts there, instead of starting
 * high, stuttering for three seconds and rebuilding the scene every time.
 */
export function rememberTierCap(tier: QualityTier): void {
  try {
    localStorage.setItem(CAP_KEY, JSON.stringify({ tier, at: Date.now() }));
  } catch {
    // ignored
  }
}

/** Applies the remembered cap to a tier chosen by Auto. */
export function capTier(tier: QualityTier): QualityTier {
  try {
    const raw = localStorage.getItem(CAP_KEY);
    if (!raw) return tier;
    const cap = JSON.parse(raw) as { tier: QualityTier; at: number };
    if (Date.now() - cap.at > CAP_DAYS * 86_400_000) {
      localStorage.removeItem(CAP_KEY);
      return tier;
    }
    return ORDER.indexOf(cap.tier) < ORDER.indexOf(tier) ? cap.tier : tier;
  } catch {
    return tier;
  }
}
