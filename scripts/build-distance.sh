#!/usr/bin/env bash
# Report how many commits have landed since the last RELEASE build, so a build never drifts more than
# BUILD_DISTANCE_MAX (default 100) commits from the previous one.
#
# "Last build" == the most recent vX.Y.Z tag. That's the only durable release marker in the repo: a
# tag push triggers .github/workflows/build.yml's `release` job (build.yml lines 11-12, 94-96), and
# ad-hoc workflow_dispatch builds are deliberately untagged. Cutting a new release (tag vX.Y.Z) moves
# the marker and resets the count for free — no extra state file to maintain.
#
# Usage:
#   scripts/build-distance.sh            # one-line summary (dev.sh prints this on startup)
#   scripts/build-distance.sh --count    # print just the number (for hooks / other scripts)
#   scripts/build-distance.sh --json     # {count,max,warn,lastTag,overdue} (the VS Code badge reads this)
#   scripts/build-distance.sh --quiet    # print ONLY when at/over the cap (for a git hook); exit 0
#   scripts/build-distance.sh --check    # like --quiet; informational only — always exits 0 (gate disabled)
set -euo pipefail

MAX=${BUILD_DISTANCE_MAX:-100}
WARN=$(( MAX * 9 / 10 ))   # gentle heads-up once 90% of the way to the cap

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

# --count: machine-readable, nothing else.
if [[ "$MODE" == "--count" ]]; then
  echo "$COUNT"
  exit 0
fi

# --json: structured, for the VS Code status-bar extension.
if [[ "$MODE" == "--json" ]]; then
  overdue=false; (( COUNT >= MAX )) && overdue=true
  printf '{"count":%d,"max":%d,"warn":%d,"lastTag":"%s","overdue":%s}\n' \
    "$COUNT" "$MAX" "$WARN" "${LAST_TAG:-}" "$overdue"
  exit 0
fi

# ANSI (skip when not a TTY, e.g. piped into a log).
if [[ -t 1 ]]; then RED=$'\e[1;31m'; YEL=$'\e[33m'; DIM=$'\e[2m'; RST=$'\e[0m'; else RED=""; YEL=""; DIM=""; RST=""; fi

OVERDUE_MSG="${YEL}⚠️  Build distance: ${COUNT} commits ${REF} (cap ${MAX}).${RST} Consider cutting a release: ${YEL}git tag vX.Y.Z && git push origin vX.Y.Z${RST} to trigger the build + GitHub Release."

if (( COUNT >= MAX )); then
  echo "$OVERDUE_MSG"
  # Gate disabled: --check no longer fails (was `exit 1`). Informational only — never blocks commits/CI.
  exit 0
fi

# Below the cap: --quiet/--check stay silent so they only ever speak up when action is needed.
if [[ "$MODE" == "--quiet" || "$MODE" == "--check" ]]; then
  exit 0
fi

if (( COUNT >= WARN )); then
  echo "${YEL}Build distance: ${COUNT}/${MAX} commits ${REF} — release soon (cut a vX.Y.Z tag).${RST}"
else
  echo "${DIM}Build distance: ${COUNT}/${MAX} commits ${REF}.${RST}"
fi
