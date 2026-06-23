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
# --play: clean PLAYER launch (shell only) — drops --debug so the game opens at the MAIN MENU with
#   the DEBUG tab hidden, the way an alpha build looks. Still served by the live dev server, so
#   bug-fixes are a reload away (no rebuild). Immersive playtesting: ./launch.sh --electron --play.
# --mm2: render the EXPERIMENTAL alternate main menu (MainMenu2) instead of the default one — a layout
#   experiment, gated by VITE_MM2. E.g. ./launch.sh --electron --play --mm2.
# --hmr: opt INTO Vite hot-reload / live page-reload. OFF by default for EVERY launch (including
#   --debug/--profiler/--electron/--tauri) so an agent editing the tree never reloads a live playtest.
# SANDBOXING (electron): ON BY DEFAULT. The dev server AND Electron run inside a private Linux network
#   namespace (rootless `unshare --net`), so the dev-server port exists ONLY inside that namespace and
#   is physically UNREACHABLE from your browser (or any other host process) as a URL — the game is the
#   only thing that can talk to it. The vite.config 403 guard is a bouncer; this removes the door.
#   - --net-host: OPT OUT — run on normal host networking (the old behaviour). Needed when you want the
#     CDP debug port (:9222) reachable for the electron-debug MCP, or any outbound network in-app.
#   - --profiler implies --net-host automatically (the profiler/CDP workflow needs host access);
#     pass --sandbox to force isolation even under --profiler.
#   Electron runs with --no-sandbox in this mode (Chromium can't nest its sandbox in the user ns).
#     ./launch.sh --electron            (sandboxed by default)
#     ./launch.sh --electron --net-host (host networking — CDP/profiling reachable)
# codegraph is a separate always-on systemd user service (see codegraph_hint below).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDS=()

PROFILER=false
LOG=false
HMR=false
PLAY=false
MM2=false
SANDBOX=auto   # auto = default ON for electron (OFF under --profiler); --sandbox forces on, --net-host forces off
SHELL_TARGET=""
for arg in "$@"; do
  case "$arg" in
    --profiler) PROFILER=true ;;
    --log) LOG=true ;;
    --hmr) HMR=true ;;
    --play) PLAY=true ;;
    --mm2) MM2=true ;;
    --sandbox) SANDBOX=on ;;
    --net-host) SANDBOX=off ;;
    --electron) SHELL_TARGET=electron ;;
    --tauri) SHELL_TARGET=tauri ;;
  esac
done
# Suffixes appended to a server's dev.sh flag set (dev.sh parses multiple flags). HMR is OFF for every
# launch unless --hmr is passed, so an agent editing the tree never reloads a live playtest.
LOG_FLAG=""; [[ "$LOG" == true ]] && LOG_FLAG=" --log"
HMR_FLAG=""; [[ "$HMR" == true ]] && HMR_FLAG=" --hmr"
# --mm2: render the experimental alternate main menu (MainMenu2) — e.g. ./launch.sh --electron --play --mm2
MM2_FLAG=""; [[ "$MM2" == true ]] && MM2_FLAG=" --mm2"

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
  # `extra` is the dev.sh flag set. Defaults to --debug (the normal launch.sh experience) ONLY when
  # $3 is UNSET; an explicit empty "" is honoured as a CLEAN run (the `--play` player launch) — hence
  # `-` not `:-`, so "" doesn't collapse back to --debug. The profiler branch passes "--profiler".
  local dir="$1" label="$2" extra="${3---debug}"
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

# Run the dev server + Electron together inside a private (rootless) network namespace so the dev
# server's port is unreachable from the host browser — only the in-ns Electron can see it. Both
# processes share the namespace's isolated loopback; nothing outside (Zen, curl, another tab) can
# route to it. Values are passed via env to dodge nested-quoting in the unshared bash.
run_isolated_electron() {
  local port="$1" server_flag="$2" shell_dir="$3"
  echo "  [electron · sandboxed] private net namespace — dev server on 127.0.0.1:$port is"
  echo "                         UNREACHABLE from your browser; only this window can see it."
  echo "                         (CDP :9222 is also in-ns — electron-debug MCP can't attach; no outbound net.)"
  if ! unshare --user --map-root-user --net true 2>/dev/null; then
    echo "  launch.sh: rootless network namespaces are unavailable on this kernel." >&2
    echo "    (need kernel.unprivileged_userns_clone=1). Falling back is unsafe; aborting." >&2
    return 1
  fi
  F4X_NS_PORT="$port" F4X_NS_SERVER_FLAG="$server_flag" F4X_NS_SHELL_DIR="$shell_dir" \
  F4X_NS_SCRIPT_DIR="$SCRIPT_DIR" F4X_NS_PLAY="$PLAY" \
  unshare --user --map-root-user --net -- bash -s <<'NSEOF'
    set -u
    ip link set lo up 2>/dev/null
    "$F4X_NS_SCRIPT_DIR/dev.sh" $F4X_NS_SERVER_FLAG --port "$F4X_NS_PORT" &
    SRV=$!
    cleanup_ns() { kill "$SRV" 2>/dev/null; wait 2>/dev/null; }
    trap 'cleanup_ns; exit 0' INT TERM
    # Wait (in-ns) for the dev server to answer — any HTTP status counts (the 403 guard still responds).
    for _ in $(seq 1 120); do
      curl -s -o /dev/null "http://127.0.0.1:$F4X_NS_PORT/" && break
      sleep 0.5
    done
    cd "$F4X_NS_SHELL_DIR" || { cleanup_ns; exit 1; }
    # --no-sandbox: Chromium can't create its own sandbox nested inside this user namespace.
    SPIKE_URL="http://127.0.0.1:$F4X_NS_PORT" F4X_PLAY="$F4X_NS_PLAY" ./node_modules/.bin/electron . --no-sandbox
    cleanup_ns
NSEOF
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
  # --play: clean PLAYER build — NO --debug, so the MAIN MENU shows and the DEBUG tab is hidden; an
  # immersive playtest over the live dev server, so bug-fixes are still just a reload away.
  SERVER_FLAG="--debug"; [[ "$PROFILER" == true ]] && SERVER_FLAG="--profiler"
  [[ "$PLAY" == true ]] && SERVER_FLAG=""
  SERVER_FLAG="$SERVER_FLAG$LOG_FLAG$HMR_FLAG$MM2_FLAG"
  SERVER_LABEL="play"; [[ "$PLAY" != true ]] && SERVER_LABEL="${SERVER_FLAG#--}"
  PORT=5173
  [[ -f "$SCRIPT_DIR/.devport" ]] && PORT=$(< "$SCRIPT_DIR/.devport")

  # Resolve sandboxing: default ON for electron, OFF under --profiler (needs CDP/host), forced by
  # --sandbox / --net-host. Only electron supports it.
  SBX=false
  if [[ "$SHELL_TARGET" == electron ]]; then
    case "$SANDBOX" in
      on) SBX=true ;;
      off) SBX=false ;;
      auto)
        if [[ "$PROFILER" == true ]]; then
          SBX=false
          echo "launch.sh: --profiler ⇒ host networking (CDP :9222 / profiling needs it); pass --sandbox to force isolation." >&2
        else
          SBX=true
        fi
        ;;
    esac
  elif [[ "$SANDBOX" == on ]]; then
    echo "launch.sh: --sandbox is supported for --electron only; ignoring it for $SHELL_TARGET." >&2
  fi

  echo "Fantasia4x — $SHELL_TARGET shell over $SERVER_LABEL server (main only)"
  echo ""
  codegraph_hint

  # Sandboxed electron: the dev server is started INSIDE the network namespace (not on the host), so
  # skip the host-side launch/wait_for_port entirely and hand off to the isolated runner.
  if [[ "$SHELL_TARGET" == electron && "$SBX" == true ]]; then
    echo ""
    run_isolated_electron "$PORT" "$SERVER_FLAG" "$SHELL_DIR"
    cleanup
    exit 0
  fi

  launch "$SCRIPT_DIR" "main" "$SERVER_FLAG"
  wait_for_port "$PORT" || { cleanup; exit 1; }
  echo ""
  case "$SHELL_TARGET" in
    electron)
      echo "  [electron] V8/Chromium → http://localhost:$PORT (close window or Ctrl-C to stop)"
      (cd "$SHELL_DIR" && SPIKE_URL="http://localhost:$PORT" F4X_PLAY="$PLAY" pnpm start)
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
  launch "$SCRIPT_DIR" "main" "--profiler$LOG_FLAG$HMR_FLAG"
  echo ""
  echo "Ctrl-C to stop."
  wait
  exit 0
fi

echo "Fantasia4x — launching all dev servers (debug mode)"
echo ""

launch "$SCRIPT_DIR" "main" "--debug$LOG_FLAG$HMR_FLAG"

LAUNCH_DIR="$SCRIPT_DIR/.worktrees/launch"
if [[ -d "$LAUNCH_DIR" ]]; then
  for wt in "$LAUNCH_DIR"/*/; do
    [[ -f "$wt/dev.sh" ]] || continue
    launch "$wt" "$(basename "$wt")" "--debug$HMR_FLAG"
  done
fi

codegraph_hint

echo ""
echo "Ctrl-C to stop all."
wait
