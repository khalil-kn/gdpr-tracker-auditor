# GDPR Website Tracker Auditor

> Automated, browser-based auditing of website tracking behaviour: what a site contacts, which trackers and cookies it uses, and what happens before and after consent — reported as explainable technical evidence.

![status](https://img.shields.io/badge/status-design%20phase-blue) ![license](https://img.shields.io/badge/license-MIT-green)

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

- [ ] **M0 — Planning & design**
- [ ] **M1 — Foundation:** API, DB, URL guard, Playwright scan, results page → `v0.1.0`
- [ ] **M2 — Network monitoring**
- [ ] **M3 — Cookie analysis**
- [ ] **M4 — Tracker intelligence**
- [ ] **M5 — Dashboard & Privacy Exposure Score**
- [ ] **M6 — Consent analysis** (before / reject / accept)
- [ ] **M7 — History & reports** · **M8 — Hardening & deployment**

## Getting started

_Setup instructions arrive with M1._

## Disclaimer

This is a technical auditing tool. Its output is not legal advice and does not establish GDPR compliance or non-compliance. Only scan websites you are permitted to test.

## License

MIT © 2026 Med Khalil Knaissi
