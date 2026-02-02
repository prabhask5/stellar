/**
 * Shared Crypto Utilities
 * SHA-256 hashing for PIN codes and other values.
 * Mirrors the engine's crypto.ts for consistent hash comparison.
 */

/**
 * Hash a value using SHA-256 via Web Crypto API.
 * Returns a 64-character hex string.
 */
export async function hashValue(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
