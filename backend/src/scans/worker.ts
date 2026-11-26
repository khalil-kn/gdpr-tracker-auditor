// Background worker: takes PENDING scans from the database, runs them and stores the results.
// The HTTP request that created the scan returned long ago (202 Accepted); the browser polls GET /api/scans/:id.

import type pg from 'pg';
import { assess } from '../assess/assess.ts';
import { config } from '../config.ts';
import { classifyObservation } from '../classify/classify.ts';
import { createRequestGuard } from '../scanner/requestGuard.ts';
import { ScanError, scanSite, type Observation } from '../scanner/scanner.ts';
import { claimNextScan, completeScan, failScan } from './repository.ts';
import type { ScanSummary } from './model.ts';

export type RunScan = (scan: ScanSummary) => Promise<Observation>;

const defaultRunScan: RunScan = (scan) => scanSite({
  url: scan.url,
  consentStates: scan.consentStates,
  observationSeconds: scan.observationSeconds,
  viewport: scan.viewport,
  guard: createRequestGuard(),
  egress: config.egressProxy ? {} : undefined,
});

/** Runs one claimed scan to COMPLETED or FAILED. Never throws. */
export async function processScan(pool: pg.Pool, scan: ScanSummary, runScan: RunScan = defaultRunScan): Promise<void> {
  // Hard limit for the whole scan, on top of the per-page navigation timeout.
  const limitMs = scan.consentStates.length * (scan.observationSeconds + 60) * 1000;
  let timer: NodeJS.Timeout | undefined;
  try {
    const obs = await Promise.race([
      runScan(scan),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ScanError('The scan took too long and was stopped.')), limitMs); }),
    ]);
    const { requests, cookies } = classifyObservation(obs, scan.host);
    const { findings, score } = assess({
      isHttps: scan.url.startsWith('https:'),
      scannedAtSec: Date.now() / 1000,
      states: obs.states,
      requests,
      cookies,
    });
    await completeScan(pool, scan.id, { states: obs.states, requests, cookies, findings, score });
  } catch (err) {
    if (!(err instanceof ScanError)) console.error(`scan ${scan.id} failed`, err); // log details, show none
    const reason = err instanceof ScanError ? err.message : 'The scan failed unexpectedly. Try again later.';
    await failScan(pool, scan.id, reason).catch((e) => console.error(`could not mark scan ${scan.id} failed`, e));
  } finally {
    clearTimeout(timer);
  }
}

/** Starts `concurrency` loops that each claim and run scans one after another. Returns a stop function. */
export function startWorker(pool: pg.Pool, concurrency: number, runScan: RunScan = defaultRunScan, idleMs = 1000): () => Promise<void> {
  let running = true;
  const loop = async () => {
    while (running) {
      const scan = await claimNextScan(pool).catch((e) => { console.error('worker could not claim a scan', e); return null; });
      if (scan) await processScan(pool, scan, runScan);
      else await new Promise((r) => setTimeout(r, idleMs));
    }
  };
  const loops = Array.from({ length: concurrency }, loop);
  return async () => { running = false; await Promise.all(loops); };
}
