# LEARNINGS: PotholeAlertBD

Written 2026-11-10, while the lab is frozen. Status: **nobody receives the reports.** No city desk, NGO or government channel has agreed to take them. The demo in `demo/` (synthetic data only) shows what the backend does. Sources are this repo: `judge.md`, `docs/outreach/tracker.csv`, the code and the demo run (`demo/data/lifecycle.json`).

## 1. The question that was never answered

The first audit (`judge.md`, 2026-10-12) ranked this as blocker 1: *who acts on a report, and why would they?* Every authority contact in `backend/src/authorities.js` is `null`, so every report waits in `queued_for_authority` for ever. The audit said to start the authority conversation in week 0, because it takes the longest.

That did not happen. The code got 15 more `judge.md` updates (the last is Update 17). The first outreach kit (`docs/outreach/`, five emails, a sample digest) came on 2026-11-01, three weeks later. On 2026-11-10 `tracker.csv` has 8 organisations, 5 with a checked address, and the `sent_on` column is empty in every row.

**Lesson:** for a civic tool, the receiver is the product. Ask one named receiver the one question ("would you take a weekly ward-level digest?") before you write the code that makes the digest.

## 2. What the 2026-10-12 audit found, and what happened to each item

| Audit item | State on 2026-11-10 |
|---|---|
| 1. Nobody acts on reports | **Open.** Contacts are `null`. The DNCC, DSCC and CCC polygons are hand-drawn placeholder boxes. |
| 2. Release builds can't reach the network or camera | Permissions and iOS usage strings added. The erase flow passed one integration test on an iOS simulator (Update 13). There has been no release build on a real phone. |
| 3. Reporters' phone numbers were public | Fixed: public and admin serializers are split. EXIF is removed by re-encoding. The phone number is optional, needs consent, is erased after 90 days, and the reporter can erase it with a code. The demo confirms the public JSON has no contact keys. |
| 4. Stored XSS to the admin token | Fixed: output is escaped (with a lint guard, `scripts/lint-innerhtml.sh`). Uploads are re-encoded and named by the server. There is a CORS allow-list, the token is compared in constant time, and per-admin tokens expire. |
| 5. No abuse control | Built: per-IP limits kept in SQLite, a Bangladesh bounding box, 30 m / 24 h dedupe, flags, a review queue (`PHOTO_REVIEW=1`) and a detector hook. Section 4 lists the limits. |
| 6. No production backend | **Open.** There is no host, HTTPS, backup or monitoring. SQLite runs on one box. |
| 7. No store release config | Partly done. No signing key and no store listing. |

Proof today: `scripts/check.sh` exits 0 (backend 37/37, Flutter 17/17, analyze clean), run 2026-11-10 in this branch.

## 3. What got built anyway

Built after the audit, with no receiver: an authority inbox (`authority.html`, scoped token, an after photo needed to resolve, compare-and-set writes), a digest (`manage.js digest`), per-admin tokens with an audit log, rotation, revocation and expiry, contact retention and self-erasure in the app, moderation (flags, hide, unhide), and the blur pipeline without a model (`PHOTO_DETECTOR`). Most of it is sound and tested. None of it has had a real user.

## 4. Per-IP limits and shared mobile IPs (CGNAT)

Anonymous submits are limited to `REPORT_LIMIT_PER_HOUR` (default 20) per IP, and IPv6 is keyed by its /64. The demo ran all 25 submits from one address. Submits 21 to 25 got **429** (`demo/data/lifecycle.json`).

Mobile carriers can put many subscribers behind one public IPv4 address (carrier-grade NAT; RFC 6598 reserves 100.64.0.0/10 for it, https://www.rfc-editor.org/rfc/rfc6598, read 2026-11-10). If that is true for a Dhaka carrier, everyone behind one address shares the 20 per hour. A busy junction could then lock out real reporters. This repo never measured how Bangladeshi carriers share addresses. Before a launch, count reports per IP in a pilot. Per-IP limits are a backstop. Use a device signal (install ID plus Play Integrity or App Attest) as the real limit. `TRUST_PROXY` must be set correctly behind a proxy, or every user shares the proxy's IP.

## 5. Privacy protections are opt-in

Every protection that matters for street photos is off by default. `PHOTO_REVIEW` and `PHOTO_DETECTOR` are empty in `.env.example`. A first deploy from the example env publishes every photo at once, faces and number plates included. Production refuses a default `ADMIN_TOKEN` (fail closed), but there is no matching rule for photos.

**Lesson:** when a missing setting can expose a person, the safe value is the default and the open value needs a choice. The frozen code does not change this. Changing the defaults is the "safe-defaults fix", allowed only once a host date exists.

**Found by the demo run (not fixed, the code is frozen):** with `PHOTO_REVIEW=1`, duplicate detection stops working. `findDuplicate` in `routes/reports.js` skips `hidden` reports, and review mode holds every new report as `hidden`. In the demo, submission #3 was about 11 m from #1 with the same road type. The backend saved it as a new report, and both reached the authority inbox. A retry on a flaky network does the same. The fix is a small change to that query (also match reports held for review, plus a test). It is listed here for when the lab is unfrozen.

## 6. Process

- Agent rounds made code progress easy to log and easy to mistake for product progress. The score in `judge.md` stayed at 30% from Update 8 to Update 17, because its cap was the missing receiver and host.
- The checks were worth it. `scripts/check.sh`, the pre-commit hook and CI caught real bugs: `backend/.gitignore` hid `src/data/` (Update 10), and a race in the authority PATCH was found (Update 16).
- Self-assessed scores need a human check. Every update in `judge.md` is marked agent-made.

## 7. Numbers

| What | Value | Source |
|---|---|---|
| Commits on `origin/main` | 36 (2026-10-12 to 2026-11-09) | `git rev-list --count origin/main` |
| `judge.md` updates | 15 headed updates, the last is Update 17 | `judge.md` |
| Go-to-market score | 30% (self-assessed, ±10) | `judge.md` Update 8 to 17 |
| Backend tests / Flutter tests | 37 / 17, all pass | `scripts/check.sh`, 2026-11-10 |
| Authorities with a verified contact | 0 | `backend/src/authorities.js`, `jurisdictions.json` |
| Outreach targets / checked addresses / emails sent / replies | 8 / 5 / 0 / 0 | `docs/outreach/tracker.csv` |
| Real users, real devices, hosts | 0 / 0 / 0 | `judge.md` |
| Demo run: posted / created / 429 / public after submit / public at end | 25 / 20 / 5 / 0 / 19 | `demo/data/lifecycle.json` |

## 8. If this is picked up again

1. Send the five emails in `docs/outreach/` and wait for one "send it" before writing code.
2. Make privacy the default: `PHOTO_REVIEW=1` unless it is turned off on purpose. Fix the dedupe-in-review bug in section 5.
3. Replace the placeholder polygons with official boundaries. Add the one contact that said yes.
4. Host it with HTTPS and backups. Measure reports per IP in the pilot ward before you trust per-IP limits.
