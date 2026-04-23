/**
 * Trivial in-memory rate limiter. Fine for a single-user app running on one
 * Next.js process; a Redis-backed limiter would be overkill here.
 *
 * Usage:
 *   const rl = hitRateLimit(`login:${ip}`, { max: 3, windowMs: 15 * 60_000 });
 *   if (rl.blocked) return res.status(429) …
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  blocked: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function hitRateLimit(
  key: string,
  opts: { max: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { blocked: false, remaining: opts.max - 1, retryAfterSec: 0 };
  }
  bucket.count += 1;
  const blocked = bucket.count > opts.max;
  return {
    blocked,
    remaining: Math.max(0, opts.max - bucket.count),
    retryAfterSec: blocked ? Math.ceil((bucket.resetAt - now) / 1000) : 0,
  };
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
