---
id: s01-game-services
title: Hand-maintained roster restates a declared set — game/services
status: open
kind: drift
severity: high
ready: false
origin: audit
rules:
  - S01
files:
  - src/lib/game/services/PawnStatService.ts
symbols:
  - src/lib/game/services/PawnStatService.ts::FORMULA_VARS#0
created: 2026-08-24
updated: 2026-08-24
---

# Hand-maintained roster restates a declared set — game/services

> **Related:** [issues/README](README.md) · [tools/audit](../../tools/audit/README.md) · [rule source](../../docs/issues/core-stat-single-source.md)

## What breaks

Rule `S01` — hand-maintained roster restates a declared set — holds in 1 place under `game/services`. Each one is listed below with the evidence the audit required before it would record a fail.

The clearest case: FORMULA_VARS hand-writes the six core stat names (BRAWN, AGILITY, VIGOUR, AWARENESS, INTELLECT, CHARISMA) that are already declared once as the canonical EntityStats interface, so a new core stat or a reordering here silently diverges from that source.

## Evidence

- [`src/lib/game/services/PawnStatService.ts:132`](../../src/lib/game/services/PawnStatService.ts#L132) — FORMULA_VARS hand-writes the six core stat names (BRAWN, AGILITY, VIGOUR, AWARENESS, INTELLECT, CHARISMA) that are already declared once as the canonical EntityStats interface, so a new core stat or a reordering here silently diverges from that source.
  - src/lib/game/services/PawnStatService.ts:133-138 — the six literal entries 'BRAWN','AGILITY','VIGOUR','AWARENESS','INTELLECT','CHARISMA' inside the FORMULA_VARS array
  - src/lib/game/core/types/culture.ts:5 — interface EntityStats, the canonical declaration of the core stat set (StatKey = keyof EntityStats derives from it)
  - Two concrete failure modes: (1) adding a seventh stat to EntityStats compiles cleanly but FORMULA_VARS is not updated, so any stats.jsonc formula referencing the new stat can't resolve it via evaluateFormula; (2) FORMULA_VARS's order is load-bearing for the positional args passed at PawnStatService.ts:314 ('Args MUST match FORMULA_VARS order') and again keyed at :987 — reordering or omitting an entry here feeds every formula the wrong value with no compiler or runtime error

## Why nothing caught it

Nothing below the judgment tier can decide this one: it is why `S01` exists at T2 rather than as a lint rule or a test. The invariant is stated in `docs/issues/core-stat-single-source.md`. If the fix makes the class mechanically checkable, add that check and demote the rule — `node tools/audit/audit.mjs demote` tracks which rules have earned it.

## Remediation

- [ ] Confirm each citation above still holds; drop any whose evidence does not.
- [ ] Fix every remaining site under `game/services` — this is one class, one PR.
- [ ] Add the check that would have caught it, or record why it stays a judgment call.
- [ ] `pnpm check` and `pnpm test:related` on the changed files are green.

## Out of scope

Sites outside `game/services`, and any other rule's findings — they are their own issues. Widening this PR past the citations above makes it unreviewable.
