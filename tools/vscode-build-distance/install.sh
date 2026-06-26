#!/usr/bin/env bash
# Install the Build Distance VS Code extension by symlinking this folder into the editor's
# extensions dir, then reload the window (Cmd/Ctrl+Shift+P → "Developer: Reload Window").
# Re-run after changing extension.js. Pass a target dir for VSCodium/Cursor, e.g.:
#   ./install.sh ~/.vscodium/extensions
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="${1:-$HOME/.vscode/extensions}"
LINK="$EXT_DIR/fantasia4x-build-distance"

mkdir -p "$EXT_DIR"
ln -sfn "$SRC" "$LINK"
echo "Linked $LINK → $SRC"
echo "Now run 'Developer: Reload Window' in VS Code to load it (badge appears bottom-right)."
