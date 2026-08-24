#!/usr/bin/env bash
# Nightly code audit, run by fantasia-audit.timer on ubuntuserver.
#
# Order matters: the source has to be current before the ledger is re-planned, or the
# night is spent auditing yesterday's code. Steps 1-4 are deterministic and cost nothing;
# only step 5 spends tokens.
#
#   1. pull main from origin
#   2. merge main into the audit branch in the worktree
#   3. re-extract the codegraph (reachability triggers read it)
#   4. re-index + re-plan  -> verdicts whose code did not move stay done
#   5. run the audit until the budget runs out
#   6. hand the result to mon so it can be read from anywhere
#
# Environment (all optional, defaults suit ubuntuserver):
#   AUDIT_REPO      main checkout            ~/Projects/Fantasia4x
#   AUDIT_TREE      audit worktree           $AUDIT_REPO/.claude/worktrees/audit-ledger
#   AUDIT_GRAPH     codegraph checkout       ~/Projects/codegraph
#   AUDIT_NODE      node >= 22.5             ~/.nvm/versions/node/v24.19.0/bin/node
#   AUDIT_HOURS     token budget in hours    3.5
#   AUDIT_WORKERS   parallel workers         3
#   AUDIT_MODEL     model for the loop       sonnet
#   AUDIT_MON       mon binary               ~/Documents/Projects/mon/mon
#   AUDIT_TAG       mon tag                  ci/cl
#   AUDIT_NO_MON=1  skip the mon handoff (for a manual test run)

set -uo pipefail

REPO="${AUDIT_REPO:-$HOME/Projects/Fantasia4x}"
TREE="${AUDIT_TREE:-$REPO/.claude/worktrees/audit-ledger}"
GRAPH="${AUDIT_GRAPH:-$HOME/Projects/codegraph}"
NODE="${AUDIT_NODE:-$HOME/.nvm/versions/node/v24.19.0/bin/node}"
HOURS="${AUDIT_HOURS:-3.5}"
WORKERS="${AUDIT_WORKERS:-3}"
MODEL="${AUDIT_MODEL:-sonnet}"
MON="${AUDIT_MON:-$HOME/Documents/Projects/mon/mon}"
TAG="${AUDIT_TAG:-ci/cl}"
BRANCH="audit-ledger"

LOGDIR="$TREE/tools/audit/.ledger/nightly"
STAMP="$(date +%Y-%m-%d)"
LOG="$LOGDIR/$STAMP.log"
LOCK="${XDG_RUNTIME_DIR:-/tmp}/fantasia-audit.lock"

mkdir -p "$LOGDIR"
exec > >(tee -a "$LOG") 2>&1

say() { printf '%s %s\n' "$(date -Is)" "$*"; }
die() { say "ABORT: $*"; exit 1; }

# A run that overruns its budget must not have a second one start on top of it.
exec 9>"$LOCK"
flock -n 9 || die "a previous run still holds $LOCK"

say "=== nightly audit $STAMP ==="
[ -x "$NODE" ] || die "no node at $NODE (needs >= 22.5 for node:sqlite)"
[ -d "$REPO/.git" ] || die "no checkout at $REPO"
[ -d "$TREE" ] || die "no worktree at $TREE"
say "node $("$NODE" -v)"

# --- 1. main -----------------------------------------------------------------
say "--- pulling main"
git -C "$REPO" fetch --quiet origin || die "fetch failed"
if [ -n "$(git -C "$REPO" status --porcelain)" ]; then
  say "WARN: $REPO has uncommitted changes; leaving main where it is"
else
  git -C "$REPO" checkout --quiet main && git -C "$REPO" merge --ff-only --quiet origin/main \
    || say "WARN: main is not fast-forwardable from origin/main; leaving it alone"
fi
say "main at $(git -C "$REPO" rev-parse --short main)"

# --- 2. worktree -------------------------------------------------------------
say "--- merging main into $BRANCH"
git -C "$TREE" rev-parse --abbrev-ref HEAD | grep -qx "$BRANCH" || die "worktree is not on $BRANCH"
if ! git -C "$TREE" merge --no-edit main; then
  git -C "$TREE" merge --abort 2>/dev/null
  die "main does not merge cleanly into $BRANCH — conflicts need a person"
fi
say "$BRANCH at $(git -C "$TREE" rev-parse --short HEAD)"

# --- 3. codegraph ------------------------------------------------------------
# Without a current extract the reachability triggers silently stop firing, which reads as
# "the hot path is clean" rather than "nothing was asked about it".
if [ -d "$GRAPH" ]; then
  say "--- re-extracting codegraph"
  ( cd "$REPO" && "$NODE" "$GRAPH/bin/codegraph.mjs" extract Fantasia4x ) \
    || say "WARN: codegraph extract failed; reachability triggers will under-fire"
else
  say "WARN: no codegraph at $GRAPH; reachability triggers will not fire"
fi

# --- 4. index + plan ---------------------------------------------------------
say "--- indexing"
( cd "$TREE" && "$NODE" tools/audit/audit.mjs index ) || die "index failed"
say "--- planning"
( cd "$TREE" && "$NODE" tools/audit/audit.mjs plan ) || die "plan failed"
BEFORE=$( cd "$TREE" && "$NODE" tools/audit/audit.mjs status | sed -n 's/^work .*done \([0-9]*\) .*/\1/p' )

# --- 5. the run --------------------------------------------------------------
say "--- auditing for ${HOURS}h with $WORKERS workers on $MODEL"
( cd "$TREE" && "$NODE" tools/audit/run.mjs \
    --workers "$WORKERS" --hours "$HOURS" --model "$MODEL" --run "nightly-$STAMP" )
RUN_RC=$?
say "run exited $RUN_RC"

( cd "$TREE" && "$NODE" tools/audit/audit.mjs release ) || true
( cd "$TREE" && "$NODE" tools/audit/audit.mjs export ) || true
AFTER=$( cd "$TREE" && "$NODE" tools/audit/audit.mjs status | sed -n 's/^work .*done \([0-9]*\) .*/\1/p' )
say "verdicts: ${BEFORE:-?} -> ${AFTER:-?}"

# --- 6. mon ------------------------------------------------------------------
# The audit itself is deterministic and needs no agent. What is worth a session is reading
# the night's findings and saying which ones matter, somewhere reachable from a phone.
if [ "${AUDIT_NO_MON:-0}" = 1 ]; then
  say "AUDIT_NO_MON=1 — skipping the mon handoff"
elif [ -x "$MON" ]; then
  say "--- handing the report to mon"
  "$MON" run "Last night's code audit finished. Read it with:

  node tools/audit/audit.mjs status
  node tools/audit/audit.mjs findings
  node tools/audit/audit.mjs na
  node tools/audit/audit.mjs demote

Say what changed since yesterday and what is worth acting on, in one paragraph a
person can read on a phone. Lead with the most severe finding, not the newest.
Verify each fail you mention against the source it cites and drop any whose
evidence does not hold — a fail with wrong line numbers is noise. If \`na\` shows a
rule answering n/a on most of its matches, say which rule and that its trigger is
too broad. If nothing meaningful landed, say that in one line rather than padding.
The run log is at $LOG." \
    --project "$TREE" \
    --title "Fantasia4x nightly code audit — $STAMP" \
    --tag "$TAG" \
    --by fantasia-audit.timer \
    || say "WARN: mon run failed"
else
  say "WARN: no mon at $MON — the report was not registered"
fi

say "=== done ==="
