---
id: s03-components-util
title: Display label mapped by hand where a lookup exists — components/util
status: open
kind: drift
severity: medium
ready: false
origin: audit
rules:
  - S03
files:
  - src/lib/components/util/conditionInfo.ts
symbols:
  - src/lib/components/util/conditionInfo.ts::GRANT_STAT_ABBR#0
created: 2026-09-04
updated: 2026-09-05
---

# Display label mapped by hand where a lookup exists — components/util

> **Related:** [issues/README](README.md) · [tools/audit](../../tools/audit/README.md) · [rule source](../../docs/issues/core-stat-single-source.md)

## What breaks

Rule `S03` — display label mapped by hand where a lookup exists — holds in 1 place under `components/util`. Each one is listed below with the evidence the audit required before it would record a fail.

The clearest case: This table is a third copy of the same stat-id → abbreviation mapping, one of which sits 27 lines above it in the same file and another in the very component that imports this function.

## Evidence

- [`src/lib/components/util/conditionInfo.ts:78`](../../src/lib/components/util/conditionInfo.ts#L78) — This table is a third copy of the same stat-id → abbreviation mapping, one of which sits 27 lines above it in the same file and another in the very component that imports this function.
  - src/lib/components/util/conditionInfo.ts:78-85 — the local literal map, used only at src/lib/components/util/conditionInfo.ts:101 and :104.
  - The same file already maps five of these six ids at src/lib/components/util/conditionInfo.ts:50-55 (`MOD_LABEL`: strength→'STR', dexterity→'DEX', constitution→'CON', perception→'PER', intelligence→'INT'), consumed by `effectLines` at src/lib/components/util/conditionInfo.ts:68. src/lib/components/pawn/TraitCards.svelte:84-91 holds a byte-identical six-entry `STAT_ABBR` and, at src/lib/components/pawn/TraitCards.svelte:248-268, repeats the same `${stat}Bonus`/`${stat}Penalty` split that traitGrantLines does — while that same component imports `traitGrantLines` from this file at src/lib/components/pawn/TraitCards.svelte:18. Two further copies exist at src/lib/dev/gearDb.ts:633-638 and src/lib/dev/gearDb.ts:800-807. No module owns the mapping today; the util module being audited is the one the components already import from, so it is the place the others should route through.
  - All four tables agree on every value as written, so the divergence is latent, not present: the id `charisma` already shows the split — it is in GRANT_STAT_ABBR (conditionInfo.ts:83) and in TraitCards.svelte:89 but absent from MOD_LABEL (conditionInfo.ts:50-64), so a charisma-affecting condition renders no CHA line while a charisma-granting trait renders `CHA +2`. Edit either table alone — add `willpower: 'WIL'` to src/lib/components/pawn/TraitCards.svelte:84-91 only — and the same trait on the same panel renders the pill `WIL +2` from TraitCards.svelte:253 next to the tooltip line `willpower +2` from conditionInfo.ts:101.

## Why nothing caught it

Nothing below the judgment tier can decide this one: it is why `S03` exists at T2 rather than as a lint rule or a test. The invariant is stated in `docs/issues/core-stat-single-source.md`. If the fix makes the class mechanically checkable, add that check and demote the rule — `node tools/audit/audit.mjs demote` tracks which rules have earned it.

## Remediation

- [ ] Confirm each citation above still holds; drop any whose evidence does not.
- [ ] Fix every remaining site under `components/util` — this is one class, one PR.
- [ ] Add the check that would have caught it, or record why it stays a judgment call.
- [ ] `pnpm check` and `pnpm test:related` on the changed files are green.

## Out of scope

Sites outside `components/util`, and any other rule's findings — they are their own issues. Widening this PR past the citations above makes it unreviewable.
