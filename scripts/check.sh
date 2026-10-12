#!/usr/bin/env bash
# Run every check; --fast runs lint + stray-file checks only.
set -euo pipefail
cd "$(dirname "$0")/.."
FAST=0; [ "${1:-}" = "--fast" ] && FAST=1
NAMES=(); RESULTS=(); FAILED=0
run() { # name cmd...
  local n=$1; shift; echo "== $n"
  if "$@"; then RESULTS+=(pass); else RESULTS+=(FAIL); FAILED=1; fi
  NAMES+=("$n")
}
skip() { NAMES+=("$1"); RESULTS+=("SKIP ($2)"); echo "== $1: SKIP ($2)"; }

node_check() { local f; while IFS= read -r f; do node --check "$f" || return 1; done < <(find backend/src backend/test backend/scripts -name '*.js'); }
stray() {
  local out; out=$(find . \( -name node_modules -o -name .git -o -name build -o -name .dart_tool \) -prune -o \
    \( -name '*-e' -o -name '*.orig' -o -name '*.rej' -o -name '*.bak' \) -type f -print)
  [ -z "$out" ] || { echo "$out"; return 1; }
}

run lint:node-check node_check
run stray-files stray
run unsafe-html scripts/lint-innerhtml.sh
if command -v flutter >/dev/null 2>&1; then
  run lint:flutter-analyze bash -c 'cd app && flutter analyze'
else
  skip lint:flutter-analyze "flutter not on PATH"
fi
if [ "$FAST" = 0 ]; then
  run test:backend bash -c 'cd backend && npm test'
  if command -v flutter >/dev/null 2>&1; then
    run test:flutter bash -c 'cd app && flutter test'
  else
    skip test:flutter "flutter not on PATH"
  fi
fi

echo; echo "step | result"; echo "-----|-------"
for i in "${!NAMES[@]}"; do echo "${NAMES[$i]} | ${RESULTS[$i]}"; done
exit $FAILED
