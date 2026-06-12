#!/usr/bin/env bash
# Start the Fantasia4x dev server on a fixed port.
# If something is already listening on that port, print its info and exit.
# Pass --debug to enable debug overlays (entity IDs, dev controls, map reroll).
#
# Worktree-local port: create a .devport file next to dev.sh containing just the
# port number (e.g. "5174"). Gitignored — only affects the checkout it lives in.

PORT=5173
DEBUG_MODE=false

# Read worktree-local port override if present
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$SCRIPT_DIR/.devport" ]]; then
  PORT=$(< "$SCRIPT_DIR/.devport")
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug) DEBUG_MODE=true ;;
    --port) PORT="$2"; shift ;;
    --port=*) PORT="${1#--port=}" ;;
  esac
  shift
done

if lsof -ti tcp:$PORT >/dev/null 2>&1; then
  echo "Dev server already running on http://localhost:$PORT"
  echo "PID(s): $(lsof -ti tcp:$PORT | tr '\n' ' ')"
  exit 0
fi

export PATH="$HOME/.npm-global/bin:$PATH"
if [[ "$DEBUG_MODE" == "true" ]]; then
  echo "Debug mode enabled — entity IDs and dev controls will be visible."
  exec env VITE_DEBUG_MODE=true pnpm exec vite dev --host --port $PORT
else
  exec pnpm exec vite dev --host --port $PORT
fi
