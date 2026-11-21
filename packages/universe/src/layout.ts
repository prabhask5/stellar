/**
 * Deterministic layout. Every entity's place in the universe is a pure function
 * of its id, so all devices render the same sky without syncing positions.
 * Units: the galaxy disc has radius 1; the scene scales it.
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
