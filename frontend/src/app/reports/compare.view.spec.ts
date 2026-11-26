import { demoReport } from '../core/api/demo-data';
import { ScanReport } from '../core/models/scan.models';
import { compareReports } from './compare.view';

describe('compareReports', () => {
  const before = demoReport('a', 'shop.example', '2026-11-20T10:00:00Z');

  it('reports no change for the same report', () => {
    const c = compareReports(before, before);
    expect(c.scoreDelta).toBe(0);
    expect(c.services.every((s) => s.change === 'same')).toBe(true);
    expect(c.findings.every((f) => f.change === 'same')).toBe(true);
  });

  it('finds services and findings that appeared or went away', () => {
    // The newer scan: Hotjar removed, one finding fixed, score lower.
    const after: ScanReport = {
      ...before,
      id: 'b',
      requests: before.requests.filter((q) => q.trackerId !== 'hotjar'),
      findings: before.findings.slice(1),
      privacyScore: { value: (before.privacyScore?.value ?? 0) - 10, breakdown: [] },
    };
    const c = compareReports(before, after);
    expect(c.scoreDelta).toBe(-10);
    expect(c.services.find((s) => s.name === 'Hotjar')?.change).toBe('gone');
    expect(c.findings.find((f) => f.title === before.findings[0]!.title)?.change).toBe('gone');
    expect(c.services[0]!.change).not.toBe('same'); // changes are listed first

    const reverse = compareReports(after, before);
    expect(reverse.services.find((s) => s.name === 'Hotjar')?.change).toBe('new');
  });
});
