#!/usr/bin/env bash
# Fail on interpolated/concatenated/multi-line-template values flowing into HTML sinks.
# Allow a line with a trailing `// safe-html: <reason>` comment.
set -uo pipefail
cd "$(dirname "$0")/.."
hits=$(grep -rnE --include='*.html' --include='*.js' --include='*.jsx' --include='*.tsx' \
  --exclude-dir=node_modules --exclude-dir=build --exclude-dir=.dart_tool --exclude-dir=.git --exclude-dir=coverage --exclude-dir=vendor \
  '(innerHTML|outerHTML|insertAdjacentHTML|document\.write|dangerouslySetInnerHTML)' . \
  | grep -vE '//[[:space:]]*safe-html:' \
  | awk -F: '{ line=$0; sub(/^[^:]*:[^:]*:/,"",line); t=line; n=gsub(/`/,"",t);
      if (line ~ /\$\{/ || line ~ /[^+]\+[^+=]/ || n%2==1) print }')
if [ -n "$hits" ]; then
  echo "unsafe HTML sinks (add escape or '// safe-html: <reason>'):"; echo "$hits"; exit 1
fi
echo "lint-innerhtml: ok"
