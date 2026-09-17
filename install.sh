#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

export PATH="$HOME/.npm-global/bin:$HOME/.cargo/bin:$PATH"

step() { printf '\n\033[1minstall.sh: %s\033[0m\n' "$1"; }
die()  { echo "install.sh: $1" >&2; exit 1; }

command -v pnpm >/dev/null 2>&1 || die "pnpm not found (expected ~/.npm-global/bin/pnpm)."

if [[ ! -d node_modules ]]; then
  step "installing main dependencies (pnpm install)…"
  pnpm install || die "main 'pnpm install' failed."
else
  echo "install.sh: main node_modules present — skipping."
fi

if [[ ! -d .svelte-kit ]]; then
  step "generating .svelte-kit types (svelte-kit sync)…"
  CI=true pnpm exec svelte-kit sync || echo "install.sh: svelte-kit sync failed (dev.sh will retry)." >&2
fi

if ! command -v wasm-pack >/dev/null 2>&1 && [[ ! -x "$HOME/.cargo/bin/wasm-pack" ]]; then
  step "installing wasm-pack (cargo install — one-time, slow)…"
  cargo install wasm-pack || echo "install.sh: wasm-pack install failed — WASM builds will be skipped." >&2
fi

if [[ ! -d src/lib/spatial-core-pkg ]]; then
  step "building spatial-core WASM…"
  pnpm add:wasm || echo "install.sh: spatial-core WASM build failed — run 'pnpm add:wasm' manually." >&2
fi
if [[ ! -d src/lib/sim-core-pkg ]]; then
  step "building sim-core WASM…"
  pnpm add:wasm:sim || echo "install.sh: sim-core WASM build failed — run 'pnpm add:wasm:sim' manually." >&2
fi

SPIKE="$SCRIPT_DIR/desktop-spike/electron"
if [[ ! -d "$SPIKE/node_modules" ]]; then
  step "installing electron spike deps…"
  (cd "$SPIKE" && pnpm install --ignore-workspace) || die "electron spike 'pnpm install' failed."
fi
if [[ ! -x "$SPIKE/node_modules/electron/dist/electron" ]]; then
  step "unpacking electron runtime…"
  (cd "$SPIKE" && node node_modules/electron/install.js) || die "electron runtime unpack failed."
fi

step "bootstrap complete — ./launch.sh is ready to run."
