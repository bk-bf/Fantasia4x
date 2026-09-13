#!/usr/bin/env bash
# Code audit, run by fantasia-audit.timer on ubuntuserver.
#
# Order matters: the source has to be current before the ledger is re-planned, or the
# night is spent auditing yesterday's code. Steps 1-2 are deterministic and cost nothing;
# only step 3 spends tokens.
#
#   1. pull dev from origin
#   2. re-index + re-plan  -> verdicts whose code did not move stay done
#   3. run the audit until the budget runs out
#   4. raise confirmed findings as GitHub issues
#   5. work a Ready card, review it, merge it to dev -- one card at a time
#
# Everything runs in the checkout on `dev`. `main` is the branch Kirill plays and builds from
# and nothing here writes to it; `promote.mjs` carries dev across when he decides.
#
# Environment (all optional, defaults suit ubuntuserver):
#   AUDIT_REPO      the dev checkout         ~/Projects/Fantasia4x
#   AUDIT_NODE      node >= 22.5             ~/.nvm/versions/node/v24.19.0/bin/node
#   AUDIT_HOURS     token budget in hours    3.5
#   AUDIT_WORKERS   parallel workers         3
#   AUDIT_MODEL     model for the loop       sonnet
#   AUDIT_FIXES     issues to attempt per night   2
#   AUDIT_REVIEWS   cards to review per night      2
#   AUDIT_NO_FIX=1  skip phase 3 entirely

set -uo pipefail

REPO="${AUDIT_REPO:-$HOME/Projects/Fantasia4x}"
NODE="${AUDIT_NODE:-$HOME/.nvm/versions/node/v24.19.0/bin/node}"
HOURS="${AUDIT_HOURS:-3.5}"
WORKERS="${AUDIT_WORKERS:-3}"
MODEL="${AUDIT_MODEL:-sonnet}"
FIXES="${AUDIT_FIXES:-2}"
REVIEWS="${AUDIT_REVIEWS:-2}"

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
resolving() { systemctl --user is-active --quiet fantasia-resolve; }
if resolving; then
  say "fantasia-resolve is working the Ready cards — skipping this run, nothing was touched"
  exit 0
fi
[ -x "$NODE" ] || die "no node at $NODE (needs >= 22.5 for node:sqlite)"
[ -x "$AUDIT_CLAUDE" ] || die "no claude at $AUDIT_CLAUDE"
[ -d "$REPO/.git" ] || die "no checkout at $REPO"
say "node $("$NODE" -v), claude $AUDIT_CLAUDE"

# --- 1. dev ------------------------------------------------------------------
# Everything runs off dev: the audit indexes it, the fixer branches from it, the reviewer
# merges into it. main is what Kirill plays and builds, and only `promote.mjs` writes there.
# An unpushed commit is rebased onto origin rather than treated as divergence, so a night
# whose push failed does not wedge `--ff-only` forever after.
say "--- pulling dev"
git -C "$REPO" fetch --quiet origin "+refs/heads/*:refs/remotes/origin/*" || say "WARN: fetch failed, auditing the tree as it stands"
if [ -n "$(git -C "$REPO" status --porcelain)" ]; then
  say "$REPO has uncommitted changes — skipping this run, nothing was touched"
  exit 0
fi
git -C "$REPO" checkout --quiet dev || die "cannot check out dev"
if ! git -C "$REPO" merge --ff-only --quiet origin/dev 2>/dev/null; then
  say "dev has local commits; rebasing them onto origin/dev"
  git -C "$REPO" rebase --quiet origin/dev \
    || { git -C "$REPO" rebase --abort 2>/dev/null; die "dev will not rebase onto origin/dev — needs a person"; }
fi
say "dev at $(git -C "$REPO" rev-parse --short dev)"

# --- 2. index + plan ---------------------------------------------------------
say "--- indexing"
( cd "$REPO" && "$NODE" tools/audit/audit.mjs index ) || die "index failed"
say "--- planning"
( cd "$REPO" && "$NODE" tools/audit/audit.mjs plan ) || die "plan failed"
BEFORE=$( cd "$REPO" && "$NODE" tools/audit/audit.mjs status | sed -n 's/^work .*done \([0-9]*\) .*/\1/p' )

# --- 3. the run --------------------------------------------------------------
say "--- auditing for ${HOURS}h with $WORKERS workers on $MODEL"
( cd "$REPO" && "$NODE" tools/audit/run.mjs \
    --workers "$WORKERS" --hours "$HOURS" --model "$MODEL" --run "nightly-$STAMP" )
RUN_RC=$?
say "run exited $RUN_RC"

( cd "$REPO" && "$NODE" tools/audit/audit.mjs release ) || true
( cd "$REPO" && "$NODE" tools/audit/audit.mjs export ) || true
AFTER=$( cd "$REPO" && "$NODE" tools/audit/audit.mjs status | sed -n 's/^work .*done \([0-9]*\) .*/\1/p' )
say "verdicts: ${BEFORE:-?} -> ${AFTER:-?}"

# --- 4. raise onto the board -------------------------------------------------
# Everything lands as `ready: false`. Nothing is worked on until a person has read it and
# flipped that, which is the only gate between the audit and the repo.
if [ "${AUDIT_NO_ISSUES:-0}" = 1 ]; then
  say "AUDIT_NO_ISSUES=1 -- not raising onto the file board"
else
  say "--- raising findings onto the board"
  ( cd "$REPO" && "$NODE" tools/audit/audit.mjs issues ) || say "WARN: issue raising failed"
fi

say "board is on GitHub; nothing to commit here"

# --- 5. the fixer ------------------------------------------------------------
if [ "${AUDIT_NO_FIX:-0}" = 1 ]; then
  say "AUDIT_NO_FIX=1 — skipping phase 3"
else
  say "--- fixer and reviewer: up to $FIXES card(s), each reviewed before the next is worked"
  for _ in $(seq 1 "$FIXES"); do
    if resolving; then say "fantasia-resolve is working the Ready cards — skipping the fixer"; break; fi
    ( cd "$REPO" && "$NODE" tools/audit/fix.mjs --next ) || break
    if [ "${AUDIT_NO_REVIEW:-0}" != 1 ]; then
      ( cd "$REPO" && "$NODE" tools/audit/review.mjs --next ) || true
    fi
  done
fi

# --- 6. review whatever is still waiting -------------------------------------
if [ "${AUDIT_NO_REVIEW:-0}" = 1 ]; then
  say "AUDIT_NO_REVIEW=1 — skipping the review pass"
elif resolving; then
  say "fantasia-resolve is working the Ready cards — skipping the review pass"
else
  say "--- reviewer: up to $REVIEWS pull request(s) without a review"
  for _ in $(seq 1 "$REVIEWS"); do
    ( cd "$REPO" && "$NODE" tools/audit/review.mjs --next ) || break
  done
fi

say "=== done ==="
