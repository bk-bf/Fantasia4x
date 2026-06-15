#!/usr/bin/env bash
# launch.sh — start main + all .worktrees/launch/* dev servers with debug mode.
# Ctrl-C kills them all.
#
# --profiler: focused profiling session — launches ONLY the main server in the heavy
#   profiler sandbox (./dev.sh --profiler), skipping the worktree fan-out. The
#   codegraph viewer still runs (read-only; rebuild it with its ↻ header button).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDS=()

# --debug enables the live codebase-graph server (off by default).
DEBUG=false
PROFILER=false
for arg in "$@"; do
  [[ "$arg" == "--debug" ]] && DEBUG=true
  [[ "$arg" == "--profiler" ]] && PROFILER=true
done

cleanup() {
  [[ ${#PIDS[@]} -eq 0 ]] && return
  echo ""
  echo "Stopping all dev servers..."
  kill -CONT "${PIDS[@]}" 2>/dev/null || true  # wake any Ctrl-Z'd child so it can exit
  kill "${PIDS[@]}" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "Done."
}
trap cleanup INT TERM

launch() {
  local dir="$1" label="$2" extra="${3:-}"
  local port=5173
  [[ -f "$dir/.devport" ]] && port=$(< "$dir/.devport")
  # A Ctrl-Z'd previous launch leaves a suspended server holding the port:
  # dev.sh then reports "already running" but nothing serves. Resume it.
  local holders stopped
  holders=$(lsof -ti tcp:$port 2>/dev/null)
  if [[ -n "$holders" ]]; then
    stopped=$(ps -o pid=,stat= -p $holders 2>/dev/null | awk '$2 ~ /^T/ {print $1}')
    if [[ -n "$stopped" ]]; then
      echo "  [$label] resuming suspended server (PID $stopped)"
      kill -CONT $stopped 2>/dev/null
    fi
  fi
  # shellcheck disable=SC2086 -- $extra is an intentional optional flag passthrough
  (cd "$dir" && exec env CI=true ./dev.sh --debug $extra) &
  PIDS+=($!)
  echo "  [$label] http://localhost:$port"
  sleep 0.3
}

# Codebase-graph viewer. The standalone codegraph tool lives in its own repo.
# No live watcher (it hogs CPU/RAM and competes with playtesting): the graph is
# built once only if it's missing, then served read-only — use the ↻ Refresh
# button in the viewer's header to rebuild on demand. Override location/port with
# CODEGRAPH_DIR / CODEGRAPH_PORT.
start_codegraph() {
  CODEGRAPH_PORT=${CODEGRAPH_PORT:-5185}
  CODEGRAPH_DIR=${CODEGRAPH_DIR:-"$SCRIPT_DIR/../codegraph"}
  if [[ ! -f "$CODEGRAPH_DIR/bin/codegraph.mjs" ]]; then
    echo "  [codegraph] not found at $CODEGRAPH_DIR — set CODEGRAPH_DIR or run its own dev server"
    return
  fi
  # First run only: build the graph once in the background so the viewer isn't
  # empty. After that it's rebuilt on demand via the header's ↻ Refresh button.
  if [[ ! -f "$CODEGRAPH_DIR/data/Fantasia4x.json" ]]; then
    echo "  [codegraph] no graph yet — building once in the background…"
    (cd "$CODEGRAPH_DIR" && node bin/codegraph.mjs extract Fantasia4x >/dev/null 2>&1 &)
  fi
  # Free the port if a previous (possibly Ctrl-Z'd) viewer is holding it.
  local holders
  holders=$(lsof -ti tcp:$CODEGRAPH_PORT 2>/dev/null)
  [[ -n "$holders" ]] && { kill -CONT $holders 2>/dev/null; kill $holders 2>/dev/null; sleep 0.4; }
  (cd "$CODEGRAPH_DIR" && exec env CI=true pnpm dev --port "$CODEGRAPH_PORT" --strictPort) &
  PIDS+=($!)
  echo "  [codegraph] http://localhost:$CODEGRAPH_PORT  (↻ Refresh in the header rebuilds the graph)"
}

# Profiler sandbox: a single focused server, no worktree fan-out — the codegraph
# viewer still runs (read-only, no watcher), so it won't compete for CPU.
if [[ "$PROFILER" == true ]]; then
  echo "Fantasia4x — profiler sandbox (main server only)"
  echo ""
  start_codegraph
  launch "$SCRIPT_DIR" "main" "--profiler"
  echo ""
  echo "Ctrl-C to stop."
  wait
  exit 0
fi

echo "Fantasia4x — launching all dev servers (debug mode)"
echo ""

launch "$SCRIPT_DIR" "main"

LAUNCH_DIR="$SCRIPT_DIR/.worktrees/launch"
if [[ -d "$LAUNCH_DIR" ]]; then
  for wt in "$LAUNCH_DIR"/*/; do
    [[ -f "$wt/dev.sh" ]] || continue
    launch "$wt" "$(basename "$wt")"
  done
fi

# Live codebase-graph viewer (--debug only).
if [[ "$DEBUG" == true ]]; then
  start_codegraph
fi

echo ""
echo "Ctrl-C to stop all."
wait
