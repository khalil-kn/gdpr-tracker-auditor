// Pure functions behind the Compare page: what changed between two reports of a site.
// "before" is the older scan, "after" the newer one. Unit-tested in compare.view.spec.ts.
import { Category, ScanReport, Severity } from '../core/models/scan.models';
import { Assessment, serviceRows, stateTotals } from '../scan-details/report.view';

export type Change = 'new' | 'gone' | 'same';

export interface ServiceChange {
  key: string;
  name: string;
  category: Category;
  change: Change;
  before: Assessment | null;
  after: Assessment | null;
}

export interface FindingChange {
  title: string;
  severity: Severity;
  change: Change;
}

export interface Comparison {
  scoreBefore: number | null;
  scoreAfter: number | null;
  scoreDelta: number | null;
  services: ServiceChange[];
  findings: FindingChange[];
  /** Busiest consent state's third-party domain count, the same measure the score uses. */
  thirdPartyBefore: number;
  thirdPartyAfter: number;
}

const maxThirdParty = (r: ScanReport) => Math.max(0, ...stateTotals(r).map((t) => t.thirdPartyDomains));
const ORDER: Change[] = ['new', 'gone', 'same'];
const SEVERITY: Severity[] = ['HIGH', 'MEDIUM', 'LOW'];

export function compareReports(before: ScanReport, after: ScanReport): Comparison {
  const a = new Map(serviceRows(before).map((s) => [s.key, s]));
  const b = new Map(serviceRows(after).map((s) => [s.key, s]));
  const services: ServiceChange[] = [...new Set([...a.keys(), ...b.keys()])].map((key): ServiceChange => {
    const x = a.get(key), y = b.get(key), s = (y ?? x)!;
    return {
      key, name: s.name, category: s.category,
      change: x && y ? 'same' : y ? 'new' : 'gone',
      before: x?.assessment ?? null, after: y?.assessment ?? null,
    };
  }).sort((p, q) => ORDER.indexOf(p.change) - ORDER.indexOf(q.change) || p.name.localeCompare(q.name));

  const fa = new Map(before.findings.map((f) => [f.title, f]));
  const fb = new Map(after.findings.map((f) => [f.title, f]));
  const findings: FindingChange[] = [...new Set([...fa.keys(), ...fb.keys()])].map((title): FindingChange => {
    const f = (fb.get(title) ?? fa.get(title))!;
    return { title, severity: f.severity, change: fa.has(title) && fb.has(title) ? 'same' : fb.has(title) ? 'new' : 'gone' };
  }).sort((p, q) => ORDER.indexOf(p.change) - ORDER.indexOf(q.change) || SEVERITY.indexOf(p.severity) - SEVERITY.indexOf(q.severity));

  const sa = before.privacyScore?.value ?? null, sb = after.privacyScore?.value ?? null;
  return {
    scoreBefore: sa, scoreAfter: sb, scoreDelta: sa !== null && sb !== null ? sb - sa : null,
    services, findings, thirdPartyBefore: maxThirdParty(before), thirdPartyAfter: maxThirdParty(after),
  };
}
