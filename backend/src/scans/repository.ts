// All SQL for scans lives here. Every query is parameterised ($1, $2…): user input never becomes SQL text.

import type pg from 'pg';
import { trackerById } from '../classify/classify.ts';
import type { NewFinding } from '../assess/assess.ts';
import type {
  ConsentState, CreateScanRequest, NetworkRequest, PrivacyScore, ScanCookie, ScanReport, ScanSummary, StateRun, Tracker,
} from './model.ts';

type Db = pg.Pool | pg.PoolClient;

interface ScanRow {
  id: string; url: string; host: string; status: ScanSummary['status']; consent_states: ConsentState[];
  observation_seconds: number; viewport: ScanSummary['viewport']; created_at: Date; completed_at: Date | null;
  failure_reason: string | null; score: number | null; score_breakdown: PrivacyScore['breakdown'] | null;
  states: StateRun[]; finding_count: number | null;
}

const SUMMARY_COLUMNS = `s.*, CASE WHEN s.status = 'COMPLETED'
  THEN (SELECT count(*)::int FROM findings f WHERE f.scan_id = s.id) END AS finding_count`;

function toSummary(r: ScanRow): ScanSummary {
  return {
    id: r.id, url: r.url, host: r.host, status: r.status, consentStates: r.consent_states,
    observationSeconds: r.observation_seconds, viewport: r.viewport,
    createdAt: r.created_at.toISOString(), completedAt: r.completed_at?.toISOString() ?? null,
    failureReason: r.failure_reason, score: r.score, findingCount: r.finding_count,
  };
}

export async function createScan(db: Db, input: CreateScanRequest, host: string): Promise<ScanSummary> {
  const { rows } = await db.query<ScanRow>(
    `INSERT INTO scans (url, host, consent_states, observation_seconds, viewport)
     VALUES ($1, $2, $3, $4, $5) RETURNING *, NULL::int AS finding_count`,
    [input.url, host, input.consentStates, input.observationSeconds, input.viewport],
  );
  return toSummary(rows[0]!);
}

export async function listScans(db: Db, limit = 200): Promise<ScanSummary[]> {
  const { rows } = await db.query<ScanRow>(`SELECT ${SUMMARY_COLUMNS} FROM scans s ORDER BY s.created_at DESC LIMIT $1`, [limit]);
  return rows.map(toSummary);
}

export async function countActive(db: Db): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM scans WHERE status IN ('PENDING', 'RUNNING')`);
  return rows[0]!.n;
}

export async function getReport(db: Db, id: string): Promise<ScanReport | null> {
  const { rows } = await db.query<ScanRow>(`SELECT ${SUMMARY_COLUMNS} FROM scans s WHERE s.id = $1`, [id]);
  const scan = rows[0];
  if (!scan) return null;

  const [requests, cookies, findings] = await Promise.all([
    db.query(`SELECT consent_state AS "consentState", url, hostname, registrable_domain AS "registrableDomain", method,
                     resource_type AS "resourceType", third_party AS "thirdParty", time_ms AS "timeMs", tracker_id AS "trackerId"
              FROM network_requests WHERE scan_id = $1 ORDER BY consent_state, time_ms, id`, [id]),
    db.query(`SELECT consent_state AS "consentState", name, domain, path, expires, secure, http_only AS "httpOnly",
                     same_site AS "sameSite", third_party AS "thirdParty", category, tracker_id AS "trackerId"
              FROM cookies WHERE scan_id = $1 ORDER BY consent_state, name`, [id]),
    db.query(`SELECT id::text, severity, title, description, consent_state AS "consentState", evidence
              FROM findings WHERE scan_id = $1 ORDER BY id`, [id]),
  ]);

  const trackerIds = new Set<string>();
  for (const r of [...requests.rows, ...cookies.rows] as { trackerId: string | null }[]) if (r.trackerId) trackerIds.add(r.trackerId);

  return {
    ...toSummary(scan),
    states: scan.states,
    requests: requests.rows,
    cookies: cookies.rows,
    findings: findings.rows,
    trackers: [...trackerIds].map(trackerById).filter((t): t is Tracker => !!t),
    privacyScore: scan.score === null ? null : { value: scan.score, breakdown: scan.score_breakdown ?? [] },
  };
}

// ---- Worker side: the scans table doubles as the job queue ----

/**
 * Takes the oldest PENDING scan and marks it RUNNING in one statement. FOR UPDATE SKIP LOCKED makes
 * two workers that ask at the same moment get different scans instead of the same one.
 */
export async function claimNextScan(db: Db): Promise<ScanSummary | null> {
  const { rows } = await db.query<ScanRow>(
    `UPDATE scans SET status = 'RUNNING', started_at = now()
     WHERE id = (SELECT id FROM scans WHERE status = 'PENDING' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING *, NULL::int AS finding_count`,
  );
  return rows[0] ? toSummary(rows[0]) : null;
}

/** On start-up, scans left RUNNING by a crash or restart will never finish: mark them failed. */
export async function failInterruptedScans(db: Db): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE scans SET status = 'FAILED', completed_at = now(), failure_reason = 'The scanner restarted while this scan was running. Start it again.'
     WHERE status = 'RUNNING'`,
  );
  return rowCount ?? 0;
}

export async function failScan(db: Db, id: string, reason: string): Promise<void> {
  await db.query(`UPDATE scans SET status = 'FAILED', completed_at = now(), failure_reason = $2 WHERE id = $1`, [id, reason]);
}

export interface ScanResult {
  states: StateRun[];
  requests: NetworkRequest[];
  cookies: ScanCookie[];
  findings: NewFinding[];
  score: PrivacyScore;
}

/** Saves every observation, finding and the score, then marks the scan COMPLETED. All or nothing. */
export async function completeScan(pool: pg.Pool, id: string, r: ScanResult): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // unnest() turns parallel arrays into rows: one INSERT for hundreds of requests.
    await client.query(
      `INSERT INTO network_requests (scan_id, consent_state, url, hostname, registrable_domain, method, resource_type, third_party, time_ms, tracker_id)
       SELECT $1, * FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::bool[], $9::int[], $10::text[])`,
      [id, ...columns(r.requests, ['consentState', 'url', 'hostname', 'registrableDomain', 'method', 'resourceType', 'thirdParty', 'timeMs', 'trackerId'])],
    );
    await client.query(
      `INSERT INTO cookies (scan_id, consent_state, name, domain, path, expires, secure, http_only, same_site, third_party, category, tracker_id)
       SELECT $1, * FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::float8[], $7::bool[], $8::bool[], $9::text[], $10::bool[], $11::text[], $12::text[])`,
      [id, ...columns(r.cookies, ['consentState', 'name', 'domain', 'path', 'expires', 'secure', 'httpOnly', 'sameSite', 'thirdParty', 'category', 'trackerId'])],
    );
    for (const f of r.findings) {
      await client.query(
        `INSERT INTO findings (scan_id, severity, title, description, consent_state, evidence) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, f.severity, f.title, f.description, f.consentState, f.evidence],
      );
    }
    await client.query(
      `UPDATE scans SET status = 'COMPLETED', completed_at = now(), score = $2, score_breakdown = $3, states = $4 WHERE id = $1`,
      [id, r.score.value, JSON.stringify(r.score.breakdown), JSON.stringify(r.states)],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function columns<T>(rows: T[], keys: (keyof T)[]): unknown[][] {
  return keys.map((k) => rows.map((r) => r[k]));
}
