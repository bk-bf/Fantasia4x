#!/usr/bin/env bash
set -euo pipefail

MAX=${BUILD_DISTANCE_MAX:-100}
WARN=$(( MAX * 9 / 10 ))

MODE="${1:-summary}"

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

LAST_TAG=$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || echo "")
if [[ -z "$LAST_TAG" ]]; then
  COUNT=$(git rev-list --count HEAD 2>/dev/null || echo 0)
  REF="no v* release tag yet — counting all commits"
else
  COUNT=$(git rev-list --count "$LAST_TAG"..HEAD 2>/dev/null || echo 0)
  REF="since $LAST_TAG"
fi

if [[ "$MODE" == "--count" ]]; then
  echo "$COUNT"
  exit 0
fi

if [[ "$MODE" == "--json" ]]; then
  overdue=false; (( COUNT >= MAX )) && overdue=true
  printf '{"count":%d,"max":%d,"warn":%d,"lastTag":"%s","overdue":%s}\n' \
    "$COUNT" "$MAX" "$WARN" "${LAST_TAG:-}" "$overdue"
  exit 0
fi

if [[ -t 1 ]]; then RED=$'\e[1;31m'; YEL=$'\e[33m'; DIM=$'\e[2m'; RST=$'\e[0m'; else RED=""; YEL=""; DIM=""; RST=""; fi

OVERDUE_MSG="${YEL}⚠️  Build distance: ${COUNT} commits ${REF} (cap ${MAX}).${RST} Consider cutting a release: ${YEL}git tag vX.Y.Z && git push origin vX.Y.Z${RST} to trigger the build + GitHub Release."

if (( COUNT >= MAX )); then
  echo "$OVERDUE_MSG"
  exit 0
fi

if [[ "$MODE" == "--quiet" || "$MODE" == "--check" ]]; then
  exit 0
fi

if (( COUNT >= WARN )); then
  echo "${YEL}Build distance: ${COUNT}/${MAX} commits ${REF} — release soon (cut a vX.Y.Z tag).${RST}"
else
  echo "${DIM}Build distance: ${COUNT}/${MAX} commits ${REF}.${RST}"
fi
