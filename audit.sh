#!/usr/bin/env bash
# audit.sh — run the heavy balance audits on a remote box instead of this laptop.
#
# The sweeps are thousands of real headless duels each: `weaponMeta` alone is ~45 minutes at 100% CPU.
# Running them here makes the machine unusable for the duration, which is the only reason this exists.
#
#   ./audit.sh <test-file> [-t "name filter"]   sync the working tree, start the run, follow it
#   ./audit.sh --all                            every balance audit, fanned out across the remote cores
#   ./audit.sh --tail                           follow a run already in progress (from anywhere)
#   ./audit.sh --status                         is anything running, and how far along
#   ./audit.sh --result                         the finished output, once it is done
#   ./audit.sh --setup                          (re)prepare the remote checkout
#   ./audit.sh --shell                          a shell there, in the repo
#
# The run is DETACHED (nohup) on the remote, so closing the laptop, losing the network or Ctrl-C-ing
# the tail never kills it — `--tail` just reattaches to the log. That matters at 45 minutes a run.
#
# The working tree is shipped as a tarball of `src/`, NOT via git: the whole point is auditing changes
# before they are committed. Nothing is committed or pushed, on either machine.
set -euo pipefail

HOST="${AUDIT_HOST:-aspect}"
REPO="Fantasia4x"
REMOTE_DIR="\$HOME/$REPO"
LOG='$HOME/'"$REPO"'/.debug/audit.log'
PROGRESS='$HOME/'"$REPO"'/.debug/weapon-meta-progress.log'
PIDFILE='$HOME/'"$REPO"'/.debug/audit.pid'
# nvm is a user-local install on the remote, so every non-interactive ssh must source it by hand — a
# non-login shell will not pick it up.
NODE_ENV_SETUP='export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null'

die() { echo "audit.sh: $*" >&2; exit 1; }

case "${1:-}" in
  --tail)
    echo "==> following $HOST  (Ctrl-C detaches; the run keeps going)"
    # Both files: vitest buffers a test's console output until the test ENDS, so the audit's own
    # progress file is the only thing that moves during a long sweep.
    exec ssh -t "$HOST" "touch $LOG $PROGRESS; tail -n 40 -f $LOG $PROGRESS"
    ;;
  --status)
    ssh "$HOST" "
      if [ -f $PIDFILE ] && kill -0 \$(cat $PIDFILE) 2>/dev/null; then
        echo 'RUNNING (pid '\$(cat $PIDFILE)')'
      else
        echo 'idle'
      fi
      echo '--- last progress:'; tail -n 3 $PROGRESS 2>/dev/null || echo '  (none)'
      echo '--- last output:';   tail -n 5 $LOG 2>/dev/null || echo '  (none)'"
    exit 0
    ;;
  --result)
    exec ssh "$HOST" "grep -vE '^\[scenario\]' $LOG"
    ;;
  --setup)
    echo "==> preparing $HOST"
    ssh "$HOST" "$NODE_ENV_SETUP
      set -e
      cd \$HOME
      [ -d $REPO/.git ] || git clone --quiet https://github.com/bk-bf/$REPO.git
      cd $REPO && mkdir -p .debug
      git fetch --quiet origin && git reset --hard --quiet origin/main
      corepack prepare pnpm@11.3.0 --activate >/dev/null 2>&1
      pnpm install --frozen-lockfile 2>&1 | tail -2
      pnpm exec svelte-kit sync"
    # The compiled WASM is gitignored, and the remote has no Rust toolchain (no compiler, no
    # passwordless sudo). It is wasm32 and therefore platform-independent, so shipping the prebuilt
    # artifact is both correct and far cheaper than installing Rust there.
    echo "==> shipping prebuilt spatial-core WASM (gitignored; remote cannot build it)"
    tar czf - src/lib/spatial-core-pkg | ssh "$HOST" "cd $REMOTE_DIR && tar xzf -"
    echo "==> ready"
    exit 0
    ;;
  --all)
    # Every audit at once. They are separate FILES, so vitest's fork pool runs them in parallel and the
    # short sweeps finish alongside the long one for free — `weaponMeta` (~45 min) is the only real pole.
    TEST_FILE="src/tests/game/systems/{weaponMetaNone,weaponMetaLight,weaponMetaMedium,weaponMetaHeavy,weaponMetaHeadToHead,styleMatchups,armourStyleAudit,weaponFightSim,combatBalanceAudit,buildFitAudit,t4WeaponAudit,maimTargeting,carryCapacityAudit}.test.ts"
    shift
    ;;
  --shell)
    exec ssh -t "$HOST" "$NODE_ENV_SETUP; cd $REMOTE_DIR && exec bash -l"
    ;;
  "" | -h | --help)
    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
esac

if [ -z "${TEST_FILE:-}" ]; then
  TEST_FILE="$1"; shift
  [ -f "$TEST_FILE" ] || die "no such test file: $TEST_FILE"
fi

ssh "$HOST" "[ -f $PIDFILE ] && kill -0 \$(cat $PIDFILE) 2>/dev/null" \
  && die "a run is already going on $HOST — ./audit.sh --status"

echo "==> syncing working tree to $HOST (src/ — uncommitted changes included)"
tar czf - src | ssh "$HOST" "cd $REMOTE_DIR && mkdir -p .debug && tar xzf -"

echo "==> starting $TEST_FILE on $HOST (detached)"
# `VITEST_MAX_FORKS` is capped at 3 by default as a laptop OOM guard (vitest.config.ts). The remote is
# not the laptop, so let it use the cores it has.
ssh "$HOST" "$NODE_ENV_SETUP
  cd $REMOTE_DIR
  : > $LOG; : > $PROGRESS
  nohup env VITEST_MAX_FORKS=\${AUDIT_FORKS:-\$(nproc)} RUN_AUDITS=1 \
    pnpm vitest run $TEST_FILE ${*:+$*} > $LOG 2>&1 &
  echo \$! > $PIDFILE"

echo "==> running. Ctrl-C only stops the tail; the run continues."
echo "    ./audit.sh --status   ./audit.sh --tail   ./audit.sh --result"
echo
exec ssh -t "$HOST" "tail -n 5 -f $LOG $PROGRESS"
