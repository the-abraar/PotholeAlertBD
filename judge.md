# PotholeAlertBD: launch-readiness verdict

> **Current go-to-market score: 30%.** The verdict below is the original 2026-10-12 audit. See *Update 8* at the bottom for the current score, gaps and next steps, and `../GO_TO_MARKET_SCORECARD.md`.

Audited 2026-10-12. I read README.md, todo.md, all of `backend/src`, `backend/public/admin.html`, all of `app/lib`, `app/test`, the Android/iOS manifests and the build config. Nothing was executed.

## Verdict

**About 20% ready.** This is a working demo for a laptop and an emulator. It is not yet a product. The reporting loop (photo, GPS, road type, save) works locally. Everything a real launch needs is missing:

- **The phone builds cannot work.** The release Android build has no INTERNET permission. iOS is missing the privacy strings it needs, so it crashes when it asks for location or camera.
- **The backend leaks private data and is wide open to attack.** Reporters' phone numbers are public, and there is a stored-XSS path to the admin token.
- **Nobody receives the reports.** Every authority contact is `null`, so 100% of reports stay `queued_for_authority` forever.
- **There is no way to run it in production:** no hosting, no HTTPS, no backups, no moderation and no abuse control.

The product question "who acts on a report, and why would they?" has not been answered. Until it is, the app is a public complaint wall. Note: the app does **not** detect potholes automatically (there is no accelerometer or ML code), so detection accuracy and battery drain from sensing do not apply. The open accuracy problems are wrong location, wrong division, wrong authority and duplicate reports.

---

## Critical blockers (ranked)

### 1. Nobody acts on the reports
- **Evidence:** In `backend/src/authorities.js:57-88`, every `contact: { email: null, phone: null }`. In `routes/reports.js:145`, the status is always `queued_for_authority`. The admin page admits this (`admin.html:44`). Routing works only by road type: one "RHD" entry for the whole country, and one generic "City Corporation" entry with no DNCC/DSCC/CCC split and no boundaries. The comment at `authorities.js:70` says the corporation name "appears in the report", but the code never sets it.
- **Why it blocks launch:** The core promise ("goes to the responsible authority") is false. Users who see nothing get fixed stop reporting within weeks. Sending cold email to government inboxes gets marked as spam or ignored.
- **Fix:**
  1. Pick **one** pilot jurisdiction, for example DNCC. Get a named contact through a signed MoU or letter of intent. A second option is to partner with an existing channel: the 333 / Nagorik Sheba hotline, the a2i GRS (grs.gov.bd), or the DNCC "Sobar Dhaka" app.
  2. Replace the road-type map with a `jurisdictions` table that stores a polygon (GeoJSON from BBS/LGED/OSM admin boundaries), an authority, a verified email and a ticket channel. Resolve with point-in-polygon. Turf.js is enough, or use PostGIS later.
  3. Give each authority a small inbox or a token-scoped link where they can set `in_progress` or `resolved` and attach an "after" photo. A digest email is the minimum.
  4. If no authority signs up, relaunch as a public-pressure/media tool: weekly ward-level press reports. Say so in the app.

### 2. The release mobile builds cannot reach the network or use the camera/location
- **Evidence:**
  - `android/app/src/main/AndroidManifest.xml` has no `INTERNET`, `ACCESS_FINE_LOCATION` or `CAMERA` permission. INTERNET appears only in `src/debug/`, so the release APK cannot reach the API.
  - `ios/Runner/Info.plist` has no `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription` or `NSPhotoLibraryUsageDescription`. iOS kills the app when it asks for these.
  - The API base URL defaults to `http://localhost` / `10.0.2.2` (`api_service.dart:17-25`). That is cleartext HTTP, which Android 9+ and iOS ATS both block.
- **Why it blocks launch:** The store build is non-functional, and Apple review rejects it at once.
- **Fix:**
  1. Add the permissions and usage strings, in Bangla and English.
  2. Deploy the API behind HTTPS on a real domain.
  3. Bake the domain in with `--dart-define=API_BASE_URL=https://api...` in a release script or flavor. Do not allow cleartext.
  4. Run a release build on a real Android phone and a real iPhone before anything else.

### 3. Privacy breach: reporters' phone numbers are public
- **Evidence:** `serializeReport` in `routes/reports.js:53-54` returns `contactName` and `contactPhone` on the public `GET /api/reports` and `GET /api/reports/:id`, with no auth. The app model also parses them (`models/report.dart:13-14`). This contradicts the About screen's promise that they are "not shown publicly" (`about_screen.dart`, privacy section). Photos are stored and served unchanged, with no EXIF stripping and no face or licence-plate blurring. Exact lat/lng and timestamps are public.
- **Why it blocks launch:** This is a false privacy claim and a doxxing risk for whistle-blowers in a politically sensitive area. Bangladesh's personal-data rules (the Personal Data Protection Ordinance 2025 / CSA-era rules) and the Play and App Store data-safety declarations are violated.
- **Fix:**
  1. Split the serializers into public (no contact fields) and admin (behind auth).
  2. Strip EXIF on the server (`sharp().rotate()` re-encode).
  3. Blur faces and plates before publishing. Start with a manual moderation queue and add a model later.
  4. Write a privacy policy URL, a retention period and a deletion request path.

### 4. Stored XSS, and taking over the admin token from any upload
- **Evidence:**
  - `admin.html:77-90` puts `r.description` and other user fields into the page through `innerHTML` without escaping.
  - The admin token is kept in `localStorage` (`admin.html:54-57`).
  - Uploads keep the extension the client supplied (`reports.js:21`), the mimetype check trusts the client (`reports.js:30`), and files are served from the **same origin** as `admin.html` (`server.js:17-18`). An SVG or an `.html` file sent as `image/png` therefore runs script on the admin origin.
  - `cors()` is open to every origin (`server.js:15`).
  - The token is compared with `!==` and there is no rate limit (`reports.js:189`).
- **Why it blocks launch:** One anonymous report can take over moderation and status changes. The public "resolved" stats can then be faked.
- **Fix:**
  1. Escape the output: use `textContent` or a tiny `esc()` helper.
  2. Re-encode every upload to JPEG on the server and ignore the client's extension.
  3. Serve uploads from a separate bucket or domain (S3/R2 + CDN) with `Content-Type: image/jpeg` and `X-Content-Type-Options: nosniff`.
  4. Replace the shared token with real admin accounts (sessions or OAuth). Add `helmet`, a CORS allow-list and `express-rate-limit`.

### 5. No abuse, spam or moderation control on a public, anonymous write endpoint
- **Evidence:** `POST /api/reports` has no auth, no rate limit, no CAPTCHA, no duplicate check and no geofence (any lat/lng is accepted, even outside Bangladesh, and `detectDivision` still assigns the nearest division). It accepts uploads up to 12 MB. Every report appears in the public feed immediately with status `new`. There is no moderation state that hides a report before review.
- **Why it blocks launch:** On day one the feed can fill with spam, obscene images or political content. A few scripts can fill the disk. The public statistics are meaningless.
- **Fix:**
  1. Rate-limit per IP and per device: an install-ID plus Play Integrity / App Attest token.
  2. Reject points outside the Bangladesh bounding polygon.
  3. Add a `pending_review` state and hide reports from the public until approved. Later, auto-approve trusted devices.
  4. Deduplicate: when there are reports within about 25 m and 30 days, merge them as "+1 confirmations" instead of new rows. This is also your severity signal.
  5. Add a "report this post" flag.

### 6. No deployable production backend
- **Evidence:**
  - `db.js` writes SQLite to `backend/data/` and multer writes to `backend/uploads/` on local disk (`reports.js:15`). The project uses `node:sqlite`, which is experimental in Node 22.
  - There is no Dockerfile, process manager, HTTPS setup, environment validation or backup.
  - Errors from multer (for example a non-image file) fall through to Express's HTML 500 page, and the app's `jsonDecode` (`api_service.dart:93`) then throws a useless FormatException.
  - Email forwarding is fire-and-forget (`reports.js:115`). There is no retry, and failures are swallowed.
  - The folder is not a git repo, so there is no history and no CI.
- **Why it blocks launch:** One VM or disk loss deletes every report and photo. No one can operate the service.
- **Fix:**
  1. Run `git init` and set up CI.
  2. Write a Dockerfile.
  3. Use managed Postgres with PostGIS (needed for item 1 anyway), or keep SQLite with Litestream backups.
  4. Put photos in object storage.
  5. Add a JSON error handler.
  6. Make forwarding an outbox table with retries: `forward_attempts`, `last_error`.
  7. Host on a single small VM or Fly/Render, with Caddy for TLS, uptime monitoring and Sentry on both the app and the API.

### 7. No store-publishable release configuration
- **Evidence:**
  - The release build is signed with debug keys (`android/app/build.gradle.kts:30-33`), and it still has the template `TODO`s.
  - App label is `potholealert_app` (`AndroidManifest.xml:3`), and the iOS display name is "Potholealert App".
  - `pubspec.yaml:2` still says "A new Flutter project."
  - Icons are the default Flutter icons. There is no privacy policy URL, no data-safety form content and no Bangla store listing.
  - OSM tiles are loaded from `tile.openstreetmap.org` (`map_screen.dart:49`, `report_form_screen.dart:314`). The OSM tile usage policy forbids heavy app traffic, and no attribution is shown.
- **Why it blocks launch:** Play and the App Store reject the build or listing. The OSM tile servers would block the app.
- **Fix:**
  1. Create an upload keystore and set up Play App Signing.
  2. Set the real app name, icon and splash.
  3. Write the privacy policy and data-safety answers (location, photos, phone number).
  4. Switch to a tile provider with a key (MapTiler / Stadia / Protomaps self-hosted) and add the `RichAttributionWidget`.

---

## Major gaps

- **Tests are almost absent.** There is one smoke widget test (`app/test/widget_test.dart`). It will also hit the network or `geolocator` when it loads. The backend has zero tests and no `test` script.
  - **Fix:** Add backend integration tests (supertest) for: POST validation, the public serializer leaving out contact fields, admin auth, and a geofence reject. Add a unit test for jurisdiction resolution. Add one Flutter test for form validation.
- **Offline support:** In BD, rural 2G and patchy data are the normal case. A failed submit only shows a snackbar (`report_form_screen.dart` `_submit`). There is no on-device queue, retry or upload resume, and no cache for the feed or map.
  - **Fix:** Save drafts to local storage (Hive/sqflite) and send them in the background (`workmanager`) when connectivity returns. Compress photos to about 300 KB before upload.
- **Scaling:** `GET /api/reports` returns up to 500 full rows with no pagination (`reports.js:161`). The map draws every marker with no clustering or viewport query. Stats run 6 full-table scans per request.
  - **Fix:** Add cursor pagination, a bbox query for the map plus `flutter_map_marker_cluster`, and cached stats.
- **Location accuracy:**
  - Division detection is the nearest centroid (`authorities.js:30-44`). It is wrong near division borders and on islands and coastlines.
  - The user picks the road type, so most users will get it wrong, and that choice decides the authority.
  - GPS accuracy is not recorded, and the photo's capture location and time are not checked against the submitted point.
  - **Fix:** Use polygon lookup. Infer the road type from OSM `highway=` tags near the point and let the user only confirm. Store the `accuracy` value, and reject readings worse than 50 m or ask the user to adjust the pin.
- **Closing the loop with the reporter:** There are no accounts, no push notifications and no "my reports" list, so a reporter never learns the outcome.
  - **Fix:** Store an anonymous device ID, add a "My reports" list from it, and send FCM push messages on status change.
- **Web build:** `kIsWeb` points to `localhost:4000`, and on web the photo comes from a file picker with no resizing guarantee. If the web version ships, it needs a hosted URL and a client-side resize.
- **Unclear users and value:** Is the product for citizens, journalists, or the city corporation? The PRD in `todo.md` is not written yet.
  - **Fix:** Write the PRD before more code. Name one primary user (urban commuters in a pilot ward), one buyer or partner (the city corporation), and one success metric (the share of reports acknowledged by the authority within 14 days).
- **Business model:** There is none. Realistic paths: a grant or CSR pilot (a2i, the World Bank road-safety programmes, BRAC, telcos), a B2G SaaS dashboard for city corporations (a ward-level road-condition index), and selling anonymised road-condition data to logistics and ride-hailing companies (Pathao, Uber, courier firms). Decide which one before the pilot, because it changes the data model and the consent text.
- **Cold start:** An empty map kills trust.
  - **Fix:** Seed the pilot ward with 200–500 field-verified reports, collected through student volunteers or a riders' community (bike-rider Facebook groups, motorcycle couriers). Launch with a media partner and a weekly public "worst roads" leaderboard.
- **Legal and regulatory risk:** Public photos of people or plates, and naming agencies publicly, carry a defamation risk under the Cyber Security Act. Users also need ToS acceptance.
  - **Fix:** Add a ToS and community guidelines, moderation before publishing (item 5), an image-blurring step, and a lawyer's review of the disclaimer.

---

## Launch path (ordered)

1. **Week 0:** `git init`. Write the PRD (todo.md). Choose one pilot jurisdiction and start the authority and partner conversation **now**, because it has the longest lead time (item 1).
2. Close the security and privacy holes: the public/admin serializer split, output escaping, server-side image re-encode and EXIF strip, a separate upload origin, helmet + CORS allow-list + rate limits, and real admin auth (items 3 and 4).
3. Add moderation and abuse controls: `pending_review`, the BD geofence, dedup into confirmations, and device attestation (item 5).
4. Production backend: Postgres/PostGIS or SQLite with Litestream, object storage, a Dockerfile, a TLS domain, a JSON error handler, a forwarding outbox with retry, and Sentry plus uptime monitoring (item 6).
5. Jurisdiction polygons and verified contacts for the pilot area, plus a minimal authority inbox where status can be updated (item 1).
6. Mobile release config: permissions and usage strings, the HTTPS base URL, a signing key, the app name and icon, a tile provider and attribution, and the privacy policy (items 2 and 7). Test the release build on real low-end Android phones on 3G.
7. Add an offline submit queue and photo compression, the "My reports" list, and push notifications on status change.
8. Add tests: backend integration tests and form tests, run in CI on every push.
9. Closed beta (50–100 users in the pilot ward). Seed the data. Measure the report-to-acknowledgement rate and the false-report rate.
10. Public launch in the pilot ward with a media partner. Expand to another jurisdiction only after an authority there commits to act on reports.


---

## Progress log (2026-10-12, Claude session)

**Done (verified by syntax check only; nothing built or run on a device):**
- Blocker 2: added `INTERNET`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `CAMERA` to `app/android/app/src/main/AndroidManifest.xml`. Added `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` to `ios/Runner/Info.plist` (`plutil -lint` OK).
- Phone-number leak: `serializeReport` in `backend/src/routes/reports.js` no longer returns `contactName` or `contactPhone` on the public endpoints. The Flutter model reads them as nullable, so the app keeps working.
- Stored XSS: `backend/public/admin.html` now HTML-escapes `description`, `divisionName`, `authorityName`, `severity`, `roadTypeLabel` and `photoUrl` before `innerHTML`.

**Why I stopped:** I cannot read the 5-hour usage meter, so I kept the work small and wrote this log early.

**Next, in value order:**
1. Blocker 1 (authority contacts and jurisdiction routing). It needs a human MoU or contact, so code cannot finish it.
2. Admin-token handling beyond escaping (move off `localStorage` if used, add rate limiting).
3. A moderator view needs contact info: add an admin-only endpoint behind `requireAdmin` that returns it.
4. Run `flutter build apk --release` and a real-device test of the permissions.
5. Hosting, HTTPS, backups, abuse control.


### Update 2 (supersedes "nothing changed" above; agent-made, not reviewed by a human)

**Update 2:** no further changes in this round.


### Update 3 (agent-made; results are the agents' own reports unless stated)

**Done:** `GET /api/reports/admin/all` (admin-only, returns contact fields); `admin.html` uses it with the token in `sessionStorage`. New `src/security.js` (hand-written in-memory rate limit, security headers, constant-time token compare, production check that fails startup on a default ADMIN_TOKEN). Server split into `app.js` and `server.js`. JSON capped at 10 kb, photos at 8 MB, magic-byte check, UUID filenames, Bangladesh coordinate bounds, text length caps. `src/jurisdictions.js` point-in-polygon resolver with PLACEHOLDER boxes for DNCC, DSCC and CCC in `src/data/jurisdictions.json` (contacts `null`). `npm test`: 5/5 pass. Live curl checks: headers, 401/200 on admin, 413 on oversize body, production startup failure. `flutter analyze` clean; `flutter test` passes.

**Still open:** the placeholder polygons must not ship as real boundaries. Rate limiter is in-memory, per process. No EXIF strip, no CORS allow-list, no pagination. Real polygons and verified authority contacts need a human source (blocker 1). No release build or real-device permission test. Hosting, HTTPS, backups, moderation.


### Update 4 (agent-made; agents' own reports, not yet independently re-run)

**Done (`npm test` 9/9, `flutter analyze` clean, `flutter test` passes):** EXIF stripped by re-encoding with `sharp` (**new dependency: run `npm install`**; undecodable images get 400). `CORS_ORIGINS` allow-list (unset means no CORS headers). `limit` (default 50, max 200) and `offset` on both lists, total in `X-Total-Count`, prev/next in `admin.html`. Duplicate detection within `DUP_RADIUS_M` (30) and `DUP_WINDOW_HOURS` (24): returns 200 with the existing report and `duplicate: true`, nothing saved. Flutter `api_service.dart` accepts 200 as well as 201.

**Still open:** the app does not tell the user their report was a duplicate; no admin page-size control; everything from Update 3's open list (real jurisdiction data and contacts, device build, hosting).


### Update 5 (agent-made, round 6; agents' own reports unless marked)

**Done (agent runs: backend `npm test` 12/12; `flutter analyze` clean; `flutter test` 2/2):** moderation (`hidden` and `flagged` statuses, `POST /api/reports/:id/flag`, 3 distinct-IP flags auto-hide via `FLAG_HIDE_THRESHOLD`, admin unhide and delete that also removes the photo); per-IP submit limit `REPORT_LIMIT_PER_HOUR` (default 20) and `TRUST_PROXY` setting; `/privacy` page in Bangla and English (lawyer-review TODO, no company name or address); admin page-size selector; Flutter duplicate dialog with "View it", consent dialog before contact fields, optional validated Bangladeshi phone number.

**Still open:** **set `TRUST_PROXY` correctly in production** or all users share one IP for rate limits; in-memory rate limits reset on restart; moving a report hidden -> new by PATCH keeps old flag rows (use `/unhide`); no widget tests for the consent and duplicate dialogs; nothing run on a device; real jurisdiction polygons and authority contacts (blocker 1); hosting, HTTPS, backups.


### Update 6 (agent-made: independent verification, security review, fixes; agents' own reports unless marked)

**Independent re-run confirmed:** backend 12/12, `flutter analyze` clean, `flutter test` 2/2.

**Security review found (fixed; `npm test` 17/17 per the agent):** one anonymous flag overwrote any non-hidden status, including admin `resolved` and `rejected`; rate limits and flag dedupe keyed on raw IPs (a rotating IPv6 /64 beats them); `sharp` had no pixel cap; the admin-token brute-force limit covered only the list route. Fixes: flags change only `new`, `queued_for_authority` and `flagged` reports, the prior status is saved in `pre_flag_status` and restored on unhide (existing DBs gain the column by `ALTER TABLE`); IPv6 maps to its /64 for limits and dedupe; `TRUST_PROXY` accepts only an integer 0-10, `loopback`, `linklocal` or `uniquelocal` and the app refuses to load otherwise; `limitInputPixels` 40e6 (413 above); every admin route limited to 30 per minute and 10 failed auths per 15 minutes per IP (429).

**Still open:** limiters are in-memory (not shared across instances); everything from Updates 3-5.


---

## Update 8: go-to-market scoring (2026-10-12)

**Score: 30% (was 20%).** Stage: Working demo; no one receives the reports.

**Cap:** 30: the core promise (reports reach the responsible authority) cannot be delivered, and there is no host.

**Dimension scores (0-10):** Product 5, Quality 6, Security 7, Legal 3, Market 1, Ops 2, Honesty 6. Rubric and the other five projects: `../GO_TO_MARKET_SCORECARD.md`.

**Basis and limits:** my judgement from this file's audit, the agents' reports, and independent re-runs of tests and builds. No real-device, real-user or real-host testing has happened, and nothing is committed. Agent-written code has had no human review. Treat the score as +/- 10 points.

### Gaps and flaws, ranked

1. **Nobody acts on reports.** Every authority contact is `null`; jurisdiction polygons for DNCC, DSCC and CCC are **placeholder boxes marked APPROXIMATE** that now route reports to real city corporation names. They must not ship.
2. **No production hosting:** no HTTPS, no backups, no monitoring; SQLite on a single box.
3. **Abuse controls are in-memory** (rate limits, flag dedupe) and reset on restart; they do not work across more than one instance. `TRUST_PROXY` must be set correctly or all users share one IP.
4. **A single shared admin token** guards moderation; no per-admin accounts, no audit trail of who hid or deleted a report.
5. **Phone numbers are collected** (optional, behind a consent dialog); privacy page unreviewed by a lawyer; no retention or deletion process.
6. **Photo content is unmoderated** until three distinct IPs flag it; no handling of faces, number plates or illegal images.
7. **Never built or run on a device:** release APK and iOS builds untested; the consent and duplicate dialogs have no widget tests.
8. New dependency `sharp` must be installed (`npm install`).

### What to do next, in order

1. **You:** get ONE pilot authority and a named contact (a signed letter or MoU for DNCC, or an existing channel such as the 333 hotline or a2i GRS). Without this the product is a complaint wall. If none will sign, relaunch honestly as a public-pressure and press-report tool.
2. **You:** supply real boundary data (GeoJSON from BBS, LGED or OSM) and replace `src/data/jurisdictions.json`; delete the placeholder boxes.
3. **Code:** give each authority a token-scoped inbox or link to set `in_progress` or `resolved` with an after photo, plus a digest email.
4. **You:** pick a host, set up HTTPS, daily backups, and an uptime check; set `ADMIN_TOKEN`, `TRUST_PROXY`, `CORS_ORIGINS` in production.
5. **Code:** per-admin accounts and an admin audit log; shared rate-limit store (Redis or the database); retention and deletion for phone numbers.
6. **You:** build the release APK and an iOS build, test on real phones (permissions, camera, GPS, offline); legal review of `/privacy`.
7. **Code:** widget tests for the consent and duplicate dialogs; an image-moderation or at least face and plate blurring plan.

### Update 9 (2026-10-12, stopped at the 70% usage ceiling)

**Done this round:** retro guardrails (`scripts/check.sh`, pre-commit hook `.githooks/pre-commit`, CI workflow, `AGENTS.md`, `CODING_STANDARDS.md`); orphaned worktrees removed (Suggest.Bike); all work committed and pushed to `origin/main`. Usage mirror `../usage.md` is live (status line writes the 5-hour and 7-day percentages); read it before starting a round.

**I was in the middle of:** nothing half-done. The last action was this log. No uncommitted work remains apart from this file.

**Not verified:** the GitHub CI workflows have never run; the pre-commit hook has never blocked a real commit; no real-device, real-user or real-host testing.
**Next, first:** a pilot authority contact and real jurisdiction data (Update 8, step 1); check that the first CI run passes on GitHub (Node 22, Flutter).


### Update 10 (2026-10-13, agent-made; verified by `scripts/check.sh` unless marked)

**Fixed:** CI had failed on both pushes: `backend/.gitignore` pattern `data/` also ignored `backend/src/data/`, so `jurisdictions.json` was never committed. Anchored to `/data/`.

**Added:** authority inbox (`/authority.html`, `GET/PATCH /api/authority/reports`, `x-authority-token`, scoped to one authority, resolve requires an after photo, `afterPhotoUrl` in the public report JSON); per-admin tokens (`admins` table, root `ADMIN_TOKEN` still works as actor `root`) and an audit log (`GET /api/reports/admin/audit`); rate limits and failed-auth counters now stored in SQLite (`rate_hits`); contact name/phone erased after `CONTACT_RETENTION_DAYS` (default 90, startup + daily); digest email (`node scripts/manage.js digest`, run from cron); `PRD.md` (ASD-STE100 style, no STE checker run, metric targets are proposals); Flutter tests for the consent and duplicate dialogs (dialogs extracted to top-level functions in `report_form_screen.dart`; navigation after "View it" is not covered). Tokens are created with `node scripts/manage.js add-admin|add-authority`.

**Still open:** authority contacts and polygons (blockers 1-2) are unchanged, so nobody real receives reports; digest needs SMTP and a cron entry; no UI for managing tokens or viewing the audit log; reporters have no self-service erasure; token lifetime/rotation not handled; image moderation / face and plate blurring; hosting, HTTPS, backups; no device testing. New code has had no human review.

### Update 11 (2026-10-14, agent round, pushed `d473fff`)

Done (`scripts/check.sh` exit 0): admin and authority tokens expire (`TOKEN_TTL_DAYS`, default 180) and can be rotated or revoked by CLI and API, all audited; token and audit-log tables in `admin.html` (textContent only); reporters get a one-time deletion code and `POST /api/reports/:id/erase-contact` erases name and phone; `privacy.html` updated.
**Not done:** the Flutter app does not show the deletion code yet; the new CLI commands have no tests. Blockers 1-2 (authority contacts, polygons) and hosting are unchanged, so the score stays at 30%.
