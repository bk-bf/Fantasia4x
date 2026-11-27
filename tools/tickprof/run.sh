#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Tick profiler for the Fantasia4x sim. Heavy runs belong on desktop, never on the laptop.

  tools/tickprof/run.sh desktop <ref> tick|loop [VAR=value ...]
      Clones <ref> fresh on desktop into /tmp/f4x-tickprof-<sha>, installs it, builds both WASM
      crates, copies this checkout's tools/tickprof into it, runs there under timeout 20m and
      copies the result JSON back into PROF_OUT here. A PROF_SAVE file is copied over with it.
  tools/tickprof/run.sh tick|loop [VAR=value ...]
      Runs in this checkout under timeout 20m and prints a summary of the result.
  tools/tickprof/run.sh kernel [entities]
      The sim-core entity step in WASM, in mutable and immutable JS, and in native Rust.
  node tools/tickprof/analyze.mjs <file.cpuprofile> [top] [regex]
      Self time inside processGameTurn by category, function and file.
  node tools/tickprof/summary.mjs <result.json>...

tick   HeadlessSession ticks timed per phase, with counters on the spatial-core WASM calls and GC.
loop   The real sim.worker loop at PROF_SPEED, posting through structuredClone, with the
       worker's own tps= lines.

PROF_SCENARIO   dev-save (default), large-wilderness, colony-750-40p, colony-1060-80p,
                idle-colony-750-40p, stress, save
PROF_SAVE       the save scenario's file: a gzipped { v: 1, dynamic, world } snapshot
PROF_MAP PROF_PAWNS PROF_MOBS PROF_BASE
                stress: map side (750), pawns (20), creatures (1200), a built base (1)
PROF_WARM PROF_TICKS      tick: ticks before measuring (600), ticks measured (1800)
PROF_SPEED PROF_SECONDS   loop: game speed (4), seconds measured (30)
PROF_OUT        result directory (tools/tickprof/out); PROF_TAG names the file instead of the scenario
PROF_DUMP       tick: also write the built scenario as a snapshot to this file
PROF_EXECARGV   extra node flags, such as "--cpu-prof --cpu-prof-dir=/tmp/prof"
PROF_BRANCH     the branch to record when no branch points at HEAD

Every result carries commit, branch, dirty, turn, seed, map (WxH), pawns and mobs at the start of
the run, and endTurn, endPawns and endMobs.

  tools/tickprof/run.sh desktop origin/dev loop PROF_SCENARIO=colony-750-40p
  tools/tickprof/run.sh desktop origin/dev tick PROF_SCENARIO=save PROF_SAVE=owner-save.json.gz
EOF
}

toolchain() {
  local node
  node=$(sed -n 's/^ *node-version: *//p' .github/actions/prepare/action.yml | head -1)
  export PATH="$HOME/.nvm/versions/node/v$node/bin:$HOME/.npm-global/bin:$HOME/.cargo/bin:$PATH"
}

prepare() {
  local dir=$1 sha=$2
  if [ ! -d "$dir/.git" ]; then
    git clone -q --reference-if-able "$HOME/Documents/Projects/Fantasia4x" --dissociate \
      git@github.com:bk-bf/Fantasia4x.git "$dir"
  fi
  cd "$dir"
  git fetch -q --prune origin
  git checkout -q --detach "$sha"
  toolchain
  if [ ! -f .git/tickprof-ready ]; then
    CI=true pnpm install --frozen-lockfile --prefer-offline >/dev/null
    for crate in spatial-core sim-core; do
      [ -d "$crate" ] && (cd "$crate" && wasm-pack build --target web --out-dir "../src/lib/$crate-pkg" >/dev/null 2>&1)
    done
    CI=true pnpm exec svelte-kit sync >/dev/null
    touch .git/tickprof-ready
  fi
  echo "desktop $dir $(git log -1 --format='%h %s')"
}

result_file() {
  local name=${PROF_TAG:-${PROF_SCENARIO:-dev-save}} out=${PROF_OUT:-tools/tickprof/out}
  if [ "$1" = loop ]; then echo "$out/$name.loop${PROF_SPEED:-4}x.json"; else echo "$out/$name.json"; fi
}

profile() {
  local kind=$1
  shift
  cd "$(dirname "$0")/../.."
  toolchain
  [ $# -gt 0 ] && export "$@"
  export PROF_FILE=$kind
  local file log
  file=$(result_file "$kind")
  log=${file%.json}.log
  mkdir -p "$(dirname "$file")"
  rm -f "$file"
  echo "== $(hostname) $(git rev-parse --short HEAD) $kind $*"
  if ! timeout 20m node node_modules/vitest/vitest.mjs run --config tools/tickprof/vitest.config.ts >"$log" 2>&1 || [ ! -f "$file" ]; then
    tail -40 "$log"
    exit 1
  fi
  grep -E '^stress' "$log" || true
  node tools/tickprof/summary.mjs "$file"
}

desktop() {
  local ref=$1 kind=$2
  shift 2
  local here sha dir branch out=tools/tickprof/out save=''
  here=$(cd "$(dirname "$0")" && pwd)
  git -C "$here" fetch -q origin
  sha=$(git -C "$here" rev-parse "$ref^{commit}")
  dir=/tmp/f4x-tickprof-${sha:0:12}
  branch=${ref#origin/}
  git -C "$here" rev-parse -q --verify "refs/remotes/origin/$branch" >/dev/null || branch=''
  local args=()
  for a in "$@"; do
    case $a in
      PROF_OUT=*) out=${a#PROF_OUT=} ;;
      PROF_SAVE=*) save=${a#PROF_SAVE=}; args+=("PROF_SAVE=$dir.saves/$(basename "$save")") ;;
      *) args+=("$a") ;;
    esac
  done
  [ -n "$branch" ] && args+=("PROF_BRANCH=$branch")
  timeout 20m ssh desktop bash -s -- prepare "$dir" "$sha" <"$here/run.sh"
  tar -C "$here/.." --exclude=tickprof/out -cf - tickprof |
    timeout 20m ssh desktop "rm -rf $dir/tools/tickprof && tar -C $dir/tools -xf -"
  if [ -n "$save" ]; then
    timeout 20m ssh desktop "mkdir -p $dir.saves"
    timeout 20m scp -q "$save" "desktop:$dir.saves/"
  fi
  timeout 20m ssh desktop "$dir/tools/tickprof/run.sh $kind $(printf '%q ' "${args[@]}")"
  local file
  file=$(for a in "${args[@]}"; do export "$a"; done; PROF_OUT=tools/tickprof/out result_file "$kind")
  mkdir -p "$out"
  timeout 20m scp -q "desktop:$dir/$file" "$out/"
  echo "results in $out"
}

kernel() {
  cd "$(dirname "$0")/../.."
  toolchain
  local ents=${1:-2419}
  node tools/tickprof/kernel.mjs "$ents"
  mkdir -p sim-core/examples
  cp tools/tickprof/kernel.rs sim-core/examples/tickprof_kernel.rs
  (cd sim-core && timeout 20m cargo run -q --release --example tickprof_kernel -- "$ents") || true
  rm -f sim-core/examples/tickprof_kernel.rs
  rmdir sim-core/examples 2>/dev/null || true
}

case ${1:-} in
  tick | loop) profile "$@" ;;
  desktop) shift; desktop "$@" ;;
  prepare) shift; prepare "$@" ;;
  kernel) shift; kernel "$@" ;;
  *) usage; [ "${1:-}" = -h ] || [ "${1:-}" = --help ] || exit 2 ;;
esac
