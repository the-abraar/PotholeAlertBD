# PotholeAlertBD
Verdict: The best-engineered of the labs and the one with a plausible public-good use, but it is a complaint wall: no authority receives reports, the city boundaries are hand-drawn boxes, and every report photo (faces, plates included) is public the moment it is submitted.  |  Call: freeze (unfreeze the day one authority contact or one press/NGO partner says yes)
Scores (0-10): product 4, code health 8, ship-ready 3
Live/users: none. No host (owner decision in `products/decision.md:11`: "Don't host yet. Find one real authority contact first"). No store listing; Android release is signed with the debug key (`app/android/app/build.gradle.kts:32`), app default API URL is `localhost`/`10.0.2.2` (`app/lib/services/api_service.dart:18-24`). Only device run: one iOS simulator integration test (2026-10-21).
Main branch state: only branch, 0 ahead / 0 behind origin. Last commit `0b3a787` 2026-10-27 (judge Update 16). Nothing deployed.
Checks run: `cd backend && npm ci && npm test` in the snapshot (Node 26.5) -> 33/33 pass, 2.3 s. Flutter tests not run (brief: no Flutter builds; judge reports 17 pass).

## Findings (most severe first, max 8)
- [High] Every photo is public, unmoderated and unblurred — `backend/src/app.js:21`, `backend/src/serialize.js:8` — `/uploads` is a public static dir and `photoUrl` is in every public report. Street photos in Dhaka will contain faces and number plates; a hidden or flagged report's photo stays reachable by its URL until an admin deletes it. Housekeeping lists `62ab693` as "photos admin-only until server-side blur", but that is only the recommendation in `PHOTO_BLUR_PLAN.md:27` ("use D. New photos are admin-only until approved"); the code does not do it. Auto-hide needs 3 distinct IPs (`routes/reports.js:19`), so an illegal image stays up until 3 people flag it. Must be fixed before any public host.
- [High] Routing promise is false — `backend/src/data/jurisdictions.json:2`, `backend/src/authorities.js:63-96` — all authority contacts are `null` and DNCC/DSCC/CCC polygons are "PLACEHOLDER / APPROXIMATE" boxes, yet reports are labelled with real city corporation names (`authority_name`). `forwardToAuthority` (`routes/reports.js:130-154`) can never send, so every report sits at `queued_for_authority` forever. The core value proposition does not exist.
- [Medium] Shared root admin token is still the default — `backend/src/security.js:87-92` — per-admin hashed tokens and an audit log exist, but the shared `ADMIN_TOKEN` keeps working as actor `root` unless `DISABLE_ROOT_TOKEN=1` is set. Root actions are audited as "root", so with more than one moderator nobody knows who hid or deleted a report. Production startup only checks length >= 16 (`security.js:140-150`).
- [Medium] Phone/name retention is 90 days by default, and IPs are kept indefinitely — `backend/src/retention.js:8-18`, `backend/src/routes/reports.js:250` — contact name and phone are erased after `CONTACT_RETENTION_DAYS` (default 90) or on self-erase with the one-time code; that works and is tested. But `flags.ip` stores the reporter's IPv4 (or /64) per flagged report and is never purged unless an admin unhides/deletes; there is no phone format validation (only max 20 chars, `reports.js:43`); `privacy.html:25` still has "TODO: deletion-request contact to be defined by the operator"; the policy has had no legal review (Bangladesh PDPA-style obligations unknown).
- [Medium] Rate limits are per-IP in one SQLite file — `backend/src/security.js:6,27-44` — no longer in memory (focus question): counters persist across restarts and processes on one DB file, tested. Limits: they only work on one host, and behind a proxy every client shares one IP unless `TRUST_PROXY` is set correctly. Carrier-grade NAT in Bangladesh mobile networks means many real users share one IPv4, so `REPORT_LIMIT_PER_HOUR=20` and the 3-IP flag threshold will both misfire at scale.
- [Low] CSP allows inline script on the admin pages — `backend/src/security.js:53` — `script-src 'self' 'unsafe-inline'` means any future `innerHTML` slip in `public/admin.html:117` (currently escaped via `esc()`) becomes token theft from `sessionStorage`. Defence in depth only.
- [Low] Release builds are not shippable as-is — `app/lib/services/api_service.dart:18-30`, Android `signingConfig = debug` — a release build without `--dart-define=API_BASE_URL=https://...` talks to localhost. Expected for a lab, but means "never run on a real phone" (judge Update 8 #7) is still true.

## Claims vs reality
- "Contact erased after CONTACT_RETENTION_DAYS (default 90, startup + daily)" (judge Update 10/15) -> true: `retention.js`, `server.js:11-12`, tested.
- "Per-admin tokens and audit log; DISABLE_ROOT_TOKEN finishes the migration" (judge Update 10/15) -> true, but opt-in; shared root token is still the default.
- "Rate limits, failed-auth counters and flag dedupe stored in SQLite, survive restart" (judge Update 10/15) -> true (`security.js:27-36`, test "survive a process restart" passes).
- "Photos admin-only until server-side blur" (housekeeping.md:19 on `62ab693`) -> false: plan document only; photos are public (`app.js:21`).
- "Reports reach the responsible authority" (README/PRD core promise) -> false: contacts null, polygons placeholder.

## Next actions (max 5, in priority order)
- [owner] Get one named authority/channel contact (DNCC, 333, a2i GRS) or one newspaper/NGO partner willing to receive a weekly digest; without it, keep frozen — effort: days (outreach)
- [agent] Implement option D from `PHOTO_BLUR_PLAN.md`: new photos served only to admins until approved; remove the public `/uploads` static mount, serve approved photos through a route that checks status — effort: half-day
- [owner] Replace `jurisdictions.json` with real city-corporation GeoJSON (OSM/LGED) before any public test — effort: half-day
- [agent] Make `DISABLE_ROOT_TOKEN` the production default (refuse root token when `NODE_ENV=production`), purge `flags.ip` with the contact retention job — effort: 1h
- [owner] Legal read of `privacy.html` and fill the deletion-request contact — effort: 1h + counsel

## Not checked
- Flutter app tests and `flutter analyze` (not run per brief); app UI on a real device.
- `PRD.md` content beyond the core promise.
- Email forwarding with real SMTP; digest cron.
- Sharp/multer dependency vulnerabilities (`npm audit` not run).
