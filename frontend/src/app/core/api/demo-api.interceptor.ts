import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { delay, of, throwError } from 'rxjs';
import { CreateScanRequest, ScanReport, ScanSummary } from '../models/scan.models';
import { demoReport, demoSummaries } from './demo-data';

// shortcut: in-memory fake of the Express API so the UI can be built before the backend exists.
// Turn off with USE_DEMO_API in app.config.ts once POST/GET /api/scans work; delete this file and demo-data.ts then.
const scans: ScanSummary[] = demoSummaries();
const RUN_MS = 8000;

function current(s: ScanSummary): ScanReport {
  if (s.status === 'FAILED') return { ...s, states: [], requests: [], cookies: [], trackers: [], findings: [], privacyScore: null };
  const age = Date.now() - Date.parse(s.createdAt);
  if (age >= RUN_MS) return demoReport(s.id, s.host, s.createdAt);
  return {
    ...s, status: age < 1000 ? 'PENDING' : 'RUNNING',
    states: [], requests: [], cookies: [], trackers: [], findings: [], privacyScore: null,
  };
}

export const demoApiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/scans')) return next(req);
  const ok = <T>(body: T, status = 200) => of(new HttpResponse({ status, body })).pipe(delay(250));

  if (req.method === 'GET' && req.url === '/api/scans') {
    return ok(scans.map((s) => { const { requests, cookies, trackers, findings, privacyScore, states, ...sum } = current(s); return sum; }));
  }
  if (req.method === 'POST' && req.url === '/api/scans') {
    const body = req.body as CreateScanRequest;
    const host = new URL(body.url).hostname;
    const s: ScanSummary = {
      id: `demo-${Date.now()}`, url: body.url, host, status: 'PENDING', consentStates: body.consentStates,
      observationSeconds: body.observationSeconds, viewport: body.viewport, createdAt: new Date().toISOString(),
      completedAt: null, failureReason: null, score: null, findingCount: null,
    };
    scans.unshift(s);
    return ok(s, 202);
  }
  const id = decodeURIComponent(req.url.slice('/api/scans/'.length));
  const found = scans.find((s) => s.id === id);
  if (req.method === 'GET' && found) return ok(current(found));
  return throwError(() => new HttpErrorResponse({ status: 404, url: req.url })).pipe(delay(250));
};
