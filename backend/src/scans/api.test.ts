// API + worker tests against a real PostgreSQL. They run when TEST_DATABASE_URL is set
// (see the README, "Running the tests").
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
  let agent: ReturnType<typeof request.agent>; // keeps the session cookie between requests, like a browser
  const signUp = async (email: string) => {
    const a = request.agent(app);
    const res = await a.post('/api/auth/register').send({ email, password: 'correct horse battery' });
    expect(res.status).toBe(201);
    return a;
  };
  beforeEach(async () => {
    await pool.query('TRUNCATE scans, users CASCADE');
    app = createApp(pool, fakeDns); // fresh app = fresh rate limiter
    agent = await signUp('alice@example.com');
  });
  afterAll(() => pool.end());

  const start = (body: object) => agent.post('/api/scans').send(body);

  it('queues a scan with 202 and lists it', async () => {
    const res = await start({ url: 'https://shop.example.com' });
    expect(res.status).toBe(202);
    expect(res.headers.location).toBe(`/api/scans/${res.body.id}`);
    expect(res.body).toMatchObject({ url: 'https://shop.example.com/', host: 'shop.example.com', status: 'PENDING', score: null, findingCount: null });

    const list = await agent.get('/api/scans');
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
    const bad = await agent.post('/api/scans').set('content-type', 'application/json').send('{"url":');
    expect(bad.status).toBe(400);
    expect((await agent.get('/api/scans/00000000-0000-0000-0000-000000000000')).status).toBe(404);
    const injected = await agent.get(`/api/scans/${encodeURIComponent("1' OR '1'='1")}`);
    expect(injected.status).toBe(404);
    expect(injected.body).toEqual({ message: 'This scan does not exist.' });
  });

  it('rate-limits scan creation per client', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      codes.push((await start({ url: 'https://shop.example.com' })).status);
      await pool.query(`UPDATE scans SET status = 'COMPLETED'`); // keep the per-account limit out of the way
    }
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

    const res = await agent.get(`/api/scans/${body.id}`);
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
    const reasons = (await agent.get('/api/scans')).body.map((s: { status: string; failureReason: string }) => [s.status, s.failureReason]);
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

  it('exports a completed report as PDF, only for its owner', async () => {
    const { body } = await start({ url: 'https://shop.example.com', consentStates: ['BEFORE_INTERACTION'] });
    expect((await agent.get(`/api/scans/${body.id}/report.pdf`)).status).toBe(409); // not finished yet
    const fake: Observation = { states: [{ consentState: 'BEFORE_INTERACTION', bannerFound: false, bannerClickedAtMs: null }], requests: [], cookies: [] };
    await processScan(pool, (await claimNextScan(pool))!, async () => fake);

    const pdf = await agent.get(`/api/scans/${body.id}/report.pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toMatch(/^attachment; filename="?tracker-audit-shop\.example\.com-\d{4}-\d{2}-\d{2}\.pdf"?$/);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const bob = await signUp('bob@example.com');
    expect((await bob.get(`/api/scans/${body.id}/report.pdf`)).status).toBe(404);
  });

  it('limits how many scans one account can have waiting', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await start({ url: 'https://shop.example.com' })).status);
    expect(codes).toEqual([202, 202, 202, 429]);
  });

  describe('accounts', () => {
    it('refuses every scan route without a session', async () => {
      for (const res of [
        await request(app).get('/api/scans'),
        await request(app).post('/api/scans').send({ url: 'https://shop.example.com' }),
        await request(app).get('/api/scans/00000000-0000-0000-0000-000000000000'),
      ]) expect([res.status, res.body]).toEqual([401, { message: 'Sign in to continue.' }]);
    });

    it('never shows one account the scans of another (IDOR)', async () => {
      const { body: scan } = await start({ url: 'https://shop.example.com' });
      const bob = await signUp('bob@example.com');
      expect((await bob.get('/api/scans')).body).toEqual([]);
      const peek = await bob.get(`/api/scans/${scan.id}`);
      expect([peek.status, peek.body]).toEqual([404, { message: 'This scan does not exist.' }]); // same answer as a missing id
      expect((await agent.get(`/api/scans/${scan.id}`)).status).toBe(200);
    });

    it('signs in, answers the same for an unknown email and a wrong password, and signs out', async () => {
      const wrong = await request(app).post('/api/auth/login').send({ email: 'alice@example.com', password: 'not the password' });
      const nobody = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'not the password' });
      expect([wrong.status, wrong.body]).toEqual([401, { message: 'Email or password is incorrect.' }]);
      expect([nobody.status, nobody.body]).toEqual([wrong.status, wrong.body]);

      const a = request.agent(app);
      const ok = await a.post('/api/auth/login').send({ email: ' Alice@Example.com ', password: 'correct horse battery' });
      expect(ok.status).toBe(200);
      const cookie = ok.headers['set-cookie']![0]!;
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect((await a.get('/api/auth/me')).body).toMatchObject({ email: 'alice@example.com' });

      expect((await a.post('/api/auth/logout').send({})).status).toBe(204);
      expect((await a.get('/api/auth/me')).status).toBe(401); // the session is gone from the database, not just the cookie
    });

    it('stores only a hash of the password and of the session token', async () => {
      const { rows: [u] } = await pool.query('SELECT password_hash FROM users');
      expect(u.password_hash).toMatch(/^scrypt\$32768\$8\$1\$/);
      expect(u.password_hash).not.toContain('correct horse');
      const { rows: [s] } = await pool.query('SELECT token_hash FROM sessions');
      expect(s.token_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it.each([
      [{ email: 'carol@example.com', password: 'short' }, 400, 'Use a password of 10 to 128 characters.'],
      [{ email: 'not-an-email', password: 'long enough password' }, 400, 'Enter a valid email address.'],
      [{ email: 'ALICE@example.com', password: 'long enough password' }, 409, 'An account with this email already exists. Sign in instead.'],
    ])('refuses registration %j', async (body, status, message) => {
      const res = await request(app).post('/api/auth/register').send(body);
      expect([res.status, res.body]).toEqual([status, { message }]);
    });

    it('rate-limits sign-in attempts', async () => {
      const codes: number[] = [];
      for (let i = 0; i < 11; i++) codes.push((await request(app).post('/api/auth/login').send({ email: 'alice@example.com', password: 'guess number ' + i })).status);
      expect(codes.at(-1)).toBe(429);
    });

    it('refuses writes that are not JSON, so a cross-site form cannot post', async () => {
      const res = await agent.post('/api/scans').type('form').send('url=https://shop.example.com');
      expect(res.status).toBe(415);
    });

    it('gives scans made before accounts existed to the first account only', async () => {
      await pool.query('TRUNCATE scans, users CASCADE');
      await pool.query(`INSERT INTO scans (url, host, consent_states, observation_seconds, viewport) VALUES ('https://old.example/', 'old.example', '{BEFORE_INTERACTION}', 15, 'desktop')`);
      const first = await signUp('first@example.com');
      const second = await signUp('second@example.com');
      expect((await first.get('/api/scans')).body.map((s: { host: string }) => s.host)).toEqual(['old.example']);
      expect((await second.get('/api/scans')).body).toEqual([]);
    });
  });
});
