#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDS=()

export PATH="$HOME/.npm-global/bin:$PATH"

PROFILER=false
LOG=false
PLAY=false
TOOLS=false
SANDBOX=auto
SHELL_TARGET=""
for arg in "$@"; do
  case "$arg" in
    --tools) TOOLS=true ;;
    --profiler) PROFILER=true ;;
    --log) LOG=true ;;
    --play) PLAY=true ;;
    --sandbox) SANDBOX=on ;;
    --net-host) SANDBOX=off ;;
    --electron) SHELL_TARGET=electron ;;
    --tauri) SHELL_TARGET=tauri ;;
  esac
done

needs_bootstrap() {
  [[ -d "$SCRIPT_DIR/node_modules" ]]              || return 0
  [[ -d "$SCRIPT_DIR/.svelte-kit" ]]               || return 0
  [[ -d "$SCRIPT_DIR/src/lib/spatial-core-pkg" ]]  || return 0
  [[ -d "$SCRIPT_DIR/src/lib/sim-core-pkg" ]]      || return 0
  if [[ "$SHELL_TARGET" == electron ]]; then
    [[ -x "$SCRIPT_DIR/desktop-spike/electron/node_modules/electron/dist/electron" ]] || return 0
  fi
  return 1
}
if needs_bootstrap; then
  echo "launch.sh: fresh checkout — running ./install.sh (host bootstrap, needs network)…" >&2
  "$SCRIPT_DIR/install.sh" || { echo "launch.sh: install.sh failed; aborting." >&2; exit 1; }
  echo ""
fi
LOG_FLAG=""; [[ "$LOG" == true ]] && LOG_FLAG=" --log"

cleanup() {
  [[ ${#PIDS[@]} -eq 0 ]] && return
  echo ""
  echo "Stopping all dev servers..."
  kill -CONT "${PIDS[@]}" 2>/dev/null || true
  kill "${PIDS[@]}" 2>/dev/null || true
  wait 2>/dev/null || true
  PIDS=()
  echo "Done."
}
trap cleanup INT TERM

launch() {
  local dir="$1" label="$2" extra="${3---debug}"
  local port=5173
  [[ -f "$dir/.devport" ]] && port=$(< "$dir/.devport")
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

start_spritesheet_viewer() {
  local vport="${1:-5174}"
  if ! command -v python3 >/dev/null 2>&1; then
    echo "  [spritesheet] skipped — python3 not found (needed for the static viewer server)" >&2
    return
  fi
  (exec python3 -m http.server "$vport" --directory "$SCRIPT_DIR/static" >/dev/null 2>&1) &
  PIDS+=($!)
  echo "  [spritesheet] http://localhost:$vport/dev/spritesheet-viewer.html"
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

scope_available() {
  systemd-run --user --scope --quiet --collect --slice=app.slice -- true >/dev/null 2>&1
}

run_at_app_priority() {
  if ! scope_available; then
    echo "  launch.sh: no systemd user scope available — the game runs at this terminal's" >&2
    echo "             priority (CPUWeight 20 under VS Code), not its own." >&2
    "$@"
    return
  fi
  echo "  [priority] own app.slice scope 'f4x-game-$$' at CPUWeight=100, outside the editor's."
  systemd-run --user --scope --quiet --collect \
    --unit="f4x-game-$$" --slice=app.slice \
    -p CPUWeight=100 \
    -- "$@"
}

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
  export F4X_NS_PORT="$port" F4X_NS_SERVER_FLAG="$server_flag" F4X_NS_SHELL_DIR="$shell_dir"
  export F4X_NS_SCRIPT_DIR="$SCRIPT_DIR" F4X_NS_PLAY="$PLAY"
  run_at_app_priority unshare --user --map-root-user --net -- bash -s <<'NSEOF'
    set -u
    log() { printf '  [ns %s] %s\n' "$(date +%T)" "$*" >&2; }
    log "entered user+net namespace; bringing loopback up"
    ip link set lo up 2>/dev/null
    if ip addr show lo 2>/dev/null | grep -q 'inet '; then
      log "loopback is up"
    else
      log "WARNING: loopback has no IPv4 addr — the dev server won't be reachable in here"
    fi
    log "starting dev server: dev.sh $F4X_NS_SERVER_FLAG --port $F4X_NS_PORT"
    "$F4X_NS_SCRIPT_DIR/dev.sh" $F4X_NS_SERVER_FLAG --port "$F4X_NS_PORT" &
    SRV=$!
    cleanup_ns() { kill "$SRV" 2>/dev/null; wait 2>/dev/null; }
    trap 'cleanup_ns; exit 0' INT TERM
    log "waiting for dev server on http://127.0.0.1:$F4X_NS_PORT/ (up to 60s) …"
    up=false
    for i in $(seq 1 120); do
      if ! kill -0 "$SRV" 2>/dev/null; then
        log "ERROR: dev server (PID $SRV) exited before binding the port — see its output above. Aborting."
        cleanup_ns; exit 1
      fi
      if curl -s -o /dev/null "http://127.0.0.1:$F4X_NS_PORT/"; then up=true; log "dev server answered (attempt $i)"; break; fi
      sleep 0.5
    done
    if [[ "$up" != true ]]; then
      log "ERROR: dev server never answered on 127.0.0.1:$F4X_NS_PORT within 60s — not launching a blank window. Aborting."
      cleanup_ns; exit 1
    fi
    cd "$F4X_NS_SHELL_DIR" || { cleanup_ns; exit 1; }
    export DBUS_SESSION_BUS_ADDRESS=disabled:
    log "launching electron → http://127.0.0.1:$F4X_NS_PORT …"
    SPIKE_URL="http://127.0.0.1:$F4X_NS_PORT" F4X_PLAY="$F4X_NS_PLAY" ./node_modules/.bin/electron . --no-sandbox
    log "electron exited (status $?)"
    cleanup_ns
NSEOF
}

if [[ "$TOOLS" == true ]]; then
  PORT=5173
  [[ -f "$SCRIPT_DIR/.devport" ]] && PORT=$(< "$SCRIPT_DIR/.devport")
  VPORT=$((PORT + 1))

  echo "Fantasia4x — dev tools (browsable, hot-reload)"
  echo ""
  port_holders() { { lsof -ti tcp:"$PORT"; lsof -ti tcp:"$VPORT"; } 2>/dev/null; }
  announced=false
  for _ in 1 2 3 4; do
    holders=$(port_holders)
    [[ -z "$holders" ]] && break
    if [[ "$announced" == false ]]; then echo "  restarting — stopping servers on :$PORT/:$VPORT"; announced=true; fi
    kill -CONT $holders 2>/dev/null || true
    kill $holders 2>/dev/null || true
    sleep 0.7
    holders=$(port_holders)
    [[ -n "$holders" ]] && kill -9 $holders 2>/dev/null || true
    sleep 0.4
  done

  launch "$SCRIPT_DIR" "dev-server" "--hmr --tools"
  wait_for_port "$PORT" || { cleanup; exit 1; }
  start_spritesheet_viewer "$VPORT"
  echo ""
  echo "  → gear database   http://localhost:$PORT/gear-db"
  echo "  → spritesheets    http://localhost:$VPORT/dev/spritesheet-viewer.html"
  echo ""
  echo "  Ctrl-C to stop · re-run ./launch.sh --tools to restart."
  wait
  exit 0
fi

if [[ -n "$SHELL_TARGET" ]]; then
  SHELL_DIR="$SCRIPT_DIR/desktop-spike/$SHELL_TARGET"
  if [[ ! -d "$SHELL_DIR/node_modules" ]]; then
    echo "launch.sh: $SHELL_TARGET deps not installed — installing (first run in this worktree)…" >&2
    (cd "$SHELL_DIR" && pnpm install --ignore-workspace) || {
      echo "launch.sh: failed to install $SHELL_TARGET deps (cd $SHELL_DIR && pnpm install --ignore-workspace)." >&2
      exit 1
    }
  fi
  if [[ "$SHELL_TARGET" == electron && ! -x "$SHELL_DIR/node_modules/electron/dist/electron" ]]; then
    echo "launch.sh: unpacking electron runtime…" >&2
    (cd "$SHELL_DIR" && node node_modules/electron/install.js) || {
      echo "launch.sh: failed to unpack electron runtime." >&2
      exit 1
    }
  fi
  SERVER_FLAG="--debug"; [[ "$PROFILER" == true ]] && SERVER_FLAG="--profiler"
  [[ "$PLAY" == true ]] && SERVER_FLAG=""
  SERVER_FLAG="$SERVER_FLAG$LOG_FLAG"
  SERVER_LABEL="play"; [[ "$PLAY" != true ]] && SERVER_LABEL="${SERVER_FLAG#--}"
  PORT=5173
  [[ -f "$SCRIPT_DIR/.devport" ]] && PORT=$(< "$SCRIPT_DIR/.devport")

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
  start_spritesheet_viewer

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
      (cd "$SHELL_DIR" && export SPIKE_URL="http://localhost:$PORT" F4X_PLAY="$PLAY" && run_at_app_priority pnpm start)
      ;;
    tauri)
      echo "  [tauri] WebKitGTK/JSC → http://127.0.0.1:$PORT (close window or Ctrl-C to stop)"
      (cd "$SHELL_DIR" && pnpm tauri dev -c "{\"build\":{\"devUrl\":\"http://127.0.0.1:$PORT\"}}")
      ;;
  esac
  cleanup
  exit 0
fi

if [[ "$PROFILER" == true ]]; then
  echo "Fantasia4x — profiler sandbox (main server only)"
  echo ""
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
    launch "$wt" "$(basename "$wt")" "--debug"
  done
fi


echo ""
echo "Ctrl-C to stop all."
wait
