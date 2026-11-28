#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
out=${SPIKE_OUT:-$root/tools/native-spike/out/results}
target=${CARGO_TARGET_DIR:-$root/tools/native-spike/out/target}
ticks=${SPIKE_TICKS:-1500}
rounds=${SPIKE_ROUNDS:-3}
sessions=${SPIKE_SESSIONS:-2}
export PATH="$HOME/.cargo/bin:$PATH" CARGO_TARGET_DIR=$target
mkdir -p "$out"
cd "$root"

display() {
  if [ -z "${WAYLAND_DISPLAY:-}${DISPLAY:-}" ]; then
    export GDK_BACKEND=broadway BROADWAY_DISPLAY=:${SPIKE_BROADWAY:-7}
    pgrep -f "broadwayd :${SPIKE_BROADWAY:-7}" >/dev/null || { broadwayd ":${SPIKE_BROADWAY:-7}" >/dev/null 2>&1 & sleep 1; }
  fi
}

build() {
  (cd "$here/wry-bench" && cargo build --release -q)
  "$here/simbench/build.sh" >/dev/null
}

sim() {
  local s
  for s in $(seq 1 "$sessions"); do
    node "$here/simbench/node.mjs" "$out/node-$s.json" "$ticks" "$rounds" | tail -1 | sed "s/^/node $s /"
    node "$here/simbench/chromium.mjs" index.html "ticks=$ticks&rounds=$rounds" "$out/chromium-$s.json" | tail -1 | sed "s/^/chromium $s /"
    "$target/release/wry-bench" "$root/tools/native-spike/out/simbench" "index.html?ticks=$ticks&rounds=$rounds" "$out/webkitgtk-$s.json" 1800 | tail -1 | cut -c1-200 | sed "s/^/webkitgtk $s /"
  done
}

ipc() {
  "$target/release/wry-bench" "$root/tools/native-spike/out/simbench" ipc.html "$out/ipc-wry.json" 600 | tail -1 | cut -c1-200
  node "$here/sidecar/transport.mjs" "$target/release/frame-echo" "$root/tools/native-spike/out/snapsize/typical.json" "$out/ipc-sidecar.json" >/dev/null
  echo "ipc results in $out"
}

snapsize() {
  local w=src/lib/game/sim/sim.worker.ts
  cp "$w" "$out/sim.worker.ts.orig"
  sed -i 's/^const SNAP_SIZE_LOG = false;/const SNAP_SIZE_LOG = true;/' "$w"
  SNAP_SPEED=${SNAP_SPEED:-1} node node_modules/vitest/vitest.mjs run --config tools/native-spike/vitest.config.ts --silent=false >"$out/snapsize.log" 2>&1 || true
  cp "$out/sim.worker.ts.orig" "$w"
  grep -E '^\[SNAP' "$out/snapsize.log" | head -4
}

echo "== $(hostname) $(git rev-parse --short HEAD) nproc $(nproc) load $(cut -d' ' -f1-3 /proc/loadavg)"
case ${1:-all} in
  build) build ;;
  snapsize) snapsize ;;
  sim) display; sim ;;
  ipc) display; ipc ;;
  all) build; [ -f tools/native-spike/out/snapsize/typical.json ] || snapsize; build; display; sim; ipc ;;
  *) echo "usage: tools/native-spike/run.sh [all|build|snapsize|sim|ipc]"; exit 2 ;;
esac
