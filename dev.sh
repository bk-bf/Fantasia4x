#!/usr/bin/env bash
# Start the Fantasia4x dev server on a fixed port.
# If something is already listening on that port, print its info and exit.
# Pass --debug to enable debug overlays (entity IDs, dev controls, map reroll) + verbose logging.
# Pass --hmr to opt INTO Vite hot-reload / live page-reload. It is OFF by default so an agent editing
#   the tree never reloads a live playtest. Composable with any other flag (e.g. ./dev.sh --debug --hmr).
# Pass --log to enable ONLY the in-game DEBUG log tab + verbose firehose (no other dev UI). Composable
#   with --profiler (e.g. ./dev.sh --profiler --log) to watch the log during an otherwise-clean run.
# Pass --profiler to boot the heavy populated sandbox (giant map, 150 pawns…) but with the REAL-game
#   startup: PAUSED, behind the lingering loading overlay — for measuring the loading-screen hack
#   (and gameplay) under realistic load. It deliberately does NOT enable --debug/verbose logging.
# Pass --profiler-autorun for the CAPTURE run: same heavy sandbox but auto-unpaused at 4× with the
#   overlay dropped immediately, so the running sim's startup can be recorded in the Firefox Profiler.
#   See src/lib/game/dev/profilerScenario.ts.
#
# Worktree-local port: create a .devport file next to dev.sh containing just the
# port number (e.g. "5174"). Gitignored — only affects the checkout it lives in.

PORT=5173
DEBUG_MODE=false
LOG_MODE=false
PROFILER_MODE=false
PROFILER_AUTORUN=false
HMR_MODE=false

# Read worktree-local port override if present
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$SCRIPT_DIR/.devport" ]]; then
  PORT=$(< "$SCRIPT_DIR/.devport")
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug) DEBUG_MODE=true ;;
    --log) LOG_MODE=true ;; # log tab + verbose firehose only; no other dev UI (composable w/ --profiler)
    --profiler) PROFILER_MODE=true ;; # heavy sandbox, real-game (paused) startup — NOT --debug
    --profiler-autorun) PROFILER_MODE=true; PROFILER_AUTORUN=true ;; # heavy sandbox, capture run
    --hmr) HMR_MODE=true ;; # opt into Vite hot-reload / live page-reload (off by default)
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

# Pass the build's commit so the debug/profiler header shows which build is running. Append "*" when
# the working tree is dirty (uncommitted changes — the running build is ahead of the named commit).
COMMIT=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo "")
if [[ -n "$COMMIT" ]] && ! git -C "$SCRIPT_DIR" diff --quiet HEAD 2>/dev/null; then
  COMMIT="$COMMIT*"
fi

PROFILER_ENV=""
if [[ "$PROFILER_MODE" == "true" ]]; then
  PROFILER_ENV="VITE_PROFILER=true"
  if [[ "$PROFILER_AUTORUN" == "true" ]]; then
    echo "Profiler CAPTURE run — heavy populated map, auto-unpaused at 4×, overlay dropped immediately."
    echo "  Open http://localhost:$PORT, record in the Firefox Profiler, then read with scripts/profile-self.mjs."
    PROFILER_ENV="$PROFILER_ENV VITE_PROFILER_AUTORUN=true"
  else
    echo "Profiler sandbox — heavy populated map, REAL-game startup (PAUSED behind the loading overlay)."
    echo "  For a clean capture run of the running sim, use ./dev.sh --profiler-autorun instead."
  fi
fi

# Compose the debug-flavour env: --debug is the superset (dev UI + log + firehose); --log is just the
# DEBUG log tab + verbose firehose. Vite reads these VITE_-prefixed vars from the environment.
DEBUG_ENV=""
if [[ "$DEBUG_MODE" == "true" ]]; then
  echo "Debug mode enabled — entity IDs, dev controls, and the DEBUG log tab will be visible."
  DEBUG_ENV="VITE_DEBUG_MODE=true"
elif [[ "$LOG_MODE" == "true" ]]; then
  echo "Log mode enabled — the DEBUG log tab + verbose logging are on (no other dev UI)."
  DEBUG_ENV="VITE_DEBUG_LOG=true"
fi

# HMR is OFF by default (vite.config.ts reads F4X_HMR) so an agent editing the tree never reloads a
# live playtest. --hmr opts back in.
HMR_ENV=""
if [[ "$HMR_MODE" == "true" ]]; then
  echo "HMR enabled — Vite hot-reload / live page-reload is ON."
  HMR_ENV="F4X_HMR=true"
else
  echo "HMR disabled (default) — pass --hmr to enable hot-reload."
fi

# shellcheck disable=SC2086 -- $PROFILER_ENV/$DEBUG_ENV/$HMR_ENV are intentional VAR=val flag passthroughs
exec env $PROFILER_ENV $DEBUG_ENV $HMR_ENV VITE_DEV_BRANCH="$BRANCH" VITE_DEV_COMMIT="$COMMIT" pnpm exec vite dev --host --port $PORT
