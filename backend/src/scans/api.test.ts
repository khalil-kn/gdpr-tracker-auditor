// API + worker tests against a real PostgreSQL. They run when TEST_DATABASE_URL is set
// (CI sets it; locally see the README, "Running the tests").
// The DNS lookup and the browser are faked, so nothing leaves the machine.

import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { migrate } from '../db/migrate.ts';
import type { Observation } from '../scanner/scanner.ts';
import { ScanError } from '../scanner/scanner.ts';
import type { ScanReport } from './model.ts';
import { claimNextScan, failInterruptedScans } from './repository.ts';
import { parseCreateBody } from './routes.ts';
import { processScan } from './worker.ts';

describe('parseCreateBody', () => {
  it('fills defaults and puts states in canonical order', () => {
    expect(parseCreateBody({ url: 'https://example.com', consentStates: ['ACCEPTED', 'BEFORE_INTERACTION', 'ACCEPTED'] })).toEqual({
      url: 'https://example.com', consentStates: ['BEFORE_INTERACTION', 'ACCEPTED'], observationSeconds: 15, viewport: 'desktop',
    });
  });
  it.each([
    [null, 'Send a JSON object.'],
    [{ url: 42 }, 'url must be a string.'],
    [{ url: 'x', consentStates: ['REJECTED'] }, 'consentStates must include BEFORE_INTERACTION.'],
    [{ url: 'x', consentStates: ['DROP TABLE'] }, 'consentStates must be a list of BEFORE_INTERACTION, REJECTED, ACCEPTED.'],
    [{ url: 'x', observationSeconds: 3600 }, 'observationSeconds must be one of 10, 15, 30.'],
    [{ url: 'x', viewport: 'tv' }, 'viewport must be desktop or phone.'],
  ])('rejects %j', (body, message) => {
    expect(parseCreateBody(body)).toBe(message);
  });
});

// These tests TRUNCATE tables, so they refuse any database whose name doesn't end in _test.
const DATABASE_URL = process.env.TEST_DATABASE_URL;
if (DATABASE_URL && !/_test(\?.*)?$/.test(DATABASE_URL)) throw new Error('TEST_DATABASE_URL must point to a database whose name ends in _test');

describe.skipIf(!DATABASE_URL)('scans API with PostgreSQL', () => {
  let pool: pg.Pool;
  const fakeDns = async (host: string) => {
    if (host === 'shop.example.com') return ['93.184.215.14'];
    if (host === 'intranet.example.com') return ['10.1.2.3'];
    throw new Error('ENOTFOUND');
  };
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    await migrate(pool);
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE scans CASCADE');
    app = createApp(pool, fakeDns); // fresh app = fresh rate limiter
  });
  afterAll(() => pool.end());

  const start = (body: object) => request(app).post('/api/scans').send(body);

  it('queues a scan with 202 and lists it', async () => {
    const res = await start({ url: 'https://shop.example.com' });
    expect(res.status).toBe(202);
    expect(res.headers.location).toBe(`/api/scans/${res.body.id}`);
    expect(res.body).toMatchObject({ url: 'https://shop.example.com/', host: 'shop.example.com', status: 'PENDING', score: null, findingCount: null });

    const list = await request(app).get('/api/scans');
    expect(list.body.map((s: { id: string }) => s.id)).toEqual([res.body.id]);
  });

  it.each([
    ['http://intranet.example.com', 'The hostname points to a private or reserved network address'],
    ['http://169.254.169.254/latest/meta-data', 'The hostname points to a private or reserved network address'],
    ['file:///etc/passwd', 'Only http and https URLs are allowed'],
    ['https://nowhere.example.com', 'Could not resolve the hostname'],
  ])('refuses %s with 400 and stores nothing', async (url, message) => {
    const res = await start({ url });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message });
    expect((await pool.query('SELECT count(*)::int AS n FROM scans')).rows[0].n).toBe(0);
  });

  it('answers 400 to broken JSON and 404 to unknown or malformed ids, without internals', async () => {
    const bad = await request(app).post('/api/scans').set('content-type', 'application/json').send('{"url":');
    expect(bad.status).toBe(400);
    expect((await request(app).get('/api/scans/00000000-0000-0000-0000-000000000000')).status).toBe(404);
    const injected = await request(app).get(`/api/scans/${encodeURIComponent("1' OR '1'='1")}`);
    expect(injected.status).toBe(404);
    expect(injected.body).toEqual({ message: 'This scan does not exist.' });
  });

  it('rate-limits scan creation per client', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await start({ url: 'https://shop.example.com' })).status);
    expect(codes).toEqual([202, 202, 202, 202, 202, 429]);
  });

  it('runs a queued scan and serves the full report in the frontend contract shape', async () => {
    const { body } = await start({ url: 'https://shop.example.com', consentStates: ['BEFORE_INTERACTION', 'REJECTED'] });
    const claimed = await claimNextScan(pool);
    expect(claimed?.status).toBe('RUNNING');
    expect(await claimNextScan(pool)).toBeNull(); // nobody else gets the same scan

    const fake: Observation = {
      states: [
        { consentState: 'BEFORE_INTERACTION', bannerFound: true, bannerClickedAtMs: null },
        { consentState: 'REJECTED', bannerFound: true, bannerClickedAtMs: 1400 },
      ],
      requests: [
        { consentState: 'BEFORE_INTERACTION', url: 'https://shop.example.com/', method: 'GET', resourceType: 'document', timeMs: 10 },
        { consentState: 'BEFORE_INTERACTION', url: 'https://region1.google-analytics.com/g/collect', method: 'POST', resourceType: 'fetch', timeMs: 1800 },
        { consentState: 'REJECTED', url: 'https://region1.google-analytics.com/g/collect', method: 'POST', resourceType: 'fetch', timeMs: 2400 },
      ],
      cookies: [
        { consentState: 'BEFORE_INTERACTION', name: '_ga', domain: '.shop.example.com', path: '/', expires: Date.now() / 1000 + 400 * 86400, secure: false, httpOnly: false, sameSite: 'Lax' },
      ],
    };
    await processScan(pool, claimed!, async () => fake);

    const res = await request(app).get(`/api/scans/${body.id}`);
    const report = res.body as ScanReport;
    expect(report).toMatchObject({ status: 'COMPLETED', findingCount: 3, states: fake.states });
    expect(report.completedAt).not.toBeNull();
    expect(report.requests[1]).toEqual({
      consentState: 'BEFORE_INTERACTION', url: 'https://region1.google-analytics.com/g/collect', hostname: 'region1.google-analytics.com',
      registrableDomain: 'google-analytics.com', method: 'POST', resourceType: 'fetch', thirdParty: true, timeMs: 1800, trackerId: 'ga4',
    });
    expect(report.requests[0]!.thirdParty).toBe(false);
    expect(report.cookies[0]).toMatchObject({ name: '_ga', category: 'Analytics', trackerId: 'ga4', thirdParty: false, sameSite: 'Lax' });
    expect(report.trackers.map((t) => t.id)).toEqual(['ga4']);
    expect(report.findings.map((f) => f.title)).toEqual([
      'Tracking request observed before consent', 'Tracking continued after consent was rejected', 'Tracking cookie kept over 12 months',
    ]);
    expect(typeof report.findings[0]!.id).toBe('string');
    expect(report.privacyScore).toEqual({ value: 18, breakdown: [
      { points: 8, reason: 'Tracking before consent', detail: 'Google Analytics 4' },
      { points: 8, reason: 'Tracking after Reject all', detail: 'Google Analytics 4' },
      { points: 2, reason: 'Long-lived tracking cookies', detail: '1 set before consent' },
    ] });
    expect(report.score).toBe(18);
  });

  it('stores a safe failure reason and never the raw error', async () => {
    await start({ url: 'https://shop.example.com' });
    await start({ url: 'https://shop.example.com' });
    await processScan(pool, (await claimNextScan(pool))!, async () => { throw new ScanError('The page did not finish loading within 30 seconds.'); });
    const quiet = console.error; console.error = () => {};
    await processScan(pool, (await claimNextScan(pool))!, async () => { throw new Error('connect ECONNREFUSED 10.0.0.7:5432 at Socket.internal'); });
    console.error = quiet;
    const reasons = (await request(app).get('/api/scans')).body.map((s: { status: string; failureReason: string }) => [s.status, s.failureReason]);
    expect(reasons).toEqual(expect.arrayContaining([
      ['FAILED', 'The page did not finish loading within 30 seconds.'],
      ['FAILED', 'The scan failed unexpectedly. Try again later.'],
    ]));
  });

  it('marks scans left RUNNING by a restart as failed', async () => {
    await start({ url: 'https://shop.example.com' });
    await claimNextScan(pool);
    expect(await failInterruptedScans(pool)).toBe(1);
  });
});
