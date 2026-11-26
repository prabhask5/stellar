/**
 * Cosmic event bus. The app emits what just happened; the universe host (a lazy chunk)
 * listens and plays it. This module has no imports, so emitting an event never pulls the
 * renderer into a bundle.
 */
export interface ScreenPoint {
  /** Viewport pixels. */
  x: number;
  y: number;
}

export type CosmicEvent =
  | { type: "task_created"; id: string; origin?: ScreenPoint }
  | { type: "task_completed"; id: string; origin?: ScreenPoint }
  | { type: "task_uncompleted"; id: string; origin?: ScreenPoint }
  | { type: "task_deleted"; id: string; origin?: ScreenPoint }
  | { type: "overdue_postponed"; count: number }
  /** `amount` is the size of the step as a share of the goal's total, 0…1. */
  | { type: "goal_progress"; id: string; amount: number; origin?: ScreenPoint }
  | { type: "goal_completed"; id: string; origin?: ScreenPoint }
  | { type: "routine_checked"; id: string; origin?: ScreenPoint }
  | { type: "routine_day_complete"; date: string }
  | { type: "focus_started" }
  | { type: "focus_break" }
  | { type: "focus_completed" };

export type CosmicEventType = CosmicEvent["type"];
export type CosmicListener = (event: CosmicEvent) => void;

export const COSMIC_EVENT_TYPES: readonly CosmicEventType[] = [
  "task_created",
  "task_completed",
  "task_uncompleted",
  "task_deleted",
  "overdue_postponed",
  "goal_progress",
  "goal_completed",
  "routine_checked",
  "routine_day_complete",
  "focus_started",
  "focus_break",
  "focus_completed",
];

const listeners = new Set<CosmicListener>();
/** Events emitted before the host has loaded are replayed when it subscribes. */
const backlog: { event: CosmicEvent; at: number }[] = [];
const BACKLOG_MS = 4000;
const BACKLOG_MAX = 24;
/** The latest events, oldest first: what the end-to-end tests read. */
const log: CosmicEventType[] = [];
const LOG_MAX = 200;

export function emitCosmic(event: CosmicEvent): void {
  log.push(event.type);
  if (log.length > LOG_MAX) log.shift();
  if (listeners.size === 0) {
    backlog.push({ event, at: Date.now() });
    if (backlog.length > BACKLOG_MAX) backlog.shift();
    return;
  }
  for (const l of listeners) l(event);
}

export function onCosmic(listener: CosmicListener): () => void {
  listeners.add(listener);
  if (backlog.length > 0) {
    const fresh = backlog.splice(0).filter((b) => Date.now() - b.at < BACKLOG_MS);
    for (const b of fresh) listener(b.event);
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Centre of an element, for events that start where the user tapped. */
export function originOf(el: Element | null | undefined): ScreenPoint | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Every event type emitted so far in this page, oldest first (the last 200). */
export function cosmicLog(): readonly CosmicEventType[] {
  return log;
}

/** Test hook. */
export function resetCosmicBus(): void {
  listeners.clear();
  backlog.length = 0;
  log.length = 0;
}
