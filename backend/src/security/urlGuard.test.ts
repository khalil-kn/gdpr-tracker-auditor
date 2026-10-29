import { describe, expect, it } from 'vitest';
import { checkTargetUrl, MAX_URL_LENGTH, parseTargetUrl } from './urlGuard.ts';

describe('parseTargetUrl', () => {
  it.each([
    'https://example.com',
    'http://example.com/page?x=1',
    'https://example.com:443/',
    '  https://example.com  ',
  ])('accepts %s', (input) => {
    expect(parseTargetUrl(input).ok).toBe(true);
  });

  it.each([
    ['', 'URL is required'],
    ['   ', 'URL is required'],
    ['example.com', 'Not a valid URL'],
    ['not a url', 'Not a valid URL'],
    ['file:///etc/passwd', 'Only http and https URLs are allowed'],
    ['javascript:alert(1)', 'Only http and https URLs are allowed'],
    ['ftp://example.com', 'Only http and https URLs are allowed'],
    ['https://admin:secret@example.com', 'URLs with a username or password are not allowed'],
    ['http://example.com:5432', 'Only ports 80 and 443 are allowed'],
    ['http://example.com:8080', 'Only ports 80 and 443 are allowed'],
  ])('rejects %s', (input, reason) => {
    expect(parseTargetUrl(input)).toEqual({ ok: false, reason });
  });

  it('rejects URLs that are too long', () => {
    const long = 'https://example.com/' + 'a'.repeat(MAX_URL_LENGTH);
    expect(parseTargetUrl(long).ok).toBe(false);
  });
});

describe('checkTargetUrl', () => {
  // A fake DNS: tests never touch the network, and we choose what each name "resolves" to.
  const fakeDns = (records: Record<string, string[]>) => async (hostname: string) => {
    const found = records[hostname];
    if (!found) throw new Error('ENOTFOUND');
    return found;
  };
  const dns = fakeDns({
    'example.com': ['93.184.215.14'],
    'internal.attacker.com': ['127.0.0.1'],
    'mixed.attacker.com': ['93.184.215.14', '10.0.0.5'],
    'metadata.attacker.com': ['169.254.169.254'],
  });

  it('accepts a hostname that resolves to a public address', async () => {
    const result = await checkTargetUrl('https://example.com', dns);
    expect(result).toMatchObject({ ok: true, addresses: ['93.184.215.14'] });
  });

  it('passes format errors through from part 1', async () => {
    expect(await checkTargetUrl('file:///etc/passwd', dns)).toEqual({
      ok: false,
      reason: 'Only http and https URLs are allowed',
    });
  });

  it.each([
    'http://internal.attacker.com', // innocent-looking name pointing at localhost
    'http://mixed.attacker.com', // one public and one private address
    'http://metadata.attacker.com', // cloud metadata
    'http://127.0.0.1',
    'http://localhost', // fake DNS doesn't know it, so it fails to resolve
    'http://2130706433', // 127.0.0.1 written as one number
    'http://0x7f.1', // 127.0.0.1 in hexadecimal
    'http://[::1]', // IPv6 localhost
    'http://[::ffff:127.0.0.1]', // IPv4 localhost inside IPv6
    'http://192.168.1.1',
  ])('rejects %s', async (input) => {
    const result = await checkTargetUrl(input, dns);
    expect(result.ok).toBe(false);
  });

  it('explains why a private address is rejected', async () => {
    expect(await checkTargetUrl('http://internal.attacker.com', dns)).toEqual({
      ok: false,
      reason: 'The hostname points to a private or reserved network address',
    });
  });

  it('rejects hostnames that do not resolve', async () => {
    expect(await checkTargetUrl('https://does-not-exist.test', dns)).toEqual({
      ok: false,
      reason: 'Could not resolve the hostname',
    });
  });
});