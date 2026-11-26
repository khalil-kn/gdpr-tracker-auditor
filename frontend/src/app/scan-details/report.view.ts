// Pure functions turning the raw observations of a ScanReport into what the report tabs show.
// No Angular here, so they are unit-tested directly (report.view.spec.ts).
import {
  CONSENT_STATES, Category, ConsentState, NetworkRequest, ScanReport, TRACKING_CATEGORIES,
} from '../core/models/scan.models';

export const CATEGORY_TICK: Record<Category, string> = {
  Analytics: 'trk', Advertising: 'trk ad', Social: 'trk so', Functional: '', Essential: '', Unknown: 'unk',
};

/** The states this scan actually ran, in canonical order. */
export function statesOf(r: ScanReport): ConsentState[] {
  return CONSENT_STATES.filter((s) => r.consentStates.includes(s));
}

/** Category of a request: its tracker's, else Unknown for an unmatched third party, else null (first party). */
export function categoryOf(req: NetworkRequest, r: ScanReport): Category | null {
  if (req.trackerId) return r.trackers.find((t) => t.id === req.trackerId)?.category ?? 'Unknown';
  return req.thirdParty ? 'Unknown' : null;
}

export function isTracking(req: NetworkRequest, r: ScanReport): boolean {
  const c = categoryOf(req, r);
  return c !== null && TRACKING_CATEGORIES.has(c);
}

export interface StateTotals {
  state: ConsentState;
  requests: number;
  thirdParty: number;
  thirdPartyDomains: number;
  trackingRequests: number;
  trackers: number;
  cookies: number;
}

export function stateTotals(r: ScanReport): StateTotals[] {
  return statesOf(r).map((state) => {
    const reqs = r.requests.filter((q) => q.consentState === state);
    const third = reqs.filter((q) => q.thirdParty);
    const tracking = reqs.filter((q) => isTracking(q, r));
    return {
      state,
      requests: reqs.length,
      thirdParty: third.length,
      thirdPartyDomains: new Set(third.map((q) => q.registrableDomain)).size,
      trackingRequests: tracking.length,
      trackers: new Set(tracking.map((q) => q.trackerId)).size,
      cookies: r.cookies.filter((c) => c.consentState === state).length,
    };
  });
}

export type Assessment = 'Potential issue' | 'Needs classifying' | 'After consent only' | 'Not tracking';
export const ASSESSMENT_PILL: Record<Assessment, string> = {
  'Potential issue': 'p-high', 'Needs classifying': 'p-med', 'After consent only': 'p-off', 'Not tracking': 'p-off',
};

export interface ServiceRow {
  key: string;
  name: string;
  provider: string;
  category: Category;
  description: string;
  tracking: boolean;
  domains: string[];
  counts: Record<ConsentState, number>;
  firstMs: number | null;
  assessment: Assessment;
}

/** One row per matched tracker, plus one per unclassified third-party registrable domain. */
export function serviceRows(r: ScanReport): ServiceRow[] {
  const rows = new Map<string, ServiceRow>();
  for (const q of r.requests) {
    if (!q.thirdParty && !q.trackerId) continue;
    const t = q.trackerId ? r.trackers.find((x) => x.id === q.trackerId) : undefined;
    const key = t?.id ?? `unknown:${q.registrableDomain}`;
    let row = rows.get(key);
    if (!row) {
      const category: Category = t?.category ?? 'Unknown';
      row = {
        key, name: t?.name ?? q.registrableDomain, provider: t?.provider ?? 'Not in the tracker library',
        category, description: t?.description ?? 'Not in the tracker library. Classify it to make future scans exact.',
        tracking: TRACKING_CATEGORIES.has(category), domains: [],
        counts: { BEFORE_INTERACTION: 0, REJECTED: 0, ACCEPTED: 0 }, firstMs: null, assessment: 'Not tracking',
      };
      rows.set(key, row);
    }
    row.counts[q.consentState]++;
    if (!row.domains.includes(q.hostname)) row.domains.push(q.hostname);
    if (row.firstMs === null || q.timeMs < row.firstMs) row.firstMs = q.timeMs;
  }
  for (const row of rows.values()) {
    const withoutConsent = row.counts.BEFORE_INTERACTION + row.counts.REJECTED > 0;
    row.assessment = row.category === 'Unknown' ? 'Needs classifying'
      : row.tracking && withoutConsent ? 'Potential issue'
      : row.tracking ? 'After consent only' : 'Not tracking';
  }
  const order: Assessment[] = ['Potential issue', 'Needs classifying', 'After consent only', 'Not tracking'];
  return [...rows.values()].sort((a, b) => order.indexOf(a.assessment) - order.indexOf(b.assessment) || a.name.localeCompare(b.name));
}

export type DomainFilter = 'all' | 'third' | 'tracking' | 'unknown';
export interface DomainRow {
  hostname: string;
  thirdParty: boolean;
  service: string;
  category: Category | null;
  types: string[];
  count: number;
  tracking: boolean;
}

export function domainRows(r: ScanReport, state: ConsentState, filter: DomainFilter): DomainRow[] {
  const rows = new Map<string, DomainRow>();
  for (const q of r.requests) {
    if (q.consentState !== state) continue;
    const category = categoryOf(q, r);
    let row = rows.get(q.hostname);
    if (!row) {
      const t = q.trackerId ? r.trackers.find((x) => x.id === q.trackerId) : undefined;
      row = {
        hostname: q.hostname, thirdParty: q.thirdParty,
        service: t?.name ?? (q.thirdParty ? 'Not in the library' : 'The site itself'),
        category, types: [], count: 0, tracking: isTracking(q, r),
      };
      rows.set(q.hostname, row);
    }
    row.count++;
    if (!row.types.includes(q.resourceType)) row.types.push(q.resourceType);
  }
  const keep = (d: DomainRow) =>
    filter === 'all' || (filter === 'third' && d.thirdParty) || (filter === 'tracking' && d.tracking)
    || (filter === 'unknown' && d.thirdParty && d.category === 'Unknown');
  return [...rows.values()].filter(keep).sort((a, b) => b.count - a.count);
}

export interface CookieRow {
  name: string;
  domain: string;
  thirdParty: boolean;
  category: Category;
  tracking: boolean;
  expires: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string | null;
  /** Security attributes are judged only on cookies the site itself needs; vendors choose their own. */
  missingSecure: boolean;
  missingSameSite: boolean;
  setIn: Record<ConsentState, boolean>;
}

export function cookieRows(r: ScanReport): CookieRow[] {
  const rows = new Map<string, CookieRow>();
  for (const c of r.cookies) {
    const key = `${c.name}|${c.domain}|${c.path}`;
    let row = rows.get(key);
    if (!row) {
      const tracking = TRACKING_CATEGORIES.has(c.category);
      row = {
        name: c.name, domain: c.domain, thirdParty: c.thirdParty, category: c.category, tracking,
        expires: c.expires, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
        missingSecure: !tracking && !c.secure, missingSameSite: !tracking && c.sameSite === null,
        setIn: { BEFORE_INTERACTION: false, REJECTED: false, ACCEPTED: false },
      };
      rows.set(key, row);
    }
    row.setIn[c.consentState] = true;
  }
  return [...rows.values()];
}

export interface Lane {
  state: ConsentState;
  ticks: { x: number; cls: string }[];
  choiceX: number | null;
  tracking: number;
  thirdParty: number;
  withoutConsent: boolean;
}

/** Third-party requests placed on a 0-100 % axis over the observation window of each state. */
export function lanes(r: ScanReport): Lane[] {
  const windowMs = r.observationSeconds * 1000;
  return statesOf(r).map((state) => {
    const third = r.requests.filter((q) => q.consentState === state && q.thirdParty && q.timeMs <= windowMs);
    const tracking = third.filter((q) => isTracking(q, r)).length;
    const run = r.states.find((s) => s.consentState === state);
    return {
      state,
      ticks: third.map((q) => {
        const c = categoryOf(q, r);
        return { x: (q.timeMs / windowMs) * 100, cls: c ? CATEGORY_TICK[c] : '' };
      }),
      choiceX: run?.bannerClickedAtMs != null ? (run.bannerClickedAtMs / windowMs) * 100 : null,
      tracking,
      thirdParty: third.length,
      withoutConsent: state !== 'ACCEPTED' && tracking > 0,
    };
  });
}

/** Third-party request counts per category for one state, largest first. */
export function categoryMix(r: ScanReport, state: ConsentState): { category: Category; count: number; names: string[] }[] {
  const mix = new Map<Category, { count: number; names: Set<string> }>();
  for (const q of r.requests) {
    if (q.consentState !== state || !q.thirdParty) continue;
    const c = categoryOf(q, r) ?? 'Unknown';
    const t = r.trackers.find((x) => x.id === q.trackerId);
    const m = mix.get(c) ?? { count: 0, names: new Set<string>() };
    m.count++;
    m.names.add(t?.name ?? q.registrableDomain);
    mix.set(c, m);
  }
  return [...mix.entries()].map(([category, m]) => ({ category, count: m.count, names: [...m.names] }))
    .sort((a, b) => b.count - a.count);
}
