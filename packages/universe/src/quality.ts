/** Quality tiers: what each one renders, how Auto chooses, and when to step down. */

export type QualitySetting = "auto" | "cinematic" | "balanced" | "minimal";
export type QualityTier = "cinematic" | "balanced" | "minimal";

export interface TierProfile {
  /** Renders the 3D scene at all. Minimal keeps the static starfield. */
  webgl: boolean;
  maxDpr: number;
  bloom: boolean;
  /** Frames per second while nothing is happening / during events and interaction. */
  idleFps: number;
  activeFps: number;
  maxStars: number;
  maxDust: number;
  /** Average frame time (ms) above which the tier is too heavy for this device. */
  frameBudgetMs: number;
}

export const TIERS: Record<QualityTier, TierProfile> = {
  cinematic: {
    webgl: true,
    maxDpr: 2,
    bloom: true,
    idleFps: 60,
    activeFps: 60,
    maxStars: 20_000,
    maxDust: 4800,
    frameBudgetMs: 1000 / 45,
  },
  balanced: {
    webgl: true,
    maxDpr: 1.25,
    bloom: false,
    idleFps: 30,
    activeFps: 60,
    maxStars: 6_000,
    maxDust: 1600,
    frameBudgetMs: 1000 / 20,
  },
  minimal: {
    webgl: false,
    maxDpr: 1,
    bloom: false,
    idleFps: 0,
    activeFps: 0,
    maxStars: 0,
    maxDust: 0,
    frameBudgetMs: Infinity,
  },
};

export interface DeviceSignals {
  reducedMotion: boolean;
  saveData: boolean;
  /** navigator.deviceMemory in GB, when the browser reports it. */
  deviceMemory?: number;
  hardwareConcurrency?: number;
  /** 0 = no WebGL or software rendering, 1 = low, 2 = mid, 3 = high. */
  gpuTier: 0 | 1 | 2 | 3;
  /** Whether a WebGL context can be created at all (true even for software rendering). */
  webgl: boolean;
  /** Battery level 0…1 and charging state, when available. */
  battery?: { level: number; charging: boolean };
}

export function stepDown(tier: QualityTier): QualityTier {
  return tier === "cinematic" ? "balanced" : "minimal";
}

/**
 * The tier to render. An explicit setting is respected. Auto reads the device:
 * reduced motion and data saver mean Minimal; otherwise GPU, memory and cores
 * decide, and a battery at or below 20% that is not charging steps down once.
 */
export function selectTier(setting: QualitySetting, d: DeviceSignals): QualityTier {
  if (setting !== "auto") {
    // An explicit choice is honoured wherever WebGL exists at all.
    return d.webgl ? setting : "minimal";
  }
  if (d.reducedMotion || d.saveData || d.gpuTier === 0) return "minimal";
  const memory = d.deviceMemory ?? 8;
  const cores = d.hardwareConcurrency ?? 8;
  let tier: QualityTier;
  if (d.gpuTier >= 2 && memory >= 4 && cores >= 4) tier = "cinematic";
  else if (d.gpuTier >= 1 && memory >= 2) tier = "balanced";
  else tier = "minimal";
  if (d.battery && d.battery.level <= 0.2 && !d.battery.charging) tier = stepDown(tier);
  return tier;
}

/** Classifies a WebGL renderer string. Runs locally; no benchmark download. */
export function gpuTierFromRenderer(renderer: string | null, maxTextureSize = 4096): 0 | 1 | 2 | 3 {
  if (!renderer) return 0;
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
  if (/adreno|mali|powervr|intel|videocore/.test(r)) return maxTextureSize >= 8192 ? 2 : 1;
  return maxTextureSize >= 8192 ? 2 : 1;
}

/**
 * Watches frame times and asks for a lower tier when the average stays above
 * the budget for three seconds. After a step-down it waits before judging again.
 */
export class FrameGovernor {
  private budgetMs: number;
  private ema = 0;
  private overSince: number | null = null;
  private quietUntil = 0;
  static readonly SUSTAIN_MS = 3000;
  static readonly COOLDOWN_MS = 5000;

  constructor(budgetMs: number) {
    this.budgetMs = budgetMs;
  }

  setBudget(budgetMs: number, now: number): void {
    this.budgetMs = budgetMs;
    this.ema = 0;
    this.overSince = null;
    this.quietUntil = now + FrameGovernor.COOLDOWN_MS;
  }

  /** Feed one frame. Returns true when the tier should step down now. */
  frame(dtMs: number, now: number): boolean {
    // A long gap is a hidden tab or a breakpoint, not a slow frame.
    if (dtMs > 500 || dtMs <= 0) {
      this.overSince = null;
      return false;
    }
    this.ema = this.ema === 0 ? dtMs : this.ema * 0.9 + dtMs * 0.1;
    if (now < this.quietUntil || !Number.isFinite(this.budgetMs)) return false;
    if (this.ema <= this.budgetMs) {
      this.overSince = null;
      return false;
    }
    if (this.overSince === null) this.overSince = now;
    if (now - this.overSince >= FrameGovernor.SUSTAIN_MS) {
      this.overSince = null;
      this.quietUntil = now + FrameGovernor.COOLDOWN_MS;
      return true;
    }
    return false;
  }

  get average(): number {
    return this.ema;
  }
}
