#!/usr/bin/env bash
set -euo pipefail

toolchain() {
  local node
  node=$(sed -n 's/^ *node-version: *//p' .github/actions/prepare/action.yml 2>/dev/null | head -1)
  export PATH="$HOME/.nvm/versions/node/v$node/bin:$HOME/.npm-global/bin:$HOME/.cargo/bin:$PATH"
}

cgroup_of() {
  cut -d: -f3 "/proc/$1/cgroup" 2>/dev/null || true
}

quiet() {
  local self=${1:-$$} own pid unit cmd
  own=$(cgroup_of "$self")
  echo "cores=$(nproc)"
  echo "load=$(cut -d' ' -f1-3 /proc/loadavg)"
  systemctl --user list-units --plain --no-legend --state=running 'f4x-*' 2>/dev/null | while read -r unit _; do
    case $unit in f4x-ledger-rerun-* | "f4x-gpu-compositor-$self.scope") continue ;; esac
    [ -n "$own" ] && [ "${own##*/}" = "$unit" ] && continue
    pid=$(systemctl --user show -p MainPID --value "$unit" 2>/dev/null || true)
    cmd=''
    [ -n "$pid" ] && [ "$pid" != 0 ] && cmd=$(ps -o args= -p "$pid" 2>/dev/null | cut -c1-200 || true)
    echo "busy=${pid:-0} $unit $cmd"
  done
  pgrep -af '^[^ ]*node( [^ ]+)* [^ ]*(tools/gpu/[a-z-]+\.mjs|vitest)|ms-playwright/.*/chrome --' | while read -r pid cmd; do
    case $cmd in *' --type='*) continue ;; esac
    [ "$(cgroup_of "$pid")" = "$own" ] && continue
    case $(cgroup_of "$pid") in *"f4x-gpu-compositor-$self.scope") continue ;; esac
    echo "busy=$pid ${cmd:0:200}"
  done
  true
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

case ${1:-} in
  quiet) quiet ;;
  prepare) shift; prepare "$@" ;;
  round) shift; round "$@" ;;
  cleanup) shift; cleanup "$@" ;;
  logged) exec >>"$2" 2>&1; script=$0; shift 2; exec bash "$script" "$@" ;;
  *) echo "usage: rerun-remote.sh quiet|prepare|round|cleanup|logged" >&2; exit 2 ;;
esac
