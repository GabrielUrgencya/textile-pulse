/**
 * In-memory rate limiter.
 *
 * LIMITATION: In serverless environments (Vercel), each cold-start creates
 * a fresh Map, so rate limiting is per-instance only. This provides basic
 * protection against rapid successive requests within the same instance
 * but does NOT guarantee global rate limiting across instances.
 *
 * For production-grade rate limiting, consider:
 * - Vercel KV (Redis) for shared state
 * - Supabase rate_limit table with DB-level counters
 * - Upstash Redis for edge-compatible rate limiting
 */
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

interface RateLimitEntry {
  count: number;
  expiry: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes (no-op if process exits before timer fires)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    store.forEach((entry, key) => {
      if (now >= entry.expiry) {
        store.delete(key);
      }
    });
  }, 5 * 60 * 1000).unref?.();
}

export function checkRateLimit(key: string): {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
} {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.expiry) {
    store.set(key, { count: 1, expiry: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, retryAfterMs: 0 };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: entry.expiry - now,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: MAX_ATTEMPTS - entry.count,
    retryAfterMs: 0,
  };
}

export function checkRateLimitCustom(
  key: string,
  maxAttempts: number,
  windowMs: number
): {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
} {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.expiry) {
    store.set(key, { count: 1, expiry: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1, retryAfterMs: 0 };
  }

  if (entry.count >= maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: entry.expiry - now,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: maxAttempts - entry.count,
    retryAfterMs: 0,
  };
}

export function rateLimitKey(ip: string, tenantId: string): string {
  return `${ip}:${tenantId}`;
}
