// Instant feedback while typing. This is UX only: the browser cannot resolve DNS, so the backend's
// security/urlGuard.ts stays the real SSRF defence and re-checks every address and every request.

export type UrlCheck =
  | { kind: 'empty'; message: string }
  | { kind: 'scheme' | 'private' | 'metadata' | 'host'; message: string }
  | { kind: 'ok'; url: string; host: string };

const PRIVATE_HOST =
  /^(localhost|.*\.localhost|.*\.local|.*\.internal|127(\.\d+){3}|10(\.\d+){3}|192\.168(\.\d+){2}|172\.(1[6-9]|2\d|3[01])(\.\d+){2}|169\.254(\.\d+){2}|0\.0\.0\.0|::1?|f[cd][0-9a-f:]*|fe80:[0-9a-f:]*)$/i;
const METADATA_HOST = /^(169\.254\.169\.254|metadata\.google\.internal|fd00:ec2::254)$/i;

export function checkUrl(raw: string): UrlCheck {
  const v = raw.trim();
  if (!v) return { kind: 'empty', message: 'Paste the address of a public website, like example.com.' };
  // "host:port" is not a scheme; "x://" and the dangerous scheme-only forms are.
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) || /^(javascript|data|file|mailto|about|blob|vbscript):/i.test(v);
  const withScheme = hasScheme ? v : `https://${v}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return { kind: 'host', message: 'Enter a full domain, like example.com.' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { kind: 'scheme', message: 'Only http and https addresses can be scanned.' };
  }
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (METADATA_HOST.test(host)) return { kind: 'metadata', message: 'This is a cloud metadata address. The scanner never visits it.' };
  if (PRIVATE_HOST.test(host)) return { kind: 'private', message: 'This address points to a private or local network, so the scanner won’t visit it.' };
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return { kind: 'host', message: 'Enter a full domain, like example.com.' };
  if (u.username || u.password) return { kind: 'host', message: 'Addresses with a username or password are not scanned.' };
  return { kind: 'ok', url: u.href, host };
}
