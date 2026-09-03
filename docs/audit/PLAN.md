# Conventions audit — run plan

Driven by the ledger in `tools/audit/`, not by ad-hoc reading: every verdict is a row
keyed to a symbol's `content_hash` and a rule's `rule_hash`, so coverage is a count and
re-auditing only touches code that moved. `node tools/audit/audit.mjs status` is the
authority on what was really audited.

Model: opus. Runner: `node tools/audit/run.mjs --workers 2 --model opus`, in bounded
blocks with gaps between them.

## Family order

Highest importance first. Only `active` families are planned; the rest sit at `draft` in
`tools/audit/rules/*.jsonc` and are switched on as each phase completes. `plan` rebuilds
the work table but keeps verdicts, so switching a family on never re-runs finished work.

| Phase | Families | Question | Items | Status |
|---|---|---|---|---|
| 1 | S, C, G | duplication and restated facts; defaults masking failed lookups; branches no caller reaches | 1702 | active |
| 2 | A, D | ADR invariants and doc-vs-code drift; ticks vs turns, ms vs seconds, 0–1 vs 0–100 | 585 | draft |
| 3 | E, F | per-tick allocation and hot-path churn; tests asserting less than the symbol promises | 2606 | draft |
| 4 | B, H | ids and dev jargon in player-facing text; item tier and naming progression | 5835 | draft |

Full sweep is 11393 items over 4293 symbols. Measured rate is one symbol per 44 s per
worker, so the whole set is about 52 h of wall clock at one worker.

## Reporting

`audit findings` lists open fails with their evidence. The merged report goes to
`docs/audit/code-conventions-audit.md` with checkboxes, sorted most to least severe, and
states coverage per family from `audit status` so a partial sweep is never read as a
clean one.

`docs/audit/findings-cross-cutting.md` is a separate hand pass over circular imports,
dead exports, duplicated helpers and repo hygiene, kept because the ledger's rules do not
cover build config or lockfiles.
