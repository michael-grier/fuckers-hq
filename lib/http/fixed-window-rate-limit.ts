type RateLimitEntry = {
  count: number;
  resetsAt: number;
};

type FixedWindowRateLimitOptions = {
  limit: number;
  windowMs: number;
  maxKeys?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

/** Provides a bounded, per-process guard for lightweight public endpoints. */
export function createFixedWindowRateLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
}: FixedWindowRateLimitOptions) {
  const entries = new Map<string, RateLimitEntry>();

  return (key: string, now = Date.now()): RateLimitResult => {
    const current = entries.get(key);

    if (current && current.resetsAt > now) {
      if (current.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((current.resetsAt - now) / 1_000)),
        };
      }

      current.count += 1;
      return {
        allowed: true,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetsAt - now) / 1_000)),
      };
    }

    if (current) {
      entries.delete(key);
    }

    if (entries.size >= maxKeys) {
      // Map iteration follows insertion order, so removing the first key bounds memory while
      // retaining the newest client windows during a distributed scan.
      const oldestKey = entries.keys().next().value;
      if (oldestKey !== undefined) {
        entries.delete(oldestKey);
      }
    }

    entries.set(key, { count: 1, resetsAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1_000) };
  };
}
