interface RateLimitConfig {
  windowMs: number;
  max: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export function rateLimit({ windowMs, max }: RateLimitConfig) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function check(ip: string): RateLimitResult {
    const now = Date.now();
    const entry = hits.get(ip);

    if (hits.size > 100) {
      for (const [key, val] of hits) {
        if (now > val.resetAt) hits.delete(key);
      }
    }

    if (!entry || now > entry.resetAt) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: max - 1 };
    }

    entry.count++;
    if (entry.count > max) {
      return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: max - entry.count };
  };
}
