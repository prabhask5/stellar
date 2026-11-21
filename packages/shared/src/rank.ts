/**
 * Fractional ranking for reorderable rows. `sort_order` is a double; a reorder
 * writes exactly one row with a value between its new neighbours.
 */

export const RANK_STEP = 1024;
/** Below this gap neighbours are too close to split again; rebalance the list. */
export const RANK_MIN_GAP = 1e-6;

/** A rank strictly between `before` and `after` (either may be null at the ends). */
export function rankBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return RANK_STEP;
  if (before === null) return (after as number) - RANK_STEP;
  if (after === null) return before + RANK_STEP;
  return before + (after - before) / 2;
}

export function needsRebalance(before: number | null, after: number | null): boolean {
  if (before === null || after === null) return false;
  return Math.abs(after - before) < RANK_MIN_GAP;
}

/** Rank that places a new row after every existing one. */
export function rankAtEnd(existing: readonly number[]): number {
  if (existing.length === 0) return RANK_STEP;
  return Math.max(...existing) + RANK_STEP;
}

/** Evenly spaced ranks for a full rebalance, in the given order. */
export function rebalancedRanks(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * RANK_STEP);
}

/**
 * The rank for moving the item at `from` to position `to` within `ordered`
 * (ranks already sorted ascending). Returns null when nothing changes.
 */
export function rankForMove(ordered: readonly number[], from: number, to: number): number | null {
  if (from === to || from < 0 || to < 0 || from >= ordered.length || to >= ordered.length) {
    return null;
  }
  const without = ordered.filter((_, i) => i !== from);
  const before = to > 0 ? (without[to - 1] ?? null) : null;
  const after = to < without.length ? (without[to] ?? null) : null;
  return rankBetween(before, after);
}
