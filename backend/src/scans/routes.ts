import { Router } from 'express';
import type pg from 'pg';
import { config } from '../config.ts';
import { rateLimit } from '../security/rateLimit.ts';
import { checkTargetUrl, type LookupFn } from '../security/urlGuard.ts';
import { CONSENT_STATES, type ConsentState, type CreateScanRequest, type Viewport } from './model.ts';
import { countActive, createScan, getReport, listScans } from './repository.ts';

const OBSERVATION_CHOICES = [10, 15, 30];
const VIEWPORTS: Viewport[] = ['desktop', 'phone'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates the JSON body of POST /api/scans. Returns the clean request or a message for a 400. */
export function parseCreateBody(body: unknown): CreateScanRequest | string {
  if (typeof body !== 'object' || body === null) return 'Send a JSON object.';
  const b = body as Record<string, unknown>;
  if (typeof b.url !== 'string') return 'url must be a string.';

  const states = b.consentStates ?? CONSENT_STATES;
  if (!Array.isArray(states) || !states.every((s) => CONSENT_STATES.includes(s as ConsentState))) {
    return `consentStates must be a list of ${CONSENT_STATES.join(', ')}.`;
  }
  if (!states.includes('BEFORE_INTERACTION')) return 'consentStates must include BEFORE_INTERACTION.';
  const consentStates = CONSENT_STATES.filter((s) => states.includes(s)); // canonical order, no duplicates

  const observationSeconds = b.observationSeconds ?? 15;
  if (typeof observationSeconds !== 'number' || !OBSERVATION_CHOICES.includes(observationSeconds)) {
    return `observationSeconds must be one of ${OBSERVATION_CHOICES.join(', ')}.`;
  }
  const viewport = b.viewport ?? 'desktop';
  if (!VIEWPORTS.includes(viewport as Viewport)) return 'viewport must be desktop or phone.';

  return { url: b.url, consentStates, observationSeconds, viewport: viewport as Viewport };
}

export function scansRouter(pool: pg.Pool, resolve?: LookupFn): Router {
  const router = Router();

  router.post('/', rateLimit(5, 60_000), async (req, res) => {
    const parsed = parseCreateBody(req.body);
    if (typeof parsed === 'string') return res.status(400).json({ message: parsed });

    const target = await checkTargetUrl(parsed.url, resolve);
    if (!target.ok) return res.status(400).json({ message: target.reason });

    if ((await countActive(pool)) >= config.maxQueuedScans) {
      return res.status(429).json({ message: 'The scanner is busy. Try again in a few minutes.' });
    }
    const scan = await createScan(pool, { ...parsed, url: target.url.href }, target.url.hostname);
    res.status(202).location(`/api/scans/${scan.id}`).json(scan);
  });

  router.get('/', async (_req, res) => {
    res.json(await listScans(pool));
  });

  router.get('/:id', async (req, res) => {
    const report = UUID.test(req.params.id) ? await getReport(pool, req.params.id) : null;
    if (!report) return res.status(404).json({ message: 'This scan does not exist.' });
    res.json(report);
  });

  return router;
}
