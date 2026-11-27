#!/usr/bin/env bash
set -euo pipefail

toolchain() {
  local node
  node=$(sed -n 's/^ *node-version: *//p' .github/actions/prepare/action.yml 2>/dev/null | head -1)
  export PATH="$HOME/.nvm/versions/node/v$node/bin:$HOME/.npm-global/bin:$HOME/.cargo/bin:$PATH"
}

quiet() {
  echo "load=$(cut -d' ' -f1-3 /proc/loadavg)"
  pgrep -af '[f]rame-cost\.mjs|[s]teady\.mjs|[z]oom-out\.mjs|[a]ttach-trace\.mjs|[t]ickprof/|[v]itest|[w]ork-pins/' | sed 's/^/busy=/' || true
}

prepare() {
  local repo=$1 wt=$2 sha=$3 harness=$4
  [ -e "$wt/.git" ] || git -C "$repo" worktree add -q --detach "$wt" "$sha"
  cd "$wt"
  git checkout -q --detach "$sha"
  git checkout -q -- .
  toolchain
  if [ ! -f node_modules/.f4x-ledger-ready ] || [ "$(cat node_modules/.f4x-ledger-ready)" != "$sha" ]; then
    CI=true pnpm install --frozen-lockfile --prefer-offline
    pnpm run --if-present add:wasm
    pnpm run --if-present add:wasm:sim
    CI=true pnpm exec svelte-kit sync
    echo "$sha" >node_modules/.f4x-ledger-ready
  fi
  rm -rf tools/tickprof
  git -C "$repo" archive "$harness" tools/tickprof | tar -x -C "$wt"
  local engine=src/lib/game/systems/GameEngineImpl.ts patched=0
  if grep -q 'const tp = (_label: string, fn: () => void): void => fn();' "$engine"; then
    sed -i 's/const tp = (_label: string, fn: () => void): void => fn();/const tp = (label: string, fn: () => void): void => this.timed(label, fn);/' "$engine"
    patched=1
  fi
  echo "patched=$patched"
  echo "dirty=$(git status --porcelain --untracked-files=no -- . ':!tools/tickprof' | wc -l)"
  echo "ready $(git log -1 --format='%h %s')"
}

round() {
  local wt=$1
  shift
  cd "$wt"
  F4X_LEDGER_OFF=1 timeout 20m tools/tickprof/run.sh "$@"
}

cleanup() {
  local repo=$1 run=$2 wt
  shift 2
  for wt in "$@"; do
    if [ -e "$wt/.git" ]; then git -C "$repo" worktree remove --force "$wt"; fi
  done
  rm -rf "$run"
}

logged() {
  local log=$1
  shift
  exec >>"$log" 2>&1
  "$@"
}

case ${1:-} in
  quiet) quiet ;;
  prepare) shift; prepare "$@" ;;
  round) shift; round "$@" ;;
  cleanup) shift; cleanup "$@" ;;
  logged) shift; log=$1; shift; logged "$log" "$0" "$@" ;;
  *) echo "usage: rerun-remote.sh quiet|prepare|round|cleanup|logged" >&2; exit 2 ;;
esac
