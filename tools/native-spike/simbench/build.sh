#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
out=$root/tools/native-spike/out/simbench
cd "$root"
pnpm exec vite build --config tools/native-spike/simbench/vite.config.ts
cp src/lib/spatial-core-pkg/spatial_core_bg.wasm "$out/"
cp "$here/page.html" "$out/index.html"
cp "$here/../ipc/ipc.html" "$out/ipc.html"
[ ! -f "$root/tools/native-spike/out/snapsize/typical.json" ] || cp "$root/tools/native-spike/out/snapsize/typical.json" "$out/"
echo "$out"
