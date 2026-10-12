# Coding standards (judgement calls)

- **Compare-and-set**: every state-changing write is `UPDATE ... WHERE id=? AND status=?`; check `changes`, return 409 on conflict. Why: concurrent admin/forwarder writes silently overwrite each other.
- **Explicit**: every route states its auth decision (public, admin token, or per-report); public is a commented, deliberate choice. Why: new routes default to open.
- **Fail closed**: secrets (`ADMIN_TOKEN`, SMTP) have no default or placeholder accepted in production. Why: `.env.example` values get deployed.
- **Public vs admin**: public serializers never contain contact name/phone, and exact-location or photo exposure is a stated decision. Why: reporter doxxing (judge.md #3).
- **Escape**: any user-supplied field (description, contact, filenames) reaching HTML goes through `esc()` or `textContent`. Why: stored XSS to admin token (judge.md #4).
- **Server-trusted**: derive file extension and type from the decoded bytes, never client `mimetype` or filename. Why: same-origin uploads run script.
- **Cap**: unbounded input (query `limit`/`offset`, upload size, text length, reports per IP) has an explicit maximum. Why: public anonymous write endpoint.
- **Caller keys**: dedupe or idempotency identity comes from the caller (client-supplied key) or a documented rule like radius/window, never a per-request random id. Why: retries on flaky mobile networks create duplicates.
- **Placeholder data is not authority**: approximate jurisdiction polygons (`src/data/jurisdictions.json`) and null contacts must never be presented to users, authorities or press as real routing; any UI/copy or email claiming "sent to X" must be gated on verified data. Why: false promise that a report reached an authority.
- **Unverified**: user-facing claims not measured (resolution rates, "forwarded", accuracy, response times) carry an UNVERIFIED marker. Why: the launch score is self-assessed.
- **Source of truth**: Flutter models and test fixtures take field names and statuses from the backend serializer; a test fails on drift. Why: the app and API are separate projects with no shared schema.
- **Privacy copy**: the app About screen and `privacy.html` must match what the backend actually stores and exposes. Why: false privacy claims are a legal risk.
