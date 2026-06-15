#!/usr/bin/env bash
# launch.sh — start main + all .worktrees/launch/* dev servers with debug mode.
# Ctrl-C kills them all.
#
# --profiler: focused profiling session — launches ONLY the main server in the heavy
#   profiler sandbox (./dev.sh --profiler), skipping the worktree fan-out. The live
#   codegraph viewer still runs (it auto-updates as you edit, same as --debug).

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

# Live codebase-graph viewer + watcher. The standalone codegraph tool lives in its
# own repo; the watcher re-extracts this project's graph on src change and the
# viewer (CODEGRAPH_NO_WATCH=1 so it doesn't double-watch) live-reloads on each
# re-extract. Both are PID-tracked so they stop cleanly. Override location/port
# with CODEGRAPH_DIR / CODEGRAPH_PORT.
start_codegraph() {
  CODEGRAPH_PORT=${CODEGRAPH_PORT:-5185}
  CODEGRAPH_DIR=${CODEGRAPH_DIR:-"$SCRIPT_DIR/../codegraph"}
  if [[ ! -f "$CODEGRAPH_DIR/bin/codegraph.mjs" ]]; then
    echo "  [codegraph] not found at $CODEGRAPH_DIR — set CODEGRAPH_DIR or run its own dev server"
    return
  fi
  # Free the port if a previous (possibly Ctrl-Z'd) viewer is holding it.
  local holders
  holders=$(lsof -ti tcp:$CODEGRAPH_PORT 2>/dev/null)
  [[ -n "$holders" ]] && { kill -CONT $holders 2>/dev/null; kill $holders 2>/dev/null; sleep 0.4; }
  (cd "$CODEGRAPH_DIR" && exec node bin/codegraph.mjs watch Fantasia4x) &
  PIDS+=($!)
  (cd "$CODEGRAPH_DIR" && exec env CI=true CODEGRAPH_NO_WATCH=1 pnpm dev --port "$CODEGRAPH_PORT" --strictPort) &
  PIDS+=($!)
  echo "  [codegraph] http://localhost:$CODEGRAPH_PORT  (standalone: $CODEGRAPH_DIR)"
}

# Profiler sandbox: a single focused server, no worktree fan-out — but the live
# codegraph viewer still runs (auto-updating) so the graph stays current.
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
