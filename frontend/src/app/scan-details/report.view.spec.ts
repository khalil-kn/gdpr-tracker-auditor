import { demoReport } from '../core/api/demo-data';
import { cookieRows, domainRows, lanes, serviceRows, stateTotals } from './report.view';

describe('report view', () => {
  const r = demoReport('t', 'shop.example', '2026-11-20T10:00:00Z');

  it('counts tracking per consent state', () => {
    const [before, rejected, accepted] = stateTotals(r);
    expect(before.trackingRequests).toBe(5); // GA4 3 + Hotjar 2
    expect(rejected.trackingRequests).toBe(5);
    expect(accepted.trackingRequests).toBe(13); // GA4 5, Hotjar 3, DoubleClick 2, Meta 3
    expect(before.trackers).toBe(2);
  });

  it('flags tracking without consent and unknown services', () => {
    const rows = serviceRows(r);
    expect(rows.find((s) => s.name === 'Google Analytics 4')?.assessment).toBe('Potential issue');
    expect(rows.find((s) => s.name === 'DoubleClick')?.assessment).toBe('After consent only');
    expect(rows.find((s) => s.name === 'Google Fonts')?.assessment).toBe('Not tracking');
    expect(rows.find((s) => s.category === 'Unknown')?.assessment).toBe('Needs classifying');
    expect(rows[0].assessment).toBe('Potential issue');
  });

  it('filters domains by state and kind', () => {
    expect(domainRows(r, 'BEFORE_INTERACTION', 'tracking').map((d) => d.hostname))
      .not.toContain('ad.doubleclick.net');
    expect(domainRows(r, 'ACCEPTED', 'tracking').map((d) => d.hostname)).toContain('ad.doubleclick.net');
    expect(domainRows(r, 'ACCEPTED', 'unknown').map((d) => d.hostname)).toEqual(['cdn.metrics-relay.example']);
    expect(domainRows(r, 'ACCEPTED', 'third').some((d) => !d.thirdParty)).toBe(false);
  });

  it('judges security attributes only on cookies the site needs', () => {
    const rows = cookieRows(r);
    const cart = rows.find((c) => c.name === 'shop_cart')!;
    expect(cart.missingSecure && cart.missingSameSite).toBe(true);
    expect(rows.find((c) => c.name === '_ga')!.missingSecure).toBe(false); // vendor cookie, reported differently
    expect(rows.find((c) => c.name === 'CookieConsent')!.setIn).toEqual({ BEFORE_INTERACTION: false, REJECTED: true, ACCEPTED: true });
  });

  it('places requests on the observation axis and marks the banner click', () => {
    const [before, rejected] = lanes(r);
    expect(before.choiceX).toBeNull();
    expect(rejected.choiceX).toBeCloseTo(9.33, 1);
    expect(before.withoutConsent).toBe(true);
    expect(before.ticks.every((t) => t.x >= 0 && t.x <= 100)).toBe(true);
  });
});
