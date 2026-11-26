// Layer 1: visit the site in Chromium once per consent state and record what happens.
// Each state gets a fresh browser context, so cookies and storage from one can't leak into another.

import { chromium, type Browser, type BrowserContextOptions, type LaunchOptions, type Page } from 'playwright';
import type { ConsentState, SameSite, StateRun, Viewport } from '../scans/model.ts';
import { findBannerButton } from './consent.ts';
import type { RequestGuard } from './requestGuard.ts';

export interface RawRequest {
  consentState: ConsentState;
  url: string;
  method: string;
  resourceType: string;
  timeMs: number;
}

export interface RawCookie {
  consentState: ConsentState;
  name: string;
  domain: string;
  path: string;
  expires: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: SameSite | null;
}

export interface Observation {
  states: StateRun[];
  requests: RawRequest[];
  cookies: RawCookie[];
}

export interface ScanOptions {
  url: string;
  consentStates: ConsentState[];
  observationSeconds: number;
  viewport: Viewport;
  guard: RequestGuard;
  launchOptions?: LaunchOptions;
  navigationTimeoutMs?: number;
}

/** An error whose message is safe to show to the user (no stack traces, no internals). */
export class ScanError extends Error {}

const MAX_REQUESTS_PER_STATE = 3000; // a hostile page could otherwise fill the database
const BANNER_WAIT_MS = 8000;

const VIEWPORTS: Record<Viewport, BrowserContextOptions> = {
  desktop: { viewport: { width: 1366, height: 768 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
};

/** A normal Chrome user agent: "HeadlessChrome" gets blocked or served a different page by many sites. */
function userAgent(browser: Browser, viewport: Viewport): string {
  const major = browser.version().split('.')[0];
  return viewport === 'phone'
    ? `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Mobile Safari/537.36`
    : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

/** SameSite as written in a Set-Cookie header; null when the attribute is absent. */
export function sameSiteFromHeader(setCookie: string): { name: string; sameSite: SameSite | null } {
  const [pair = '', ...attrs] = setCookie.split(';');
  const attr = attrs.map((a) => a.trim()).find((a) => /^samesite=/i.test(a));
  const value = attr?.split('=')[1]?.trim().toLowerCase();
  const sameSite = value === 'strict' ? 'Strict' : value === 'lax' ? 'Lax' : value === 'none' ? 'None' : null;
  return { name: pair.split('=')[0]!.trim(), sameSite };
}

function navigationError(err: unknown, timeoutMs: number): ScanError {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof Error && err.name === 'TimeoutError') return new ScanError(`The page did not finish loading within ${timeoutMs / 1000} seconds.`);
  if (msg.includes('ERR_BLOCKED_BY_CLIENT')) return new ScanError('The address led to a private or blocked network address, so the scan was stopped.');
  if (msg.includes('ERR_NAME_NOT_RESOLVED')) return new ScanError('The domain name could not be resolved.');
  if (msg.includes('ERR_CERT')) return new ScanError('The website’s HTTPS certificate is not valid.');
  if (/ERR_CONNECTION|ERR_ADDRESS|ERR_TIMED_OUT/.test(msg)) return new ScanError('The website could not be reached.');
  return new ScanError('The page could not be loaded.');
}

async function observeState(browser: Browser, o: ScanOptions, state: ConsentState, out: Observation): Promise<void> {
  const context = await browser.newContext({
    ...VIEWPORTS[o.viewport],
    userAgent: userAgent(browser, o.viewport),
    serviceWorkers: 'block', // a service worker's requests would bypass the route guard below
    acceptDownloads: false,
  });
  const headerSameSite = new Map<string, SameSite | null>();
  let t0 = Date.now();
  let recorded = 0;

  try {
    await context.route('**/*', async (route) => {
      const req = route.request();
      try {
        const allowed = recorded < MAX_REQUESTS_PER_STATE && (await o.guard(new URL(req.url())));
        if (!allowed) return await route.abort('blockedbyclient');
        recorded++;
        out.requests.push({ consentState: state, url: req.url().slice(0, 2048), method: req.method(), resourceType: req.resourceType(), timeMs: Date.now() - t0 });
        await route.continue();
      } catch {
        // The context was closed while this request was in flight: nothing left to do.
      }
    });
    context.on('response', (res) => {
      res.headersArray().then((headers) => {
        for (const h of headers) {
          if (h.name.toLowerCase() !== 'set-cookie') continue;
          const { name, sameSite } = sameSiteFromHeader(h.value);
          headerSameSite.set(name, sameSite);
        }
      }, () => {});
    });

    const page: Page = await context.newPage();
    const navTimeout = o.navigationTimeoutMs ?? 30_000;
    t0 = Date.now();
    try {
      await page.goto(o.url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
    } catch (err) {
      throw navigationError(err, navTimeout);
    }

    const windowEnd = t0 + o.observationSeconds * 1000;
    const bannerWait = () => Math.max(0, Math.min(BANNER_WAIT_MS, windowEnd - Date.now()));
    const run: StateRun = { consentState: state, bannerFound: false, bannerClickedAtMs: null };

    if (state === 'BEFORE_INTERACTION') {
      // Only look: the banner stays unanswered for the whole window.
      run.bannerFound = !!(await findBannerButton(page, 'accept', bannerWait())) || !!(await findBannerButton(page, 'reject', 500));
    } else {
      const button = await findBannerButton(page, state === 'REJECTED' ? 'reject' : 'accept', bannerWait());
      if (button) {
        run.bannerFound = true;
        const clicked = await button.click({ timeout: 3000 }).then(() => true, () => false);
        if (clicked) run.bannerClickedAtMs = Date.now() - t0;
      }
    }

    await page.waitForTimeout(Math.max(0, windowEnd - Date.now()));

    // Playwright can't tell "SameSite absent" from the browser default, so the Set-Cookie header decides when we saw one.
    // shortcut: cookies set by JavaScript (document.cookie) only have Playwright's value; parse those writes if it matters.
    for (const c of await context.cookies()) {
      out.cookies.push({
        consentState: state, name: c.name, domain: c.domain, path: c.path, expires: c.expires,
        secure: c.secure, httpOnly: c.httpOnly,
        sameSite: headerSameSite.has(c.name) ? headerSameSite.get(c.name)! : c.sameSite,
      });
    }
    out.states.push(run);
  } finally {
    await context.close().catch(() => {});
  }
}

export async function scanSite(o: ScanOptions): Promise<Observation> {
  const browser = await chromium.launch(o.launchOptions);
  try {
    const out: Observation = { states: [], requests: [], cookies: [] };
    for (const state of o.consentStates) await observeState(browser, o, state, out);
    return out;
  } finally {
    await browser.close().catch(() => {});
  }
}
