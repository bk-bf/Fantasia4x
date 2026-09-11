#!/usr/bin/env bash
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../../.."
NODE="${AUDIT_NODE:-$HOME/.nvm/versions/node/v24.19.0/bin/node}"
export PATH="$(dirname "$NODE"):$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

failed=0
for _ in $(seq 1 20); do
  out=$("$NODE" tools/audit/review.mjs --merge --next 2>&1)
  code=$?
  printf '%s\n' "$out"
  if grep -q '^ABORT: ' <<<"$out"; then
    grep -q '^ABORT: no card is Approved' <<<"$out" || failed=1
    break
  fi
  (( code == 0 )) || failed=1
done

exit "$failed"
