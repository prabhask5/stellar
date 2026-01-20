/**
 * Utilities for calculating new order values when reordering items.
 * Uses fractional ordering to avoid updating multiple items on each reorder.
 */

/**
 * Calculate new order value when moving an item to a new position.
 * Uses fractional ordering to minimize updates.
 *
 * @param items - The sorted array of items with order property
 * @param fromIndex - Current index of the item being moved
 * @param toIndex - Target index where the item should be placed
 * @returns The new order value for the moved item
 */
export function calculateNewOrder<T extends { order: number }>(
  items: T[],
  fromIndex: number,
  toIndex: number
): number {
  // No movement
  if (fromIndex === toIndex) {
    return items[fromIndex].order;
  }

  // Moving to the beginning
  if (toIndex === 0) {
    return items[0].order - 1;
  }

  // Moving to the end
  if (toIndex === items.length - 1) {
    return items[items.length - 1].order + 1;
  }

  // Moving between two items
  // Account for the shift that happens when removing the item from its original position
  let prevIndex: number;
  let nextIndex: number;

  if (fromIndex < toIndex) {
    // Moving down: the item will be placed between toIndex and toIndex + 1
    prevIndex = toIndex;
    nextIndex = toIndex + 1;
  } else {
    // Moving up: the item will be placed between toIndex - 1 and toIndex
    prevIndex = toIndex - 1;
    nextIndex = toIndex;
  }

  const prevOrder = items[prevIndex].order;
  const nextOrder = items[nextIndex].order;

  return (prevOrder + nextOrder) / 2;
}

/**
 * Check if the order values in an array have become too fragmented
 * (differences too small for reliable ordering).
 * Returns true if normalization is recommended.
 */
export function shouldNormalizeOrder<T extends { order: number }>(items: T[]): boolean {
  if (items.length < 2) return false;

  const sorted = [...items].sort((a, b) => a.order - b.order);

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].order - sorted[i - 1].order;
    // If gap is less than 0.0001, precision issues may occur
    if (gap < 0.0001) {
      return true;
    }
  }

  return false;
}

/**
 * Generate normalized order values (integers starting from 0).
 * Returns a map of item id to new order value.
 */
export function normalizeOrder<T extends { id: string; order: number }>(
  items: T[]
): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const orderMap = new Map<string, number>();

  sorted.forEach((item, index) => {
    orderMap.set(item.id, index);
  });

  return orderMap;
}
