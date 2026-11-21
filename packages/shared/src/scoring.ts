/** Stardust scoring and eras. Mirrors the Postgres triggers in migration 0006. */

export const POINTS = {
  task: 10,
  routineInstance: 5,
  routineDay: 20,
  /** Per 25 focus minutes, pro-rated. */
  focusPer25Min: 25,
  /** Multiplied by the change in a progress goal's fraction. */
  goalProgress: 50,
  goalComplete: 100,
  goalList: 250,
} as const;

export type UniverseEventKind =
  | "task_completed"
  | "task_uncompleted"
  | "routine_instance"
  | "routine_instance_reversed"
  | "routine_day"
  | "routine_day_reversed"
  | "focus_phase"
  | "goal_progress"
  | "goal_completed"
  | "goal_uncompleted"
  | "goal_list_completed"
  | "goal_list_reversed";

export interface Era {
  index: number;
  name: string;
  threshold: number;
}

export const ERAS: readonly Era[] = [
  { index: 0, name: "Void", threshold: 0 },
  { index: 1, name: "First Light", threshold: 100 },
  { index: 2, name: "Nebula", threshold: 1_000 },
  { index: 3, name: "Star Cluster", threshold: 5_000 },
  { index: 4, name: "Galaxy", threshold: 15_000 },
  { index: 5, name: "Supercluster", threshold: 40_000 },
  { index: 6, name: "Cosmic Web", threshold: 100_000 },
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

export function eraFor(total: number): Era {
  const t = Math.max(0, total);
  let current = ERAS[0]!;
  for (const era of ERAS) if (t >= era.threshold) current = era;
  return current;
}

export interface EraProgress {
  era: Era;
  next: Era | null;
  /** 0…1 through the current era (1 at the final era). */
  fraction: number;
  /** Stardust still needed for the next era (0 at the final era). */
  remaining: number;
}

export function eraProgress(total: number): EraProgress {
  const t = Math.max(0, total);
  const era = eraFor(t);
  const next = ERAS[era.index + 1] ?? null;
  if (!next) return { era, next: null, fraction: 1, remaining: 0 };
  const spanSize = next.threshold - era.threshold;
  return {
    era,
    next,
    fraction: Math.min(1, (t - era.threshold) / spanSize),
    remaining: Math.max(0, next.threshold - t),
  };
}

/** "Era III · Nebula". Eras are numbered from I (Void). */
export function eraLabel(era: Era): string {
  return `Era ${ROMAN[era.index] ?? era.index + 1} · ${era.name}`;
}

/** Points for a completed focus phase: 25 per 25 minutes, pro-rated to the second. */
export function focusPoints(actualSeconds: number): number {
  return Math.round((POINTS.focusPer25Min * Math.max(0, actualSeconds)) / 1500);
}

/**
 * Points for a progress-goal change. Computed from rounded cumulative values so
 * many small increments add up to exactly the same total as one large one.
 */
export function goalProgressPoints(oldFraction: number, newFraction: number): number {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return (
    Math.round(POINTS.goalProgress * clamp(newFraction)) -
    Math.round(POINTS.goalProgress * clamp(oldFraction))
  );
}
