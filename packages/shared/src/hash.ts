/** Deterministic hashing so every device derives the same universe from the same ids. */

/** FNV-1a 32-bit hash of a string. */
export function hash32(input: string, seed = 0): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Final avalanche (murmur3 fmix) to decorrelate similar ids.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Seeded PRNG (mulberry32) returning floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A PRNG seeded from an id (and an optional salt for independent streams). */
export function randomFor(id: string, salt = 0): () => number {
  return seededRandom(hash32(id, salt));
}

/** A single float in [0, 1) for an id. */
export function unitFor(id: string, salt = 0): number {
  return hash32(id, salt) / 4294967296;
}
