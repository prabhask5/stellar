/**
 * Returns a color on the red-to-green spectrum based on a percentage (0-100)
 * 0% = red, 50% = yellow, 100% = green
 */
export function getProgressColor(percentage: number): string {
  const clamped = Math.max(0, Math.min(100, percentage));

  if (clamped <= 50) {
    // Red to yellow (0-50%)
    const ratio = clamped / 50;
    const r = 255;
    const g = Math.round(107 + (215 - 107) * ratio); // 107 (red) to 215 (yellow)
    const b = Math.round(107 * (1 - ratio)); // 107 to 0
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Yellow to green (50-100%)
    const ratio = (clamped - 50) / 50;
    const r = Math.round(255 * (1 - ratio)); // 255 to 0
    const g = Math.round(215 + (222 - 215) * ratio); // 215 to 222
    const b = Math.round(61 * ratio + 93 * ratio); // 0 to ~129
    return `rgb(${r}, ${g}, ${b})`;
  }
}

/**
 * Calculate completion percentage for a goal (uncapped - can exceed 100%)
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
  if (targetValue === null || targetValue === 0) return 0;
  return (currentValue / targetValue) * 100;
}

/**
 * Calculate completion percentage for a goal (capped at 100% for aggregate totals)
 */
export function calculateGoalProgressCapped(
  type: 'completion' | 'incremental' | 'progressive',
  completed: boolean,
  currentValue: number,
  targetValue: number | null
): number {
  return Math.min(100, calculateGoalProgress(type, completed, currentValue, targetValue));
}

/**
 * Returns a color for overflow progress (>100%)
 * 100%: #26de81 (Success Green)
 * 150%: #00d4ff (Cosmic Cyan)
 * 200%+: #6c5ce7 (Primary Purple)
 */
export function getOverflowColor(percentage: number): string {
  if (percentage <= 100) return getProgressColor(percentage);

  const overflow = percentage - 100;

  // Green RGB: 38, 222, 129 (#26de81)
  // Cyan RGB: 0, 212, 255 (#00d4ff)
  // Purple RGB: 108, 92, 231 (#6c5ce7)

  if (overflow <= 50) {
    // Green to Cyan (100-150%)
    const ratio = overflow / 50;
    const r = Math.round(38 + (0 - 38) * ratio);
    const g = Math.round(222 + (212 - 222) * ratio);
    const b = Math.round(129 + (255 - 129) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Cyan to Purple (150-200%+)
    const ratio = Math.min(1, (overflow - 50) / 50);
    const r = Math.round(0 + (108 - 0) * ratio);
    const g = Math.round(212 + (92 - 212) * ratio);
    const b = Math.round(255 + (231 - 255) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  }
}
