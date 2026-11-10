#!/usr/bin/env bash
# Rebuild demo/data, demo/img and the data block in demo/index.html from one real run of the backend.
# Everything fed in is synthetic: generated road photos (no people, no vehicles, no plates), invented points
# inside the placeholder jurisdiction boxes, and a script playing the "authority". Nothing is emailed:
# SMTP is unset and the digest is a --dry-run. The backend runs from a temp copy with a temp DB and PHOTO_REVIEW=1.
# Needs: node >= 22.5, npm, Google Chrome (for the screenshots).
set -euo pipefail
DEMO="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(dirname "$DEMO")"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/pa-demo.XXXXXX")"
PID=
cleanup() { [ -n "$PID" ] && kill "$PID" 2>/dev/null || true; rm -rf "$WORK"; }
trap cleanup EXIT

rsync -a --exclude /node_modules --exclude /data --exclude /uploads --exclude /.env "$REPO/backend/" "$WORK/backend/"
(cd "$WORK/backend" && npm ci --silent --no-audit --no-fund)

export DB_PATH="$WORK/demo.db" UPLOAD_DIR="$WORK/uploads" PHOTO_REVIEW=1 PORT=4417 PUBLIC_URL=https://demo.invalid
ADMIN_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
export ADMIN_TOKEN
unset SMTP_HOST REPORT_LIMIT_PER_HOUR TRUST_PROXY PHOTO_DETECTOR # defaults on purpose: the run shows the default per-IP limit

# The scripted "authority": a token for the placeholder DNCC box, with a reserved .invalid address so nothing can be delivered.
AUTH_TOKEN="$(cd "$WORK/backend" && node scripts/manage.js add-authority "ঢাকা উত্তর সিটি কর্পোরেশন (DNCC)" digest@example.invalid | sed 's/.*token: //')"
export AUTH_TOKEN

node "$WORK/backend/src/server.js" > "$WORK/server.log" 2>&1 &
PID=$!
for _ in $(seq 50); do curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break; sleep 0.2; done

node "$DEMO/tools/run_demo.js" "$WORK" "$DEMO"
echo "demo size: $(du -sk "$DEMO" | cut -f1) KB"
