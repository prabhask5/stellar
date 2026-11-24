/**
 * Deterministic layout. Every entity's place in the universe is a pure function
 * of its id, so all devices render the same sky without syncing positions.
 * Units: the galaxy disc has radius 1 in the XZ plane; +Y is "up" out of the disc.
 */
import { hash32, seededRandom } from "@stellar/shared/hash";

export type Vec3 = [number, number, number];

export const GALAXY_ARMS = 3;
const TWIST = 3.4; // radians of arm winding from centre to rim
const TAU = Math.PI * 2;

function gaussian(rand: () => number): number {
  // Sum of uniforms: cheap, bounded, bell-shaped.
  return (rand() + rand() + rand() - 1.5) / 1.5;
}

export interface StarPlacement {
  position: Vec3;
  /** Relative size 0.6…1.6. */
  size: number;
  /** 0 = cool blue-white, 1 = warm gold. */
  warmth: number;
  /** Phase offset for the twinkle shader, 0…2π. */
  phase: number;
}

/** A star on the spiral disc. `seed` is a task id, or "month:index" for aggregated dust. */
export function placeStar(seed: string): StarPlacement {
  const rand = seededRandom(hash32(seed, 17));
  const arm = Math.floor(rand() * GALAXY_ARMS);
  // Bias towards the inner disc, never exactly at the core.
  const radius = 0.12 + 0.88 * Math.pow(rand(), 0.62);
  const spread = 0.34 * (1 - radius * 0.45);
  const angle = (arm / GALAXY_ARMS) * TAU + radius * TWIST + gaussian(rand) * spread;
  const thickness = 0.045 * (1.15 - radius);
  return {
    position: [Math.cos(angle) * radius, gaussian(rand) * thickness, Math.sin(angle) * radius],
    size: 0.6 + rand() * rand() * 1.0,
    warmth: rand(),
    phase: rand() * TAU,
  };
}

/** Seeds for every star: recent tasks by id, older ones as "month:n" so the count is honoured without sending rows. */
export function starSeeds(
  recent: readonly { id: string }[],
  months: readonly { month: string; count: number }[],
  total: number,
  cap: number,
): string[] {
  const seeds: string[] = [];
  const limit = Math.min(total, cap);
  for (const r of recent) {
    if (seeds.length >= limit) return seeds;
    seeds.push(r.id);
  }
  // Fill the remainder from the monthly aggregates, newest month first.
  const remaining = limit - seeds.length;
  if (remaining <= 0) return seeds;
  const older = [...months].sort((a, b) => (a.month < b.month ? 1 : -1));
  const olderTotal = older.reduce((n, m) => n + m.count, 0);
  let skip = Math.min(recent.length, olderTotal); // the recent stars are already drawn by id
  for (const m of older) {
    for (let i = 0; i < m.count; i++) {
      if (skip > 0) {
        skip--;
        continue;
      }
      if (seeds.length >= limit) return seeds;
      seeds.push(`${m.month}:${i}`);
    }
  }
  return seeds;
}

// ── planets ─────────────────────────────────────────────────────────────────
export const PLANET_FAMILIES = ["gold", "violet", "rose", "blue"] as const;
export type PlanetFamily = (typeof PLANET_FAMILIES)[number];

export interface SystemPlacement {
  /** Centre of the planetary system on the disc. */
  center: Vec3;
  family: PlanetFamily;
  /** Radians per second the system drifts around the core. */
  drift: number;
}

/** One planetary system per goal list, on a ring around the core. Hue family follows the list's order. */
export function placeSystem(listId: string, index: number, count: number): SystemPlacement {
  const rand = seededRandom(hash32(listId, 31));
  const slot = count > 0 ? index / count : 0;
  const angle = slot * TAU + (rand() - 0.5) * (TAU / Math.max(count, 1)) * 0.5 + 0.6;
  const radius = 0.5 + rand() * 0.28;
  return {
    center: [Math.cos(angle) * radius, 0.02 + (rand() - 0.5) * 0.05, Math.sin(angle) * radius],
    family: PLANET_FAMILIES[index % PLANET_FAMILIES.length] ?? "gold",
    drift: 0.004 + rand() * 0.004,
  };
}

export interface PlanetPlacement {
  /** Orbit radius around its system centre. */
  orbit: number;
  /** Starting angle and angular speed (rad/s). */
  angle: number;
  speed: number;
  /** Small vertical tilt of the orbit. */
  tilt: number;
  /** Hue shift within the family, −1…1. */
  shade: number;
}

export function placePlanet(goalId: string, indexInList: number): PlanetPlacement {
  const rand = seededRandom(hash32(goalId, 47));
  return {
    orbit: 0.045 + indexInList * 0.034 + rand() * 0.008,
    angle: rand() * TAU,
    speed: (0.05 + rand() * 0.06) / (1 + indexInList * 0.35),
    tilt: (rand() - 0.5) * 0.5,
    shade: rand() * 2 - 1,
  };
}

/** Radius of a planet for a goal's progress (0…1). A started goal is always visible. */
export function planetRadius(progress: number, completed: boolean): number {
  const p = Math.min(1, Math.max(0, progress));
  return 0.011 + 0.022 * p + (completed ? 0.004 : 0);
}

// ── constellations ──────────────────────────────────────────────────────────
export interface ConstellationPlacement {
  /** Star positions on the sky dome (radius ≈ SKY_RADIUS). */
  stars: Vec3[];
  /** Index pairs into `stars`. */
  lines: [number, number][];
  center: Vec3;
}

export const SKY_RADIUS = 3.2;
export const CONSTELLATION_MAX_STARS = 9;
/** The dome direction opposite the default camera (azimuth 0.6). */
export const CONSTELLATION_AZIMUTH = Math.atan2(-Math.cos(0.6), -Math.sin(0.6));

function onDome(azimuth: number, elevation: number, radius = SKY_RADIUS): Vec3 {
  const c = Math.cos(elevation);
  return [
    Math.cos(azimuth) * c * radius,
    Math.sin(elevation) * radius,
    Math.sin(azimuth) * c * radius,
  ];
}

/**
 * One constellation per routine: a small deterministic figure high on the sky
 * dome. `count` stars are lit (completed scheduled days, capped); the shape
 * itself always has the same points, so it grows rather than reshuffles.
 */
export function placeConstellation(
  routineId: string,
  index: number,
  total: number,
): ConstellationPlacement {
  const rand = seededRandom(hash32(routineId, 59));
  // Constellations hang over the far side of the galaxy, low enough to sit in the upper part of the default view.
  const step = Math.min(0.46, 1.7 / Math.max(total, 1));
  const azimuth =
    CONSTELLATION_AZIMUTH + (index - (total - 1) / 2) * step + (rand() - 0.5) * step * 0.3;
  const elevation = 0.05 + rand() * 0.15;
  const stars: Vec3[] = [];
  const lines: [number, number][] = [];
  let a = azimuth;
  let e = elevation;
  let heading = rand() * TAU;
  for (let i = 0; i < CONSTELLATION_MAX_STARS; i++) {
    stars.push(onDome(a, e));
    if (i > 0) {
      // Mostly a chain, sometimes a branch from an earlier star.
      const from = i > 2 && rand() < 0.22 ? Math.floor(rand() * (i - 1)) : i - 1;
      lines.push([from, i]);
    }
    heading += (rand() - 0.5) * 1.9;
    const hop = 0.05 + rand() * 0.04;
    a += (Math.cos(heading) * hop) / Math.max(0.35, Math.cos(e));
    e = Math.min(0.5, Math.max(0.02, e + Math.sin(heading) * hop));
  }
  return { stars, lines, center: onDome(azimuth, elevation) };
}

/** How many stars of a constellation are lit for a number of completed days. Never fewer than two, so a line can show. */
export function litStars(completedDays: number): number {
  if (completedDays <= 0) return 2;
  return Math.min(CONSTELLATION_MAX_STARS, 2 + Math.floor(Math.sqrt(completedDays) * 1.6));
}

/** Brightness 0…1: a broken streak dims to 35% (never removed); a streak brightens up to full. */
export function constellationBrightness(streak: number, broken: boolean): number {
  if (broken) return 0.35;
  return Math.min(1, 0.55 + Math.min(streak, 14) * 0.0325);
}

// ── background layers ───────────────────────────────────────────────────────
export interface ClusterPlacement {
  center: Vec3;
  radius: number;
  stars: number;
}

/** Globular clusters around the galaxy. */
export function placeClusters(): ClusterPlacement[] {
  const rand = seededRandom(9001);
  return Array.from({ length: 6 }, () => {
    const a = rand() * TAU;
    const r = 0.75 + rand() * 0.55;
    return {
      center: [Math.cos(a) * r, (rand() - 0.5) * 0.7, Math.sin(a) * r] as Vec3,
      radius: 0.05 + rand() * 0.05,
      stars: 110 + Math.floor(rand() * 90),
    };
  });
}

/** Distant neighbouring galaxies. */
export function placeNeighbours(): { position: Vec3; scale: number; tilt: number }[] {
  const rand = seededRandom(9002);
  return Array.from({ length: 9 }, () => {
    const a = rand() * TAU;
    const e = (rand() - 0.35) * 1.1;
    return {
      position: onDome(a, e, SKY_RADIUS * 1.6),
      scale: 0.25 + rand() * 0.4,
      tilt: rand() * Math.PI,
    };
  });
}

/** The cosmic web: filaments between far nodes across the sky. */
export function placeWeb(): { nodes: Vec3[]; edges: [number, number][] } {
  const rand = seededRandom(9003);
  const nodes: Vec3[] = Array.from({ length: 42 }, () =>
    onDome(rand() * TAU, (rand() - 0.3) * 1.3, SKY_RADIUS * 1.9),
  );
  const edges: [number, number][] = [];
  const dist = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  nodes.forEach((n, i) => {
    // Link each node to its two nearest neighbours.
    const near = nodes
      .map((m, j) => ({ j, d: i === j ? Infinity : dist(n, m) }))
      .sort((x, y) => x.d - y.d)
      .slice(0, 2);
    for (const { j } of near)
      if (!edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) edges.push([i, j]);
  });
  return { nodes, edges };
}
