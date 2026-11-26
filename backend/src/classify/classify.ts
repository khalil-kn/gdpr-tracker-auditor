import { getDomain } from 'tldts';
import type { Observation } from '../scanner/scanner.ts';
import type { Category, NetworkRequest, ScanCookie, Tracker } from '../scans/model.ts';
import { CONSENT_COOKIE, COOKIE_PATTERNS, TRACKERS } from './trackers.ts';

/**
 * eTLD+1 from the Public Suffix List: shop.example.co.uk -> example.co.uk, alice.github.io -> alice.github.io.
 * Falls back to the hostname itself for IPs and single-label names.
 */
export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^\./, '');
  return getDomain(host, { allowPrivateDomains: true }) ?? host;
}

export function trackerById(id: string): Tracker | undefined {
  return TRACKERS.find((t) => t.id === id);
}

/** The library entry whose domain is this hostname or one of its parents. */
export function matchTracker(hostname: string): Tracker | undefined {
  const host = hostname.toLowerCase().replace(/^\./, '');
  return TRACKERS.find((t) => t.domains.some((d) => host === d || host.endsWith('.' + d)));
}

export function classifyCookie(name: string, domain: string): { category: Category; trackerId: string | null } {
  const byName = COOKIE_PATTERNS.find(([re]) => re.test(name));
  const tracker = (byName && trackerById(byName[1])) ?? matchTracker(domain);
  if (tracker) return { category: tracker.category, trackerId: tracker.id };
  if (CONSENT_COOKIE.test(name)) return { category: 'Essential', trackerId: null };
  return { category: 'Unknown', trackerId: null };
}

/** Layer 2 over a whole scan: party, registrable domain and tracker for every observation. */
export function classifyObservation(obs: Observation, siteHost: string): { requests: NetworkRequest[]; cookies: ScanCookie[] } {
  const site = registrableDomain(siteHost);
  const requests = obs.requests.map((r): NetworkRequest => {
    const hostname = new URL(r.url).hostname.replace(/^\[|\]$/g, '');
    const domain = registrableDomain(hostname);
    return {
      ...r,
      hostname,
      registrableDomain: domain,
      thirdParty: domain !== site,
      trackerId: matchTracker(hostname)?.id ?? null,
    };
  });
  const cookies = obs.cookies.map((c): ScanCookie => ({
    ...c,
    thirdParty: registrableDomain(c.domain) !== site,
    ...classifyCookie(c.name, c.domain),
  }));
  return { requests, cookies };
}
