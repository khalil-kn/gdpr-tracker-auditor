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
- [x] **M4 — Tracker intelligence** (library in code; editable library screen still to come)
- [x] **M5 — Dashboard & Privacy Exposure Score**
- [x] **M6 — Consent analysis** (before / reject / accept)
- [ ] **M7 — History & reports:** scan history done; PDF export and scan comparison to do
- [ ] **M8 — Hardening & deployment:** CI done; authentication, egress proxy for the browser, Docker image and deployment to do

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

Security controls: the submitted URL and **every request the page makes** are checked against private, loopback and metadata ranges (SSRF); service workers are blocked so no request bypasses that check; scans have a hard time limit and a request cap; scan creation is rate-limited and the queue is bounded; error messages shown to users never contain internals.

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

GitHub Actions runs everything on every push (`.github/workflows/ci.yml`).

## Disclaimer

This is a technical auditing tool. Its output is not legal advice and does not establish GDPR compliance or non-compliance. Only scan websites you are permitted to test.

## License

MIT © 2026 Med Khalil Knaissi
