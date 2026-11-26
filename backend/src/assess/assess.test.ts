import { describe, expect, it } from 'vitest';
import type { ConsentState, NetworkRequest, ScanCookie, StateRun } from '../scans/model.ts';
import { assess, type AssessInput } from './assess.ts';

const NOW = 1_800_000_000;
const DAY = 86400;

function req(consentState: ConsentState, hostname: string, timeMs: number, trackerId: string | null, thirdParty = true): NetworkRequest {
  return { consentState, url: `https://${hostname}/x`, hostname, registrableDomain: hostname.split('.').slice(-2).join('.'), method: 'GET', resourceType: 'script', thirdParty, timeMs, trackerId };
}
function cookie(consentState: ConsentState, name: string, extra: Partial<ScanCookie> = {}): ScanCookie {
  return { consentState, name, domain: 'shop.example', path: '/', expires: -1, secure: true, httpOnly: true, sameSite: 'Lax', thirdParty: false, category: 'Unknown', trackerId: null, ...extra };
}
const states = (clicked: number | null): StateRun[] => [
  { consentState: 'BEFORE_INTERACTION', bannerFound: true, bannerClickedAtMs: null },
  { consentState: 'REJECTED', bannerFound: clicked !== null, bannerClickedAtMs: clicked },
  { consentState: 'ACCEPTED', bannerFound: clicked !== null, bannerClickedAtMs: clicked },
];
const base = (over: Partial<AssessInput>): AssessInput => ({ isHttps: true, scannedAtSec: NOW, states: states(1400), requests: [], cookies: [], ...over });
const titles = (r: ReturnType<typeof assess>) => r.findings.map((f) => f.title);

describe('assess', () => {
  it('gives a clean site score 0 and no findings', () => {
    const r = assess(base({ requests: [req('BEFORE_INTERACTION', 'shop.example', 100, null, false)] }));
    expect(r.findings).toEqual([]);
    expect(r.score).toEqual({ value: 0, breakdown: [] });
  });

  it('flags tracking before consent and after reject, but not after accept', () => {
    const r = assess(base({
      requests: [
        req('BEFORE_INTERACTION', 'region1.google-analytics.com', 1800, 'ga4'),
        req('BEFORE_INTERACTION', 'region1.google-analytics.com', 2300, 'ga4'),
        req('REJECTED', 'static.hotjar.com', 2000, 'hotjar'),
        req('ACCEPTED', 'region1.google-analytics.com', 2000, 'ga4'),
      ],
    }));
    expect(titles(r)).toEqual(['Tracking request observed before consent', 'Tracking continued after consent was rejected']);
    expect(r.findings[0]!.evidence).toEqual(['Google Analytics 4: 2 requests, first at 1.8 s']);
    expect(r.score.value).toBe(16);
  });

  it('only counts reject-state requests that came after the click', () => {
    const r = assess(base({ requests: [req('REJECTED', 'region1.google-analytics.com', 900, 'ga4')] }));
    expect(titles(r)).not.toContain('Tracking continued after consent was rejected');
  });

  it('never claims a rejection when no reject button was clicked', () => {
    const r = assess(base({ states: states(null), requests: [req('REJECTED', 'region1.google-analytics.com', 5000, 'ga4')] }));
    expect(titles(r)).toEqual(['Consent banner button not found']);
  });

  it('does not count functional services as tracking', () => {
    const r = assess(base({ requests: [req('BEFORE_INTERACTION', 'fonts.gstatic.com', 300, 'gfonts')] }));
    expect(r.findings).toEqual([]);
  });

  it('adds exposure for ad and social services after accepting, without a finding', () => {
    const r = assess(base({ requests: [req('ACCEPTED', 'ad.doubleclick.net', 2200, 'doubleclick'), req('ACCEPTED', 'connect.facebook.net', 1700, 'metapixel')] }));
    expect(r.findings).toEqual([]);
    expect(r.score.breakdown).toEqual([{ points: 6, reason: 'Ad and social after accepting', detail: 'DoubleClick, Meta Pixel' }]);
  });

  it('lists unclassified third parties', () => {
    const r = assess(base({ requests: [req('BEFORE_INTERACTION', 'cdn.metrics-relay.example', 3100, null)] }));
    expect(r.findings[0]).toMatchObject({ title: 'Unclassified third party', evidence: ['metrics-relay.example'] });
  });

  it('flags long-lived tracking cookies set before consent', () => {
    const r = assess(base({ cookies: [
      cookie('BEFORE_INTERACTION', '_ga', { category: 'Analytics', trackerId: 'ga4', expires: NOW + 400 * DAY, secure: false }),
      cookie('ACCEPTED', '_fbp', { category: 'Social', trackerId: 'metapixel', expires: NOW + 400 * DAY }),
    ] }));
    expect(r.findings).toEqual([expect.objectContaining({ title: 'Tracking cookie kept over 12 months', evidence: ['_ga, 400 days'] })]);
  });

  it('checks Secure and SameSite only on the site’s own non-tracking cookies, once per cookie', () => {
    const cart = { secure: false, sameSite: null };
    const r = assess(base({ cookies: [
      cookie('BEFORE_INTERACTION', 'shop_cart', cart),
      cookie('ACCEPTED', 'shop_cart', cart),
      cookie('BEFORE_INTERACTION', 'IDE', { domain: '.doubleclick.net', thirdParty: true, secure: false, sameSite: null }),
    ] }));
    expect(titles(r)).toEqual(['Cookie without Secure attribute', 'Cookie without SameSite attribute']);
    expect(r.findings[0]!.evidence).toEqual(['shop_cart']);
    expect(r.score.value).toBe(2);
  });

  it('does not ask for Secure on a plain http site', () => {
    const r = assess(base({ isHttps: false, cookies: [cookie('BEFORE_INTERACTION', 'sid', { secure: false })] }));
    expect(r.findings).toEqual([]);
  });

  it('caps every rule and the total', () => {
    const many = Array.from({ length: 20 }, (_, i) => req('BEFORE_INTERACTION', `cdn${i}.unknown${i}.example`, 100, null));
    const r = assess(base({ requests: many }));
    expect(r.score.breakdown.find((b) => b.reason === 'Unclassified third parties')!.points).toBe(8);
    expect(r.score.breakdown.find((b) => b.reason === 'Third-party domains over 10')!.points).toBe(10);
    expect(r.score.value).toBeLessThanOrEqual(100);
  });
});
