#!/usr/bin/env bash
# Start the Fantasia4x dev server on a fixed port.
# If something is already listening on that port, print its info and exit.
# Pass --debug to enable debug overlays (entity IDs, dev controls, map reroll).
# Pass --profiler to boot the heavy populated profiling sandbox (4× speed, turn profiler ON,
#   implies --debug) — open the page and watch [PROF] logs / globalThis.__profOut. See
#   src/lib/game/dev/profilerScenario.ts.
#
# Worktree-local port: create a .devport file next to dev.sh containing just the
# port number (e.g. "5174"). Gitignored — only affects the checkout it lives in.

PORT=5173
DEBUG_MODE=false
PROFILER_MODE=false

# Read worktree-local port override if present
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$SCRIPT_DIR/.devport" ]]; then
  PORT=$(< "$SCRIPT_DIR/.devport")
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug) DEBUG_MODE=true ;;
    --profiler) PROFILER_MODE=true; DEBUG_MODE=true ;;
    --port) PORT="$2"; shift ;;
    --port=*) PORT="${1#--port=}" ;;
  esac
  shift
done

# Generate .svelte-kit/ type definitions if missing (fresh worktree / clean checkout)
if [[ ! -d "$SCRIPT_DIR/.svelte-kit" ]]; then
  echo "Generating .svelte-kit/…"
  (cd "$SCRIPT_DIR" && CI=true pnpm exec svelte-kit sync 2>&1) || true
fi

if lsof -ti tcp:$PORT >/dev/null 2>&1; then
  echo "Dev server already running on http://localhost:$PORT"
  echo "PID(s): $(lsof -ti tcp:$PORT | tr '\n' ' ')"
  exit 0
fi

export PATH="$HOME/.npm-global/bin:$PATH"

# Pass current branch name so the UI can label itself in multi-worktree setups
BRANCH=$(git -C "$SCRIPT_DIR" branch --show-current 2>/dev/null || echo "")

PROFILER_ENV=""
if [[ "$PROFILER_MODE" == "true" ]]; then
  echo "Profiler sandbox enabled — heavy populated map, 4× speed, turn profiler ON."
  echo "  Open http://localhost:$PORT and watch the console [PROF] logs (or read globalThis.__profOut)."
  PROFILER_ENV="VITE_PROFILER=true"
fi

if [[ "$DEBUG_MODE" == "true" ]]; then
  echo "Debug mode enabled — entity IDs and dev controls will be visible."
  exec env $PROFILER_ENV VITE_DEBUG_MODE=true VITE_DEV_BRANCH="$BRANCH" pnpm exec vite dev --host --port $PORT
else
  exec env $PROFILER_ENV VITE_DEV_BRANCH="$BRANCH" pnpm exec vite dev --host --port $PORT
fi
