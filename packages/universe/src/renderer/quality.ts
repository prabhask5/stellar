/**
 * Quality tiers. A tier sets three things only: how many stars, how many pixels and whether
 * there is bloom. Auto picks one from the device, checks it against the first live frames,
 * and never changes what is on screen mid-view: a step-down waits for the next mode change.
 */

/** The stored setting (`sp_settings.quality_tier`). The names are older than the labels. */
export type QualitySetting = "auto" | "cinematic" | "balanced" | "minimal";
export type QualityTier = "high" | "balanced" | "low";

export interface TierProfile {
  stars: number;
  /** Unresolved-starlight points, star-forming knots and dust puffs scale with the stars. */
  haze: number;
  knots: number;
  dust: number;
  /** Pixel budget of the drawing buffer. */
  maxPixels: number;
  bloom: boolean;
  /** Light per star, so fewer stars add up to the same galaxy. */
  starLight: number;
  /** Average frame time (ms) over the probe above which the tier is too heavy here. */
  frameBudgetMs: number;
}

export const TIERS: Record<QualityTier, TierProfile> = {
  high: {
    stars: 190_000,
    haze: 22_000,
    knots: 640,
    dust: 4600,
    maxPixels: 2.4e6,
    bloom: true,
    starLight: 0.42,
    frameBudgetMs: 1000 / 45,
  },
  balanced: {
    stars: 110_000,
    haze: 14_000,
    knots: 420,
    dust: 3000,
    maxPixels: 1.4e6,
    bloom: true,
    starLight: 0.55,
    frameBudgetMs: 1000 / 38,
  },
  low: {
    stars: 60_000,
    haze: 9000,
    knots: 280,
    dust: 2000,
    maxPixels: 0.9e6,
    bloom: false,
    starLight: 0.8,
    frameBudgetMs: Infinity,
  },
};

const SETTING_TIER: Record<Exclude<QualitySetting, "auto">, QualityTier> = {
  cinematic: "high",
  balanced: "balanced",
  minimal: "low",
};

export interface DeviceSignals {
  reducedMotion: boolean;
  saveData: boolean;
  /** navigator.deviceMemory in GB, when the browser reports it. */
  deviceMemory?: number;
  hardwareConcurrency?: number;
  /** 0 = software rendering, 1 = low, 2 = mid, 3 = high. */
  gpuTier: 0 | 1 | 2 | 3;
  /** Battery level 0…1 and charging state, when available. */
  battery?: { level: number; charging: boolean };
  /** A tier Auto stepped down to on this device earlier. */
  cap?: QualityTier;
}

export interface QualityChoice {
  tier: QualityTier;
  /** True when nothing may move by itself: the galaxy is drawn once and events are a glow. */
  still: boolean;
}

const ORDER: readonly QualityTier[] = ["low", "balanced", "high"];

export function stepDown(tier: QualityTier): QualityTier {
  return tier === "high" ? "balanced" : "low";
}

export function lowerOf(a: QualityTier, b: QualityTier): QualityTier {
  return ORDER.indexOf(a) < ORDER.indexOf(b) ? a : b;
}

/**
 * The tier to render. An explicit setting is respected as it is. Auto reads the device: GPU,
 * memory and cores decide, a battery at or below 20% that is not charging steps down once,
 * and a remembered step-down is kept. Software rendering and data saver get the lightest
 * tier and a still sky. Reduced motion always means a still sky, whatever the setting.
 */
export function chooseQuality(setting: QualitySetting, d: DeviceSignals): QualityChoice {
  if (setting !== "auto") return { tier: SETTING_TIER[setting], still: d.reducedMotion };
  if (d.saveData || d.gpuTier === 0) return { tier: "low", still: true };
  const memory = d.deviceMemory ?? 8;
  const cores = d.hardwareConcurrency ?? 8;
  let tier: QualityTier;
  if (d.gpuTier >= 3 && memory >= 4 && cores >= 4) tier = "high";
  else if (d.gpuTier >= 2 && memory >= 2) tier = "balanced";
  else tier = "low";
  if (d.battery && d.battery.level <= 0.2 && !d.battery.charging) tier = stepDown(tier);
  if (d.cap) tier = lowerOf(tier, d.cap);
  return { tier, still: d.reducedMotion };
}

/** Classifies a WebGL renderer string. Runs locally; no benchmark download. */
export function gpuTierFromRenderer(renderer: string | null, maxTextureSize = 4096): 0 | 1 | 2 | 3 {
  if (!renderer) return maxTextureSize >= 8192 ? 2 : 1;
  const r = renderer.toLowerCase();
  if (/swiftshader|llvmpipe|software|softpipe|microsoft basic render/.test(r)) return 0;
  if (
    /apple (m\d|a1[4-9]|a[2-9]\d)|apple gpu|rtx|radeon rx|radeon pro|geforce gtx 1[0-9]{3}|geforce (rtx|gtx 9)|arc a\d|adreno \(tm\) (7\d\d|8\d\d)|adreno 7\d\d|mali-g7[1-9]\d?|mali-g[6-9]1\d|immortalis|xclipse/.test(
      r,
    )
  )
    return 3;
  if (
    /iris|uhd graphics|adreno \(tm\) 6\d\d|adreno 6\d\d|mali-g[5-7]\d|apple a1[0-3]|radeon|geforce|intel\(r\) (hd|xe)/.test(
      r,
    )
  )
    return 2;
  return maxTextureSize >= 8192 ? 2 : 1;
}

/** Drawing-buffer size for a CSS size: device pixels up to 2×, within the tier's pixel budget. */
export function bufferSize(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  maxPixels: number,
): { width: number; height: number; scale: number } {
  const w = Math.max(1, cssWidth);
  const h = Math.max(1, cssHeight);
  const scale = Math.min(Math.min(Math.max(dpr, 1), 2), Math.sqrt(maxPixels / (w * h)));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  };
}

/**
 * Checks Auto's choice against the first live frames. Feed it frame times; once it has seen
 * enough it answers whether the tier holds. Gaps (a hidden tab, a breakpoint) are not frames.
 */
export class FrameProbe {
  static readonly FRAMES = 120;
  /** The first frames compile shaders and upload buffers; they say nothing about steady state. */
  static readonly WARMUP = 12;
  private seen = 0;
  private sum = 0;
  private budgetMs: number;
  verdict: "pending" | "ok" | "down" = "pending";

  constructor(budgetMs: number) {
    this.budgetMs = budgetMs;
    if (!Number.isFinite(budgetMs)) this.verdict = "ok";
  }

  /** Returns true on the frame the verdict is reached. */
  frame(dtMs: number): boolean {
    if (this.verdict !== "pending" || dtMs <= 0 || dtMs > 250) return false;
    this.seen++;
    if (this.seen <= FrameProbe.WARMUP) return false;
    this.sum += dtMs;
    if (this.seen < FrameProbe.WARMUP + FrameProbe.FRAMES) return false;
    this.verdict = this.sum / FrameProbe.FRAMES > this.budgetMs ? "down" : "ok";
    return true;
  }

  get average(): number {
    const n = this.seen - FrameProbe.WARMUP;
    return n > 0 ? this.sum / n : 0;
  }
}

/**
 * Holds the tier on screen and the one waiting. A new tier is only ever taken at a boundary
 * (a mode change, a navigation, an explicit choice in Settings), where a cross-fade covers it.
 */
export class QualityPlan {
  current: QualityTier;
  private pending: QualityTier | null = null;

  constructor(tier: QualityTier) {
    this.current = tier;
  }

  /** Ask for a tier. Nothing changes until `takeAtBoundary`. */
  request(tier: QualityTier): void {
    this.pending = tier === this.current ? null : tier;
  }

  get waiting(): QualityTier | null {
    return this.pending;
  }

  /** At a boundary: returns the tier to switch to, or null when nothing is waiting. */
  takeAtBoundary(): QualityTier | null {
    const next = this.pending;
    if (!next) return null;
    this.pending = null;
    this.current = next;
    return next;
  }
}
