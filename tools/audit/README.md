# audit — a code-audit ledger

> **Related:** [AGENTS.md](../../AGENTS.md) · [DECISIONS.md](../../docs/game/DECISIONS.md) · [ITEM-RULES.md](../../docs/game/ITEM-RULES.md) · [ENGINE-PERFORMANCE.md](../../docs/tasks/open/ENGINE-PERFORMANCE.md) · [issues](https://github.com/bk-bf/Fantasia4x/issues)

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
| **T0** | `tsc`, `eslint`, `audit t0` | syntax, types, declared constants, architecture seams |
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
| **A** contract | ADR invariants stated in prose, which no script can decide, plus doc-vs-code drift |
| **B** boundary | Ids and dev jargon in player-facing text; tone; selection-is-not-commitment |
| **C** silent failure | A default masking a failed lookup; a discarded error; a signal-free early return |
| **D** units | Ticks vs turns, ms vs seconds, 0–1 vs 0–100 |
| **E** hot path | Per-tick allocation, ref churn under a memo, snapshot growth, ungated logging |
| **F** tests | A test that asserts less than the symbol promises; a cheap test that is missing |
| **G** reachability | A branch no caller can satisfy |
| **H** data | Item tier plausibility, naming progression, generic-before-thematic |
| **S** single-source | A roster restated by hand, a correspondence held together by a comment, a label mapped twice, a data key read unvalidated |

Family **S** was derived from [issue #20](https://github.com/bk-bf/Fantasia4x/issues/20),
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
`module_matches` `name_matches` `exported` `min_loc` `max_loc` `flag` `any_flag` `no_flag`
`matches` `not_matches`, composed with `all` / `any` / `not`.

Every clause reads the symbol's own text and metadata, both taken from the file it lives
in. There is deliberately no clause for "is this reached from the tick loop" or "does a
test cover this": those are questions about the rest of the repository, the rule states
them, and the agent answers them by searching and citing `path:line`. A precomputed answer
would be a second copy of the codebase to keep in step, and when it drifted the triggers
would stop firing quietly — which reads as clean code rather than as an unasked question.

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
node tools/audit/run.mjs --workers 2 --hours 1 --dry-run   # drive the board, spend nothing

node tools/audit/audit.mjs tick        # one supervisor pass: apply the dashboard, launch if due
node tools/audit/audit.mjs tick --json # the same, as the document audit-monitor.py projects
```

`index` re-reads every source file and rewrites the symbol inventory; `plan` crosses the
active rules against it. A verdict survives both as long as its symbol's `content_hash` and
its rule's `rule_hash` are unchanged, so only what actually moved is re-audited.

## How the dashboard drives a run

`/audit` never touches the ledger. A button writes a request file, and `audit.mjs tick`
is the only thing that reads it. `audit-monitor.timer` calls `tick` every 20 s, so a click
takes effect within one tick and a pause reaches a live worker within its poll interval.

`tick` decides one thing: whether a runner should be alive right now. It is alive when the
audit is not paused, a **run window** is open, and work is pending. Start opens a window of
the requested length; Resume reopens the last one if it has closed, which is what makes
Resume able to start the audit from a standing stop. A pause kills the runner — `run.mjs`
exits rather than idles — and the next tick after a resume launches it again with the hours
left in the window. The window expiring is what ends a run for good; nothing relaunches
after that until a button asks.

The runner is started as its own transient unit, `fantasia-audit-run.service`, not as a
child of the monitor. A child would sit in `audit-monitor.service`'s cgroup and be killed
the moment that oneshot finished, which is how a launch could report success and leave
nothing running. `systemctl --user status fantasia-audit-run` is the runner's own status.

Five launches that die inside two minutes close the window and record why, so a runner that
cannot start does not relaunch every 20 s.

## Testing the board without spending anything

`--dry-run` runs the whole loop — the pace gate, the pause check, the per-worker state the
dashboard reads — but claims no work, calls no model and writes no verdict. The board shows
`working`, the worker rows fill, and Pause stops it, all for free. Use it for any change to
`/audit`; the ledger and `pace.json` are left exactly as they were.

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
node tools/audit/audit.mjs issues             # raise them as GitHub issues
node tools/audit/audit.mjs board              # the board, by status
```

The board is [GitHub issues](https://github.com/bk-bf/Fantasia4x/issues). Frontmatter became
labels: severity (`high`/`medium`/`low`), kind (`drift`, `correctness`, `data`, `boundary`,
`test gap`), origin (`found by audit`/`found by hand`), the rule that fired (`S01`, `G01`, …)
and the `ready` gate. `tools/audit/lib/gh.mjs` is the only writer; it finds an issue again by
the `<!-- audit-id: … -->` marker in its body and keeps files and symbols in a
`<!-- audit-meta: … -->` block beside it.

Everything is raised into `Backlog`. The lane is the only gate between the audit and the
repo: a card reaches the fixer when it is in `Ready`, and it gets there by triage, not by the
run that raised it. An audit that raised its own work and then acted on it would be a loop
with no one in it.

Refreshing never overwrites an issue whose `origin: human`, and never reopens one that is
`closed`.

## Phase 3 — the fixer

```bash
pnpm audit:fix --next                     # oldest Ready card on the tests route
pnpm audit:fix --next --verify headless   # the headless route instead
pnpm audit:fix --next --verify playtest   # work it, then hand it to Kirill
pnpm audit:fix --issue 24                 # a named one
pnpm audit:fix --next --dry-run           # pick and print
pnpm audit:fix --next --keep              # leave the worktree to inspect
```

The gate is the board, not a label: a card sitting in `Ready`, worked on the route its `Verify`
field names.

One issue, one worktree off `origin/dev`, one branch `fix/<slug>`, and the attempt written up
as a comment on that issue. The prompt hands the model the issue and states plainly that
AGENTS.md's "stop at a proposal" rule does not apply here, because otherwise every run ends
with a plan and no diff. It is told not to commit, not to push, not to close the issue, and
that `Out of scope` is binding.

**Nothing is committed unless `pnpm check` and `pnpm test:related` are green.** A green branch
is pushed to origin so the diff is readable from anywhere; `review.mjs` deletes it there when it
merges. A run that
cannot get green commits nothing, writes the failure and the model's account to the issue as a
comment, keeps its worktree, and sends the card back to `Ready`.

Where it ends depends on the route:

| Route | Green ends at |
| --- | --- |
| `tests`, `headless` | `In review`, for `review.mjs` to verify on the merge and land. |
| `playtest` | `Needs playtest`, committed and **not** merged. The branch is pushed, the worktree is kept, and it is given a free port in `.devport` so `./dev.sh` inside it runs beside the checkout's own dev server instead of fighting it for 5173. Only Kirill merges one. |

The card moves `Ready → In progress → In review` or `→ Needs playtest`. An interrupted run (SIGINT/SIGTERM/SIGHUP)
sends it back to `Ready` before exiting and leaves the worktree in place. A card left `In
progress` with no worktree behind it — a run that was killed outright — is released by the next
run before it picks anything.

## Phase 4 — the reviewer

```bash
pnpm audit:review --next                  # oldest In review card
pnpm audit:review --issue 24              # a named one
pnpm audit:review --next --dry-run        # pick and print
pnpm audit:review --next --keep           # leave the worktree to inspect
```

Before anything runs, the diff is checked against the files the issue cites: a change to a file
the issue does not name has either reached past what was asked or fixed a different problem, and
goes back to `Ready` naming both lists. A file under `src/tests/` is always in scope, and an
issue that cites no code at all is not checked this way. On the `tests` route no model reads the
diff, so this is the only thing that reads it.

The fixer verified its branch in isolation. The reviewer verifies the **merge**: a second
worktree off a freshly fetched `origin/dev`, `git merge --no-ff` of `fix/<slug>` into it, and
the route run again on the result. A branch that passed alone and conflicts with `dev`, or
passes alone and fails against what landed since, is caught here and nowhere else.

| Route | What settles it |
| --- | --- |
| `tests` | `pnpm check` and `pnpm test:related` on the merge result. Deterministic, no model. |
| `headless` | The same, then a session that must invoke the `headless` skill, drive the real sim over real ticks, and end with `VERDICT: PASS` or `VERDICT: FAIL`. It judges only whether the stated behaviour happens — never whether the numbers are the right numbers, which is a playtest question. |

Green means merged to **`dev`**: `git push origin HEAD:dev`, a comment naming the merge commit,
the issue closed, the card in `On dev`, and both branches deleted. `main` is not touched.

## Promotion

```bash
pnpm audit:promote --list      # what is on dev that main does not have
pnpm audit:promote             # merge it in a worktree and run the whole suite there
pnpm audit:promote --push      # the same, and push main + move the cards to Done
```

`main` is the branch you play and build from, so nothing automated writes to it. Promotion
merges `dev` into `main` in a throwaway worktree, runs `pnpm check` and the **entire** vitest
suite there — 191 files, 1383 tests, about seven minutes — and then stops. It prints the
worktree so you can `./dev.sh` in it on its own port and play the merge before it exists
anywhere else. `--push` is the same run with the push at the end.

A promotion that is not green leaves `main` untouched and keeps the worktree.

Anything else sends the card back to `Ready` with the failure written on the issue and the
worktree kept.

Both scripts stop while the audit is paused — they spend the same limits, and the pause is one
switch for all of it.

## Nightly run on ubuntuserver

`deploy/` holds a systemd user timer that runs the whole thing at 04:00 local. The units'
`ExecStart` points into this checkout, so the repo owns them —
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

1. `git fetch` + fast-forward `dev` from origin. It runs in the checkout on `dev`; there is no
   audit branch. A commit whose push failed last night is rebased onto `origin/dev` rather than
   treated as divergence, which would otherwise wedge every later run on `--ff-only`.
2. `audit index` + `audit plan` — verdicts whose code did not move stay `done`, so only the
   diff is re-audited
3. `run.mjs` until the budget runs out (3.5 h, 3 workers, sonnet by default)
4. `audit issues` — findings raised as GitHub issues, into `Backlog`. Nothing acts on them
   until someone triages a card into `Ready`.
5. `fix.mjs --next` then `review.mjs --next`, ×`AUDIT_FIXES` — **interleaved, not one pass
   each**. A fixer cuts its worktree from `origin/dev`, so a card worked before the previous
   one has merged does not contain it. 22 files are cited by more than one open issue, and two
   cards on the same file conflict the moment the second one merges. Reviewing each card before
   working the next closes that window.
6. `review.mjs --next` ×`AUDIT_REVIEWS` — anything still sitting `In review`, from a night that
   was cut short or a card sent back and re-worked. Nothing in the nightly writes `main`.

Steps 1–3 are deterministic and cost nothing; steps 4, 5 and 6 spend tokens. A `flock`
stops a second night starting on top of an overrunning one.

**Timezone.** The server's clock is UTC, so `OnCalendar` carries an explicit
`Europe/Berlin`. A plain cron line at `0 4 * * *` on that box would fire at 04:00 UTC —
06:00 local in summer — and shift by an hour at every DST change.

**Node.** The server's default `node` is v20, which has no `node:sqlite`. The script pins
`~/.nvm/versions/node/v24.19.0/bin/node`; override with `AUDIT_NODE`.

**Linger.** A user timer only fires while the user has a session unless
`loginctl enable-linger` is set. `install.sh` says so if it is not.

Environment overrides: `AUDIT_REPO` `AUDIT_TREE` `AUDIT_GRAPH` `AUDIT_NODE` `AUDIT_CLAUDE`
`AUDIT_HOURS` `AUDIT_WORKERS` `AUDIT_MODEL` `AUDIT_FIX_MODEL` `AUDIT_FIXES` `AUDIT_REVIEWS`
`AUDIT_NO_FIX`.

## Storage

`tools/audit/.ledger/audit.db` (SQLite via `node:sqlite`, no native dependency).
`audit export` writes `tools/audit/ledger/*.jsonl` — a readable dump for grepping or
backing up. Both directories are git-ignored: the ledger is per-machine state, and
committing it from two machines guarantees a conflict on the nightly merge.
Schema: [`schema.sql`](schema.sql).
