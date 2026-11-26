// All settings come from environment variables. `npm run dev` loads ../.env (see .env.example).

const env = process.env;

function databaseUrl(): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const user = encodeURIComponent(env.POSTGRES_USER ?? 'auditor');
  const password = encodeURIComponent(env.POSTGRES_PASSWORD ?? '');
  const host = env.POSTGRES_HOST ?? 'localhost';
  const db = env.POSTGRES_DB ?? 'tracker_auditor';
  return `postgres://${user}:${password}@${host}:5432/${db}`;
}

export const config = {
  port: Number(env.PORT ?? 3000),
  databaseUrl: databaseUrl(),
  /** Scans running at the same time. Each one is a full Chromium, so keep it small. */
  scanConcurrency: Number(env.SCAN_CONCURRENCY ?? 2),
  /** Scans waiting or running before POST /api/scans answers 429. */
  maxQueuedScans: Number(env.MAX_QUEUED_SCANS ?? 20),
};
