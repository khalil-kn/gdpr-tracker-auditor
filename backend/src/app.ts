import express, { type ErrorRequestHandler } from 'express';
import type pg from 'pg';
import { authRouter } from './auth/routes.ts';
import { trackersRouter } from './classify/routes.ts';
import { config } from './config.ts';
import { pool as defaultPool } from './db/pool.ts';
import { scansRouter } from './scans/routes.ts';
import type { LookupFn } from './security/urlGuard.ts';

/** Builds the HTTP API. Tests pass their own pool and a fake DNS lookup. */
export function createApp(pool: pg.Pool = defaultPool, resolve?: LookupFn): express.Express {
  const app = express();
  app.disable('x-powered-by'); // don't advertise the framework to scanners
  app.set('trust proxy', config.trustProxy); // behind nginx, req.ip must be the client, not the proxy

  app.use('/api', (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); // reports are private
    // A cross-site HTML form can only send form or text bodies. Requiring JSON on every write blocks
    // CSRF even in a browser that ignores SameSite cookies.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.is('application/json')) {
      return res.status(415).json({ message: 'Send the request body as JSON.' });
    }
    next();
  });
  app.use(express.json({ limit: '10kb' })); // a scan request is tiny; refuse large bodies early

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/auth', authRouter(pool));
  app.use('/api/scans', scansRouter(pool, resolve));
  app.use('/api/trackers', trackersRouter(pool));

  app.use('/api', (_req, res) => {
    res.status(404).json({ message: 'Not found.' });
  });

  // Express recognises an error handler by its four parameters, so `_next` must stay.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ message: 'The request body is not valid JSON.' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ message: 'The request body is too large.' });
    console.error(err);
    res.status(500).json({ message: 'Internal error.' }); // never send stack traces to the client
  };
  app.use(onError);
  return app;
}

export const app = createApp();
