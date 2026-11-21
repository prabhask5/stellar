/**
 * The EventDirector: turns the stream of cosmic events into effects to play.
 * Pure and time-injected so it can be tested. Rapid repeats of the same kind
 * coalesce into one bigger effect instead of queueing (5 tasks completed in 3s
 * play as one burst). Nothing here ever blocks input.
 */
import type { CosmicEvent, CosmicEventType, ScreenPoint } from "./bus.ts";

export interface Effect {
  id: number;
  type: CosmicEventType;
  startedAt: number;
  /** Total length in ms, including extensions from merged events. */
  duration: number;
  /** How many events this effect represents. */
  magnitude: number;
  /** Where each merged event started (for sparks that fly from the checkbox). */
  origins: { point: ScreenPoint | null; at: number }[];
  /** Free-form details for the renderer (era name, ids). */
  detail: Record<string, string | number>;
}

/** Base durations from SPEC §7.2, in ms. */
export const DURATIONS: Record<CosmicEventType, number> = {
  task_completed: 1200,
  overdue_postponed: 1500,
  goal_progress: 1000,
  goal_completed: 2500,
  goal_list_completed: 3500,
  routine_instance: 800,
  routine_day_complete: 2000,
  streak_rekindled: 1500,
  focus_start: 1500,
  focus_complete: 3000,
  new_era: 6000,
  first_light: 4000,
};

/** Kinds that merge into a running effect of the same kind, and for how long after it started. */
const COALESCE_MS: Partial<Record<CosmicEventType, number>> = {
  task_completed: 3000,
  routine_instance: 3000,
  goal_progress: 1500,
  overdue_postponed: 1500,
};

/** The reduced-motion and Minimal-tier stand-in: a brief soft glow at the source. */
export const GLOW_MS = 450;

/** Large cinematic events never overlap each other; a new one waits for the current one. */
const EXCLUSIVE: ReadonlySet<CosmicEventType> = new Set([
  "new_era",
  "first_light",
  "focus_complete",
  "goal_list_completed",
]);

export type DirectorDecision =
  { action: "start"; effect: Effect } | { action: "merge"; effect: Effect } | { action: "queued" };

function detailOf(event: CosmicEvent): Record<string, string | number> {
  switch (event.type) {
    case "new_era":
      return { index: event.index, name: event.name };
    case "overdue_postponed":
      return { count: event.count };
    case "goal_progress":
    case "goal_completed":
      return { goalId: event.goalId };
    case "goal_list_completed":
      return { listId: event.listId };
    case "routine_instance":
    case "streak_rekindled":
      return { routineId: event.routineId };
    case "routine_day_complete":
      return { date: event.date };
    default:
      return {};
  }
}

function originOf(event: CosmicEvent): ScreenPoint | null {
  return "origin" in event && event.origin ? event.origin : null;
}

export class EventDirector {
  private active: Effect[] = [];
  private waiting: CosmicEvent[] = [];
  private nextId = 1;
  /** When true, every event becomes a short glow (reduced motion, Minimal tier). */
  reduced = false;

  /** Offer an event. The caller starts or updates the returned effect. */
  push(event: CosmicEvent, now: number): DirectorDecision {
    this.prune(now);
    const window = COALESCE_MS[event.type];
    if (window !== undefined) {
      const running = this.active.find((e) => e.type === event.type && now - e.startedAt <= window);
      if (running) {
        running.magnitude += event.type === "overdue_postponed" ? 0 : 1;
        running.origins.push({ point: originOf(event), at: now });
        // Keep the effect alive long enough for the newest spark to land.
        const base = this.reduced ? GLOW_MS : DURATIONS[event.type];
        running.duration = Math.max(running.duration, now - running.startedAt + base);
        return { action: "merge", effect: running };
      }
    }
    if (EXCLUSIVE.has(event.type) && this.active.some((e) => EXCLUSIVE.has(e.type))) {
      // Identical big events do not stack up behind each other.
      if (!this.waiting.some((w) => w.type === event.type)) this.waiting.push(event);
      return { action: "queued" };
    }
    return { action: "start", effect: this.start(event, now) };
  }

  private start(event: CosmicEvent, now: number): Effect {
    const effect: Effect = {
      id: this.nextId++,
      type: event.type,
      startedAt: now,
      duration: this.reduced ? GLOW_MS : DURATIONS[event.type],
      magnitude: event.type === "overdue_postponed" ? Math.max(1, event.count) : 1,
      origins: [{ point: originOf(event), at: now }],
      detail: detailOf(event),
    };
    this.active.push(effect);
    return effect;
  }

  /** Call every frame: drops finished effects and returns queued ones that may start now. */
  tick(now: number): Effect[] {
    this.prune(now);
    const started: Effect[] = [];
    while (this.waiting.length > 0 && !this.active.some((e) => EXCLUSIVE.has(e.type))) {
      const next = this.waiting.shift();
      if (next) started.push(this.start(next, now));
    }
    return started;
  }

  private prune(now: number): void {
    // An effect stays mergeable for its whole coalescing window, even if its visuals have finished.
    this.active = this.active.filter(
      (e) => now - e.startedAt < Math.max(e.duration, COALESCE_MS[e.type] ?? 0),
    );
  }

  effects(): readonly Effect[] {
    return this.active;
  }

  get idle(): boolean {
    return this.active.length === 0 && this.waiting.length === 0;
  }

  clear(): void {
    this.active = [];
    this.waiting = [];
  }
}
