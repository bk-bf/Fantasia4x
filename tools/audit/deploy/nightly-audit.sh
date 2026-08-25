#!/usr/bin/env bash
# Nightly code audit, run by fantasia-audit.timer on ubuntuserver.
#
# Order matters: the source has to be current before the ledger is re-planned, or the
# night is spent auditing yesterday's code. Steps 1-4 are deterministic and cost nothing;
# only step 5 spends tokens.
#
#   1. pull main from origin
#   2. re-extract the codegraph (reachability triggers read it)
#   3. re-index + re-plan  -> verdicts whose code did not move stay done
#   4. run the audit until the budget runs out
#   5. raise confirmed findings onto the issue board, and commit it to main
#   6. work any issue a person marked `ready: true` -> a local branch + a review file
#   7. hand the result to mon so it can be read from anywhere
#
# Everything runs in the main checkout on `main`. The audit's own output (the board) is the
# only thing it commits there; a fix attempt goes to its own branch and is never pushed.
#
# Environment (all optional, defaults suit ubuntuserver):
#   AUDIT_REPO      main checkout            ~/Projects/Fantasia4x
#   AUDIT_GRAPH     codegraph checkout       ~/Projects/codegraph
#   AUDIT_NODE      node >= 22.5             ~/.nvm/versions/node/v24.19.0/bin/node
#   AUDIT_HOURS     token budget in hours    3.5
#   AUDIT_WORKERS   parallel workers         3
#   AUDIT_MODEL     model for the loop       sonnet
#   AUDIT_MON       mon binary               ~/Documents/Projects/mon/mon
#   AUDIT_TAG       mon tag                  ci/cl
#   AUDIT_FIXES     issues to attempt per night   2
#   AUDIT_NO_MON=1  skip the mon handoff (for a manual test run)
#   AUDIT_NO_FIX=1  skip phase 3 entirely

set -uo pipefail

REPO="${AUDIT_REPO:-$HOME/Projects/Fantasia4x}"
GRAPH="${AUDIT_GRAPH:-$HOME/Projects/codegraph}"
NODE="${AUDIT_NODE:-$HOME/.nvm/versions/node/v24.19.0/bin/node}"
HOURS="${AUDIT_HOURS:-3.5}"
WORKERS="${AUDIT_WORKERS:-3}"
MODEL="${AUDIT_MODEL:-sonnet}"
MON="${AUDIT_MON:-$HOME/Documents/Projects/mon/mon}"
TAG="${AUDIT_TAG:-ci/cl}"
FIXES="${AUDIT_FIXES:-2}"

# claude lives in ~/.local/bin, which is on PATH in a login shell and in the unit, but not
# when this script is invoked over a bare ssh command. Resolve it here so all three agree.
export PATH="$HOME/.local/bin:$PATH"
AUDIT_CLAUDE="${AUDIT_CLAUDE:-$(command -v claude || echo "$HOME/.local/bin/claude")}"
export AUDIT_CLAUDE

LOGDIR="$REPO/tools/audit/.ledger/nightly"
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
[ -x "$AUDIT_CLAUDE" ] || die "no claude at $AUDIT_CLAUDE"
[ -d "$REPO/.git" ] || die "no checkout at $REPO"
say "node $("$NODE" -v), claude $AUDIT_CLAUDE"

# --- 1. main -----------------------------------------------------------------
# Everything below runs here. A board commit left over from a night whose push failed would
# make `--ff-only` fail forever after, so an unpushed board commit is rebased onto origin
# rather than treated as divergence.
say "--- pulling main"
git -C "$REPO" fetch --quiet origin "+refs/heads/*:refs/remotes/origin/*" || die "fetch failed"
if [ -n "$(git -C "$REPO" status --porcelain)" ]; then
  die "$REPO has uncommitted changes — refusing to run against a dirty tree"
fi
git -C "$REPO" checkout --quiet main || die "cannot check out main"
if ! git -C "$REPO" merge --ff-only --quiet origin/main 2>/dev/null; then
  say "main has local commits; rebasing them onto origin/main"
  git -C "$REPO" rebase --quiet origin/main \
    || { git -C "$REPO" rebase --abort 2>/dev/null; die "main will not rebase onto origin/main — needs a person"; }
fi
say "main at $(git -C "$REPO" rev-parse --short main)"

# --- 2. codegraph ------------------------------------------------------------
# Without a current extract the reachability triggers silently stop firing, which reads as
# "the hot path is clean" rather than "nothing was asked about it".
if [ -d "$GRAPH" ]; then
  say "--- re-extracting codegraph"
  ( cd "$REPO" && "$NODE" "$GRAPH/bin/codegraph.mjs" extract Fantasia4x ) \
    || say "WARN: codegraph extract failed; reachability triggers will under-fire"
else
  say "WARN: no codegraph at $GRAPH; reachability triggers will not fire"
fi

# --- 3. index + plan ---------------------------------------------------------
say "--- indexing"
( cd "$REPO" && "$NODE" tools/audit/audit.mjs index ) || die "index failed"
say "--- planning"
( cd "$REPO" && "$NODE" tools/audit/audit.mjs plan ) || die "plan failed"
BEFORE=$( cd "$REPO" && "$NODE" tools/audit/audit.mjs status | sed -n 's/^work .*done \([0-9]*\) .*/\1/p' )

# --- 4. the run --------------------------------------------------------------
say "--- auditing for ${HOURS}h with $WORKERS workers on $MODEL"
( cd "$REPO" && "$NODE" tools/audit/run.mjs \
    --workers "$WORKERS" --hours "$HOURS" --model "$MODEL" --run "nightly-$STAMP" )
RUN_RC=$?
say "run exited $RUN_RC"

( cd "$REPO" && "$NODE" tools/audit/audit.mjs release ) || true
( cd "$REPO" && "$NODE" tools/audit/audit.mjs export ) || true
AFTER=$( cd "$REPO" && "$NODE" tools/audit/audit.mjs status | sed -n 's/^work .*done \([0-9]*\) .*/\1/p' )
say "verdicts: ${BEFORE:-?} -> ${AFTER:-?}"

# --- 5. raise onto the board -------------------------------------------------
# Everything lands as `ready: false`. Nothing is worked on until a person has read it and
# flipped that, which is the only gate between the audit and the repo.
say "--- raising findings onto the board"
( cd "$REPO" && "$NODE" tools/audit/audit.mjs issues ) || say "WARN: issue raising failed"

if [ -n "$(git -C "$REPO" status --porcelain docs/issues)" ]; then
  git -C "$REPO" add docs/issues
  git -C "$REPO" -c user.name="fantasia-audit" -c user.email="audit@localhost" \
    commit -q -m "docs(issues): board refresh $STAMP" || say "WARN: board commit failed"
  if ! git -C "$REPO" push -q origin main 2>/dev/null; then
    # Someone pushed to main during the run. Rebase the board commit on top and try once more;
    # if that still fails, step 1 of the next run picks it up rather than leaving it stranded.
    say "board push rejected; rebasing onto origin/main and retrying"
    git -C "$REPO" fetch --quiet origin main \
      && git -C "$REPO" rebase --quiet origin/main \
      && git -C "$REPO" push -q origin main \
      || { git -C "$REPO" rebase --abort 2>/dev/null; say "WARN: board push failed; next run retries"; }
  fi
  say "board committed and pushed"
else
  say "board unchanged"
fi


# --- 7. the fixer ------------------------------------------------------------
if [ "${AUDIT_NO_FIX:-0}" = 1 ]; then
  say "AUDIT_NO_FIX=1 — skipping phase 3"
else
  say "--- fixer: up to $FIXES issue(s)"
  for _ in $(seq 1 "$FIXES"); do
    ( cd "$REPO" && "$NODE" tools/audit/fix.mjs --next ) || break
  done
fi

# --- 6. mon ------------------------------------------------------------------
# The audit itself is deterministic and needs no agent. What is worth a session is reading
# the night's findings and saying which ones matter, somewhere reachable from a phone.
if [ "${AUDIT_NO_MON:-0}" = 1 ]; then
  say "AUDIT_NO_MON=1 — skipping the mon handoff"
elif [ -x "$MON" ]; then
  say "--- handing the report to mon"
  # The pinned node matters in the prompt too: the session's own PATH resolves to v20,
  # which has no node:sqlite, so a bare \`node\` would fail to open the ledger.
  "$MON" run "Last night's code audit finished. Read it with (use this exact node):

  $NODE tools/audit/audit.mjs status
  $NODE tools/audit/audit.mjs findings
  $NODE tools/audit/audit.mjs na
  $NODE tools/audit/audit.mjs demote
  $NODE tools/audit/audit.mjs board

Say what changed since yesterday and what is worth acting on, in one paragraph a
person can read on a phone. Lead with the most severe finding, not the newest.
Verify each fail you mention against the source it cites and drop any whose
evidence does not hold — a fail with wrong line numbers is noise. If \`na\` shows a
rule answering n/a on most of its matches, say which rule and that its trigger is
too broad. Name any issue the board gained tonight that looks worth marking \`ready: true\`,
and any PR the fixer opened. If nothing meaningful landed, say that in one line rather than padding.
The run log is at $LOG." \
    --project "$REPO" \
    --title "Fantasia4x nightly code audit — $STAMP" \
    --tag "$TAG" \
    --by fantasia-audit.timer \
    || say "WARN: mon run failed"
else
  say "WARN: no mon at $MON — the report was not registered"
fi

say "=== done ==="
