// Development-only sample data, used by demoApiInterceptor while the backend is not built yet.
// Domains use the reserved .example TLD so no real website is described.
import {
  Category, ConsentState, Finding, NetworkRequest, ScanCookie, ScanReport, ScanSummary, Tracker,
} from '../models/scan.models';

const TRACKERS: Tracker[] = [
  { id: 'ga4', name: 'Google Analytics 4', provider: 'Google', category: 'Analytics', description: 'Measures visits and behaviour. Sends page views and events to Google.', domains: ['google-analytics.com'] },
  { id: 'hotjar', name: 'Hotjar', provider: 'Hotjar', category: 'Analytics', description: 'Session recording and heatmaps. Can capture clicks, scrolling and form interaction.', domains: ['hotjar.com'] },
  { id: 'gtm', name: 'Google Tag Manager', provider: 'Google', category: 'Functional', description: 'Loads other tags. Not a tracker itself, but it is what loads Google Analytics here.', domains: ['googletagmanager.com'] },
  { id: 'cookiebot', name: 'Cookiebot', provider: 'Usercentrics', category: 'Essential', description: 'The consent banner. Stores the visitor’s choice.', domains: ['cookiebot.com'] },
  { id: 'gfonts', name: 'Google Fonts', provider: 'Google', category: 'Functional', description: 'Web fonts served by Google. Each request shares the visitor’s IP address with Google.', domains: ['googleapis.com', 'gstatic.com'] },
  { id: 'doubleclick', name: 'DoubleClick', provider: 'Google', category: 'Advertising', description: 'Ad serving, conversion and retargeting for Google advertising.', domains: ['doubleclick.net'] },
  { id: 'metapixel', name: 'Meta Pixel', provider: 'Meta', category: 'Social', description: 'Reports visits and conversions to Meta for ad targeting and measurement.', domains: ['facebook.net', 'facebook.com'] },
];

// [hostname, registrable domain, tracker id, resource type, method, [before, rejected, accepted] start times in seconds]
type Row = [string, string, string | null, string, string, [number[], number[], number[]]];
const ROWS: Row[] = [
  ['region1.google-analytics.com', 'google-analytics.com', 'ga4', 'fetch', 'POST', [[1.8, 2.3, 9.6], [1.9, 2.4, 9.7], [1.9, 2.4, 6.2, 9.7, 13.1]]],
  ['static.hotjar.com', 'hotjar.com', 'hotjar', 'script', 'GET', [[2.0], [2.1], [2.0]]],
  ['script.hotjar.com', 'hotjar.com', 'hotjar', 'fetch', 'POST', [[2.6], [2.7], [2.7, 7.8]]],
  ['www.googletagmanager.com', 'googletagmanager.com', 'gtm', 'script', 'GET', [[0.6, 0.7], [0.6, 0.7], [0.6, 0.7]]],
  ['consent.cookiebot.com', 'cookiebot.com', 'cookiebot', 'script', 'GET', [[0.4, 0.5], [0.4, 0.5], [0.4, 0.5]]],
  ['fonts.googleapis.com', 'googleapis.com', 'gfonts', 'stylesheet', 'GET', [[0.3], [0.3], [0.3]]],
  ['fonts.gstatic.com', 'gstatic.com', 'gfonts', 'font', 'GET', [[0.35, 0.4], [0.35, 0.4], [0.35, 0.4]]],
  ['ad.doubleclick.net', 'doubleclick.net', 'doubleclick', 'image', 'GET', [[], [], [2.2, 11.0]]],
  ['connect.facebook.net', 'facebook.net', 'metapixel', 'script', 'GET', [[], [], [1.7]]],
  ['www.facebook.com', 'facebook.com', 'metapixel', 'image', 'GET', [[], [], [2.1, 8.3]]],
  ['cdn.metrics-relay.example', 'metrics-relay.example', null, 'fetch', 'POST', [[3.1], [3.1], [3.1]]],
];
const STATES: ConsentState[] = ['BEFORE_INTERACTION', 'REJECTED', 'ACCEPTED'];

function requests(host: string): NetworkRequest[] {
  const out: NetworkRequest[] = [];
  STATES.forEach((consentState, s) => {
    // First-party document and assets.
    [0.1, 0.2, 0.25, 0.5, 0.8, 1.0, 1.2, 4.0].forEach((t, i) => out.push({
      consentState, url: `https://${host}/asset-${i}`, hostname: host, registrableDomain: host,
      method: 'GET', resourceType: i === 0 ? 'document' : 'script', thirdParty: false, timeMs: t * 1000, trackerId: null,
    }));
    for (const [hostname, registrableDomain, trackerId, resourceType, method, times] of ROWS) {
      for (const t of times[s]) out.push({
        consentState, url: `https://${hostname}/collect`, hostname, registrableDomain, method, resourceType,
        thirdParty: true, timeMs: t * 1000, trackerId,
      });
    }
  });
  return out;
}

// [name, domain, category, tracker, days (-1 session), secure, httpOnly, sameSite, states set]
type CookieRow = [string, string, Category, string | null, number, boolean, boolean, ScanCookie['sameSite'], string];
const COOKIES: CookieRow[] = [
  ['shop_session', '', 'Essential', null, -1, true, true, 'Lax', 'BRA'],
  ['shop_cart', '', 'Essential', null, 30, false, false, null, 'BRA'],
  ['CookieConsent', '', 'Essential', 'cookiebot', 365, true, false, 'Lax', 'RA'],
  ['_ga', '.', 'Analytics', 'ga4', 400, false, false, 'Lax', 'BRA'],
  ['_hjSessionUser_1', '.', 'Analytics', 'hotjar', 365, true, false, 'Lax', 'BRA'],
  ['_fbp', '.', 'Social', 'metapixel', 90, false, false, 'Lax', 'A'],
  ['IDE', '.doubleclick.net', 'Advertising', 'doubleclick', 390, true, true, 'None', 'A'],
];

function cookies(host: string, createdAt: string): ScanCookie[] {
  const now = Date.parse(createdAt) / 1000;
  const out: ScanCookie[] = [];
  for (const [name, d, category, trackerId, days, secure, httpOnly, sameSite, set] of COOKIES) {
    const domain = d === '' ? host : d === '.' ? `.${host}` : d;
    STATES.forEach((consentState, s) => {
      if (!set.includes('BRA'[s])) return;
      out.push({
        consentState, name, domain, path: '/', expires: days < 0 ? -1 : now + days * 86400, secure, httpOnly, sameSite,
        thirdParty: !domain.endsWith(host), category, trackerId,
      });
    });
  }
  return out;
}

const FINDINGS: Finding[] = [
  { id: 'f1', severity: 'HIGH', title: 'Tracking request observed before consent', description: 'Analytics trackers sent requests while the consent banner was still unanswered.', consentState: 'BEFORE_INTERACTION', evidence: ['Google Analytics 4: 3 requests, first at 1.8 s', 'Hotjar: 2 requests, first at 2.0 s'] },
  { id: 'f2', severity: 'HIGH', title: 'Tracking continued after consent was rejected', description: 'The same trackers kept sending requests after the scanner clicked Reject all.', consentState: 'REJECTED', evidence: ['Google Analytics 4: 3 requests', 'Hotjar: 2 requests'] },
  { id: 'f3', severity: 'MEDIUM', title: 'Unclassified third party in every state', description: 'This domain is not in the tracker library and receives a POST request in every consent state.', consentState: null, evidence: ['cdn.metrics-relay.example, 1 POST per state'] },
  { id: 'f4', severity: 'MEDIUM', title: 'Tracking cookie kept over 12 months', description: 'A tracking cookie set before consent is kept for more than a year.', consentState: 'BEFORE_INTERACTION', evidence: ['_ga, 400 days', '_hjSessionUser_1, 365 days'] },
  { id: 'f5', severity: 'LOW', title: 'Cookie without Secure attribute', description: 'The browser would also send this cookie over plain http.', consentState: null, evidence: ['shop_cart'] },
  { id: 'f6', severity: 'LOW', title: 'Cookie without SameSite attribute', description: 'The cookie relies on the browser default (Lax in current Chromium).', consentState: null, evidence: ['shop_cart'] },
];

export function demoReport(id: string, host: string, createdAt: string): ScanReport {
  return {
    id, url: `https://${host}/`, host, status: 'COMPLETED',
    consentStates: STATES, observationSeconds: 15, viewport: 'desktop',
    createdAt, completedAt: new Date(Date.parse(createdAt) + 112_000).toISOString(),
    failureReason: null, score: 58, findingCount: FINDINGS.length,
    states: [
      { consentState: 'BEFORE_INTERACTION', bannerFound: true, bannerClickedAtMs: null },
      { consentState: 'REJECTED', bannerFound: true, bannerClickedAtMs: 1400 },
      { consentState: 'ACCEPTED', bannerFound: true, bannerClickedAtMs: 1400 },
    ],
    requests: requests(host), cookies: cookies(host, createdAt), trackers: TRACKERS, findings: FINDINGS,
    privacyScore: {
      value: 58,
      breakdown: [
        { points: 16, reason: 'Tracking before consent', detail: 'Google Analytics 4, Hotjar' },
        { points: 16, reason: 'Tracking after Reject all', detail: 'The same 2 trackers' },
        { points: 9, reason: 'Ad and social after accepting', detail: 'DoubleClick, Meta Pixel' },
        { points: 4, reason: 'Unclassified third party', detail: 'cdn.metrics-relay.example' },
        { points: 6, reason: 'Long-lived tracking cookies', detail: '2 set before consent' },
        { points: 7, reason: 'Cookie weaknesses', detail: 'shop_cart: no Secure, no SameSite' },
      ],
    },
  };
}

export function demoSummaries(): ScanSummary[] {
  const strip = ({ requests, cookies, trackers, findings, privacyScore, states, ...s }: ScanReport): ScanSummary => s;
  return [
    strip(demoReport('demo-1', 'demo-shop.example', '2026-11-20T11:47:00Z')),
    {
      ...strip(demoReport('demo-3', 'slow-site.example', '2026-11-19T10:20:00Z')),
      status: 'FAILED', completedAt: null, score: null, findingCount: null,
      failureReason: 'The page did not finish loading within 30 seconds.',
    },
  ];
}
