import type { RequestHandler } from 'express';

/**
 * Fixed-window limit per client IP: at most `max` requests every `windowMs`, then 429.
 * shortcut: counts live in this process's memory; use a shared store (Postgres or Redis) once
 * more than one backend instance runs, or they each allow `max`.
 */
export function rateLimit(
  max: number,
  windowMs: number,
  message = 'Too many scans in a short time. Wait a minute and try again.',
): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    const key = req.ip ?? 'unknown';
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (++entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ message });
    }
    next();
  };
}
