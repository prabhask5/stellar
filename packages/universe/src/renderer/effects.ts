/**
 * Cosmic events: particles inside the same 3D scene as the galaxy. One spec per event type
 * (how long it lasts, where it starts, where it lands, and the program that draws it), a
 * pool of effect slots, and the scheduler that staggers, caps and drops events. No GL here:
 * programs write into `Particles`, and the engine uploads that once per frame.
 *
 * Nothing in this file allocates while an effect is playing.
 */
import type { CosmicEvent, CosmicEventType } from "../bus.ts";
import type { Camera } from "./camera.ts";
import { armAngle, PATTERN_SPEED, TARGET_STRIDE } from "./galaxy.ts";
import { bell, clamp01, easeIn, easeInOut, easeOut, hash32, rng, TAU } from "./math.ts";
import { PALETTE, type Rgb, WHITE } from "./palette.ts";

export const PARTICLE_CAP = 6000;

/** The particles of one frame. */
export class Particles {
  readonly position = new Float32Array(PARTICLE_CAP * 3);
  readonly color = new Float32Array(PARTICLE_CAP * 4);
  readonly size = new Float32Array(PARTICLE_CAP);
  count = 0;

  add(x: number, y: number, z: number, c: Rgb, intensity: number, size: number): void {
    const n = this.count;
    if (n >= PARTICLE_CAP || intensity <= 0.004 || size <= 0) return;
    this.position[n * 3] = x;
    this.position[n * 3 + 1] = y;
    this.position[n * 3 + 2] = z;
    this.color[n * 4] = c[0];
    this.color[n * 4 + 1] = c[1];
    this.color[n * 4 + 2] = c[2];
    this.color[n * 4 + 3] = intensity;
    this.size[n] = size;
    this.count = n + 1;
  }
}

/** What an effect's program may read and write for the frame it draws. */
export interface Stage {
  /** Scene time in seconds: where the galaxy's rotation is. */
  time: number;
  targets: Float32Array;
  targetCount: number;
  camera: Camera;
  particles: Particles;
  /** Added to the core's brightness this frame. */
  core: number;
  /** Extra camera push-in this frame, 0…1. */
  push: number;
}

const RAND = 1024;

export interface Effect {
  type: CosmicEventType;
  /** `performance.now()` at which it starts; later than "now" when it was staggered. */
  startAt: number;
  /** Seconds. */
  duration: number;
  /** Index of the arm star it lands on, or -1. */
  target: number;
  /** Where the owner tapped, 0…1 across the viewport; NaN when there is no control. */
  u: number;
  v: number;
  /** Event-specific size: a count, or the share of a goal a step covered. */
  amount: number;
  /** Drawn as the reduced-motion glow instead of its program. */
  glow: boolean;
  /** Stands in for a burst of task completions. */
  burst: boolean;
  /** The launch point, fixed in the world on the effect's first frame. */
  from: Float32Array;
  launched: boolean;
  /** Its own random numbers, filled when planned, so the same item plays the same way. */
  rand: Float32Array;
}

export interface EffectSpec {
  /** Seconds. */
  duration: number;
  /** Where it starts: at the control the owner tapped, or nowhere in particular. */
  origin: "control" | "none";
  /** Where it lands: a real star on a major arm chosen by the item's id, or the whole disk. */
  target: "arm-star" | "disk";
  /** Needs the galaxy or the camera to move, so a frozen page goes live while it plays. */
  motion: boolean;
  draw: (e: Effect, t: number, s: Stage) => void;
}

// Scratch space shared by the programs. Effects are drawn one at a time.
const TO = new Float32Array(3);
const A = new Float32Array(3);

const hasOrigin = (e: Effect): boolean => e.u === e.u;

/** Where a target star is right now. Arm stars turn rigidly with the pattern. */
export function targetPosition(s: Stage, index: number, out: Float32Array | number[]): void {
  if (index < 0 || s.targetCount === 0) {
    out[0] = out[1] = out[2] = 0;
    return;
  }
  const k = (index % s.targetCount) * TARGET_STRIDE;
  const a = s.targets[k] ?? 0;
  const theta = (s.targets[k + 1] ?? 0) + PATTERN_SPEED * s.time;
  out[0] = a * Math.cos(theta);
  out[1] = s.targets[k + 2] ?? 0;
  out[2] = a * Math.sin(theta);
}

/** Fixes the launch point: just in front of the camera, where the control is on screen. */
function launch(e: Effect, s: Stage): void {
  if (e.launched) return;
  e.launched = true;
  if (hasOrigin(e)) s.camera.unproject(e.u, e.v, s.camera.distance * 0.22, e.from);
  else {
    // No control: come in from above the disk, on the camera's side.
    e.from[0] = s.camera.eye[0]! * 0.45;
    e.from[1] = s.camera.eye[1]! * 0.45 + 0.35;
    e.from[2] = s.camera.eye[2]! * 0.45;
  }
}

/** A point on the arc from A to TO at parameter `u`, lifted by `lift` at its middle. */
function arc(u: number, lift: number, out: Float32Array): void {
  const v = 1 - u;
  const cx = (A[0]! + TO[0]!) / 2;
  const cy = (A[1]! + TO[1]!) / 2 + lift;
  const cz = (A[2]! + TO[2]!) / 2;
  out[0] = v * v * A[0]! + 2 * v * u * cx + u * u * TO[0]!;
  out[1] = v * v * A[1]! + 2 * v * u * cy + u * u * TO[1]!;
  out[2] = v * v * A[2]! + 2 * v * u * cz + u * u * TO[2]!;
}

const P = new Float32Array(3);

/** A bright head with a continuous tail along the arc A → TO, at progress `e` (0…1). */
function streak(
  s: Stage,
  c: Rgb,
  e: number,
  tail: number,
  head: number,
  headSize: number,
  fade = 1,
  rise = 0.4,
): void {
  const lift = rise * Math.hypot(TO[0]! - A[0]!, TO[1]! - A[1]!, TO[2]! - A[2]!);
  arc(e, lift, P);
  s.particles.add(P[0]!, P[1]!, P[2]!, c, head * fade, headSize);
  for (let k = 1; k < tail; k++) {
    const u = e - k * 0.005;
    if (u < 0) break;
    arc(u, lift, P);
    s.particles.add(
      P[0]!,
      P[1]!,
      P[2]!,
      c,
      3.2 * Math.pow(1 - k / tail, 1.4) * fade,
      headSize * 0.48 * (1 - k / (tail * 1.15)),
    );
  }
}

/** A ring in the galactic plane around TO. */
function ring(
  s: Stage,
  c: Rgb,
  radius: number,
  points: number,
  intensity: number,
  size: number,
): void {
  if (intensity <= 0.004) return;
  for (let k = 0; k < points; k++) {
    const a = (k / points) * TAU;
    s.particles.add(
      TO[0]! + Math.cos(a) * radius,
      TO[1]!,
      TO[2]! + Math.sin(a) * radius,
      c,
      intensity,
      size,
    );
  }
}

/** Embers flying out from TO along the effect's own random directions. */
function embers(
  e: Effect,
  s: Stage,
  c: Rgb,
  count: number,
  reach: number,
  intensity: number,
  size: number,
  fall = 0,
): void {
  if (intensity <= 0.004) return;
  for (let k = 0; k < count; k++) {
    const y = e.rand[k * 3]! * 2 - 1;
    const a = e.rand[k * 3 + 1]! * TAU;
    const h = Math.sqrt(1 - y * y);
    const r = reach * (0.55 + 0.45 * e.rand[k * 3 + 2]!);
    s.particles.add(
      TO[0]! + h * Math.cos(a) * r,
      TO[1]! + y * r - fall,
      TO[2]! + h * Math.sin(a) * r,
      c,
      intensity,
      size,
    );
  }
}

/** The ignition where a shooting star lands: flare, white-hot centre, ring, embers. */
function ignition(e: Effect, s: Stage, c: Rgb, f: number, scale: number, emberCount: number): void {
  const pop = bell(Math.min(1, f * 2));
  s.particles.add(
    TO[0]!,
    TO[1]!,
    TO[2]!,
    c,
    scale * (22 * Math.pow(1 - f, 2.2) + 2 * (1 - f)),
    scale * (0.03 + 0.2 * pop),
  );
  s.particles.add(
    TO[0]!,
    TO[1]!,
    TO[2]!,
    WHITE,
    scale * 30 * Math.pow(1 - f, 4),
    scale * (0.02 + 0.05 * pop),
  );
  ring(
    s,
    c,
    scale * (0.02 + 0.32 * easeOut(f)),
    Math.round(90 * scale),
    3 * Math.pow(1 - f, 2),
    0.013,
  );
  embers(e, s, c, emberCount, scale * 0.2 * easeOut(f), 3 * (1 - f), 0.014);
}

function shootingStar(
  e: Effect,
  t: number,
  s: Stage,
  c: Rgb,
  flight: number,
  tail: number,
  scale: number,
  emberCount: number,
): void {
  launch(e, s);
  targetPosition(s, e.target, TO);
  if (t < flight) {
    A.set(e.from);
    streak(s, c, easeInOut(t / flight), tail, 14 * scale, 0.05 * scale);
    return;
  }
  ignition(e, s, c, (t - flight) / (e.duration - flight), scale, emberCount);
}

/** Motes converge on an arm star, then a soft pop and a small ring. */
function condense(e: Effect, t: number, s: Stage): void {
  const c = PALETTE.fx.born;
  targetPosition(s, e.target, TO);
  const gather = 0.9;
  if (t < gather) {
    const k = 1 - easeIn(t / gather);
    embers(e, s, c, 40, 0.25 * k, 3.5 * (t / gather), 0.018);
    return;
  }
  const f = (t - gather) / (e.duration - gather);
  s.particles.add(TO[0]!, TO[1]!, TO[2]!, c, 16 * bell(f) + 1.5 * (1 - f), 0.03 + 0.12 * bell(f));
  s.particles.add(TO[0]!, TO[1]!, TO[2]!, WHITE, 18 * Math.pow(1 - f, 3), 0.025);
  ring(s, c, 0.02 + 0.2 * easeOut(f), 64, 2.4 * (1 - f), 0.012);
}

/** A flare at the arm star, then a streak flying back out towards the control, fading. */
function reverseStreak(e: Effect, t: number, s: Stage): void {
  const c = PALETTE.fx.done;
  launch(e, s);
  targetPosition(s, e.target, TO);
  const flare = 0.35;
  if (t < flare) {
    const f = t / flare;
    s.particles.add(TO[0]!, TO[1]!, TO[2]!, c, 12 * bell(f), 0.04 + 0.1 * bell(f));
    return;
  }
  const f = (t - flare) / (e.duration - flare);
  s.particles.add(TO[0]!, TO[1]!, TO[2]!, c, 5 * Math.pow(1 - f, 3), 0.05);
  // The same arc as a completion, travelled the other way.
  A.set(e.from);
  streak(s, c, 1 - easeIn(f) * 0.96, 46, 11, 0.045, Math.pow(1 - f, 1.5));
}

/** The star flickers, then implodes into red embers that drift and fade. */
function collapse(e: Effect, t: number, s: Stage): void {
  const c = PALETTE.fx.gone;
  targetPosition(s, e.target, TO);
  const flicker = 0.55;
  if (t < flicker) {
    s.particles.add(TO[0]!, TO[1]!, TO[2]!, c, 10 * (0.5 + 0.5 * Math.sin(t * 46)), 0.07);
    return;
  }
  const f = (t - flicker) / (e.duration - flicker);
  s.particles.add(
    TO[0]!,
    TO[1]!,
    TO[2]!,
    c,
    12 * Math.pow(1 - f, 3),
    0.07 * (1 - easeOut(f)) + 0.004,
  );
  embers(e, s, c, 30, 0.2 * easeOut(f), 3 * Math.pow(1 - f, 1.5), 0.014, 0.06 * f * f);
}

/** A comet sweeping across the disk; its tail grows gently with how many tasks moved. */
function comet(e: Effect, t: number, s: Stage): void {
  const c = PALETTE.fx.comet;
  const f = t / e.duration;
  const angle = e.rand[0]! * TAU;
  const reach = 1.25;
  A[0] = Math.cos(angle) * reach;
  A[1] = 0.22;
  A[2] = Math.sin(angle) * reach;
  // Across the disk, a little off the centre.
  const across = angle + Math.PI + (e.rand[1]! - 0.5) * 0.7;
  TO[0] = Math.cos(across) * reach;
  TO[1] = 0.1;
  TO[2] = Math.sin(across) * reach;
  const tail = Math.min(170, Math.round(70 + 9 * Math.min(e.amount, 11)));
  // Almost flat: it skims the disk instead of arcing over it.
  streak(s, c, easeInOut(f), tail, 16, 0.06, bell(Math.min(1, f * 1.15) * 0.92 + 0.04), 0.05);
}

/** A light wave travelling a short way along the target star's arm. */
function armPulse(e: Effect, t: number, s: Stage): void {
  const c = PALETTE.fx.goal;
  if (s.targetCount === 0) return;
  const f = t / e.duration;
  const k = (e.target % s.targetCount) * TARGET_STRIDE;
  const a0 = s.targets[k] ?? 0.4;
  const phase = (s.targets[k + 3] ?? 0) + PATTERN_SPEED * s.time;
  const height = s.targets[k + 2] ?? 0;
  const strength = 1.6 + 6 * clamp01(e.amount);
  const centre = a0 + 0.2 * easeOut(f);
  const fade = bell(Math.min(1, f * 1.05));
  for (let j = -14; j <= 14; j++) {
    const a = centre + j * 0.006;
    const theta = armAngle(a) + phase;
    const w = Math.exp(-(j * j) / 40);
    s.particles.add(
      a * Math.cos(theta),
      height,
      a * Math.sin(theta),
      c,
      strength * w * fade,
      0.034,
    );
  }
  // A spark where it starts, so the step reads as coming from this star.
  targetPosition(s, e.target, TO);
  s.particles.add(TO[0]!, TO[1]!, TO[2]!, c, strength * 1.6 * Math.pow(1 - f, 3), 0.05);
}

/** A larger ignition with two staggered rings. */
function doubleRing(e: Effect, t: number, s: Stage): void {
  const c = PALETTE.fx.goal;
  targetPosition(s, e.target, TO);
  const f = t / e.duration;
  const pop = bell(Math.min(1, f * 2.2));
  s.particles.add(
    TO[0]!,
    TO[1]!,
    TO[2]!,
    c,
    30 * Math.pow(1 - f, 2.2) + 3 * (1 - f),
    0.04 + 0.26 * pop,
  );
  s.particles.add(TO[0]!, TO[1]!, TO[2]!, WHITE, 38 * Math.pow(1 - f, 4), 0.025 + 0.06 * pop);
  ring(s, c, 0.02 + 0.42 * easeOut(f), 200, 3.4 * Math.pow(1 - f, 2), 0.014);
  const g = clamp01((f - 0.22) / 0.78);
  if (f > 0.22) ring(s, WHITE, 0.02 + 0.6 * easeOut(g), 280, 2.6 * Math.pow(1 - g, 2), 0.012);
  embers(e, s, c, 44, 0.3 * easeOut(f), 3.4 * (1 - f), 0.015);
}

/** 10–14 staggered streaks raining across the galaxy. */
function meteorShower(e: Effect, t: number, s: Stage): void {
  const c = e.burst ? PALETTE.fx.done : PALETTE.fx.routine;
  const count = 10 + Math.floor(e.rand[0]! * 5);
  const flight = 1.05;
  const window = e.duration - flight - 0.25;
  // They all fall the same way, like rain in a wind.
  const wind = e.rand[1]! * TAU;
  const wx = Math.cos(wind) * 0.55;
  const wz = Math.sin(wind) * 0.55;
  for (let k = 0; k < count; k++) {
    const r = 3 + k * 3;
    const start = (k / count) * window + e.rand[r + 2]! * 0.12;
    const local = t - start;
    if (local < 0 || local > flight + 0.25) continue;
    const radius = 0.15 + 0.95 * Math.sqrt(e.rand[r]!);
    const around = e.rand[r + 1]! * TAU;
    TO[0] = Math.cos(around) * radius;
    TO[1] = 0;
    TO[2] = Math.sin(around) * radius;
    A[0] = TO[0]! - wx;
    A[1] = 0.75;
    A[2] = TO[2]! - wz;
    if (local < flight) {
      const p = local / flight;
      const head = easeIn(p) * 0.9 + p * 0.1;
      const lift = 0;
      for (let j = 0; j < 22; j++) {
        const u = head - j * 0.012;
        if (u < 0) break;
        arc(u, lift, P);
        s.particles.add(
          P[0]!,
          P[1]!,
          P[2]!,
          c,
          (j === 0 ? 11 : 3 * Math.pow(1 - j / 22, 1.4)) * Math.min(1, p * 5),
          j === 0 ? 0.034 : 0.016 * (1 - j / 26),
        );
      }
    } else {
      // A small flash where it meets the disk.
      const g = (local - flight) / 0.25;
      s.particles.add(TO[0]!, TO[1]!, TO[2]!, c, 9 * Math.pow(1 - g, 2), 0.03 + 0.05 * g);
    }
  }
}

/** A ring in the plane around the galaxy's centre. */
function diskWave(s: Stage, c: Rgb, radius: number, intensity: number): void {
  TO[0] = TO[1] = TO[2] = 0;
  // Enough points that the widest wave still reads as a line.
  ring(s, c, radius, 640, intensity, 0.02);
}

/** The camera pushes in, the core brightens and a ring wave rolls across the disk. */
function focusStart(e: Effect, t: number, s: Stage): void {
  const f = t / e.duration;
  diskWave(s, PALETTE.fx.focus, 0.03 + 1.15 * easeOut(f), 3 * Math.pow(1 - f, 2));
  // A surge on top of the steadier glow the phase itself keeps.
  s.core += 1.5 * easeOut(Math.min(1, f * 3)) * Math.pow(1 - f, 1.6);
  s.push = Math.max(s.push, bell(f) * 0.55);
}

/** The core relaxes; a faint ring settles back towards the centre. */
function focusBreak(e: Effect, t: number, s: Stage): void {
  const f = t / e.duration;
  diskWave(s, PALETTE.fx.focus, 0.95 - 0.6 * easeInOut(f), 0.35 * bell(f));
  s.core -= 0.22 * bell(f);
}

/** A bright core flash, an expanding particle shell and a big ring in the plane. */
function focusComplete(e: Effect, t: number, s: Stage): void {
  const c = PALETTE.fx.focus;
  const f = t / e.duration;
  s.core += 6 * Math.pow(1 - f, 3);
  diskWave(s, c, 0.03 + 1.3 * easeOut(f), 4 * Math.pow(1 - f, 2));
  const out = easeOut(f);
  const intensity = 4 * Math.pow(1 - f, 2);
  if (intensity <= 0.004) return;
  for (let k = 0; k < 320; k++) {
    const y = e.rand[k * 3]! * 2 - 1;
    const a = e.rand[k * 3 + 1]! * TAU;
    const h = Math.sqrt(1 - y * y);
    const r = (0.4 + 0.8 * e.rand[k * 3 + 2]!) * out;
    // Flattened, so the shell hugs the disk.
    s.particles.add(h * Math.cos(a) * r, y * r * 0.35, h * Math.sin(a) * r, c, intensity, 0.018);
  }
}

export const EFFECTS: Record<CosmicEventType, EffectSpec> = {
  task_created: { duration: 2, origin: "none", target: "arm-star", motion: false, draw: condense },
  task_completed: {
    duration: 2.6,
    origin: "control",
    target: "arm-star",
    motion: false,
    draw: (e, t, s) => shootingStar(e, t, s, PALETTE.fx.done, 0.85, 70, 1, 26),
  },
  task_uncompleted: {
    duration: 1.6,
    origin: "control",
    target: "arm-star",
    motion: false,
    draw: reverseStreak,
  },
  task_deleted: { duration: 2, origin: "none", target: "arm-star", motion: false, draw: collapse },
  overdue_postponed: { duration: 2.2, origin: "none", target: "disk", motion: false, draw: comet },
  goal_progress: {
    duration: 1.4,
    origin: "none",
    target: "arm-star",
    motion: false,
    draw: armPulse,
  },
  goal_completed: {
    duration: 3,
    origin: "none",
    target: "arm-star",
    motion: false,
    draw: doubleRing,
  },
  routine_checked: {
    duration: 1.8,
    origin: "control",
    target: "arm-star",
    motion: false,
    draw: (e, t, s) => shootingStar(e, t, s, PALETTE.fx.routine, 0.7, 36, 0.62, 12),
  },
  routine_day_complete: {
    duration: 3,
    origin: "none",
    target: "disk",
    motion: false,
    draw: meteorShower,
  },
  focus_started: { duration: 2.4, origin: "none", target: "disk", motion: true, draw: focusStart },
  focus_break: { duration: 1.5, origin: "none", target: "disk", motion: true, draw: focusBreak },
  focus_completed: {
    duration: 2.8,
    origin: "none",
    target: "disk",
    motion: true,
    draw: focusComplete,
  },
};

/** The reduced-motion stand-in for every event: a brief soft glow where it started. */
export const GLOW_SECONDS = 0.4;

function glow(e: Effect, t: number, s: Stage): void {
  const f = t / e.duration;
  if (hasOrigin(e)) {
    launch(e, s);
    // Sized in screen terms: the launch point sits at a fixed share of the camera distance.
    const size = s.camera.distance * 0.03;
    s.particles.add(e.from[0]!, e.from[1]!, e.from[2]!, PALETTE.fx.done, 3.2 * bell(f), size);
    return;
  }
  // Nothing was tapped: the core itself breathes once.
  s.core += 0.9 * bell(f);
}

/** Staggering, caps and drops (the "coalescing" rules). */
export const STAGGER_MS = 120;
export const MAX_PER_TYPE = 6;
export const MAX_WAIT_MS = 1500;
const POOL = 40;

export type Offer = "played" | "staggered" | "shower" | "dropped";

function emptyEffect(): Effect {
  return {
    type: "task_created",
    startAt: 0,
    duration: 0,
    target: -1,
    u: NaN,
    v: NaN,
    amount: 0,
    glow: false,
    burst: false,
    from: new Float32Array(3),
    launched: false,
    rand: new Float32Array(RAND),
  };
}

function idOf(event: CosmicEvent): string {
  if ("id" in event) return event.id;
  if (event.type === "routine_day_complete") return event.date;
  return event.type;
}

function amountOf(event: CosmicEvent): number {
  if (event.type === "overdue_postponed") return Math.max(1, event.count);
  if (event.type === "goal_progress") return clamp01(event.amount);
  return 0;
}

/** An event's control, as a share of the viewport. */
export interface Origin {
  u: number;
  v: number;
}

export class EffectPlayer {
  private readonly pool: Effect[] = [];
  private readonly active: Effect[] = [];
  private readonly lastStart = new Map<CosmicEventType, number>();
  /** Reduced motion: every event is the short glow. */
  still = false;

  constructor() {
    for (let i = 0; i < POOL; i++) this.pool.push(emptyEffect());
  }

  /** How many effects of a type are playing or waiting to start. */
  private countOf(type: CosmicEventType): number {
    let n = 0;
    for (let i = 0; i < this.active.length; i++) if (this.active[i]!.type === type) n++;
    return n;
  }

  /**
   * Offers an event. The same type again within the stagger starts 120 ms after the one
   * before it; a seventh at once is dropped, unless it is a task completion, where the
   * burst becomes one meteor shower. Nothing waits longer than 1.5 s.
   */
  offer(event: CosmicEvent, origin: Origin | null, targetCount: number, now: number): Offer {
    this.prune(now);
    let type = event.type;
    let burst = false;
    if (this.countOf(type) >= MAX_PER_TYPE) {
      if (type !== "task_completed") return "dropped";
      for (let i = 0; i < this.active.length; i++) if (this.active[i]!.burst) return "dropped";
      type = "routine_day_complete";
      burst = true;
    }
    const last = this.lastStart.get(type);
    const startAt = last === undefined ? now : Math.max(now, last + STAGGER_MS);
    if (startAt - now > MAX_WAIT_MS) return "dropped";
    const slot = this.pool.pop();
    if (!slot) return "dropped";

    const spec = EFFECTS[type];
    const id = idOf(event);
    slot.type = type;
    slot.startAt = startAt;
    slot.glow = this.still;
    slot.duration = this.still ? GLOW_SECONDS : spec.duration;
    slot.burst = burst;
    slot.amount = amountOf(event);
    slot.launched = false;
    slot.target = spec.target === "arm-star" && targetCount > 0 ? hash32(id) % targetCount : -1;
    const uses = spec.origin === "control" || this.still;
    slot.u = uses && origin ? origin.u : NaN;
    slot.v = uses && origin ? origin.v : NaN;
    const rand = rng(hash32(id, 0x5eed) ^ hash32(type));
    for (let i = 0; i < RAND; i++) slot.rand[i] = rand();
    this.active.push(slot);
    this.lastStart.set(type, startAt);
    if (burst) return "shower";
    return startAt > now ? "staggered" : "played";
  }

  private prune(now: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i]!;
      if (now >= e.startAt + e.duration * 1000) {
        // Swap with the last one: no array is created, and order does not matter.
        this.active[i] = this.active[this.active.length - 1]!;
        this.active.pop();
        this.pool.push(e);
      }
    }
  }

  /** Draws every running effect into the stage's particles. Returns how many are alive. */
  draw(stage: Stage, now: number): number {
    this.prune(now);
    for (let i = 0; i < this.active.length; i++) {
      const e = this.active[i]!;
      const t = (now - e.startAt) / 1000;
      if (t < 0) continue;
      if (e.glow) glow(e, t, stage);
      else EFFECTS[e.type].draw(e, t, stage);
    }
    return this.active.length;
  }

  get idle(): boolean {
    return this.active.length === 0;
  }

  /** True while an effect that moves the galaxy or the camera is playing or about to. */
  get needsMotion(): boolean {
    for (let i = 0; i < this.active.length; i++) {
      const e = this.active[i]!;
      if (!e.glow && EFFECTS[e.type].motion) return true;
    }
    return false;
  }

  effects(): readonly Effect[] {
    return this.active;
  }

  clear(): void {
    while (this.active.length > 0) this.pool.push(this.active.pop()!);
    this.lastStart.clear();
  }
}
