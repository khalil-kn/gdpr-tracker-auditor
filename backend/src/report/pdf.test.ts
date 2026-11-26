import { describe, expect, it } from 'vitest';
import type { ScanReport } from '../scans/model.ts';
import { esc, pdfFileName, renderReportHtml, reportPdf } from './pdf.ts';

const report: ScanReport = {
  id: '6f1c1a8e-0000-4000-8000-000000000001', url: 'https://shop.example/', host: 'shop.example', status: 'COMPLETED',
  consentStates: ['BEFORE_INTERACTION', 'REJECTED'], observationSeconds: 15, viewport: 'desktop',
  createdAt: '2026-11-26T10:00:00.000Z', completedAt: '2026-11-26T10:01:20.000Z', failureReason: null, score: 18, findingCount: 1,
  states: [
    { consentState: 'BEFORE_INTERACTION', bannerFound: true, bannerClickedAtMs: null },
    { consentState: 'REJECTED', bannerFound: true, bannerClickedAtMs: 1400 },
  ],
  requests: [
    { consentState: 'BEFORE_INTERACTION', url: 'https://www.google-analytics.com/g/collect', hostname: 'www.google-analytics.com', registrableDomain: 'google-analytics.com', method: 'POST', resourceType: 'fetch', thirdParty: true, timeMs: 900, trackerId: 'ga4' },
    { consentState: 'REJECTED', url: 'https://evil.example/x', hostname: 'evil.example', registrableDomain: 'evil.example', method: 'GET', resourceType: 'script', thirdParty: true, timeMs: 2000, trackerId: null },
  ],
  // A hostile site picks its own cookie names: this one tries to inject markup and a script.
  cookies: [{ consentState: 'BEFORE_INTERACTION', name: '<img src=x onerror=alert(1)>', domain: '.shop.example', path: '/', expires: -1, secure: false, httpOnly: false, sameSite: null, thirdParty: false, category: 'Unknown', trackerId: null }],
  trackers: [{ id: 'ga4', name: 'Google Analytics 4', provider: 'Google', category: 'Analytics', description: '', domains: ['google-analytics.com'] }],
  findings: [{ id: '1', severity: 'HIGH', title: 'Tracking request observed before consent', description: 'Tracking services sent requests.', consentState: 'BEFORE_INTERACTION', evidence: ['Google Analytics 4: 1 request, first at 0.9 s'] }],
  privacyScore: { value: 18, breakdown: [{ points: 8, reason: 'Tracking before consent', detail: 'Google Analytics 4' }] },
};

describe('PDF report', () => {
  it('escapes every value from the scanned site', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    const html = renderReportHtml(report);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('carries the score, the findings, each state and each service', () => {
    const html = renderReportHtml(report);
    expect(html).toContain('<b>18</b>');
    expect(html).toContain('Tracking request observed before consent');
    expect(html).toContain('Clicked at 1.4 s');
    expect(html).toContain('Google Analytics 4');
    expect(html).toContain('evil.example');
    expect(html).toContain('not legal advice');
  });

  it('names the file safely', () => {
    expect(pdfFileName({ ...report, host: 'a/b..\\c' })).toBe('tracker-audit-a_b.._c-2026-11-26.pdf');
  });

  it('prints a real PDF', async () => {
    const pdf = await reportPdf(report);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(10_000);
  });
});
