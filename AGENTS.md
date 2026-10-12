# AGENTS.md

- Run `scripts/check.sh` before finishing; `--fast` (lint + stray files) is what the pre-commit hook runs.
- `git config core.hooksPath .githooks` is set locally; it needs re-running after a fresh clone.
- Two projects: `backend/` (Node >=22.5, uses built-in `node:sqlite`, no ESLint, so lint = `node --check`) and `app/` (Flutter).
- check.sh runs the Flutter steps only if `flutter` is on PATH, otherwise prints SKIP. CI installs it via subosito/flutter-action.
- Backend tests need no env: `backend/test/api.test.js` sets `DB_PATH`/`UPLOAD_DIR` to a temp dir. Never point them at `backend/data`.
- Runtime env vars are listed in `backend/.env.example`; with `NODE_ENV=production` the server refuses to start with a missing/default `ADMIN_TOKEN`.
- `backend/src/data/jurisdictions.json` polygons are APPROXIMATE placeholders and every authority contact is null, so routing is not real.
- `scripts/lint-innerhtml.sh` guards `backend/public/*.html`; annotate an audited line with a trailing `// safe-html: <reason>` (not possible inside a template literal; assign to a variable first).
- Changing admin UI or auth: read `judge.md` (Critical blockers 3 and 4) for the XSS and privacy history.
- Judging launch readiness or priorities: read `judge.md` (latest "Update" at the bottom) and `todo.md`.
- Review standards: `CODING_STANDARDS.md`.
