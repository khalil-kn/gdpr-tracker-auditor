// PDF export of a completed report: an HTML page built here, printed by Chromium.
//
// Every value from a scan is untrusted (cookie names, URLs, domains come from the scanned site), so each one
// goes through esc() before it reaches the HTML. Chromium then prints with JavaScript off and every network
// request refused, so even a missed tag could neither run nor call out.

import { chromium } from 'playwright';
import { CONSENT_STATES, TRACKING_CATEGORIES, type Category, type ConsentState, type ScanReport } from '../scans/model.ts';

const STATE_LABEL: Record<ConsentState, string> = {
  BEFORE_INTERACTION: 'Before consent', REJECTED: 'After rejecting', ACCEPTED: 'After accepting',
};
const CATEGORY_COLOR: Record<Category, string> = {
  Analytics: '#0b84b5', Advertising: '#c2286b', Social: '#c2650f', Functional: '#1f8a5b', Essential: '#5b6475', Unknown: '#8a6d00',
};

/** HTML-escapes a value for text and double-quoted attributes. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function band(score: number): string {
  return score >= 75 ? 'Severe' : score >= 50 ? 'High' : score >= 25 ? 'Moderate' : 'Low';
}

function lifetime(expires: number, scannedAtMs: number): string {
  if (expires < 0) return 'Session';
  const days = Math.round((expires - scannedAtMs / 1000) / 86400);
  return days < 1 ? 'Under a day' : `${days} ${days === 1 ? 'day' : 'days'}`;
}

interface ServiceLine { name: string; category: Category; counts: Record<ConsentState, number> }

/** One line per known service, plus one per unclassified third-party domain, with request counts per state. */
function services(r: ScanReport): ServiceLine[] {
  const out = new Map<string, ServiceLine>();
  for (const q of r.requests) {
    if (!q.thirdParty && !q.trackerId) continue;
    const t = q.trackerId ? r.trackers.find((x) => x.id === q.trackerId) : undefined;
    const key = t?.id ?? `?${q.registrableDomain}`;
    const line = out.get(key) ?? { name: t?.name ?? q.registrableDomain, category: t?.category ?? 'Unknown', counts: { BEFORE_INTERACTION: 0, REJECTED: 0, ACCEPTED: 0 } };
    line.counts[q.consentState]++;
    out.set(key, line);
  }
  const rank = (c: Category) => (TRACKING_CATEGORIES.has(c) ? 0 : c === 'Unknown' ? 1 : 2);
  return [...out.values()].sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name));
}

export function renderReportHtml(r: ScanReport, generatedAt = new Date()): string {
  const states = CONSENT_STATES.filter((s) => r.consentStates.includes(s));
  const scannedAt = Date.parse(r.createdAt);
  const score = r.privacyScore;
  const date = (iso: string | number | Date) => new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  const totals = states.map((s) => {
    const reqs = r.requests.filter((q) => q.consentState === s);
    const third = reqs.filter((q) => q.thirdParty);
    const tracking = reqs.filter((q) => q.trackerId && TRACKING_CATEGORIES.has(r.trackers.find((t) => t.id === q.trackerId)?.category ?? 'Unknown'));
    const run = r.states.find((x) => x.consentState === s);
    return `<tr><th>${esc(STATE_LABEL[s])}</th><td class="n">${reqs.length}</td><td class="n">${new Set(third.map((q) => q.registrableDomain)).size}</td>
      <td class="n">${tracking.length}</td><td class="n">${r.cookies.filter((c) => c.consentState === s).length}</td>
      <td>${s === 'BEFORE_INTERACTION' ? (run?.bannerFound ? 'Banner seen, left unanswered' : 'No banner found') : run?.bannerClickedAtMs != null ? `Clicked at ${(run.bannerClickedAtMs / 1000).toFixed(1)} s` : 'Button not found'}</td></tr>`;
  }).join('');

  const findings = r.findings.length ? r.findings.map((f) => `
    <div class="finding sev-${esc(f.severity.toLowerCase())}">
      <p class="f-head"><span class="sev">${esc(f.severity[0] + f.severity.slice(1).toLowerCase())}</span> ${esc(f.title)}${f.consentState ? ` <span class="muted">(${esc(STATE_LABEL[f.consentState])})</span>` : ''}</p>
      <p>${esc(f.description)}</p>
      ${f.evidence.length ? `<ul>${f.evidence.map((e) => `<li class="mono">${esc(e)}</li>`).join('')}</ul>` : ''}
    </div>`).join('') : '<p class="muted">No findings.</p>';

  const breakdown = score?.breakdown.length
    ? `<table><thead><tr><th>Rule</th><th>Detail</th><th class="n">Points</th></tr></thead><tbody>${score.breakdown.map((p) =>
        `<tr><td>${esc(p.reason)}</td><td>${esc(p.detail)}</td><td class="n">${p.points}</td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">No points: nothing in this scan raised the exposure.</p>';

  const svc = services(r);
  const serviceTable = svc.length ? `<table><thead><tr><th>Service</th><th>Category</th>${states.map((s) => `<th class="n">${esc(STATE_LABEL[s])}</th>`).join('')}</tr></thead><tbody>${svc.map((l) =>
    `<tr><td><span class="dot" style="background:${CATEGORY_COLOR[l.category]}"></span>${esc(l.name)}</td><td>${esc(l.category === 'Unknown' ? 'Unclassified' : l.category)}</td>${states.map((s) => `<td class="n">${l.counts[s]}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '<p class="muted">The site contacted no third parties.</p>';

  const seen = new Set<string>();
  const cookies = r.cookies.filter((c) => { const k = `${c.name}|${c.domain}|${c.path}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const MAX_COOKIES = 200;
  const cookieTable = cookies.length ? `<table class="small"><thead><tr><th>Cookie</th><th>Domain</th><th>Category</th><th>First seen</th><th>Lifetime</th><th>Secure</th><th>HttpOnly</th><th>SameSite</th></tr></thead><tbody>${cookies.slice(0, MAX_COOKIES).map((c) =>
    `<tr><td class="mono">${esc(c.name)}</td><td class="mono">${esc(c.domain)}</td><td>${esc(c.category === 'Unknown' ? 'Unclassified' : c.category)}</td><td>${esc(STATE_LABEL[c.consentState])}</td><td>${esc(lifetime(c.expires, scannedAt))}</td><td>${c.secure ? 'Yes' : 'No'}</td><td>${c.httpOnly ? 'Yes' : 'No'}</td><td>${esc(c.sameSite ?? 'Not set')}</td></tr>`).join('')}</tbody></table>${cookies.length > MAX_COOKIES ? `<p class="muted">${cookies.length - MAX_COOKIES} more cookies are in the online report.</p>` : ''}`
    : '<p class="muted">No cookies were set.</p>';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tracker audit: ${esc(r.host)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm; }
  body { font-family: Arial, Helvetica, 'DejaVu Sans', sans-serif; color: #17171d; font-size: 10.5pt; line-height: 1.45; margin: 0; }
  h1 { font-size: 22pt; margin: 0 0 4pt; } h2 { font-size: 13pt; margin: 18pt 0 6pt; border-bottom: 1.5pt solid #17171d; padding-bottom: 3pt; }
  p { margin: 0 0 6pt; } .muted { color: #5b5b66; } .mono { font-family: 'Courier New', 'DejaVu Sans Mono', monospace; font-size: 9pt; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; margin: 4pt 0 8pt; } th, td { text-align: left; padding: 4pt 6pt 4pt 0; border-bottom: 0.5pt solid #d6d6dc; vertical-align: top; }
  thead th { font-size: 9pt; color: #5b5b66; border-bottom: 1pt solid #17171d; } .n { text-align: right; } table.small td { font-size: 9pt; }
  tr { page-break-inside: avoid; } .meta td { border: 0; padding: 1pt 12pt 1pt 0; }
  .score { display: flex; gap: 16pt; align-items: baseline; margin: 10pt 0 4pt; } .score b { font-size: 34pt; line-height: 1; }
  .finding { border-left: 3pt solid #9aa3b5; padding: 4pt 0 4pt 10pt; margin: 0 0 10pt; page-break-inside: avoid; }
  .finding ul { margin: 2pt 0 0 14pt; padding: 0; } .f-head { font-weight: 700; } .sev { text-transform: none; padding: 1pt 5pt; border-radius: 3pt; background: #eceef2; font-size: 8.5pt; margin-right: 4pt; }
  .sev-high { border-color: #d92d43; } .sev-high .sev { background: #fbe3e6; color: #a3172a; }
  .sev-medium { border-color: #d98a00; } .sev-medium .sev { background: #fdf0d9; color: #7a4d00; }
  .dot { display: inline-block; width: 7pt; height: 7pt; border-radius: 50%; margin-right: 5pt; }
  .note { margin-top: 18pt; padding: 8pt 10pt; background: #f2f2f5; font-size: 9pt; }
</style></head><body>
  <p class="muted">Tracker Auditor report</p>
  <h1>${esc(r.host)}</h1>
  <table class="meta"><tr><td class="muted">Address</td><td class="mono">${esc(r.url)}</td></tr>
    <tr><td class="muted">Scanned</td><td>${esc(date(r.createdAt))}, ${states.length} consent ${states.length === 1 ? 'state' : 'states'}, ${r.observationSeconds} s each, ${esc(r.viewport)} window</td></tr>
    <tr><td class="muted">Scan id</td><td class="mono">${esc(r.id)}</td></tr></table>

  <h2>Privacy Exposure Score</h2>
  ${score ? `<div class="score"><b>${score.value}</b><span>of 100, ${esc(band(score.value))} exposure. Higher means more exposed.</span></div>${breakdown}` : '<p class="muted">Not scored.</p>'}

  <h2>Findings (${r.findings.length})</h2>
  ${findings}

  <h2>Consent states</h2>
  <table><thead><tr><th>State</th><th class="n">Requests</th><th class="n">Third-party domains</th><th class="n">Tracking requests</th><th class="n">Cookies</th><th>Banner</th></tr></thead><tbody>${totals}</tbody></table>

  <h2>Third-party services (requests per state)</h2>
  ${serviceTable}

  <h2>Cookies (${cookies.length})</h2>
  ${cookieTable}

  <p class="note">This report describes what an automated browser observed on ${esc(date(r.createdAt))}. It is technical evidence for review, not legal advice, and does not establish compliance or non-compliance with the GDPR or any other law. Generated ${esc(date(generatedAt))}.</p>
</body></html>`;
}

/** Prints the report to PDF in a sandboxed page: no JavaScript, no network. */
export async function reportPdf(r: ScanReport): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(renderReportHtml(r), { waitUntil: 'load' });
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close().catch(() => {});
  }
}

/** A safe download name: tracker-audit-shop.example.com-2026-11-26.pdf */
export function pdfFileName(r: ScanReport): string {
  return `tracker-audit-${r.host.replace(/[^a-z0-9.-]/gi, '_')}-${r.createdAt.slice(0, 10)}.pdf`;
}
