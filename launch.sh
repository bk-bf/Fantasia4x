#!/usr/bin/env bash
# launch.sh — start main + all .worktrees/launch/* dev servers with debug mode.
# Ctrl-C kills them all.
#
# --profiler: focused profiling session — launches ONLY the main server in the heavy
#   profiler sandbox (./dev.sh --profiler), skipping the worktree fan-out.
# --electron / --tauri: wrap a SINGLE main server in a desktop webview for the cross-engine
#   TPS spike (V8/Chromium vs WebKitGTK/JSC). Combinable with --debug (default) or --profiler;
#   skips the worktree fan-out (the shell points at one port). Closing the window stops the server.
#     ./launch.sh --debug --electron      ./launch.sh --profiler --tauri
# --log: add the in-game DEBUG log tab + verbose firehose (no other dev UI) to any launch — handy
#   to watch the log under --profiler/--electron, e.g. ./launch.sh --profiler --electron --log.
# codegraph is a separate always-on systemd user service (see codegraph_hint below).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDS=()

PROFILER=false
LOG=false
SHELL_TARGET=""
for arg in "$@"; do
  case "$arg" in
    --profiler) PROFILER=true ;;
    --log) LOG=true ;;
    --electron) SHELL_TARGET=electron ;;
    --tauri) SHELL_TARGET=tauri ;;
  esac
done
# Suffix appended to a server's dev.sh flag set when --log is requested (dev.sh parses multiple flags).
LOG_FLAG=""; [[ "$LOG" == true ]] && LOG_FLAG=" --log"

cleanup() {
  [[ ${#PIDS[@]} -eq 0 ]] && return
  echo ""
  echo "Stopping all dev servers..."
  kill -CONT "${PIDS[@]}" 2>/dev/null || true  # wake any Ctrl-Z'd child so it can exit
  kill "${PIDS[@]}" 2>/dev/null || true
  wait 2>/dev/null || true
  PIDS=()  # idempotent: a second cleanup (e.g. Ctrl-C then normal return) no-ops
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

wait_for_port() {
  local port="$1"
  printf '  waiting for http://localhost:%s ' "$port"
  for _ in $(seq 1 60); do
    if lsof -ti "tcp:$port" >/dev/null 2>&1; then echo "✓"; return 0; fi
    printf '.'; sleep 0.5
  done
  echo ""; echo "  dev server did not come up." >&2; return 1
}

# Desktop webview shell over a single main server (cross-engine TPS spike).
if [[ -n "$SHELL_TARGET" ]]; then
  SHELL_DIR="$SCRIPT_DIR/desktop-spike/$SHELL_TARGET"
  if [[ ! -d "$SHELL_DIR/node_modules" ]]; then
    echo "launch.sh: $SHELL_TARGET deps not installed." >&2
    echo "  Run: (cd $SHELL_DIR && pnpm install --ignore-workspace)" >&2
    exit 1
  fi
  # --profiler boots WITHOUT --debug so the sim profiles clean (no verbose firehose). Add --log to
  # surface the DEBUG log tab + firehose on demand (e.g. ./launch.sh --profiler --electron --log).
  SERVER_FLAG="--debug"; [[ "$PROFILER" == true ]] && SERVER_FLAG="--profiler"
  SERVER_FLAG="$SERVER_FLAG$LOG_FLAG"
  PORT=5173
  [[ -f "$SCRIPT_DIR/.devport" ]] && PORT=$(< "$SCRIPT_DIR/.devport")

  echo "Fantasia4x — $SHELL_TARGET shell over ${SERVER_FLAG#--} server (main only)"
  echo ""
  codegraph_hint
  launch "$SCRIPT_DIR" "main" "$SERVER_FLAG"
  wait_for_port "$PORT" || { cleanup; exit 1; }
  echo ""
  case "$SHELL_TARGET" in
    electron)
      echo "  [electron] V8/Chromium → http://localhost:$PORT (close window or Ctrl-C to stop)"
      (cd "$SHELL_DIR" && SPIKE_URL="http://localhost:$PORT" pnpm start)
      ;;
    tauri)
      echo "  [tauri] WebKitGTK/JSC → http://127.0.0.1:$PORT (close window or Ctrl-C to stop)"
      # Tauri polls devUrl literally — override the hardcoded conf to the real .devport AND force
      # IPv4: here `localhost` resolves to ::1 first, but `vite --host` binds 0.0.0.0 (IPv4 only),
      # so a `localhost` poll hits an unserved ::1 and hangs on "Waiting for frontend dev server".
      (cd "$SHELL_DIR" && pnpm tauri dev -c "{\"build\":{\"devUrl\":\"http://127.0.0.1:$PORT\"}}")
      ;;
  esac
  cleanup
  exit 0
fi

# Profiler sandbox: a single focused server, no worktree fan-out.
if [[ "$PROFILER" == true ]]; then
  echo "Fantasia4x — profiler sandbox (main server only)"
  echo ""
  codegraph_hint
  launch "$SCRIPT_DIR" "main" "--profiler$LOG_FLAG"
  echo ""
  echo "Ctrl-C to stop."
  wait
  exit 0
fi

echo "Fantasia4x — launching all dev servers (debug mode)"
echo ""

launch "$SCRIPT_DIR" "main" "--debug$LOG_FLAG"

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
