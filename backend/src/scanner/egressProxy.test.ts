// The egress proxy against DNS rebinding. Everything runs on 127.0.0.1; "public" and "private" are decided
// by a fake isBlocked, and names are resolved by a fake DNS, so the tests can play a rebinding server.

import { createServer, request, type Server } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanSite } from './scanner.ts';
import { BLOCKED_HEADER, startEgressProxy, type EgressProxy } from './egressProxy.ts';

let site: Server;
let port = 0;
const paths: string[] = [];
let internal: Server;
const internalHits: string[] = [];
const PUBLIC = '127.0.0.1'; // plays a public address
const PRIVATE = '127.0.0.2'; // plays the internal service an attacker wants (a second loopback address)

const fakeDns = async (host: string) => {
  if (host === 'public.test') return [PUBLIC];
  if (host === 'rebind.test') return [PRIVATE]; // what a rebinding server answers the second time
  if (host === 'mixed.test') return [PUBLIC, PRIVATE];
  throw new Error('ENOTFOUND');
};
const isBlocked = (ip: string) => ip !== PUBLIC;

beforeAll(async () => {
  site = createServer((req, res) => {
    paths.push(req.url ?? '');
    if (req.url === '/page') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html><script>fetch('http://rebind.test:${port}/secret').catch(() => {});</script><p>shop</p>`);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`hello from ${req.headers.host}`);
  });
  await new Promise<void>((ok) => site.listen(0, PUBLIC, ok));
  port = (site.address() as AddressInfo).port;
  // The "internal" service listens on the same port at the private address and records what reaches it.
  internal = createServer((req, res) => { internalHits.push(req.url ?? ''); res.end('internal secret'); });
  await new Promise<void>((ok, fail) => internal.once('error', fail).listen(port, PRIVATE, ok));
});
afterAll(async () => {
  await new Promise<void>((ok) => site.close(() => ok()));
  await new Promise<void>((ok) => internal.close(() => ok()));
});

function viaProxy(proxy: EgressProxy, url: string): Promise<{ status: number; body: string; blocked: boolean }> {
  const p = new URL(proxy.url);
  return new Promise((ok, fail) => {
    request({ host: p.hostname, port: p.port, path: url, headers: { host: new URL(url).host } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => ok({ status: res.statusCode!, body, blocked: res.headers[BLOCKED_HEADER] === '1' }));
    }).on('error', fail).end();
  });
}

function tunnel(proxy: EgressProxy, hostPort: string): Promise<string> {
  const p = new URL(proxy.url);
  return new Promise((ok, fail) => {
    const s = connect(Number(p.port), p.hostname, () => s.write(`CONNECT ${hostPort} HTTP/1.1\r\nHost: ${hostPort}\r\n\r\n`));
    s.once('data', (d) => { ok(d.toString().split('\r\n')[0]!); s.destroy(); });
    s.on('error', fail);
  });
}

describe('egress proxy', () => {
  it('forwards plain HTTP to the address it checked, keeping the Host header', async () => {
    const proxy = await startEgressProxy({ resolve: fakeDns, isBlocked });
    expect(proxy.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(await viaProxy(proxy, `http://public.test:${port}/`)).toEqual({ status: 200, body: `hello from public.test:${port}`, blocked: false });
    await proxy.close();
  });

  it.each(['rebind.test', 'mixed.test', PRIVATE])('refuses %s, whose addresses are not all public', async (host) => {
    const proxy = await startEgressProxy({ resolve: fakeDns, isBlocked });
    const res = await viaProxy(proxy, `http://${host}:${port}/secret`);
    expect([res.status, res.blocked]).toEqual([403, true]);
    expect(await tunnel(proxy, `${host}:443`)).toBe('HTTP/1.1 403 Forbidden');
    expect(proxy.refused).toHaveLength(2);
    await proxy.close();
  });

  it('opens CONNECT tunnels only to public addresses, and 502 for names that do not resolve', async () => {
    const proxy = await startEgressProxy({ resolve: fakeDns, isBlocked });
    expect(await tunnel(proxy, `public.test:${port}`)).toBe('HTTP/1.1 200 Connection Established');
    expect(await tunnel(proxy, 'nowhere.test:443')).toBe('HTTP/1.1 502 Bad Gateway');
    expect(await tunnel(proxy, 'no-port')).toBe('HTTP/1.1 400 Bad Request');
    await proxy.close();
  });

  it('with the real proxy (real DNS, real ranges), refuses localhost even by name', async () => {
    const proxy = await startEgressProxy();
    expect((await viaProxy(proxy, `http://localhost:${port}/`)).status).toBe(403);
    expect(await tunnel(proxy, `127.0.0.1:${port}`)).toBe('HTTP/1.1 403 Forbidden');
    await proxy.close();
  });
});

describe('Chromium through the egress proxy', () => {
  it('loads the page but cannot reach a rebound private address, even when the request guard allowed it', async () => {
    const obs = await scanSite({
      url: `http://public.test:${port}/page`,
      consentStates: ['BEFORE_INTERACTION'],
      observationSeconds: 1,
      viewport: 'desktop',
      guard: async () => true, // the guard was fooled: DNS said "public" when it asked
      egress: { resolve: fakeDns, isBlocked },
    });
    expect(obs.requests.map((r) => new URL(r.url).host)).toEqual([`public.test:${port}`, `rebind.test:${port}`]);
    // The fetch was attempted (and recorded) but the proxy refused it: the internal service never saw it.
    expect(internalHits).toEqual([]);
  });

  it('control: with every address allowed, the same page does reach the internal service', async () => {
    await scanSite({
      url: `http://public.test:${port}/page`, consentStates: ['BEFORE_INTERACTION'], observationSeconds: 1, viewport: 'desktop',
      guard: async () => true, egress: { resolve: fakeDns, isBlocked: () => false },
    });
    expect(internalHits).toContain('/secret'); // so the test above really measures the proxy
    internalHits.length = 0;
  });

  it('stops the scan when the page itself points to a private address', async () => {
    await expect(scanSite({
      url: `http://rebind.test:${port}/`,
      consentStates: ['BEFORE_INTERACTION'],
      observationSeconds: 1,
      viewport: 'desktop',
      guard: async () => true,
      egress: { resolve: fakeDns, isBlocked },
    })).rejects.toThrow('The address led to a private or blocked network address, so the scan was stopped.');
  });

  it('never lets Chromium connect directly, even to loopback', async () => {
    const proxy = await startEgressProxy({ resolve: fakeDns, isBlocked: () => true }); // everything blocked
    const browser = await chromium.launch({ proxy: { server: proxy.url, bypass: '<-loopback>' } });
    const page = await browser.newPage();
    const res = await page.goto(`http://127.0.0.1:${port}/`);
    expect(res?.status()).toBe(403);
    await browser.close();
    await proxy.close();
  });
});
