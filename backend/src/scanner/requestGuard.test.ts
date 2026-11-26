import { describe, expect, it } from 'vitest';
import { createRequestGuard } from './requestGuard.ts';

describe('createRequestGuard', () => {
  const dns: Record<string, string[]> = {
    'cdn.example.com': ['93.184.215.14'],
    'rebind.example.com': ['93.184.215.14', '10.0.0.5'], // one private answer is enough to refuse
    'internal.example.com': ['192.168.1.10'],
  };
  let lookups = 0;
  const guard = createRequestGuard(async (h) => { lookups++; if (!dns[h]) throw new Error('ENOTFOUND'); return dns[h]; });

  it.each([
    ['https://cdn.example.com/app.js', true],
    ['https://rebind.example.com/', false],
    ['http://internal.example.com/admin', false],
    ['http://169.254.169.254/latest/meta-data/', false],
    ['http://127.0.0.1:5432/', false],
    ['http://[::1]/', false],
    ['https://unknown.example.com/', false],
    ['ws://cdn.example.com/socket', false],
    ['ftp://cdn.example.com/file', false],
  ])('%s -> %s', async (url, allowed) => {
    expect(await guard(new URL(url))).toBe(allowed);
  });

  it('looks each hostname up once', async () => {
    lookups = 0;
    const g = createRequestGuard(async () => { lookups++; return ['93.184.215.14']; });
    await Promise.all([g(new URL('https://a.example.com/1')), g(new URL('https://a.example.com/2'))]);
    expect(lookups).toBe(1);
  });
});
