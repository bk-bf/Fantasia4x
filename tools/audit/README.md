# audit — a code-audit ledger

> **Related:** [AGENTS.md](../../AGENTS.md) · [DECISIONS.md](../../docs/game/DECISIONS.md) · [ITEM-RULES.md](../../docs/game/ITEM-RULES.md) · [ENGINE-PERFORMANCE.md](../../docs/tasks/open/ENGINE-PERFORMANCE.md) · [docs/issues](../../docs/issues/README.md)

"Audit the code" is unverifiable: nothing records which of the 5,599 objects in this repo
anything ever looked at, under which question, with which model. This tool makes that a
row in a table instead of a claim.

Every auditable object gets a line-independent key and a content hash. Every rule gets a
hash over its own text. A verdict is valid only for the triple
`(content_hash, dep_hash, rule_hash)` it was produced under — change the code, change a
callee, or reword the rule, and the work item re-opens on its own. Coverage is then
`SELECT count(*)`, not trust.

## Tiers

A check is assigned to exactly one tier, and must justify why the cheaper one cannot
decide it.

| Tier | Mechanism | Decides |
| --- | --- | --- |
| **T0** | `tsc`, `eslint`, `graph:check`, `audit t0` | syntax, types, structure, call edges, declared constants |
| **T1** | the 197 vitest files, `HeadlessSession`, `perf.log` | behaviour that runs |
| **T2** | the model loop | what a text-vs-code comparison or a whole-symbol reading decides |

Two mechanisms keep T2 small:

- **The ratchet.** `audit demote` lists T2 rules that have failed the same way often
  enough to be worth writing as a semgrep/ast-grep rule. Once written, the rule's status
  becomes `demoted` and it stops costing tokens. The expensive tier shrinks over time.
- **Escalation, not reporting.** For the behavioural families a `fail` is meant to become a
  vitest case or a headless scenario. A repro that passes closes the finding as a false
  positive. T2 feeds T1 rather than competing with it.

## Rule families

Rules live in [`rules/`](rules/), one file per family, as data. `audit rules` validates
them.

| Family | What only a reader can decide |
| --- | --- |
| **A** contract | The 31 ADRs `codegraph.config.json` marks `checkable: false`, plus doc-vs-code drift |
| **B** boundary | Ids and dev jargon in player-facing text; tone; selection-is-not-commitment |
| **C** silent failure | A default masking a failed lookup; a discarded error; a signal-free early return |
| **D** units | Ticks vs turns, ms vs seconds, 0–1 vs 0–100 |
| **E** hot path | Per-tick allocation, ref churn under a memo, snapshot growth, ungated logging |
| **F** tests | A test that asserts less than the symbol promises; a cheap test that is missing |
| **G** reachability | A branch no caller can satisfy |
| **H** data | Item tier plausibility, naming progression, generic-before-thematic |
| **S** single-source | A roster restated by hand, a correspondence held together by a comment, a label mapped twice, a data key read unvalidated |

Family **S** was derived from [`core-stat-single-source`](../../docs/issues/core-stat-single-source.md),
which was found by hand. It is the family most likely to be under-triggered rather than
over-triggered — check its n/a rate before trusting a clean result.

Content and gameplay findings land on the same board. `docs/tasks/archive/AUDIT-2026-08-25.md`
was the old headless-sim checklist; its unfinished items are now issue files and its completed
record is archived. This ledger raises **code-level** findings into that same board.

## Rule shape

```jsonc
{
  "id": "E01",
  "family": "hot-path",
  "tier": "T2",
  "title": "allocation on the per-tick peace path",
  "authority": "docs/tasks/open/ENGINE-PERFORMANCE.md",   // excerpt is shipped in the prompt
  "question": "Does this symbol allocate ... on every tick when nothing is happening?",
  "fail_requires": [                    // a fail missing any of these is rejected
    "file:line of the allocation",
    "the call path from processGameTurn or tickPawn",
    "why it is not already guarded by a first-write or combat-only check"
  ],
  "not_a_finding": [                    // grown as false positives are closed
    "an allocation behind a first-write / copy-on-write guard"
  ],
  "trigger": {                          // evaluated by the harness, never by the model
    "all": [
      { "kind_in": ["function", "method"] },
      { "reachable_from": { "entries": ["processGameTurn", "tickPawn"], "max_hops": 4 } },
      { "any_flag": ["allocatesArray", "spreadsObject", "allocatesLiteral", "deepClones"] }
    ]
  },
  "demotable": false,
  "status": "active"                    // active | draft | demoted
}
```

Trigger clauses: `file_glob` `file_not_glob` `kind_in` `lang_in` `layer_in` `group_in`
`module_matches` `name_matches` `exported` `tested` `test_reachable` `max_test_depth`
`min_loc` `max_loc` `flag` `any_flag` `no_flag` `matches` `not_matches` `reachable_from`
`has_callers` `min_callers`, composed with `all` / `any` / `not`.

`tested` is "a test file calls this symbol directly". Most of this suite runs through
`buildScenario` / `HeadlessSession`, so what a test actually exercises sits one or more
hops further in: `test_reachable` and `max_test_depth` read codegraph's `testDepth` (hops
to the nearest directly-tested symbol) and are what a rule asking "is this untested?"
should use. Asking with `tested` alone puts 271 symbols in front of an agent where
`test_reachable` puts 79.

## Verdicts

One row per `(symbol, rule)`, with four possible values:

| Status | Requirement |
| --- | --- |
| `pass` | the default |
| `fail` | every item in that rule's `fail_requires`, plus a summary — enforced in `lib/verdict.mjs`, not in the prompt |
| `n/a` | must name the trigger clause it believes did not hold, which is checkable against the harness |
| `undecidable` | must name exactly what was missing |

`undecidable` is what stops the model guessing, and a rule with a high undecidable rate is
a badly scoped rule — visible per rule in `audit status`.

## Commands

```bash
node tools/audit/audit.mjs index      # inventory: spans, hashes, flags, call graph, reachability
node tools/audit/audit.mjs plan       # cross active rules against symbols -> pending work
node tools/audit/audit.mjs plan --why # per-rule match counts and top trigger-miss reasons
node tools/audit/audit.mjs status     # coverage, overall and per rule
node tools/audit/audit.mjs t0         # ADR constant drift + which ADRs have no check at all
node tools/audit/audit.mjs findings   # open fails with their evidence
node tools/audit/audit.mjs demote     # T2 rules that have earned a move to T0
node tools/audit/audit.mjs export     # ledger -> JSONL under tools/audit/ledger/ (git-ignored)

node tools/audit/run.mjs --workers 4 --hours 8        # the overnight loop
node tools/audit/run.mjs --once --model haiku         # one batch, for checking a rule
```

`index` needs a current `codegraph` extract for the reachability and caller triggers; run
`pnpm graph` first. It compares the extract's commit against HEAD and warns when they
differ — a stale graph makes `reachable_from` under-fire, which reads as clean code rather
than as an unasked question. It also reports how each node was matched: `exact` is
one-to-one, `folded` is a codegraph node (a nested function, an object-literal method, a
component) attributed to the symbol whose span contains it, and anything left over has no
counterpart in this inventory at all and gets named.

## Parallel workers

Claims are atomic (`BEGIN IMMEDIATE` + a `changes()` check), so any number of processes or
machines can share one ledger. Each worker sets `AUDIT_WORKER` to something distinct;
`run.mjs` does this per worker. A claim carries a lease, and an expired one returns to the
pool, so a killed worker costs one batch. `audit release` returns this worker's claims
immediately.

The hash triple is re-checked at submission: if the source moved while a batch was in
flight, the verdict is rejected and the item stays open. A worker can never write a verdict
about code that no longer exists.

## Phase 2 — findings become issues

A finding is a verdict row. An issue is a unit of work. `audit issues` turns one into the
other by grouping open findings by **(rule, two-path-segment module group)**: a rule firing
forty times is one class of defect, and the class is what a fixer can close in a single PR.
Each issue carries every citation the audit demanded before it would record a fail.

```bash
node tools/audit/audit.mjs issues --dry-run   # what would be written
node tools/audit/audit.mjs issues             # write docs/issues/*.md
node tools/audit/audit.mjs board              # the board, by status
```

The board lives at [`docs/issues/`](../../docs/issues/README.md) and is the **only** record
of a defect — nothing is projected to a forge. See
[why not GitHub](../../docs/pr/README.md#why-not-github).

Everything is raised `ready: false`. `ready` is the only gate between the audit and the
repo, and only a person sets it: the fixer will not touch anything without it. An audit that
raised its own work and then acted on it would be a loop with no one in it.

Refreshing never overwrites an issue whose `origin: human`, and never reopens one that is
`closed`.

## Phase 3 — the fixer

```bash
node tools/audit/fix.mjs --next               # oldest ready issue
node tools/audit/fix.mjs --issue <slug>       # a named one
node tools/audit/fix.mjs --next --dry-run     # pick and print
node tools/audit/fix.mjs --next --keep        # leave the worktree to inspect
```

One issue, one worktree off `origin/main`, one branch `fix/<slug>`, one review file at
[`docs/pr/<slug>.md`](../../docs/pr/README.md). The prompt hands
the model the issue and states plainly that AGENTS.md's "stop at a proposal" rule does not
apply here — `ready: true` is the go-ahead — because otherwise every run ends with a plan and
no diff. It is told not to commit, not to push, not to touch `docs/issues/`, and that
`Out of scope` is binding.

**Nothing is committed unless `pnpm check` and `pnpm test:related` are green, and nothing is
pushed at all.** The branch stays local; whether it reaches `main` is your decision, made by
reading `git diff main...fix/<slug>`. A run that cannot get green commits nothing, writes the
failure and the model's account to the review board as `status: abandoned`, keeps its
worktree, and returns the issue to `open` — a failed attempt leaves a record rather than a
half-finished branch.

Status moves `open → in-progress → in-review`, with `pr:` naming the review file. Merging is
yours; nothing here closes an issue.

**Every attempt is handed to `mon` under the `fix` tag** (`AUDIT_FIX_TAG`), separately from
the nightly audit reports on `ci/cl`:

| Outcome | The session |
| --- | --- |
| Ready to review | Runs in the main checkout. Reads `git diff main...fix/<slug>` against the issue and says which remediation steps it actually did, which it skipped, and what a reviewer should look at hardest. |
| Not green | **Keeps the fix worktree and runs in it**, with the changes still in place. `mon steer` can carry the same attempt forward from any machine rather than starting over. |
| Nothing changed | Says whether the issue is already fixed, wrongly scoped, or was not understood. No review file is written. |
| Crashed before verifying | Says whether it is a harness problem or an issue problem, and changes nothing. |

`--no-mon` skips registration.

An interrupted run (SIGINT/SIGTERM/SIGHUP) releases its issue back to `open` before
exiting and leaves the worktree in place. Without that a killed run leaves the issue at
`in-progress` with a branch set, and no later run will ever pick it up again.

## Nightly run on ubuntuserver

`deploy/` holds a systemd user timer that runs the whole thing at 04:00 local and hands the
report to `mon`. The units' `ExecStart` points into this checkout, so the repo owns them —
`install.sh` symlinks rather than copies, and a `git pull` updates the installed unit.

```bash
tools/audit/deploy/install.sh              # symlink the units, enable the timer
tools/audit/deploy/install.sh --no-enable  # install only
tools/audit/deploy/install.sh --uninstall  # stop it autorunning; the checkout stays
systemctl --user list-timers fantasia-audit.timer
journalctl --user -u fantasia-audit.service -n 40
```

[`nightly-audit.sh`](deploy/nightly-audit.sh) runs in this order, and the order is the
point — the source has to be current before the ledger is re-planned:

1. `git fetch` + fast-forward `main` from origin. It runs in the main checkout on `main`;
   there is no audit branch. A board commit whose push failed last night is rebased onto
   `origin/main` rather than treated as divergence, which would otherwise wedge every
   later run on `--ff-only`.
2. re-extract the codegraph — without it the reachability triggers stop firing, which reads
   as "the hot path is clean" rather than "nothing was asked about it"
3. `audit index` + `audit plan` — verdicts whose code did not move stay `done`, so only the
   diff is re-audited
4. `run.mjs` until the budget runs out (3.5 h, 3 workers, sonnet by default)
5. `audit issues` — findings onto the board, committed to `main` and pushed. This is the
   only thing the nightly puts on `main`; it is markdown, and all of it `ready: false`.
6. `fix.mjs --next` ×`AUDIT_FIXES` — only touches `ready: true` issues. Each attempt gets
   its own local branch and a review file; nothing is pushed.
7. `mon run` with the night's numbers, so the report is readable from a phone

Steps 1–3 and 5 are deterministic and cost nothing; steps 4 and 6 spend tokens. A `flock`
stops a second night starting on top of an overrunning one.

**Timezone.** The server's clock is UTC, so `OnCalendar` carries an explicit
`Europe/Berlin`. A plain cron line at `0 4 * * *` on that box would fire at 04:00 UTC —
06:00 local in summer — and shift by an hour at every DST change.

**Node.** The server's default `node` is v20, which has no `node:sqlite`. The script pins
`~/.nvm/versions/node/v24.19.0/bin/node`; override with `AUDIT_NODE`.

**Linger.** A user timer only fires while the user has a session unless
`loginctl enable-linger` is set. `install.sh` says so if it is not.

Environment overrides: `AUDIT_REPO` `AUDIT_TREE` `AUDIT_GRAPH` `AUDIT_NODE` `AUDIT_CLAUDE`
`AUDIT_HOURS` `AUDIT_WORKERS` `AUDIT_MODEL` `AUDIT_FIX_MODEL` `AUDIT_FIXES` `AUDIT_MON`
`AUDIT_TAG` `AUDIT_NO_MON` `AUDIT_NO_FIX`.

## Storage

`tools/audit/.ledger/audit.db` (SQLite via `node:sqlite`, no native dependency).
`audit export` writes `tools/audit/ledger/*.jsonl` — a readable dump for grepping or
backing up. Both directories are git-ignored: the ledger is per-machine state, and
committing it from two machines guarantees a conflict on the nightly merge.
Schema: [`schema.sql`](schema.sql).
