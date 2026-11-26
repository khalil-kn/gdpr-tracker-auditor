// SSRF defence during the scan: every request the page makes (redirects, scripts, images, fetches)
// is checked before Chromium sends it. The same rules as the URL submitted to POST /api/scans.

import { isIP } from 'node:net';
import { isBlockedAddress } from '../security/ipRanges.ts';
import { dnsLookup, type LookupFn } from '../security/urlGuard.ts';

export type RequestGuard = (url: URL) => Promise<boolean>;

/**
 * Allows http(s) requests whose hostname resolves only to public addresses. Results are cached per
 * hostname for the scan, so a page with 300 requests to 20 hosts costs 20 lookups.
 * This is the first check, made before the request leaves Chromium. A DNS-rebinding server could still
 * answer "public" here and "private" later, so the egress proxy (egressProxy.ts) checks again on the
 * connection it actually opens: the browser itself never resolves a name.
 */
export function createRequestGuard(resolve: LookupFn = dnsLookup): RequestGuard {
  const cache = new Map<string, Promise<boolean>>();
  return (url) => {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return Promise.resolve(false);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    let verdict = cache.get(host);
    if (!verdict) {
      verdict = isIP(host)
        ? Promise.resolve(!isBlockedAddress(host))
        : resolve(host).then((ips) => ips.length > 0 && !ips.some(isBlockedAddress), () => false);
      cache.set(host, verdict);
    }
    return verdict;
  };
}
