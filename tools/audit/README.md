# audit — a code-audit ledger

> **Related:** [AGENTS.md](../../AGENTS.md) · [DECISIONS.md](../../docs/game/DECISIONS.md) · [ITEM-RULES.md](../../docs/game/ITEM-RULES.md) · [ENGINE-PERFORMANCE.md](../../docs/tasks/open/ENGINE-PERFORMANCE.md) · [AUDIT.md](../../docs/tasks/open/AUDIT.md)

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

`docs/tasks/open/AUDIT.md` remains the tracker for **content and gameplay** audits driven
through the headless sim. This ledger covers **code-level** checks. They do not overlap.

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
`module_matches` `name_matches` `exported` `tested` `min_loc` `max_loc` `flag` `any_flag`
`no_flag` `matches` `not_matches` `reachable_from` `has_callers` `min_callers`, composed
with `all` / `any` / `not`.

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
node tools/audit/audit.mjs export     # ledger -> JSONL under tools/audit/ledger/

node tools/audit/run.mjs --workers 4 --hours 8        # the overnight loop
node tools/audit/run.mjs --once --model haiku         # one batch, for checking a rule
```

`index` needs a current `codegraph` extract for the reachability and caller triggers; run
`pnpm graph` first. It reports the node match rate and warns when it is low — a low rate
means `reachable_from` is under-firing, not that the code is clean.

## Parallel workers

Claims are atomic (`BEGIN IMMEDIATE` + a `changes()` check), so any number of processes or
machines can share one ledger. Each worker sets `AUDIT_WORKER` to something distinct;
`run.mjs` does this per worker. A claim carries a lease, and an expired one returns to the
pool, so a killed worker costs one batch. `audit release` returns this worker's claims
immediately.

The hash triple is re-checked at submission: if the source moved while a batch was in
flight, the verdict is rejected and the item stays open. A worker can never write a verdict
about code that no longer exists.

## Nightly run on ubuntuserver

`deploy/` holds a systemd user timer that runs the whole thing at 04:00 local and hands the
report to `mon`. The units' `ExecStart` points into this checkout, so the repo owns them —
`install.sh` symlinks rather than copies, and a `git pull` updates the installed unit.

```bash
tools/audit/deploy/install.sh              # symlink the units, enable the timer
tools/audit/deploy/install.sh --no-enable  # install only
tools/audit/deploy/install.sh --uninstall
systemctl --user list-timers fantasia-audit.timer
journalctl --user -u fantasia-audit.service -n 40
```

[`nightly-audit.sh`](deploy/nightly-audit.sh) runs in this order, and the order is the
point — the source has to be current before the ledger is re-planned:

1. `git fetch` + fast-forward `main` from origin
2. merge `main` into `audit-ledger` in the worktree (aborts on conflict rather than guessing)
3. re-extract the codegraph — without it the reachability triggers stop firing, which reads
   as "the hot path is clean" rather than "nothing was asked about it"
4. `audit index` + `audit plan` — verdicts whose code did not move stay `done`, so only the
   diff is re-audited
5. `run.mjs` until the budget runs out (3.5 h, 3 workers, sonnet by default)
6. `mon run` with the night's numbers, so the report is readable from a phone

Steps 1–4 are deterministic and cost nothing; only step 5 spends tokens. A `flock` stops a
second night starting on top of an overrunning one.

**Timezone.** The server's clock is UTC, so `OnCalendar` carries an explicit
`Europe/Berlin`. A plain cron line at `0 4 * * *` on that box would fire at 04:00 UTC —
06:00 local in summer — and shift by an hour at every DST change.

**Node.** The server's default `node` is v20, which has no `node:sqlite`. The script pins
`~/.nvm/versions/node/v24.19.0/bin/node`; override with `AUDIT_NODE`.

**Linger.** A user timer only fires while the user has a session unless
`loginctl enable-linger` is set. `install.sh` says so if it is not.

Environment overrides: `AUDIT_REPO` `AUDIT_TREE` `AUDIT_GRAPH` `AUDIT_NODE` `AUDIT_HOURS`
`AUDIT_WORKERS` `AUDIT_MODEL` `AUDIT_MON` `AUDIT_TAG` `AUDIT_NO_MON`.

## Storage

`tools/audit/.ledger/audit.db` (SQLite via `node:sqlite`, no native dependency), git-ignored.
`audit export` writes `tools/audit/ledger/*.jsonl` for committing.
Schema: [`schema.sql`](schema.sql).
