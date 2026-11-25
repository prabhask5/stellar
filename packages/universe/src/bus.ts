/**
 * Cosmic event bus. The app emits what just happened; the EventDirector (lazy
 * chunk) listens and plays it. Kept dependency-free so emitting an event never
 * pulls three.js into the main bundle.
 */
export interface ScreenPoint {
  /** Viewport pixels. */
  x: number;
  y: number;
}

export type CosmicEvent =
  | { type: "task_completed"; id?: string; origin?: ScreenPoint }
  | { type: "overdue_postponed"; count: number }
  | { type: "goal_progress"; goalId: string; origin?: ScreenPoint }
  | { type: "goal_completed"; goalId: string; origin?: ScreenPoint }
  | { type: "goal_list_completed"; listId: string }
  | { type: "routine_instance"; routineId: string; origin?: ScreenPoint }
  | { type: "routine_day_complete"; date: string }
  | { type: "streak_rekindled"; routineId: string }
  | { type: "focus_start" }
  | { type: "focus_complete" };

export type CosmicEventType = CosmicEvent["type"];
export type CosmicListener = (event: CosmicEvent) => void;

const listeners = new Set<CosmicListener>();
/** Events emitted before the director has loaded are replayed when it subscribes. */
const backlog: { event: CosmicEvent; at: number }[] = [];
const BACKLOG_MS = 4000;
const BACKLOG_MAX = 24;

export function emitCosmic(event: CosmicEvent): void {
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

/** Test hook. */
export function resetCosmicBus(): void {
  listeners.clear();
  backlog.length = 0;
}
