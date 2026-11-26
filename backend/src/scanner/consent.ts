import type { Frame, Locator, Page } from 'playwright';

// Banner buttons are found by their visible text (accessible name), in the languages the project
// targets first: English, German, French, Finnish, Arabic, plus Spanish and Italian.
// Anchored patterns so "Reject all" matches but "Learn why we never reject anyone" doesn't.
export const REJECT_TEXT = new RegExp(
  '^(' + [
    '(reject|decline|deny|refuse)( all)?( cookies)?',
    '(use |allow |accept )?(only )?(necessary|essential|required)( cookies)?( only)?',
    'continue without accepting',
    '(alle )?ablehnen', 'nur (notwendige|essenzielle|erforderliche) cookies( akzeptieren| zulassen)?',
    'tout refuser', 'refuser( tout)?', 'continuer sans accepter',
    'hylkää( kaikki)?', 'vain välttämättömät( evästeet)?',
    'رفض( الكل)?',
    'rechazar( todo| todas)?', 'rifiuta( tutto| tutti)?',
  ].join('|') + ')$', 'i');

export const ACCEPT_TEXT = new RegExp(
  '^(' + [
    '(accept|allow|agree)( to)?( all)?( cookies)?', 'i (accept|agree)', 'ok(ay)?', 'got it',
    '(alle )?(akzeptieren|annehmen|zustimmen)', 'alle cookies akzeptieren', 'einverstanden',
    'tout accepter', 'accepter( tout)?', "j'accepte",
    'hyväksy( kaikki)?', 'salli kaikki',
    'قبول( الكل)?', 'موافق',
    'aceptar( todo| todas)?', 'accetta( tutto| tutti)?',
  ].join('|') + ')$', 'i');

async function firstVisible(frame: Frame, text: RegExp): Promise<Locator | null> {
  for (const role of ['button', 'link'] as const) {
    const candidates = frame.getByRole(role, { name: text });
    const n = await candidates.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const c = candidates.nth(i);
      if (await c.isVisible().catch(() => false)) return c;
    }
  }
  return null;
}

/**
 * Looks for a banner button in the page and in every iframe (many consent tools render in one),
 * retrying until `timeoutMs`. Returns the button, or null if the banner never appeared.
 */
export async function findBannerButton(page: Page, choice: 'reject' | 'accept', timeoutMs: number): Promise<Locator | null> {
  const text = choice === 'reject' ? REJECT_TEXT : ACCEPT_TEXT;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const found = await firstVisible(frame, text);
      if (found) return found;
    }
    await page.waitForTimeout(250);
  }
  return null;
}
