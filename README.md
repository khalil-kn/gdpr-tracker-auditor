# GDPR Website Tracker Auditor

> Automated, browser-based auditing of website tracking behaviour: what a site contacts, which trackers and cookies it uses, and what happens before and after consent — reported as explainable technical evidence.

![status](https://img.shields.io/badge/status-in%20development-blue) ![license](https://img.shields.io/badge/license-MIT-green)

## Why

Most websites contact dozens of third parties the moment they load, often before a visitor has made any consent choice. This tool visits a site in an isolated, instrumented browser and answers:

*What happens when someone visits this website, and what tracking or security-relevant behaviour occurs before and after consent?*

It reports **technical observations** ("analytics request observed before consent"), not legal verdicts.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Angular, TypeScript | Structured SPA framework with strong typing |
| Backend | Node.js, Express, TypeScript | Native environment for Playwright |
| Browser automation | Playwright | Full network and cookie instrumentation |
| Database | PostgreSQL | Relational evidence + job queue |

## Roadmap

- [x] **M0 — Planning & design**
- [x] **M1 — Foundation:** API, DB, URL guard, Playwright scan, results page → `v0.1.0`
- [x] **M2 — Network monitoring**
- [x] **M3 — Cookie analysis**
- [x] **M4 — Tracker intelligence** (37 services, browsable on the Tracker library page)
- [x] **M5 — Dashboard & Privacy Exposure Score**
- [x] **M6 — Consent analysis** (before / reject / accept)
- [x] **M7 — History & reports:** scan history, PDF export, comparison of two scans
- [x] **M8 — Hardening & deployment:** accounts with per-user scans, egress proxy against DNS rebinding, Docker images, HTTPS deployment with Caddy

## How it works

```
Angular ──► POST /api/scans ──► Express validates the URL (urlGuard) ──► scans table (PENDING)
   ▲                                                                            │
   │ polls GET /api/scans/:id                                    worker claims it (FOR UPDATE SKIP LOCKED)
   │                                                                            ▼
report ◄── findings + score ◄── classification ◄── Playwright: one fresh browser context per consent state
```

| Layer | Question | Code |
|---|---|---|
| 1. Observation | What did the browser see? | `backend/src/scanner/` |
| 2. Classification | What is each request and cookie? | `backend/src/classify/` |
| 3. Assessment | Does it need review? | `backend/src/assess/` |

## Security controls

| Threat | Control | Code |
| --- | --- | --- |
| SSRF through the submitted URL | http/https only, ports 80/443, no credentials in the URL, every resolved IP must be public | `security/urlGuard.ts`, `security/ipRanges.ts` |
| SSRF through what the page loads | every request checked before Chromium sends it; service workers blocked | `scanner/requestGuard.ts` |
| DNS rebinding | Chromium reaches the web only through a local egress proxy that resolves the name itself, checks every address and connects to the exact IP it checked | `scanner/egressProxy.ts` |
| Reading someone else's scans (IDOR) | every query is scoped by the signed-in user; another user's scan answers 404, like a missing one | `scans/repository.ts` |
| Password theft and guessing | scrypt hashes (32 MiB per hash), sign-in limited to 10 tries per 15 min, the same answer for unknown email and wrong password | `auth/password.ts`, `auth/routes.ts` |
| Session theft and CSRF | random 256-bit token in an HttpOnly, SameSite=Strict, Secure cookie; only its SHA-256 is stored; every write must be JSON | `auth/middleware.ts`, `app.ts` |
| Open redirect after sign-in | `?next=` accepted only for same-site paths | `frontend/.../core/auth/auth.service.ts` |
| HTML injection into the PDF | every value escaped; the PDF page is printed with JavaScript off and all network refused | `report/pdf.ts` |
| Abuse and resource exhaustion | 5 scans a minute per IP, 3 active scans per account, 20 in the queue, hard time limit, 3,000 requests per state, 10 kB request bodies | `security/rateLimit.ts`, `scans/routes.ts`, `scans/worker.ts` |
| Leaking internals | errors shown to users never contain stack traces; `X-Powered-By` off; strict CSP and security headers on the site | `app.ts`, `frontend/nginx.conf` |

## Getting started

You need Node.js 24, Docker Desktop and Git.

```bash
cp .env.example .env            # then choose a password in .env
docker compose up -d            # PostgreSQL on localhost:5432

cd backend
npm install
npx playwright install chromium # the browser the scanner drives
npm run dev                     # API + scan worker on http://localhost:3000

cd ../frontend                  # in a second terminal
npm install
npm start                       # http://localhost:4200
```

The database schema is created automatically when the backend starts.

### Running the tests

```bash
cd backend && npm test          # unit tests + a real Chromium scan of a local test page
cd frontend && npm test
```

The API tests also need an empty test database. They wipe it, so they refuse any database whose name doesn't end in `_test`:

```powershell
docker compose exec db createdb -U auditor tracker_auditor_test
$env:TEST_DATABASE_URL = "postgres://auditor:YOUR_PASSWORD@localhost:5432/tracker_auditor_test"
npm test
```


## Accounts

The first time you open the app, choose **Create an account**. Each account sees only its own scans. The first account created also receives any scans made before accounts existed.

On a public server, set `ALLOW_REGISTRATION=false` in `.env` once your own account exists.

## Deployment

The production stack runs in Docker: PostgreSQL, the API with its worker (on Playwright's image, as a non-root user), the Angular site on nginx, and Caddy in front for HTTPS. Only Caddy publishes ports.

```bash
cp .env.example .env    # set POSTGRES_PASSWORD, and DOMAIN to your server's name
docker compose -f compose.prod.yaml up -d --build
```

With a real domain pointing at the server, Caddy obtains and renews a Let's Encrypt certificate on its own. `DOMAIN=localhost` runs the same stack locally with a local certificate.

| Setting (`.env`) | Default | What it does |
| --- | --- | --- |
| `DOMAIN` | `localhost` | Name Caddy serves and gets a certificate for |
| `ALLOW_REGISTRATION` | `true` | Whether new accounts can sign up |
| `SCAN_CONCURRENCY` | `2` | Scans run at the same time (each is a Chromium) |
| `MAX_QUEUED_SCANS` | `20` | Scans waiting or running before new ones get 429 |
| `MAX_ACTIVE_SCANS_PER_USER` | `3` | Scans one account can have waiting or running |
| `SESSION_DAYS` | `7` | How long a sign-in lasts |
| `EGRESS_PROXY` | `true` | Send browser traffic through the egress proxy; never turn off on a server |

## Disclaimer

This is a technical auditing tool. Its output is not legal advice and does not establish GDPR compliance or non-compliance. Only scan websites you are permitted to test.

## License

MIT © 2026 Med Khalil Knaissi
