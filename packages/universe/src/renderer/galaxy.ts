/**
 * The galaxy, generated once from a fixed seed into typed arrays. After this the CPU never
 * touches a star again: every point stores its orbit and the vertex shader moves it.
 *
 * Each point is two vec4s:
 *   orbit = (a, ratio, tilt, theta)   semi-major axis, b/a, ellipse orientation, phase
 *   props = (omega, height, temp, size)
 * A point with ratio < 1 sits still on an ellipse whose orientation turns (bar and bulge);
 * one with ratio = 1 goes round a circle. `temp` runs 0 (young blue) … 0.5 (disk) … 1 (bulge).
 *
 * The arms, their dust and their knots all turn at one pattern speed, so the spiral is rigid
 * and never winds up. Only populations with no azimuthal structure (the bulge and the field
 * stars between the arms) turn differentially, the centre faster: that is the motion the eye
 * reads as a living disk.
 */
import { gauss, rng, TAU } from "./math.ts";

export const GALAXY_SEED = 20261125;
/** Pitch angle of the log-spiral arms. */
export const ARM_PITCH = Math.tan((13 * Math.PI) / 180);
const ARM_START = 0.06;
/** Angular speed of the spiral pattern, radians per second of scene time. */
export const PATTERN_SPEED = 0.018;
/** Points 0 … SHARED-1 are the same stars on every tier; event targets come from them. */
const SHARED = 60_000;
const MAX_TARGETS = 2048;
const BULGE_SHARE = 0.13;
const ARM_SHARE = 0.61;

/** Angle of an arm's ridge at radius `a`. */
export const armAngle = (a: number): number =>
  Math.log(Math.max(a, ARM_START) / ARM_START) / ARM_PITCH;
/** Differential rotation for populations without structure: faster towards the centre. */
const fieldSpeed = (a: number): number => PATTERN_SPEED + 0.05 * Math.exp(-a / 0.09);

export interface Layer {
  orbit: Float32Array;
  props: Float32Array;
  count: number;
}

export interface GalaxyCounts {
  stars: number;
  haze: number;
  knots: number;
  dust: number;
}

/** A real star on a major arm that an event can land on. */
export const TARGET_STRIDE = 4;

export interface Galaxy {
  stars: Layer;
  haze: Layer;
  knots: Layer;
  dust: Layer;
  sky: Layer;
  /** Per target: radius, phase at time 0, height, offset from its arm's ridge. */
  targets: Float32Array;
  targetCount: number;
  /** How many stars of each population were generated (for the tests). */
  census: { bulge: number; bar: number; arm: number; majorArm: number; field: number };
}

function layer(count: number): Layer {
  return { orbit: new Float32Array(count * 4), props: new Float32Array(count * 4), count };
}

function put(
  l: Layer,
  i: number,
  a: number,
  ratio: number,
  tilt: number,
  theta: number,
  omega: number,
  height: number,
  temp: number,
  size: number,
): void {
  const k = i * 4;
  l.orbit[k] = a;
  l.orbit[k + 1] = ratio;
  l.orbit[k + 2] = tilt;
  l.orbit[k + 3] = theta;
  l.props[k] = omega;
  l.props[k + 1] = height;
  l.props[k + 2] = temp;
  l.props[k + 3] = size;
}

export function generateGalaxy(counts: GalaxyCounts, seed = GALAXY_SEED): Galaxy {
  const N = counts.stars;
  const stars = layer(N);
  const census = { bulge: 0, bar: 0, arm: 0, majorArm: 0, field: 0 };
  // Indices into the shared prefix, so every tier gets the same knots, haze and targets.
  const armStars: number[] = [];
  const hotArm: number[] = [];
  const bulgeStars: number[] = [];

  const rand = rng(seed);
  for (let i = 0; i < N; i++) {
    const r0 = rand();
    // Many faint stars, a few bright ones.
    let size = 0.0018 + 0.0034 * Math.pow(rand(), 3);
    if (r0 < BULGE_SHARE) {
      const a = Math.abs(gauss(rand)) * 0.07 + 0.004;
      const bar = rand() < 0.45;
      const theta = rand() * TAU;
      const height = gauss(rand) * 0.035 * (bar ? 0.5 : 1);
      const temp = 0.78 + 0.22 * rand();
      // The bar is a pattern like the arms; the rounder bulge turns faster towards the middle.
      put(
        stars,
        i,
        a,
        bar ? 0.38 : 0.85,
        0.5,
        theta,
        bar ? PATTERN_SPEED : fieldSpeed(a),
        height,
        temp,
        size,
      );
      if (bar) census.bar++;
      else census.bulge++;
      if (i < SHARED) bulgeStars.push(i);
      continue;
    }
    // Exponential disk, cut off at the edge.
    const a = -0.32 * Math.log(1 - rand() * (1 - Math.exp(-1.1 / 0.32))) + 0.05;
    const height = gauss(rand) * (0.008 + 0.02 * Math.exp(-a / 0.15));
    if (r0 < BULGE_SHARE + ARM_SHARE) {
      const pick = rand();
      const side = rand() < 0.5;
      const major = pick < 0.8;
      const arm = major ? (side ? 0 : Math.PI) : side ? Math.PI / 2 : -Math.PI / 2;
      const spread = (major ? 0.2 : 0.32) * (0.6 + 0.8 * a) * gauss(rand);
      let temp = 0.3 + 0.45 * rand();
      const onRidge = major && Math.abs(spread) < 0.12 && a > 0.18;
      const young = onRidge && rand() < 0.35;
      if (young) {
        temp = 0.04 + 0.2 * rand();
        size *= 1.6;
      }
      put(stars, i, a, 1, 0, armAngle(a) + arm + spread, PATTERN_SPEED, height, temp, size);
      census.arm++;
      if (major) census.majorArm++;
      if (onRidge && i < SHARED) {
        armStars.push(i);
        if (Math.abs(spread) < 0.07 && a > 0.22 && a < 0.95) hotArm.push(i);
      }
    } else {
      put(stars, i, a, 1, 0, rand() * TAU, fieldSpeed(a), height, 0.4 + 0.45 * rand(), size);
      census.field++;
    }
  }

  const so = stars.orbit;
  const sp = stars.props;

  // Star-forming knots (pink) ride the arms in clumps: a few blobs around each seed star.
  const knots = layer(counts.knots);
  {
    const r = rng(seed ^ 0x1a2b3c);
    const seeds = Math.max(1, Math.min(hotArm.length, Math.ceil(counts.knots / 5)));
    for (let k = 0; k < counts.knots; k++) {
      const i = (hotArm[Math.floor(r() * seeds)] ?? 0) * 4;
      put(
        knots,
        k,
        (so[i] ?? 0.4) * (1 + gauss(r) * 0.03),
        1,
        0,
        (so[i + 3] ?? 0) + gauss(r) * 0.06,
        PATTERN_SPEED,
        (sp[i + 1] ?? 0) * 0.5,
        1,
        0.01 + 0.028 * Math.pow(r(), 2),
      );
    }
  }

  // Unresolved starlight: big faint points on the same orbits make the arms and the bulge
  // glow between the stars.
  const haze = layer(counts.haze);
  {
    const r = rng(seed ^ 0x2b3c4d);
    for (let k = 0; k < counts.haze; k++) {
      const u = r();
      const from = u < 0.68 ? armStars : u < 0.82 ? bulgeStars : null;
      const i =
        (from && from.length > 0
          ? (from[Math.floor(r() * from.length)] ?? 0)
          : Math.floor(r() * Math.min(N, SHARED))) * 4;
      put(
        haze,
        k,
        (so[i] ?? 0) * (1 + gauss(r) * 0.01),
        so[i + 1] ?? 1,
        so[i + 2] ?? 0,
        (so[i + 3] ?? 0) + gauss(r) * 0.02,
        sp[i] ?? PATTERN_SPEED,
        sp[i + 1] ?? 0,
        sp[i + 2] ?? 0.5,
        0.022 + 0.028 * r(),
      );
    }
  }

  // Dust comes in patchy filaments along each major arm's trailing edge, not a black line.
  const dust = layer(counts.dust);
  {
    const r = rng(seed ^ 0x3c4d5e);
    const seedCount = Math.max(1, Math.round(counts.dust * 0.24));
    const seedA = new Float32Array(seedCount);
    const seedTheta = new Float32Array(seedCount);
    for (let s = 0; s < seedCount; s++) {
      const a = 0.1 + 0.85 * Math.pow(r(), 0.8);
      const arm = r() < 0.5 ? 0 : Math.PI;
      seedA[s] = a;
      seedTheta[s] = armAngle(a) + arm - (0.07 + 0.05 * a) + gauss(r) * 0.06;
    }
    for (let k = 0; k < counts.dust; k++) {
      const s = Math.floor(r() * seedCount);
      const a = (seedA[s] ?? 0.4) * (1 + gauss(r) * 0.012);
      put(
        dust,
        k,
        a,
        1,
        0,
        (seedTheta[s] ?? 0) + gauss(r) * 0.025,
        PATTERN_SPEED,
        gauss(r) * 0.005,
        1,
        0.02 + 0.04 * r(),
      );
    }
  }

  // A distant sphere of background stars. It does not turn.
  const SKY = 5000;
  const sky = layer(SKY);
  {
    const r = rng(seed ^ 0x4d5e6f);
    for (let k = 0; k < SKY; k++) {
      const y = r() * 2 - 1;
      const radius = Math.sqrt(1 - y * y) * 14;
      put(sky, k, radius, 1, 0, r() * TAU, 0, y * 14, 0.3 + 0.4 * r(), 0.025 + 0.05 * r() * r());
    }
  }

  const targetCount = Math.min(MAX_TARGETS, hotArm.length);
  const targets = new Float32Array(Math.max(1, targetCount) * TARGET_STRIDE);
  for (let t = 0; t < targetCount; t++) {
    const i = (hotArm[t] ?? 0) * 4;
    const a = so[i] ?? 0.4;
    const theta = so[i + 3] ?? 0;
    targets[t * TARGET_STRIDE] = a;
    targets[t * TARGET_STRIDE + 1] = theta;
    targets[t * TARGET_STRIDE + 2] = sp[i + 1] ?? 0;
    targets[t * TARGET_STRIDE + 3] = theta - armAngle(a);
  }

  return { stars, haze, knots, dust, sky, targets, targetCount, census };
}

/** Where a point of a layer is at scene time `t`: the same maths as the vertex shader. */
export function pointAt(l: Layer, i: number, t: number, out: Float32Array | number[]): void {
  const k = i * 4;
  const a = l.orbit[k] ?? 0;
  const ratio = l.orbit[k + 1] ?? 1;
  const ell = ratio < 1;
  const turn = (l.props[k] ?? 0) * t;
  const theta = (l.orbit[k + 3] ?? 0) + (ell ? 0 : turn);
  const tilt = (l.orbit[k + 2] ?? 0) + (ell ? turn : 0);
  const px = a * Math.cos(theta);
  const py = a * ratio * Math.sin(theta);
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  out[0] = px * c - py * s;
  out[1] = l.props[k + 1] ?? 0;
  out[2] = px * s + py * c;
}
