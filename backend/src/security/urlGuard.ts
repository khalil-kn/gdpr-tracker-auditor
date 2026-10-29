// SSRF defence for user-submitted URLs.
// Part 1: reject anything that isn't a plain web address.
// Part 2: reject hostnames that point to private or reserved IP addresses.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isBlockedAddress } from './ipRanges.ts';

export const MAX_URL_LENGTH = 2048;
const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const ALLOWED_PORTS = ['', '80', '443']; // '' = the default port of the scheme

export type UrlCheck =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

export function parseTargetUrl(input: string): UrlCheck {
  const value = input.trim();

  if (value.length === 0) {
    return { ok: false, reason: 'URL is required' };
  }
  if (value.length > MAX_URL_LENGTH) {
    return { ok: false, reason: `URL is longer than ${MAX_URL_LENGTH} characters` };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'Not a valid URL' };
  }

  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    return { ok: false, reason: 'Only http and https URLs are allowed' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'URLs with a username or password are not allowed' };
  }
  if (!ALLOWED_PORTS.includes(url.port)) {
    return { ok: false, reason: 'Only ports 80 and 443 are allowed' };
  }

  return { ok: true, url };
}

// ---- Part 2: where does the hostname really point? ----

export type LookupFn = (hostname: string) => Promise<string[]>;

/** Real DNS lookup: every IPv4 and IPv6 address the name resolves to. */
export const dnsLookup: LookupFn = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
};

export type TargetCheck =
  | { ok: true; url: URL; addresses: string[] }
  | { ok: false; reason: string };

/**
 * Full check of a user-submitted URL: format rules first, then every address
 * the hostname resolves to must be public. `resolve` is injectable for tests.
 */
export async function checkTargetUrl(input: string, resolve: LookupFn = dnsLookup): Promise<TargetCheck> {
  const parsed = parseTargetUrl(input);
  if (!parsed.ok) return parsed;

  const { url } = parsed;
  const host = url.hostname.replace(/^\[|\]$/g, ''); // IPv6 hosts come wrapped in [ ]

  let addresses: string[];
  if (isIP(host)) {
    addresses = [host]; // already an IP, nothing to resolve
  } else {
    try {
      addresses = await resolve(host);
    } catch {
      return { ok: false, reason: 'Could not resolve the hostname' };
    }
  }

  if (addresses.length === 0) {
    return { ok: false, reason: 'Could not resolve the hostname' };
  }
  if (addresses.some(isBlockedAddress)) {
    return { ok: false, reason: 'The hostname points to a private or reserved network address' };
  }
  return { ok: true, url, addresses };
}