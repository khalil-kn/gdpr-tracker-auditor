// Layer 3: turn classified observations into findings and the Privacy Exposure Score.
// Pure function, no I/O: every rule below is covered by assess.test.ts.
// Wording rule: describe what the browser saw ("observed", "potential"), never a legal verdict.

import { trackerById } from '../classify/classify.ts';
import {
  TRACKING_CATEGORIES, type ConsentState, type Finding, type NetworkRequest, type PrivacyScore,
  type ScanCookie, type ScorePoints, type StateRun,
} from '../scans/model.ts';

export interface AssessInput {
  isHttps: boolean;
  scannedAtSec: number; // unix seconds, to turn cookie expiry dates into lifetimes
  states: StateRun[];
  requests: NetworkRequest[];
  cookies: ScanCookie[];
}

export type NewFinding = Omit<Finding, 'id'>;

const YEAR_SEC = 365 * 86400;

function isTrackingRequest(r: NetworkRequest): boolean {
  const t = r.trackerId ? trackerById(r.trackerId) : undefined;
  return !!t && TRACKING_CATEGORIES.has(t.category);
}

/** Tracking requests per service name, with count and first time. */
function byService(requests: NetworkRequest[]): Map<string, { count: number; firstMs: number }> {
  const out = new Map<string, { count: number; firstMs: number }>();
  for (const r of requests) {
    const name = trackerById(r.trackerId!)!.name;
    const s = out.get(name) ?? { count: 0, firstMs: r.timeMs };
    s.count++;
    s.firstMs = Math.min(s.firstMs, r.timeMs);
    out.set(name, s);
  }
  return out;
}

function evidenceOf(services: Map<string, { count: number; firstMs: number }>): string[] {
  return [...services].map(([name, s]) =>
    `${name}: ${s.count} ${s.count === 1 ? 'request' : 'requests'}, first at ${(s.firstMs / 1000).toFixed(1)} s`);
}

/** Points for `n` items at `each` points, never more than `max`. */
const capped = (n: number, each: number, max: number) => Math.min(n * each, max);

function uniqueCookies(cookies: ScanCookie[]): ScanCookie[] {
  const seen = new Map<string, ScanCookie>();
  for (const c of cookies) seen.set(`${c.name}|${c.domain}|${c.path}`, seen.get(`${c.name}|${c.domain}|${c.path}`) ?? c);
  return [...seen.values()];
}

export function assess(input: AssessInput): { findings: NewFinding[]; score: PrivacyScore } {
  const findings: NewFinding[] = [];
  const points: ScorePoints[] = [];
  const add = (p: number, reason: string, detail: string) => { if (p > 0) points.push({ points: p, reason, detail }); };
  const inState = (s: ConsentState) => input.requests.filter((r) => r.consentState === s);
  const run = (s: ConsentState) => input.states.find((x) => x.consentState === s);

  // 1. Tracking before any choice.
  const before = byService(inState('BEFORE_INTERACTION').filter(isTrackingRequest));
  if (before.size > 0) {
    const bannerSeen = input.states.some((s) => s.bannerFound);
    findings.push({
      severity: 'HIGH',
      title: 'Tracking request observed before consent',
      description: bannerSeen
        ? 'Tracking services sent requests while the consent banner was still unanswered.'
        : 'Tracking services sent requests, and the scanner found no consent banner to answer.',
      consentState: 'BEFORE_INTERACTION',
      evidence: evidenceOf(before),
    });
    add(capped(before.size, 8, 24), 'Tracking before consent', [...before.keys()].join(', '));
  }

  // 2. Tracking after Reject all. Only requests after the click count; without a click there was no rejection.
  const rejected = run('REJECTED');
  if (rejected?.bannerClickedAtMs != null) {
    const clickedAt = rejected.bannerClickedAtMs;
    const after = byService(inState('REJECTED').filter((r) => r.timeMs > clickedAt && isTrackingRequest(r)));
    if (after.size > 0) {
      findings.push({
        severity: 'HIGH',
        title: 'Tracking continued after consent was rejected',
        description: 'Tracking services kept sending requests after the scanner clicked the banner’s reject button.',
        consentState: 'REJECTED',
        evidence: evidenceOf(after),
      });
      add(capped(after.size, 8, 24), 'Tracking after Reject all', [...after.keys()].join(', '));
    }
  }

  // 3. A choice was requested but no button was found: that state's result is really "no choice".
  const unclicked = input.states.filter((s) => s.consentState !== 'BEFORE_INTERACTION' && s.bannerClickedAtMs == null);
  if (unclicked.length > 0) {
    findings.push({
      severity: 'MEDIUM',
      title: 'Consent banner button not found',
      description: 'The scanner could not find a reject or accept button, so these states show the page without a choice. The banner may use wording or markup the scanner does not recognise yet.',
      consentState: null,
      evidence: unclicked.map((s) => (s.consentState === 'REJECTED' ? 'No reject button found' : 'No accept button found')),
    });
  }

  // 4. Advertising and social services after accepting: allowed by the visitor, still exposure.
  const adSocial = byService(inState('ACCEPTED').filter((r) => {
    const t = r.trackerId ? trackerById(r.trackerId) : undefined;
    return t?.category === 'Advertising' || t?.category === 'Social';
  }));
  add(capped(adSocial.size, 3, 15), 'Ad and social after accepting', [...adSocial.keys()].join(', '));

  // 5. Many third-party domains in the busiest state.
  const thirdDomains = Math.max(0, ...input.states.map((s) =>
    new Set(inState(s.consentState).filter((r) => r.thirdParty).map((r) => r.registrableDomain)).size));
  if (thirdDomains > 10) {
    findings.push({
      severity: 'LOW',
      title: 'Many third-party domains',
      description: 'Every third party receives at least the visitor’s IP address and the page being visited.',
      consentState: null,
      evidence: [`${thirdDomains} third-party domains in one consent state`],
    });
    add(capped(thirdDomains - 10, 1, 10), 'Third-party domains over 10', `${thirdDomains} domains`);
  }

  // 6. Third parties the tracker library doesn't know.
  const unknown = [...new Set(input.requests.filter((r) => r.thirdParty && !r.trackerId).map((r) => r.registrableDomain))];
  if (unknown.length > 0) {
    findings.push({
      severity: 'MEDIUM',
      title: 'Unclassified third party',
      description: 'These domains are not in the tracker library, so the scanner cannot say what they do. Review and classify them.',
      consentState: null,
      evidence: unknown.slice(0, 10),
    });
    add(capped(unknown.length, 2, 8), 'Unclassified third parties', unknown.slice(0, 3).join(', ') + (unknown.length > 3 ? '…' : ''));
  }

  // 7. Long-lived tracking cookies set before any choice.
  const longLived = uniqueCookies(input.cookies.filter((c) =>
    c.consentState === 'BEFORE_INTERACTION' && TRACKING_CATEGORIES.has(c.category) && c.expires > 0
    && c.expires - input.scannedAtSec > YEAR_SEC));
  if (longLived.length > 0) {
    findings.push({
      severity: 'MEDIUM',
      title: 'Tracking cookie kept over 12 months',
      description: 'Tracking cookies set before consent are kept for more than a year.',
      consentState: 'BEFORE_INTERACTION',
      evidence: longLived.map((c) => `${c.name}, ${Math.round((c.expires - input.scannedAtSec) / 86400)} days`),
    });
    add(capped(longLived.length, 2, 8), 'Long-lived tracking cookies', `${longLived.length} set before consent`);
  }

  // 8. Security attributes, judged only on cookies the site itself needs (vendors choose their own).
  const own = uniqueCookies(input.cookies.filter((c) => !TRACKING_CATEGORIES.has(c.category) && !c.thirdParty));
  const noSecure = input.isHttps ? own.filter((c) => !c.secure) : []; // Secure is impossible on plain http
  const noSameSite = own.filter((c) => c.sameSite === null);
  if (noSecure.length > 0) {
    findings.push({ severity: 'LOW', title: 'Cookie without Secure attribute', description: 'The browser would also send these cookies over plain http.', consentState: null, evidence: noSecure.map((c) => c.name) });
  }
  if (noSameSite.length > 0) {
    findings.push({ severity: 'LOW', title: 'Cookie without SameSite attribute', description: 'These cookies rely on the browser default (Lax in current Chromium).', consentState: null, evidence: noSameSite.map((c) => c.name) });
  }
  const weak = new Set([...noSecure, ...noSameSite].map((c) => c.name));
  add(capped(weak.size, 2, 6), 'Cookie weaknesses', [...weak].join(', '));

  const value = Math.min(100, points.reduce((t, p) => t + p.points, 0));
  return { findings, score: { value, breakdown: points } };
}
