#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOKS_DIR="$(git -C "$ROOT" rev-parse --git-path hooks)"

for hook in pre-commit commit-msg; do
  SRC="$ROOT/scripts/hooks/$hook"
  DEST="$HOOKS_DIR/$hook"
  if [[ -e "$DEST" && ! -L "$DEST" ]]; then
    echo "hooks: $DEST already exists and isn't our symlink — leaving it alone."
    echo "  Merge manually or rm it, then re-run."
    exit 1
  fi
  ln -sf "$SRC" "$DEST"
  chmod +x "$SRC"
  echo "hooks: installed $hook → $DEST"
done

echo
echo "  pre-commit  informational only — prints a heads-up once the tree is \$BUILD_DISTANCE_MAX"
echo "              (default 100) commits past the last v* tag. It does not block."
echo "  commit-msg  refuses a message that is not \"type(scope): lowercase summary\" with a"
echo "              bullet body. Bypass once with: git commit --no-verify"
