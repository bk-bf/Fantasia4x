#!/usr/bin/env bash
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="${1:-$HOME/.vscode/extensions}"
LINK="$EXT_DIR/fantasia4x-build-distance"

mkdir -p "$EXT_DIR"
ln -sfn "$SRC" "$LINK"
echo "Linked $LINK → $SRC"
echo "Now run 'Developer: Reload Window' in VS Code to load it (badge appears bottom-right)."
