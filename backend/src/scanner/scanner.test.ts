// Integration test: a real Chromium scans a fake shop served from this process.
// --host-resolver-rules sends every hostname to 127.0.0.1, so the page can "call" google-analytics.com
// without leaving the machine.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assess } from '../assess/assess.ts';
import { classifyObservation } from '../classify/classify.ts';
import { sameSiteFromHeader, scanSite, type Observation } from './scanner.ts';

let server: Server;
let port = 0;
const hits: string[] = [];

function shopPage(p: number): string {
  return `<!doctype html><html><body>
  <div id="banner"><p>We use cookies.</p><button id="rej">Reject all</button><button id="acc">Accept all</button></div>
  <script>
    const banner = document.getElementById('banner');
    fetch('http://www.google-analytics.com:${p}/g/collect', { mode: 'no-cors', method: 'POST' });
    fetch('http://metadata.internal:${p}/latest/meta-data/', { mode: 'no-cors' });
    document.getElementById('rej').onclick = () => {
      banner.remove();
      setTimeout(() => fetch('http://region1.google-analytics.com:${p}/g/collect', { mode: 'no-cors' }), 200);
    };
    document.getElementById('acc').onclick = () => {
      banner.remove();
      new Image().src = 'http://www.facebook.com:${p}/tr?ev=PageView';
    };
  </script></body></html>`;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const host = (req.headers.host ?? '').split(':')[0]!;
    hits.push(host);
    if (host === 'shop.example') {
      res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'shop_cart=3f9a; Path=/; Max-Age=2592000' });
      res.end(shopPage(port));
    } else {
      res.writeHead(204).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('sameSiteFromHeader', () => {
  it.each([
    ['sid=1; Path=/; SameSite=Strict; Secure', 'Strict'],
    ['sid=1; samesite=none', 'None'],
    ['cart=1; Path=/; Max-Age=60', null],
  ])('%s', (header, expected) => {
    expect(sameSiteFromHeader(header).sameSite).toBe(expected);
  });
});

describe('scanSite', () => {
  let obs: Observation;

  beforeAll(async () => {
    obs = await scanSite({
      url: `http://shop.example:${port}/`,
      consentStates: ['BEFORE_INTERACTION', 'REJECTED', 'ACCEPTED'],
      observationSeconds: 3,
      viewport: 'desktop',
      guard: async (u) => !u.hostname.startsWith('metadata'),
      launchOptions: { args: [`--host-resolver-rules=MAP * 127.0.0.1`, '--no-proxy-server'] },
    });
  }, 60_000);

  const hosts = (state: string) => obs.requests.filter((r) => r.consentState === state).map((r) => new URL(r.url).hostname);

  it('answers the banner in each state with the right button', () => {
    expect(obs.states.map((s) => [s.consentState, s.bannerFound, s.bannerClickedAtMs !== null])).toEqual([
      ['BEFORE_INTERACTION', true, false],
      ['REJECTED', true, true],
      ['ACCEPTED', true, true],
    ]);
  });

  it('records requests per state', () => {
    expect(hosts('BEFORE_INTERACTION')).toContain('www.google-analytics.com');
    expect(hosts('BEFORE_INTERACTION')).not.toContain('www.facebook.com');
    expect(hosts('REJECTED')).toContain('region1.google-analytics.com');
    expect(hosts('ACCEPTED')).toContain('www.facebook.com');
  });

  it('blocks requests the guard refuses before they leave the browser', () => {
    expect(obs.requests.some((r) => r.url.includes('metadata'))).toBe(false);
    expect(hits).not.toContain('metadata.internal');
  });

  it('keeps cookies per state and sees a missing SameSite attribute', () => {
    const cart = obs.cookies.find((c) => c.name === 'shop_cart' && c.consentState === 'BEFORE_INTERACTION');
    expect(cart).toMatchObject({ secure: false, httpOnly: false, sameSite: null });
  });

  it('feeds the classification and assessment layers end to end', () => {
    const { requests, cookies } = classifyObservation(obs, 'shop.example');
    const { findings } = assess({ isHttps: false, scannedAtSec: Date.now() / 1000, states: obs.states, requests, cookies });
    expect(findings.map((f) => f.title)).toEqual(expect.arrayContaining([
      'Tracking request observed before consent',
      'Tracking continued after consent was rejected',
      'Cookie without SameSite attribute',
    ]));
  });

  it('turns a navigation failure into a safe message', async () => {
    await expect(scanSite({
      url: `http://shop.example:${port}/`, consentStates: ['BEFORE_INTERACTION'], observationSeconds: 1, viewport: 'phone',
      guard: async () => false, launchOptions: { args: ['--no-proxy-server'] },
    })).rejects.toThrow('The address led to a private or blocked network address, so the scan was stopped.');
  }, 30_000);
});
