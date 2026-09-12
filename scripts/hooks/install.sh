#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOKS_DIR="$(git -C "$ROOT" rev-parse --git-path hooks)"

for hook in pre-commit commit-msg pre-push post-checkout; do
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
echo "  pre-commit  refuses a staged line that carries a private word."
echo "  commit-msg  refuses a message that is not \"type(scope): lowercase summary\" with a"
echo "              bullet body. Bypass once with: git commit --no-verify"
echo "  pre-push    refuses a new branch not named <type>/<title>-<issue number>, e.g."
echo "              fix/stealth-encounter-pacing-42. Bypass once with: git push --no-verify"
echo "  post-checkout  copies the main checkout's .svelte-kit/tsconfig.json into a new worktree"
echo "              that has none, so its tsconfig.json resolves in the editor."
