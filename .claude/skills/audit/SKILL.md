---
name: audit
description: "The Fantasia4x code-audit ledger (tools/audit), the GitHub issue board it raises to, and the fixer and reviewer that work cards off that board — how a run is steered and what only a person may decide. Loaded manually with /audit; never invoked automatically, and not implied by the word \"audit\" in ordinary conversation."
disable-model-invocation: true
---

# The audit loop

`tools/audit/README.md` is the reference — tiers, rule shape, verdict schema, storage. Read it
for those. This skill is the part an agent gets wrong: **what it is allowed to do, what only a
person may do, and how to steer a run without corrupting the ledger.**

Three surfaces, in order:

| | |
|---|---|
| the ledger | `tools/audit/.ledger/audit.db` — one row per `(symbol, rule)`. Gitignored, per-machine. |
| the issue board | GitHub issues, written only through `pnpm issue`. Confirmed defects, one each. |
| the project board | [projects/4](https://github.com/users/bk-bf/projects/4) — the lanes, and the `Verify` field that decides which route settles a card. |

## The rule that must not be weakened

**A run never promotes its own finding.** The audit raises into `Backlog` and stops there.
Moving a card to `Ready` is triage — a separate, deliberate evaluation, made after the finding
has been read, with a reason stated. An agent that raises a finding, promotes it and then fixes
it in one pass is a loop with nobody in it, and the lanes exist to prevent that.

Same shape, three more:

- **Never push `main`.** All work lands on `dev`; `main` changes only when Kirill runs
  `pnpm audit:promote --push`, after playing the merge. `review.mjs` merges what passed its
  route into `dev`, and nothing else reaches either branch. A card on the `playtest` route is
  never merged at all — it stops in `Needs playtest` with its branch and worktree intact, and
  that judgement is Kirill's.
- **Never write to GitHub with `gh` directly.** `gh issue create|edit|close|comment` and
  `gh label *` are denied. Everything goes through `pnpm issue`, which validates labels, links
  and body substance before a single network call.
- **Never hand-edit `.ledger/audit.db`.** Every state change goes through `audit.mjs`, which is
  what makes a killed run resumable.

## Running it

```bash
node tools/audit/audit.mjs index     # rebuild the symbol inventory — after ANY source change
node tools/audit/audit.mjs plan      # cross active rules against symbols -> the work set
node tools/audit/audit.mjs status    # coverage, and the per-rule n/a + undecidable rates
node tools/audit/run.mjs --once --model haiku    # ONE batch — use this to check a rule
node tools/audit/run.mjs --workers 3 --hours 3.5 # the real loop
```

`index` resets the plan, so **`plan` always follows `index`** — a `status` reading `in scope 0`
means you indexed and did not re-plan, not that the repo is clean.

The loop is resumable by construction: every batch is a fresh model call with no memory, and the
ledger is the only state. Killing it loses one in-flight batch, whose claim expires by itself. If
you killed a run and the board looks busy, `audit release` returns that worker's claims.

## Before you trust a result

**A verdict about the code around a symbol is only as good as the search behind it.** The
prompt hands the agent one symbol's source and nothing else — no caller list, no coverage
flag. Rules in families E, F and G ask about the rest of the repository, and the agent has to
go and look: grep for the callers, follow them toward `processGameTurn` / `tickPawn`, search
`src/tests` for anything that exercises it. So when you review one of those:

- a `fail` must cite `path:line` for every claim about another file — `lib/verdict.mjs`
  rejects one that supplies fewer evidence items than the rule demands
- an `n/a` must name the trigger clause or the search that closed it ("not reached from
  processGameTurn or tickPawn", "a test covers this symbol")
- a bare `pass` on a reachability or coverage rule is the weakest thing in the ledger:
  nothing forces it to show the search it did. Treat a family E/F/G `pass` with no evidence
  as unverified rather than as a clean bill.

**`audit t0` first, always.** It costs nothing and decides what no agent should be asked:
constants an ADR declares against their real values, and the chokepoints in
`tools/audit/seams.jsonc` against every call site that reaches them. If T0 can
decide a thing, it does not belong at T2.

## Reading a verdict

`fail` is the only verdict that costs anything to be wrong about, and `lib/verdict.mjs` enforces
its evidence requirements rather than the prompt asking nicely. When reviewing findings:

- `undecidable` is a **good** answer. It is what stops the model guessing. A rule with a high
  undecidable rate is badly scoped — that is a rule bug, not a code bug.
- A high `n/a` rate on one rule means its trigger is too broad. `audit na` shows it per rule.
- For the behavioural families a `fail` should become a vitest case or a headless scenario. A
  repro that passes closes the finding as a false positive. T2 feeds T1; it does not compete
  with it. Reach for the `headless` skill to write that repro.

## The fixer and the reviewer

`pnpm audit:fix --next` takes the oldest card in the board's `Ready` lane whose `Verify` field
says `tests`, into a worktree off `origin/dev` on `fix/<slug>`, works the whole Remediation
list, and re-runs `pnpm check` + `pnpm test:related` itself. `--verify headless` and
`--verify playtest` pick the other two routes.

| Outcome | What exists afterwards |
|---|---|
| green, `tests` or `headless` | a local commit on `fix/<slug>`, the attempt as a comment on the issue, card `In review` |
| green, `playtest` | the same commit, pushed and **not** merged, its worktree kept with a free port in `.devport`, card `Needs playtest` |
| not green | **nothing committed**, the failing output on the issue, the worktree kept, card back in `Ready` |
| nothing changed | a comment saying so, card back in `Ready` |

`pnpm audit:review --next` takes the oldest `In review` card, merges `fix/<slug>` onto a freshly
fetched `origin/dev` in a second worktree, and runs its route on the **merge result** — the
fixer only ever verified the branch alone. On the `headless` route it then runs a session that
must drive the real sim and answer `VERDICT: PASS` or `VERDICT: FAIL`.

Green means it pushes to `dev`, closes the issue naming the merge commit, and moves the card to
`On dev`. `main` is the branch Kirill plays and builds from; only `pnpm audit:promote` writes
there, and only when he runs it. Anything else sends the card back to `Ready` with the failure on the issue.

Both stop while the audit is paused; they draw on the same limits.

When you review an attempt by hand, read the diff against the issue — not the attempt's own
account of itself. The issue comment records both: what the harness observed, and what the model
claimed. They are separate so they can be compared.

```bash
git diff dev...fix/<slug>
git log --oneline dev..fix/<slug>
```

Say which remediation steps it actually did, which it skipped, and the one thing worth looking at
hardest. Then stop. `Out of scope` in the issue is binding on the fixer and on you.

## The nightly

`fantasia-audit.timer` runs `deploy/nightly-audit.sh` on ubuntuserver, **in the checkout on
`dev`** — there is no audit branch, and re-introducing one would put the ledger on a different
tree from the code it describes. It fetches, re-indexes, re-plans, runs the loop for its budget,
raises findings onto the board as GitHub issues, then works up to `AUDIT_FIXES` cards from
`Ready`, reviews up to `AUDIT_REVIEWS` cards from `In review`, and hands the night to `mon` on
the `ci/cl` tag.

The reviewer is the only automated thing that writes a branch at all, and it writes `dev`.
Nothing automated reaches `main`. Findings are raised into `Backlog`, where nothing acts on them until someone triages
them into `Ready`.

Debugging a night that did nothing, in order:

1. `journalctl --user -u fantasia-audit.service -n 60` — it dies loudly on a dirty tree, a
   `dev` that will not rebase, or a failed index.
2. `tools/audit/.ledger/nightly/<date>.log` — the run's own narration.
3. `audit status` — if `done` did not move, the loop never claimed anything; check that
   `audit plan` produced work items before suspecting the model.

## Adding a rule

Rules are data: `tools/audit/rules/<FAMILY>.jsonc`, families A–H and S. A new check must justify
why a cheaper tier cannot decide it — if `tsc`, `eslint` or a `audit t0` check could catch it, it
belongs at T0 and costs nothing. `audit demote` lists T2 rules that have earned being rewritten as
a static rule; taking that offer is how the expensive tier shrinks.

Check a new rule with one batch (`run.mjs --once --model haiku`) and read the verdicts by hand
before letting it near a full run. A rule that returns mostly `n/a` or `undecidable` is not ready.

## Finishing

- Re-run `audit index` + `audit plan` if you changed source, so the next run is not auditing
  yesterday's code.
- If you changed rule scope, say what the `n/a` rate was before and after.
- Update `tools/audit/README.md` when the mechanism changes; this skill only when the
  **rules of engagement** change.
