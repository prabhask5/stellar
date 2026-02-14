/**
 * @fileoverview Colour utility functions for progress visualisation.
 *
 * Provides a set of pure functions that map numeric percentages to RGB colour
 * strings, used by progress bars, heatmaps, and goal cards throughout the UI.
 *
 * **Colour ramps:**
 * - 0–100 %  → red → yellow → green  (standard progress)
 * - 100–150 % → green → cyan         (overflow / over-achievement)
 * - 150–200 %+ → cyan → purple       (exceptional overflow)
 *
 * All colour functions return CSS `rgb(r, g, b)` strings ready for inline
 * style binding.
 */

// =============================================================================
//                        STANDARD PROGRESS COLOUR
// =============================================================================

/**
 * Map a 0–100 percentage to a colour on the **red → yellow → green** spectrum.
 *
 * The input is clamped so values outside `[0, 100]` are safe.
 *
 * | Range   | Transition          |
 * |---------|---------------------|
 * | 0–50 %  | Red → Yellow        |
 * | 50–100 %| Yellow → Green      |
 *
 * @param percentage - Progress value (0–100). Values outside the range are
 *                     clamped automatically.
 * @returns A CSS `rgb()` colour string.
 */
export function getProgressColor(percentage: number): string {
  /* ── Clamp ──── */
  const clamped = Math.max(0, Math.min(100, percentage));

  if (clamped <= 50) {
    /* ── Red → Yellow (0–50 %) ──── */
    const ratio = clamped / 50;
    const r = 255;
    const g = Math.round(107 + (215 - 107) * ratio); /* 107 (red-ish) → 215 (yellow-ish) */
    const b = Math.round(107 * (1 - ratio)); /* 107 → 0 */
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    /* ── Yellow → Green (50–100 %) ──── */
    const ratio = (clamped - 50) / 50;
    const r = Math.round(255 * (1 - ratio)); /* 255 → 0 */
    const g = Math.round(215 + (222 - 215) * ratio); /* 215 → 222 */
    const b = Math.round(61 * ratio + 93 * ratio); /* 0 → ~129 (combined green-blue tint) */
    return `rgb(${r}, ${g}, ${b})`;
  }
}

// =============================================================================
//                         GOAL PROGRESS HELPERS
// =============================================================================

/**
 * Calculate the completion percentage for a goal — **uncapped** (may exceed 100 %).
 *
 * For `'completion'` goals the result is binary (0 or 100).  For numeric goal
 * types the percentage is `currentValue / targetValue * 100`, which can
 * legitimately exceed 100 % when the user over-achieves.
 *
 * @param type         - The goal's measurement strategy.
 * @param completed    - Whether the goal is marked done (only matters for `'completion'`).
 * @param currentValue - Current numeric progress.
 * @param targetValue  - Target to reach; `null` or `0` → returns `0`.
 * @returns Percentage as a number (0, 100, or unbounded positive).
 */
export function calculateGoalProgress(
  type: 'completion' | 'incremental' | 'progressive',
  completed: boolean,
  currentValue: number,
  targetValue: number | null
): number {
  if (type === 'completion') {
    return completed ? 100 : 0;
  }
  /* Guard against division by zero / null target */
  if (targetValue === null || targetValue === 0) return 0;
  return (currentValue / targetValue) * 100;
}

/**
 * Calculate the completion percentage for a goal — **capped at 100 %**.
 *
 * Wraps {@link calculateGoalProgress} with a `Math.min(100, ...)` ceiling,
 * useful for aggregate progress bars where overflow would skew totals.
 *
 * @param type         - The goal's measurement strategy.
 * @param completed    - Whether the goal is marked done.
 * @param currentValue - Current numeric progress.
 * @param targetValue  - Target to reach.
 * @returns Percentage clamped to the `[0, 100]` range.
 */
export function calculateGoalProgressCapped(
  type: 'completion' | 'incremental' | 'progressive',
  completed: boolean,
  currentValue: number,
  targetValue: number | null
): number {
  return Math.min(100, calculateGoalProgress(type, completed, currentValue, targetValue));
}

// =============================================================================
//                        OVERFLOW PROGRESS COLOUR
// =============================================================================

/**
 * Map a percentage (potentially > 100 %) to a colour that continues the
 * visual ramp **beyond** the standard green endpoint.
 *
 * | Range      | Transition                                     |
 * |------------|------------------------------------------------|
 * | 0–100 %    | Delegates to {@link getProgressColor}           |
 * | 100–150 %  | Success Green `#26de81` → Cosmic Cyan `#00d4ff`|
 * | 150–200 %+ | Cosmic Cyan `#00d4ff` → Primary Purple `#6c5ce7`|
 *
 * Above 200 % the colour remains fixed at the purple endpoint.
 *
 * @param percentage - Progress value; may exceed 100 %.
 * @returns A CSS `rgb()` colour string.
 */
export function getOverflowColor(percentage: number): string {
  /* ── Delegate to standard ramp for normal range ──── */
  if (percentage <= 100) return getProgressColor(percentage);

  const overflow = percentage - 100;

  /** @constant Green  — `#26de81` → `rgb(38, 222, 129)` */
  /** @constant Cyan   — `#00d4ff` → `rgb(0, 212, 255)` */
  /** @constant Purple — `#6c5ce7` → `rgb(108, 92, 231)` */

  if (overflow <= 50) {
    /* ── Green → Cyan (100–150 %) ──── */
    const ratio = overflow / 50;
    const r = Math.round(38 + (0 - 38) * ratio);
    const g = Math.round(222 + (212 - 222) * ratio);
    const b = Math.round(129 + (255 - 129) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    /* ── Cyan → Purple (150–200 %+) ──── */
    const ratio = Math.min(1, (overflow - 50) / 50); /* clamp at 200 % */
    const r = Math.round(0 + (108 - 0) * ratio);
    const g = Math.round(212 + (92 - 212) * ratio);
    const b = Math.round(255 + (231 - 255) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  }
}
