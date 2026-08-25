#!/usr/bin/env bash
set -euo pipefail

HOST="${AUDIT_HOST:-aspect}"
REPO="Fantasia4x"
REMOTE_DIR="\$HOME/$REPO"
LOG='$HOME/'"$REPO"'/.debug/audit.log'
PROGRESS='$HOME/'"$REPO"'/.debug/weapon-meta-progress.log'
PIDFILE='$HOME/'"$REPO"'/.debug/audit.pid'
NODE_ENV_SETUP='export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null'

die() { echo "audit.sh: $*" >&2; exit 1; }

case "${1:-}" in
  --tail)
    echo "==> following $HOST  (Ctrl-C detaches; the run keeps going)"
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
  --fetch)
    mkdir -p static/audit
    ssh "$HOST" "cd $REMOTE_DIR && tar czf - .debug/audit .debug/weapon-meta-*.json 2>/dev/null" \
      | tar xzf - --strip-components=1 -C static/ 2>/dev/null || true
    mv -f static/weapon-meta-*.json static/audit/ 2>/dev/null || true
    ls -1 static/audit/*.json 2>/dev/null | sed 's|^|  |' || echo "  (nothing yet — run an audit first)"
    node -e '
      const fs = require("fs");
      const dir = "static/audit";
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json") : [];
      fs.writeFileSync(dir + "/index.json", JSON.stringify({ generated: new Date().toISOString(), files }, null, 1));
      console.log("==> index.json lists " + files.length + " result files");
    '
    exit 0
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
    echo "==> shipping prebuilt spatial-core WASM (gitignored; remote cannot build it)"
    tar czf - src/lib/spatial-core-pkg | ssh "$HOST" "cd $REMOTE_DIR && tar xzf -"
    echo "==> ready"
    exit 0
    ;;
  --creatures)
    TEST_FILE="src/tests/game/systems/{creatureMatchup0,creatureMatchup1,creatureMatchup2,creatureMatchup3,creatureMatchup4,creatureMatchup5,creatureMatchup6,creatureMatchup7}.test.ts"
    shift
    ;;
  --fit)
    TEST_FILE="src/tests/game/systems/{weaponPawnFitNone,weaponPawnFitMedium,weaponPawnFitHeavy,creatureMatchup0,creatureMatchup1,creatureMatchup2,creatureMatchup3,creatureMatchup4,creatureMatchup5,creatureMatchup6,creatureMatchup7}.test.ts"
    shift
    ;;
  --all)
    TEST_FILE="src/tests/game/systems/{weaponMetaNone,weaponMetaLight,weaponMetaMedium,weaponMetaHeavy,weaponMetaHeadToHead,styleMatchups,armourStyleAudit,weaponFightSim,combatBalanceAudit,buildFitAudit,t4WeaponAudit,maimTargeting,carryCapacityAudit,weaponPawnFitNone,weaponPawnFitMedium,weaponPawnFitHeavy,creatureMatchup0,creatureMatchup1,creatureMatchup2,creatureMatchup3,creatureMatchup4,creatureMatchup5,creatureMatchup6,creatureMatchup7}.test.ts"
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
