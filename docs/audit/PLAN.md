# Conventions audit — run plan

Driven by the ledger in `tools/audit/`, not by ad-hoc reading: every verdict is a row keyed
to a symbol's `content_hash` and a rule's `rule_hash`, so coverage is a count and re-auditing
only touches code that moved. `node tools/audit/audit.mjs status` is the authority on what
was really audited.

Model: opus. Runner: `node tools/audit/run.mjs --workers 3 --model opus`. The runner paces
itself against the five-hour limit window the dashboard reports, and holds when it is ahead
of schedule. `https://dashboard.callmedaddy.dedyn.io/audit` shows coverage and has the pause
and start controls.

## Which families the model still answers

A measured comparison against eslint, knip and jscpd is in `findings-lint-experiment.md`.
The static tools reproduced 2 of 58 model findings, but found 274 clones and 285 unused
exports the model never saw. The two cover different ground, so the families a script can
decide are off, and the families it cannot are on.

| Family | Question | Status | Covered instead by |
|---|---|---|---|
| A contract | ADR invariants stated in prose; doc-vs-code drift | active | nothing static |
| F tests | a test asserting less than the symbol promises | active | nothing static |
| H data | item tier plausibility, naming progression | active | nothing static |
| B boundary | ids and dev jargon in player-facing text | draft | partly `no-restricted-syntax` |
| C silent-failure | a default masking a failed lookup | draft | `no-empty`, `no-floating-promises` |
| D units | ticks vs turns, ms vs seconds | draft | — |
| E hot path | per-tick allocation | draft | — |
| G reachability | a branch no caller can satisfy | draft | `knip`, `no-unreachable` |
| S single-source | a roster restated by hand | draft | narrowing the annotation to the union |

Only `active` families are planned. `plan` rebuilds the work table but keeps verdicts, so
switching a family on never re-runs finished work.

## The cheaper checks

`pnpm check` runs `svelte-check`, `eslint` and `knip` and must stay green. `pnpm dupes` runs
jscpd. Those cost nothing and run on every change; the ledger is for what they cannot decide.

## Reporting

`audit findings` lists open fails with their evidence. `audit issues` groups them onto the
board in `docs/issues/`, always `ready: false`.
