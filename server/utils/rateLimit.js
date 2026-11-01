const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of buckets) {
    if (value.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref();

/**
 * Small in-memory fixed-window limiter. Suitable for a local, single-user app.
 */
export function rateLimit({ windowMs = 60_000, max = 120, keyPrefix = 'general' } = {}) {
  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'You are sending requests too quickly. Take a breath and try again in a moment.',
        },
      });
    }
    return next();
  };
}

export function resetRateLimits() {
  buckets.clear();
}
