#!/usr/bin/env bash
# launch.sh — start main + all .worktrees/launch/* dev servers with debug mode.
# Ctrl-C kills them all.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDS=()

cleanup() {
  [[ ${#PIDS[@]} -eq 0 ]] && return
  echo ""
  echo "Stopping all dev servers..."
  kill "${PIDS[@]}" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "Done."
}
trap cleanup INT TERM

launch() {
  local dir="$1" label="$2"
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
  (cd "$dir" && exec env CI=true ./dev.sh --debug) &
  PIDS+=($!)
  echo "  [$label] http://localhost:$port"
  sleep 0.3
}

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

echo ""
echo "Ctrl-C to stop all."
wait
