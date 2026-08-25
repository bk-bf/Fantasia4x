---
name: audit
description: The Fantasia4x code-audit ledger, the issue board at docs/issues/, and the local review board at docs/pr/. Use when asked to run, resume, steer, extend or debug the audit; when reading or acting on a docs/issues/ entry; when reviewing a fix attempt or a fix/<slug> branch; when a nightly audit run is asked about, has stalled, or reported something; and BEFORE adding a rule, flipping `ready:`, or touching anything under tools/audit/. This is about the CODE; for auditing whether a GAME SYSTEM behaves (crafting chains, jobs, needs, combat), use the `headless` skill.
---

# The audit loop

`tools/audit/README.md` is the reference — tiers, rule shape, verdict schema, storage. Read it
for those. This skill is the part an agent gets wrong: **what it is allowed to do, what only a
person may do, and how to steer a run without corrupting the ledger.**

Three surfaces, in order:

| | |
|---|---|
| the ledger | `tools/audit/.ledger/audit.db` — one row per `(symbol, rule)`. Gitignored, per-machine. |
| the issue board | `docs/issues/*.md` — confirmed defects. The **only** record; nothing is projected to a forge. |
| the review board | `docs/pr/*.md` — one fix attempt each, alongside a local `fix/<slug>` branch. |

## The rule that must not be weakened

**`ready: true` is a person's decision. Never set it.** It is the single gate between the audit
and the repo. An agent that raises a finding, marks it ready, and then fixes it is a loop with
nobody in it — the entire design exists to prevent exactly that. You may write issues, read them,
argue about severity, and propose that one is worth doing. Flipping the flag is not yours.

Same shape, three more:

- **Never push a `fix/<slug>` branch**, and never merge one. They are local on purpose. Whether a
  change reaches `main` is decided by a person reading `git diff main...fix/<slug>`.
- **Never file anything to GitHub.** There is no `gh` path left in the tool; if you find yourself
  reaching for one, the answer is a file under `docs/pr/`. See
  [why not GitHub](../../../docs/pr/README.md#why-not-github).
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

**The graph must be current.** `audit index` reads the codegraph extract for call edges,
reachability and the `tested` flag. A stale extract does not error — the reachability triggers
silently stop firing, which reads as "the hot path is clean" rather than "nothing was asked about
it". Re-extract first:

```bash
node ../codegraph/bin/codegraph.mjs extract Fantasia4x
```

`index` prints what it got. Two lines decide whether family F and G verdicts mean anything:

```
graph: 2243/2724 nodes mapped (82%), 3468 edges, 970 unmapped
graph: 465 symbols marked tested
```

A low mapped percentage or a `tested` count near zero means the graph is wrong, not that the code
is untested — `index` warns when the flag collapses. The known cause: `tsconfig.json` extends
`.svelte-kit/tsconfig.json`, which `svelte-kit sync` generates and is not checked in, so on a
checkout where `pnpm install` never ran, `$lib` resolves to nothing and every aliased import is
dropped from the graph. `codegraph.config.json`'s `paths` block is the fallback for that.

## Reading a verdict

`fail` is the only verdict that costs anything to be wrong about, and `lib/verdict.mjs` enforces
its evidence requirements rather than the prompt asking nicely. When reviewing findings:

- `undecidable` is a **good** answer. It is what stops the model guessing. A rule with a high
  undecidable rate is badly scoped — that is a rule bug, not a code bug.
- A high `n/a` rate on one rule means its trigger is too broad. `audit na` shows it per rule.
- For the behavioural families a `fail` should become a vitest case or a headless scenario. A
  repro that passes closes the finding as a false positive. T2 feeds T1; it does not compete
  with it. Reach for the `headless` skill to write that repro.

## Steering a fix attempt

`fix.mjs` takes one `ready: true` issue into a worktree off `origin/main` on `fix/<slug>`, works
the whole Remediation list, and re-runs `pnpm check` + `pnpm test:related` itself.

| Outcome | What exists afterwards |
|---|---|
| green | a local commit on `fix/<slug>`, `docs/pr/<slug>.md` `status: open`, issue `in-review` |
| not green | **nothing committed**, `docs/pr/<slug>.md` `status: abandoned` with the failing output, the worktree kept |
| nothing changed | no review file — there is nothing to review |

Every outcome is registered in `mon` under the **`fix`** tag. A failed attempt's session runs
*inside* its kept worktree, so `mon steer` carries that same attempt forward with the changes
still in place instead of restarting it. That is the intended way to push one over the line.

When asked to review an attempt, read the diff against the issue — not the attempt's own account
of itself. `docs/pr/<slug>.md` deliberately records both: `verified` is what the harness observed,
the prose is what the model claimed. They are separate so they can be compared.

```bash
git diff main...fix/<slug>
git log --oneline main..fix/<slug>
```

Say which remediation steps it actually did, which it skipped, and the one thing worth looking at
hardest. Then stop. `Out of scope` in the issue is binding on the fixer and on you.

## The nightly

`fantasia-audit.timer` runs `deploy/nightly-audit.sh` on ubuntuserver, **in the main checkout on
`main`** — there is no audit branch, and re-introducing one would put the codegraph and the ledger
on different trees. It fetches, re-extracts, re-indexes, re-plans, runs the loop for its budget,
raises findings onto the board, commits **only `docs/issues/`** to `main`, then works up to
`AUDIT_FIXES` ready issues and hands the night to `mon` on the `ci/cl` tag.

The board commit is the one automated thing that reaches `main`. It is markdown, all
`ready: false`, so nothing acts on it. Fix attempts never go near `main`.

Debugging a night that did nothing, in order:

1. `journalctl --user -u fantasia-audit.service -n 60` — it dies loudly on a dirty tree or a
   `main` that will not rebase.
2. `tools/audit/.ledger/nightly/<date>.log` — the run's own narration.
3. `audit status` — if `done` did not move, the loop never claimed anything; check the graph
   lines above before suspecting the model.

## Adding a rule

Rules are data: `tools/audit/rules/<FAMILY>.jsonc`, families A–H and S. A new check must justify
why a cheaper tier cannot decide it — if `tsc`, `eslint` or `graph:check` could catch it, it
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
