#!/usr/bin/env bash
# launch.sh — start main + all .worktrees/launch/* dev servers with debug mode.
# Ctrl-C kills them all.
#
# --profiler: focused profiling session — launches ONLY the main server in the heavy
#   profiler sandbox (./dev.sh --profiler), skipping the worktree fan-out.
# codegraph is a separate always-on systemd user service (see codegraph_hint below).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDS=()

PROFILER=false
for arg in "$@"; do
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
  # `extra` is the dev.sh flag set. Defaults to --debug (the normal launch.sh experience); the
  # profiler branch passes "--profiler" instead, so a profiling run is CLEAN (no --debug/verbose).
  local dir="$1" label="$2" extra="${3:---debug}"
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
  # shellcheck disable=SC2086 -- $extra is an intentional flag passthrough (--debug by default)
  (cd "$dir" && exec env CI=true ./dev.sh $extra) &
  PIDS+=($!)
  echo "  [$label] http://localhost:$port"
  sleep 0.3
}

# codegraph now runs as its own always-on systemd user service, decoupled from
# this script — no file watcher, rebuilt on demand via the ↻ button in its header,
# so it never competes with playtesting/profiling. We only print a pointer here.
#   manage it with:  systemctl --user {status,restart,stop} codegraph
codegraph_hint() {
  if systemctl --user is-active --quiet codegraph.service 2>/dev/null; then
    echo "  [codegraph] http://localhost:5185  (systemd --user service; ↻ in header rebuilds)"
  else
    echo "  [codegraph] viewer not running — start it: systemctl --user start codegraph"
  fi
}

# Profiler sandbox: a single focused server, no worktree fan-out.
if [[ "$PROFILER" == true ]]; then
  echo "Fantasia4x — profiler sandbox (main server only)"
  echo ""
  codegraph_hint
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

codegraph_hint

echo ""
echo "Ctrl-C to stop all."
wait
