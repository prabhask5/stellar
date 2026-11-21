/**
 * The cosmic event renderer: a 2D canvas above the interface with
 * pointer-events off, so events never delay or block a tap. It only draws
 * while an effect is alive; at rest it costs nothing.
 */
import { seededRandom } from "@stellar/shared/hash";
import type { ScreenPoint } from "./bus.ts";
import type { Effect } from "./director.ts";
import { NEBULA_RGBA } from "./palette.ts";
import { coreScreen } from "./store.ts";

const TAU = Math.PI * 2;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeIn = (t: number) => Math.pow(clamp01(t), 3);
const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
/** 0 → 1 → 0 across [0, 1], peaking at `peak`. */
const bell = (t: number, peak = 0.5) => {
  const x = clamp01(t);
  return x < peak ? easeOut(x / peak) : 1 - easeIn((x - peak) / (1 - peak));
};
const span = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));

interface Frame {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** The sky point sparks fly to: the galactic core when known, else upper centre. */
  core: ScreenPoint;
}

function glow(f: Frame, x: number, y: number, radius: number, rgb: string, alpha: number): void {
  if (alpha <= 0.003 || radius <= 0.5) return;
  const g = f.ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(0.35, `rgba(${rgb},${alpha * 0.45})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  f.ctx.fillStyle = g;
  f.ctx.beginPath();
  f.ctx.arc(x, y, radius, 0, TAU);
  f.ctx.fill();
}

function ring(
  f: Frame,
  x: number,
  y: number,
  radius: number,
  rgb: string,
  alpha: number,
  width: number,
  squash = 1,
): void {
  if (alpha <= 0.003 || radius <= 0.5) return;
  f.ctx.strokeStyle = `rgba(${rgb},${alpha})`;
  f.ctx.lineWidth = width;
  f.ctx.beginPath();
  f.ctx.ellipse(x, y, radius, radius * squash, 0, 0, TAU);
  f.ctx.stroke();
}

function line(
  f: Frame,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rgb: string,
  a1: number,
  a2: number,
  width: number,
): void {
  const g = f.ctx.createLinearGradient(x1, y1, x2, y2);
  g.addColorStop(0, `rgba(${rgb},${a1})`);
  g.addColorStop(1, `rgba(${rgb},${a2})`);
  f.ctx.strokeStyle = g;
  f.ctx.lineWidth = width;
  f.ctx.lineCap = "round";
  f.ctx.beginPath();
  f.ctx.moveTo(x1, y1);
  f.ctx.lineTo(x2, y2);
  f.ctx.stroke();
}

function sparkle(f: Frame, x: number, y: number, size: number, rgb: string, alpha: number): void {
  if (alpha <= 0.003) return;
  glow(f, x, y, size * 2.2, rgb, alpha * 0.5);
  line(f, x - size, y, x + size, y, rgb, alpha, alpha, 1.4);
  line(f, x, y - size, x, y + size, rgb, alpha, alpha, 1.4);
  glow(f, x, y, size * 0.5, NEBULA_RGBA.white, alpha);
}

const { gold, core: coreRgb, white, violet, magenta, blue } = NEBULA_RGBA;

// ── individual events ───────────────────────────────────────────────────────

/** Star ignition: a spark flies from the checkbox up into the sky and ignites a star with a small flare. ~1.2s per spark. */
function starIgnition(f: Frame, e: Effect, now: number): void {
  const flareScale = Math.min(2.4, Math.sqrt(e.magnitude));
  e.origins.forEach((o, i) => {
    const p = (now - o.at) / 1200;
    if (p < 0 || p > 1) return;
    const rand = seededRandom(e.id * 131 + i * 17);
    const from = o.point ?? { x: f.w * 0.5, y: f.h * 0.75 };
    const to = {
      x: f.core.x + (rand() - 0.5) * Math.min(260, f.w * 0.5),
      y: f.core.y + (rand() - 0.5) * 120,
    };
    const ctrl = {
      x: (from.x + to.x) / 2 + (rand() - 0.5) * 180,
      y: Math.min(from.y, to.y) - 60 - rand() * 80,
    };
    const at = (t: number) => {
      const u = easeOut(t);
      const v = 1 - u;
      return {
        x: v * v * from.x + 2 * v * u * ctrl.x + u * u * to.x,
        y: v * v * from.y + 2 * v * u * ctrl.y + u * u * to.y,
      };
    };
    const travel = span(p, 0, 0.72);
    if (p < 0.78) {
      for (let k = 6; k >= 0; k--) {
        const pos = at(Math.max(0, travel - k * 0.035));
        const a = (1 - k / 7) * (1 - span(p, 0.6, 0.78));
        glow(f, pos.x, pos.y, 9 - k, gold, a * 0.55);
      }
      const head = at(travel);
      glow(f, head.x, head.y, 4, white, 1 - span(p, 0.6, 0.78));
    }
    // The flare where the new star settles.
    const flare = span(p, 0.62, 1);
    if (flare > 0) {
      const a = bell(flare, 0.22);
      glow(f, to.x, to.y, (26 + 44 * easeOut(flare)) * flareScale, gold, a * 0.75);
      sparkle(f, to.x, to.y, (7 + 9 * a) * flareScale, coreRgb, a);
    }
  });
}

/** Comet sweep across the sky when overdue tasks are postponed. ~1.5s. */
function cometSweep(f: Frame, e: Effect, now: number): void {
  const p = (now - e.startedAt) / 1500;
  if (p > 1) return;
  const u = easeInOut(p);
  const x = -0.15 * f.w + u * 1.3 * f.w;
  const y = f.h * 0.14 + Math.sin(u * Math.PI) * f.h * 0.07 + u * f.h * 0.06;
  const tail = Math.min(0.5, 0.26 + e.magnitude * 0.012) * f.w;
  const a = bell(p, 0.35);
  line(f, x, y, x - tail, y - tail * 0.16, gold, a * 0.9, 0, 3);
  line(f, x, y, x - tail * 0.7, y - tail * 0.2, white, a * 0.5, 0, 1.2);
  glow(f, x, y, 26, gold, a * 0.8);
  glow(f, x, y, 7, white, a);
}

/** Planet accretion pulse for a progress-goal increment. ~1s. */
function accretionPulse(f: Frame, e: Effect, now: number): void {
  e.origins.forEach((o, i) => {
    const p = (now - o.at) / 1000;
    if (p < 0 || p > 1) return;
    const c = o.point ?? f.core;
    const rand = seededRandom(e.id * 71 + i);
    for (let k = 0; k < 2; k++) {
      const q = span(p, k * 0.18, 0.7 + k * 0.18);
      ring(f, c.x, c.y, 10 + 46 * easeOut(q), gold, (1 - q) * 0.7, 2);
    }
    for (let k = 0; k < 10; k++) {
      const a = rand() * TAU;
      const r = (1 - easeIn(p)) * (40 + rand() * 30);
      glow(
        f,
        c.x + Math.cos(a + p * 2) * r,
        c.y + Math.sin(a + p * 2) * r,
        3,
        coreRgb,
        bell(p, 0.3) * 0.8,
      );
    }
    glow(f, c.x, c.y, 22, gold, bell(p, 0.5) * 0.5);
  });
}

/** Planet formation: an accretion disk collapses into a glowing planet, then a shockwave ring. ~2.5s. */
function planetFormation(f: Frame, e: Effect, now: number): void {
  const p = (now - e.startedAt) / 2500;
  if (p > 1) return;
  const c = e.origins[0]?.point ?? { x: f.core.x, y: f.core.y };
  const rand = seededRandom(e.id * 911);
  const collapse = span(p, 0, 0.58);
  if (collapse < 1) {
    for (let k = 0; k < 46; k++) {
      const base = rand() * TAU;
      const r0 = 60 + rand() * 80;
      const r = r0 * (1 - easeIn(collapse));
      const a = base + collapse * (3.5 + rand() * 2);
      const tint = rand() > 0.6 ? violet : gold;
      glow(
        f,
        c.x + Math.cos(a) * r,
        c.y + Math.sin(a) * r * 0.42,
        2.2 + rand() * 2,
        tint,
        (0.25 + 0.6 * collapse) * (1 - span(collapse, 0.9, 1)),
      );
    }
  }
  const body = span(p, 0.45, 0.7);
  if (body > 0) {
    const fade = 1 - span(p, 0.8, 1);
    glow(f, c.x, c.y, 18 + 46 * easeOut(body), gold, 0.75 * fade);
    glow(f, c.x, c.y, 12 * easeOut(body), white, 0.95 * fade);
  }
  const shock = span(p, 0.6, 1);
  if (shock > 0) {
    ring(f, c.x, c.y, 20 + 240 * easeOut(shock), coreRgb, (1 - shock) * 0.8, 2.5);
    ring(f, c.x, c.y, 10 + 150 * easeOut(shock), gold, (1 - shock) * 0.4, 1.2);
  }
}

/** A planetary system blossoms: rings and moons ignite under a gold aurora wash. ~3.5s. */
function systemBlossom(f: Frame, e: Effect, now: number): void {
  const p = (now - e.startedAt) / 3500;
  if (p > 1) return;
  const c = { x: f.core.x, y: f.core.y };
  // Aurora: soft gold bands drifting across the top of the sky.
  const wash = bell(p, 0.4);
  for (let k = 0; k < 3; k++) {
    const y = f.h * (0.08 + k * 0.07) + Math.sin(p * 4 + k) * 14;
    const g = f.ctx.createLinearGradient(0, y - 70, 0, y + 70);
    g.addColorStop(0, `rgba(${gold},0)`);
    g.addColorStop(0.5, `rgba(${k === 1 ? coreRgb : gold},${0.16 * wash})`);
    g.addColorStop(1, `rgba(${gold},0)`);
    f.ctx.fillStyle = g;
    f.ctx.fillRect(0, y - 70, f.w, 140);
  }
  for (let k = 0; k < 3; k++) {
    const q = span(p, 0.1 + k * 0.14, 0.5 + k * 0.14);
    const hold = 1 - span(p, 0.82, 1);
    ring(f, c.x, c.y, (56 + k * 30) * easeOut(q), gold, q * 0.75 * hold, 2 - k * 0.4, 0.36);
  }
  const rand = seededRandom(e.id * 37);
  for (let k = 0; k < 4; k++) {
    const q = span(p, 0.3 + k * 0.1, 0.55 + k * 0.1);
    if (q <= 0) continue;
    const a = rand() * TAU + p * (1.2 + k * 0.3);
    const r = 56 + (k % 3) * 30;
    const fade = 1 - span(p, 0.85, 1);
    sparkle(
      f,
      c.x + Math.cos(a) * r,
      c.y + Math.sin(a) * r * 0.36,
      5 + 4 * bell(q, 0.3),
      white,
      q * fade,
    );
  }
  glow(f, c.x, c.y, 60 + 60 * wash, gold, 0.35 * wash);
}

/** A constellation star lights. ~0.8s per star. */
function constellationStar(f: Frame, e: Effect, now: number): void {
  e.origins.forEach((o) => {
    const p = (now - o.at) / 800;
    if (p < 0 || p > 1) return;
    const c = o.point ?? { x: f.w * 0.7, y: f.h * 0.2 };
    const y = c.y - 46 * easeOut(p);
    sparkle(f, c.x, y, 6 + 8 * bell(p, 0.3), coreRgb, bell(p, 0.25));
  });
}

function constellationShape(seed: number, f: Frame): ScreenPoint[] {
  const rand = seededRandom(seed);
  const cx = f.w * (0.62 + rand() * 0.12);
  const cy = Math.max(70, f.h * 0.17);
  const pts: ScreenPoint[] = [];
  let x = cx - 70;
  let y = cy + 20;
  for (let i = 0; i < 6; i++) {
    pts.push({ x, y });
    x += 24 + rand() * 22;
    y += (rand() - 0.5) * 46;
  }
  return pts;
}

/** A routine day reaches 100%: the constellation draws itself line by line, then flares. ~2s. */
function constellationDraw(f: Frame, e: Effect, now: number): void {
  const p = (now - e.startedAt) / 2000;
  if (p > 1) return;
  const pts = constellationShape(e.id * 53, f);
  const drawn = span(p, 0, 0.7) * (pts.length - 1);
  const fade = 1 - span(p, 0.85, 1);
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = clamp01(drawn - i);
    if (seg <= 0) break;
    const a = pts[i] as ScreenPoint;
    const b = pts[i + 1] as ScreenPoint;
    line(
      f,
      a.x,
      a.y,
      a.x + (b.x - a.x) * seg,
      a.y + (b.y - a.y) * seg,
      gold,
      0.7 * fade,
      0.7 * fade,
      1.3,
    );
  }
  pts.forEach((pt, i) => {
    if (drawn >= i - 0.05) sparkle(f, pt.x, pt.y, 4.5, coreRgb, fade * 0.95);
  });
  const flare = span(p, 0.68, 1);
  const last = pts[pts.length - 1] as ScreenPoint;
  if (flare > 0) glow(f, last.x, last.y, 30 + 70 * easeOut(flare), gold, bell(flare, 0.2) * 0.8);
}

/** A broken streak is rekindled: the dim constellation flickers back to full. ~1.5s. */
function rekindle(f: Frame, e: Effect, now: number): void {
  const p = (now - e.startedAt) / 1500;
  if (p > 1) return;
  const pts = constellationShape(e.id * 53, f);
  // Flicker: stepped noise that settles on full brightness.
  const flicker = p < 0.6 ? 0.35 + 0.65 * (Math.sin(p * 70) > 0.1 ? 1 : 0.2) * easeOut(p / 0.6) : 1;
  const a = flicker * (1 - span(p, 0.85, 1));
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i] as ScreenPoint;
    const t = pts[i + 1] as ScreenPoint;
    line(f, s.x, s.y, t.x, t.y, gold, 0.6 * a, 0.6 * a, 1.2);
  }
  for (const pt of pts) sparkle(f, pt.x, pt.y, 4.5, coreRgb, a);
}

/** Warp jump at the start of a focus phase: streaks radiate from the centre and stretch into lines. ~1.5s. */
function warpJump(f: Frame, e: Effect, now: number): void {
  const p = (now - e.startedAt) / 1500;
  if (p > 1) return;
  const rand = seededRandom(e.id * 613);
  const reach = Math.hypot(f.w, f.h) * 0.62;
  const envelope = bell(p, 0.45);
  for (let k = 0; k < 96; k++) {
    const a = rand() * TAU;
    const offset = rand();
    const head = reach * easeIn(clamp01(p * 1.25 - offset * 0.25) + 0.02) * (0.5 + rand() * 0.7);
    const length = (30 + rand() * 150) * envelope;
    const r1 = Math.max(18, head - length);
    const tint = rand() > 0.75 ? gold : white;
    line(
      f,
      f.core.x + Math.cos(a) * r1,
      f.core.y + Math.sin(a) * r1,
      f.core.x + Math.cos(a) * head,
      f.core.y + Math.sin(a) * head,
      tint,
      0,
      envelope * (0.25 + rand() * 0.5),
      1 + rand(),
    );
  }
  glow(f, f.core.x, f.core.y, 80 + 120 * envelope, white, 0.18 * envelope);
}

/** Supernova when a focus phase completes: bright bloom, expanding shell, stardust swirling into the core. ~3s. */
function supernova(f: Frame, e: Effect, now: number): void {
  const p = (now - e.startedAt) / 3000;
  if (p > 1) return;
  const c = f.core;
  const size = Math.max(f.w, f.h);
  const bloom = bell(span(p, 0, 0.45), 0.22);
  glow(f, c.x, c.y, size * (0.16 + 0.5 * bloom), white, 0.55 * bloom);
  glow(f, c.x, c.y, size * (0.1 + 0.3 * bloom), coreRgb, 0.8 * bloom);
  for (let k = 0; k < 2; k++) {
    const shell = span(p, 0.1 + k * 0.1, 0.78 + k * 0.1);
    ring(
      f,
      c.x,
      c.y,
      size * 0.62 * easeOut(shell),
      k ? violet : gold,
      (1 - shell) * (k ? 0.35 : 0.75),
      k ? 1.5 : 3,
    );
  }
  const swirl = span(p, 0.35, 1);
  if (swirl > 0) {
    const rand = seededRandom(e.id * 409);
    for (let k = 0; k < 70; k++) {
      const a0 = rand() * TAU;
      const r0 = size * (0.18 + rand() * 0.3);
      const r = r0 * (1 - easeInOut(swirl));
      const a = a0 + swirl * (2.2 + rand() * 1.6);
      glow(
        f,
        c.x + Math.cos(a) * r,
        c.y + Math.sin(a) * r * 0.55,
        2 + rand() * 2.5,
        rand() > 0.5 ? gold : coreRgb,
        bell(swirl, 0.3) * 0.8,
      );
    }
    glow(f, c.x, c.y, 40 + 30 * swirl, gold, bell(swirl, 0.8) * 0.5);
  }
}

/** A new Era: the sky dims as if the camera pulls back, a new layer forms in widening rings. The name is shown by the DOM layer. ~6s. */
function newEra(f: Frame, e: Effect, now: number): void {
  const p = (now - e.startedAt) / 6000;
  if (p > 1) return;
  const size = Math.max(f.w, f.h);
  const veil = bell(p, 0.35);
  f.ctx.globalCompositeOperation = "source-over";
  f.ctx.fillStyle = `rgba(7,6,21,${0.42 * veil})`;
  f.ctx.fillRect(0, 0, f.w, f.h);
  f.ctx.globalCompositeOperation = "lighter";
  const c = { x: f.w / 2, y: f.h * 0.42 };
  for (let k = 0; k < 4; k++) {
    const q = span(p, 0.05 + k * 0.12, 0.6 + k * 0.12);
    ring(f, c.x, c.y, size * 0.75 * easeOut(q), k % 2 ? violet : gold, (1 - q) * 0.5, 2, 0.5);
  }
  const rand = seededRandom(e.id * 271);
  const form = span(p, 0.15, 0.75);
  for (let k = 0; k < 90; k++) {
    const a = rand() * TAU;
    const r = size * (0.08 + rand() * 0.5) * easeOut(form);
    const tint = [gold, violet, magenta, blue][k % 4] as string;
    glow(
      f,
      c.x + Math.cos(a) * r,
      c.y + Math.sin(a) * r * 0.5,
      2 + rand() * 3,
      tint,
      bell(p, 0.5) * 0.7,
    );
  }
  glow(f, c.x, c.y, size * 0.3, gold, 0.3 * veil);
}

/** First Light: the core ignites from the void. ~4s. */
function firstLight(f: Frame, e: Effect, now: number): void {
  const p = (now - e.startedAt) / 4000;
  if (p > 1) return;
  const size = Math.max(f.w, f.h);
  f.ctx.globalCompositeOperation = "source-over";
  f.ctx.fillStyle = `rgba(4,3,12,${0.7 * (1 - easeInOut(span(p, 0.1, 0.8)))})`;
  f.ctx.fillRect(0, 0, f.w, f.h);
  f.ctx.globalCompositeOperation = "lighter";
  const c = f.core;
  const ignite = easeInOut(span(p, 0.12, 0.7));
  const settle = 1 - span(p, 0.75, 1) * 0.75;
  glow(f, c.x, c.y, size * 0.5 * ignite, coreRgb, 0.5 * ignite * settle);
  glow(f, c.x, c.y, size * 0.16 * ignite, white, 0.9 * ignite * settle);
  const rand = seededRandom(e.id * 83);
  for (let k = 0; k < 14; k++) {
    const a = rand() * TAU;
    const len = size * (0.12 + rand() * 0.3) * ignite;
    line(
      f,
      c.x,
      c.y,
      c.x + Math.cos(a) * len,
      c.y + Math.sin(a) * len,
      coreRgb,
      0.5 * ignite * settle,
      0,
      1.5,
    );
  }
  ring(f, c.x, c.y, size * 0.5 * easeOut(span(p, 0.45, 1)), gold, (1 - span(p, 0.45, 1)) * 0.6, 2);
}

/** Reduced motion and the Minimal tier: every event is a brief soft glow at its source. */
function softGlow(f: Frame, e: Effect, now: number): void {
  for (const o of e.origins) {
    const p = (now - o.at) / 450;
    if (p < 0 || p > 1) continue;
    const c = o.point ?? f.core;
    const big =
      e.type === "focus_complete" ||
      e.type === "new_era" ||
      e.type === "first_light" ||
      e.type === "goal_list_completed";
    glow(
      f,
      c.x,
      c.y,
      big ? Math.max(f.w, f.h) * 0.35 : 70,
      gold,
      bell(p, 0.35) * (big ? 0.35 : 0.5),
    );
  }
}

const PAINTERS: Record<Effect["type"], (f: Frame, e: Effect, now: number) => void> = {
  task_completed: starIgnition,
  overdue_postponed: cometSweep,
  goal_progress: accretionPulse,
  goal_completed: planetFormation,
  goal_list_completed: systemBlossom,
  routine_instance: constellationStar,
  routine_day_complete: constellationDraw,
  streak_rekindled: rekindle,
  focus_start: warpJump,
  focus_complete: supernova,
  new_era: newEra,
  first_light: firstLight,
};

export class OverlayRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private dirty = false;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas is not available");
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  /** Paints the given effects for time `now` (ms, same clock as the director). */
  draw(effects: readonly Effect[], now: number, reduced: boolean): void {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.dirty || effects.length > 0) ctx.clearRect(0, 0, this.w, this.h);
    this.dirty = effects.length > 0;
    if (effects.length === 0) return;
    const frame: Frame = {
      ctx,
      w: this.w,
      h: this.h,
      core: coreScreen.known
        ? { x: coreScreen.x, y: coreScreen.y }
        : { x: this.w / 2, y: this.h * 0.34 },
    };
    ctx.globalCompositeOperation = "lighter";
    for (const effect of effects) {
      if (reduced) softGlow(frame, effect, now);
      else PAINTERS[effect.type](frame, effect, now);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.dirty = false;
  }
}
