#!/usr/bin/env bash
# install.sh — one-time bootstrap for a fresh Fantasia4x checkout or worktree.
#
# Everything here needs NETWORK, so launch.sh runs it on the HOST before any sandboxed
# (network-isolated) electron launch — inside that namespace an install would fail with ENETUNREACH.
#
# Idempotent: every step is guarded and skips when its artifact already exists, so it's safe to run
# by hand any time (`./install.sh`) or to let launch.sh invoke it automatically on a fresh checkout.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# pnpm lives in the user-local npm prefix and wasm-pack in ~/.cargo/bin — neither is on a non-login
# shell's PATH. Put both within reach (dev.sh/launch.sh do the pnpm half of this too).
export PATH="$HOME/.npm-global/bin:$HOME/.cargo/bin:$PATH"

step() { printf '\n\033[1minstall.sh: %s\033[0m\n' "$1"; }
die()  { echo "install.sh: $1" >&2; exit 1; }

command -v pnpm >/dev/null 2>&1 || die "pnpm not found (expected ~/.npm-global/bin/pnpm)."

# 1. Main-repo JS dependencies (hard requirement — the dev server can't start without them).
if [[ ! -d node_modules ]]; then
  step "installing main dependencies (pnpm install)…"
  pnpm install || die "main 'pnpm install' failed."
else
  echo "install.sh: main node_modules present — skipping."
fi

# 2. SvelteKit generated types (tolerant — dev.sh regenerates on demand too).
if [[ ! -d .svelte-kit ]]; then
  step "generating .svelte-kit types (svelte-kit sync)…"
  CI=true pnpm exec svelte-kit sync || echo "install.sh: svelte-kit sync failed (dev.sh will retry)." >&2
fi

# 3. wasm-pack toolchain — needed to build the Rust → WASM cores below.
if ! command -v wasm-pack >/dev/null 2>&1 && [[ ! -x "$HOME/.cargo/bin/wasm-pack" ]]; then
  step "installing wasm-pack (cargo install — one-time, slow)…"
  cargo install wasm-pack || echo "install.sh: wasm-pack install failed — WASM builds will be skipped." >&2
fi

# 4. Rust → WASM cores (spatial + sim). Tolerant, mirroring dev.sh: a WASM miss degrades, not aborts.
if [[ ! -d src/lib/spatial-core-pkg ]]; then
  step "building spatial-core WASM…"
  pnpm add:wasm || echo "install.sh: spatial-core WASM build failed — run 'pnpm add:wasm' manually." >&2
fi
if [[ ! -d src/lib/sim-core-pkg ]]; then
  step "building sim-core WASM…"
  pnpm add:wasm:sim || echo "install.sh: sim-core WASM build failed — run 'pnpm add:wasm:sim' manually." >&2
fi

# 5. Electron spike shell — its own workspace-isolated node_modules + unpacked runtime.
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
