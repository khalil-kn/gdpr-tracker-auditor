import express, { type ErrorRequestHandler } from 'express';
import type pg from 'pg';
import { pool as defaultPool } from './db/pool.ts';
import { scansRouter } from './scans/routes.ts';
import type { LookupFn } from './security/urlGuard.ts';

/** Builds the HTTP API. Tests pass their own pool and a fake DNS lookup. */
export function createApp(pool: pg.Pool = defaultPool, resolve?: LookupFn): express.Express {
  const app = express();
  app.disable('x-powered-by'); // don't advertise the framework to scanners
  app.use(express.json({ limit: '10kb' })); // a scan request is tiny; refuse large bodies early

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/scans', scansRouter(pool, resolve));

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
