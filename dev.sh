#!/usr/bin/env bash

PORT=5173
DEBUG_MODE=false
LOG_MODE=false
PROFILER_MODE=false
PROFILER_AUTORUN=false
HMR_MODE=false
BROWSER_MODE=false
HEADLESS_MODE=false

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$SCRIPT_DIR/.devport" ]]; then
  PORT=$(< "$SCRIPT_DIR/.devport")
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug) DEBUG_MODE=true ;;
    --log) LOG_MODE=true ;;
    --profiler) PROFILER_MODE=true ;;
    --profiler-autorun) PROFILER_MODE=true; PROFILER_AUTORUN=true ;;
    --hmr) HMR_MODE=true ;;
    --browser) BROWSER_MODE=true ;;
    --tools) TOOLS_MODE=true ;;
    --headless) HEADLESS_MODE=true ;;
    --port) PORT="$2"; shift ;;
    --port=*) PORT="${1#--port=}" ;;
  esac
  shift
done

bash "$SCRIPT_DIR/scripts/build-distance.sh" || true

if [[ ! -d "$SCRIPT_DIR/.svelte-kit" ]]; then
  echo "Generating .svelte-kit/…"
  (cd "$SCRIPT_DIR" && CI=true pnpm exec svelte-kit sync 2>&1) || true
fi

if [[ ! -f "$SCRIPT_DIR/src/lib/spatial-core-pkg/spatial_core.js" || ! -f "$SCRIPT_DIR/src/lib/sim-core-pkg/sim_core.js" ]]; then
  echo "Building WASM packages (spatial-core, sim-core)…"
  (cd "$SCRIPT_DIR" && pnpm add:wasm && pnpm add:wasm:sim) || {
    echo "dev.sh: WASM build failed — run 'pnpm add:wasm && pnpm add:wasm:sim' manually." >&2
    exit 1
  }
fi

if lsof -ti tcp:$PORT >/dev/null 2>&1; then
  echo "Dev server already running on http://localhost:$PORT"
  echo "PID(s): $(lsof -ti tcp:$PORT | tr '\n' ' ')"
  exit 0
fi

export PATH="$HOME/.npm-global/bin:$PATH"

BRANCH=$(git -C "$SCRIPT_DIR" branch --show-current 2>/dev/null || echo "")

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

DEBUG_ENV=""
if [[ "$DEBUG_MODE" == "true" ]]; then
  echo "Debug mode enabled — entity IDs, dev controls, and the DEBUG log tab will be visible."
  DEBUG_ENV="VITE_DEBUG_MODE=true"
elif [[ "$LOG_MODE" == "true" ]]; then
  echo "Log mode enabled — the DEBUG log tab + verbose logging are on (no other dev UI)."
  DEBUG_ENV="VITE_DEBUG_LOG=true"
fi

HMR_ENV=""
if [[ "$HMR_MODE" == "true" ]]; then
  echo "HMR enabled — Vite hot-reload / live page-reload is ON (loading-overlay warmup linger skipped)."
  HMR_ENV="F4X_HMR=true VITE_HMR=true"
fi

BROWSER_ENV=""
if [[ "$BROWSER_MODE" == "true" || "$PROFILER_MODE" == "true" ]]; then
  echo "Browser access ENABLED — the desktop-shell guard is lifted (plain browser can load the game)."
  BROWSER_ENV="F4X_ALLOW_BROWSER=true"
else
  echo "Browser access blocked (default) — game loads only in the desktop shell; pass --browser to allow."
fi

TOOLS_ENV=""
if [[ "$TOOLS_MODE" == "true" ]]; then
  echo "Dev-tools mode — /gear-db is browsable; the GAME stays guarded (only the desktop shell loads it)."
  TOOLS_ENV="VITE_TOOLS_MODE=true"
fi

HEADLESS_ENV=""
if [[ "$HEADLESS_MODE" == "true" ]]; then
  echo "Headless sim ENABLED — /api/sim/* routes live (start with: curl -X POST localhost:$PORT/api/sim/session -d '{\"preset\":\"bronze-colony\"}')."
  HEADLESS_ENV="VITE_HEADLESS=1"
fi

# shellcheck disable=SC2086 -- $PROFILER_ENV/$DEBUG_ENV/$HMR_ENV/$BROWSER_ENV/$TOOLS_ENV/$HEADLESS_ENV are intentional VAR=val flag passthroughs
exec env $PROFILER_ENV $DEBUG_ENV $HMR_ENV $BROWSER_ENV $TOOLS_ENV $HEADLESS_ENV VITE_DEV_BRANCH="$BRANCH" VITE_DEV_COMMIT="$COMMIT" pnpm --config.fetch-retries=0 exec vite dev --host --port $PORT
