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
  /** Scans one account may have waiting or running at once. */
  maxActiveScansPerUser: Number(env.MAX_ACTIVE_SCANS_PER_USER ?? 3),
  /** New accounts can sign up. Set ALLOW_REGISTRATION=false once your own account exists on a public server. */
  allowRegistration: env.ALLOW_REGISTRATION !== 'false',
  /** Session cookie gets the Secure flag (HTTPS only). On by default in production. */
  secureCookies: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
  /** Express "trust proxy": how many reverse proxies sit in front, so req.ip is the real client. */
  trustProxy: Number(env.TRUST_PROXY ?? 0),
  sessionDays: Number(env.SESSION_DAYS ?? 7),
  /** Chromium reaches the web only through the egress proxy, which checks the IP it really connects to. */
  egressProxy: env.EGRESS_PROXY !== 'false',
};
