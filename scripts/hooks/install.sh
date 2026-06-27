#!/usr/bin/env bash
# Install Fantasia4x git hooks (tracked in scripts/hooks/) into this checkout's .git/hooks.
# Idempotent. .git/hooks isn't version-controlled, so re-run this in a fresh clone / worktree.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOKS_DIR="$(git -C "$ROOT" rev-parse --git-path hooks)"
SRC="$ROOT/scripts/hooks/pre-commit"
DEST="$HOOKS_DIR/pre-commit"

if [[ -e "$DEST" && ! -L "$DEST" ]]; then
  echo "build-distance: $DEST already exists and isn't our symlink — leaving it alone."
  echo "  Merge manually or rm it, then re-run. (It should 'exec scripts/build-distance.sh --check'.)"
  exit 1
fi

ln -sf "$SRC" "$DEST"
chmod +x "$SRC"
echo "build-distance: installed pre-commit hook → $DEST"
echo "  Informational only — prints a heads-up once the tree is \$BUILD_DISTANCE_MAX (default 100) commits"
echo "  past the last v* tag, but no longer blocks the commit (hard gate disabled)."
