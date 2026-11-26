import { Router } from 'express';
import type pg from 'pg';
import { requireAuth } from '../auth/middleware.ts';
import { COOKIE_PATTERNS, TRACKERS } from './trackers.ts';

/** GET /api/trackers: the tracker library the classifier uses, with the cookie-name patterns per service. */
export function trackersRouter(pool: pg.Pool): Router {
  const router = Router();
  router.get('/', requireAuth(pool), (_req, res) => {
    res.json(TRACKERS.map((t) => ({
      ...t,
      cookiePatterns: COOKIE_PATTERNS.filter(([, id]) => id === t.id).map(([re]) => re.source),
    })));
  });
  return router;
}
