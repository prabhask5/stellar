/** Small maths for the renderer. Everything that runs per frame writes into arrays it is given. */

export const TAU = Math.PI * 2;

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
export const clamp01 = (x: number): number => clamp(x, 0, 1);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeOut = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
export const easeIn = (t: number): number => Math.pow(clamp01(t), 3);
export const easeInOut = (t: number): number => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
/** 0 → 1 → 0 across [0, 1]. */
export const bell = (t: number): number => Math.sin(Math.PI * clamp01(t));

/** Seeded PRNG (mulberry32) returning floats in [0, 1). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A normally distributed number from a uniform generator (Box–Muller). */
export function gauss(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

/** FNV-1a with a final avalanche: the same id always gives the same number. */
export function hash32(input: string, seed = 0): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** "#rrggbb" in sRGB → linear RGB, 0…1. */
export function linearRgb(hex: string): [number, number, number] {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i, 3 + i), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [channel(0), channel(2), channel(4)];
}

/** Column-major perspective matrix into `out`. */
export function perspective(
  out: Float32Array,
  fovY: number,
  aspect: number,
  near: number,
  far: number,
): void {
  const t = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = t / aspect;
  out[5] = t;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
}

/**
 * View matrix for a camera at `eye` looking at the origin with +Y up, into `out`. Also
 * writes the camera's right, up and back axes into `axes` (9 numbers), for unprojecting.
 */
export function lookAtOrigin(
  out: Float32Array,
  axes: Float32Array,
  ex: number,
  ey: number,
  ez: number,
): void {
  const zl = Math.hypot(ex, ey, ez) || 1;
  const zx = ex / zl;
  const zy = ey / zl;
  const zz = ez / zl;
  // x = up × z, with up = (0, 1, 0)
  let xx = zz;
  let xz = -zx;
  const xl = Math.hypot(xx, xz) || 1;
  xx /= xl;
  xz /= xl;
  // y = z × x
  const yx = zy * xz;
  const yy = zz * xx - zx * xz;
  const yz = -zy * xx;
  out[0] = xx;
  out[1] = yx;
  out[2] = zx;
  out[3] = 0;
  out[4] = 0;
  out[5] = yy;
  out[6] = zy;
  out[7] = 0;
  out[8] = xz;
  out[9] = yz;
  out[10] = zz;
  out[11] = 0;
  out[12] = -(xx * ex + xz * ez);
  out[13] = -(yx * ex + yy * ey + yz * ez);
  out[14] = -(zx * ex + zy * ey + zz * ez);
  out[15] = 1;
  axes[0] = xx;
  axes[1] = 0;
  axes[2] = xz;
  axes[3] = yx;
  axes[4] = yy;
  axes[5] = yz;
  axes[6] = zx;
  axes[7] = zy;
  axes[8] = zz;
}
