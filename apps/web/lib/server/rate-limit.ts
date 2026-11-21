/** Small in-memory sliding-window limiter for the auth and setup endpoints. */
interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateResult {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0] ?? now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }
  bucket.hits.push(now);
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.hits.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimits(): void {
  buckets.clear();
}
