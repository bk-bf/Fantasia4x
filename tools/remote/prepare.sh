PINS=.github/actions/prepare/action.yml
F4X_NODE=$(sed -n 's/^ *node-version: *//p' "$PINS" | head -1)
F4X_RUST=$(sed -n 's/^ *toolchain: *//p' "$PINS" | head -1)
NODE_BIN="$HOME/.nvm/versions/node/v$F4X_NODE/bin"
SHIMS="$HOME/test-runs/bin"

export PATH="$SHIMS:$NODE_BIN:$HOME/.cargo/bin:$PATH"
export RUSTUP_TOOLCHAIN="$F4X_RUST"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export TMPDIR="$HOME/test-runs/tmp"
mkdir -p "$TMPDIR"

if [ ! -x "$NODE_BIN/node" ]; then
  . "$HOME/.nvm/nvm.sh"
  nvm install "$F4X_NODE" >&2
fi
if ! rustup toolchain list | grep -q "^$F4X_RUST"; then
  rustup toolchain install "$F4X_RUST" --profile minimal --target wasm32-unknown-unknown >&2
fi
if [ ! -x "$SHIMS/pnpm" ]; then
  mkdir -p "$SHIMS"
  corepack enable --install-directory "$SHIMS" pnpm
fi

LOCK_HASH=$(sha256sum pnpm-lock.yaml | cut -c1-64)
if [ ! -d node_modules ] || [ "$(cat .git/f4x-lock-hash 2>/dev/null)" != "$LOCK_HASH" ]; then
  pnpm install --frozen-lockfile --prefer-offline >&2
  echo "$LOCK_HASH" > .git/f4x-lock-hash
fi

WASM_HASH=$(find spatial-core sim-core \( -name target -o -name pkg \) -prune -o -type f -print0 \
  | sort -z | xargs -0 sha256sum | sha256sum | cut -c1-64)
if [ ! -d src/lib/sim-core-pkg ] || [ ! -d src/lib/spatial-core-pkg ] \
  || [ "$(cat .git/f4x-wasm-hash 2>/dev/null)" != "$WASM_HASH" ]; then
  (cd spatial-core && wasm-pack build --target web --out-dir ../src/lib/spatial-core-pkg) >&2
  (cd sim-core && wasm-pack build --target web --out-dir ../src/lib/sim-core-pkg) >&2
  echo "$WASM_HASH" > .git/f4x-wasm-hash
fi

export PATH="$PWD/node_modules/.bin:$PATH"
pnpm exec svelte-kit sync >&2
