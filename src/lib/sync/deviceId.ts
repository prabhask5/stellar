/**
 * Device ID Management
 *
 * Generates and persists a stable device identifier for deterministic conflict resolution.
 * When two operations have the same timestamp, the device ID is used as a tiebreaker
 * to ensure consistent resolution across all devices.
 */

const DEVICE_ID_KEY = 'stellar_device_id';

/**
 * Get or create a stable device ID for this browser/device.
 * The ID is stored in localStorage and persists across sessions.
 *
 * Format: Random UUID v4
 */
export function getDeviceId(): string {
  if (typeof localStorage === 'undefined') {
    // SSR context - return a placeholder that won't be used
    return 'ssr-placeholder';
  }

  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    deviceId = generateUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}

/**
 * Generate a UUID v4 (random UUID).
 * Uses crypto.randomUUID if available, otherwise falls back to manual generation.
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Reset the device ID (for testing purposes).
 * In production, this should rarely be called.
 */
export function resetDeviceId(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(DEVICE_ID_KEY);
  }
}
