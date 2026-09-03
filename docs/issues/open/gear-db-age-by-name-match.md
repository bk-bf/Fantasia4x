---
id: gear-db-age-by-name-match
title: The gear grid files an item by matching words in its research id, so a tier-1 bench reads as Runed
status: open
kind: correctness
severity: medium
ready: false
origin: human
rules: []
files:
  - src/lib/dev/gearDb.ts
symbols: []
created: 2026-08-27
updated: 2026-08-27
---

# The gear grid files an item by matching words in its research id, so a tier-1 bench reads as Runed

> **Related:** [issues/README](../README.md) · [caster-weapon-line-age](../review/caster-weapon-line-age.md)

## What breaks

`ageOf` decides which age column an item belongs to by regex-matching its `researchRequired`
string before it consults the research chain or the recipe. Any research whose id contains
`rune`, `runic`, `arcane`, `attunement`, `manaforge` or `lapidary` files the item as **Runed**,
whatever tier that research actually sits at. `arcane_lapidary` is tier 1 and unlocks the
Lapidary Bench, so every recipe gated behind it is drawn in the last column of the grid
instead of the first.

The cost is not cosmetic. The grid is what a coverage claim is read from, so an item authored
to fill an early-age hole can appear to fill it while being filed at the far end of the
ladder. That happened: three rods authored on `fix/caster-weapon-line-age` to fill the bronze,
iron and steel rungs declared `researchRequired: "arcane_lapidary"`, and the caster grid read
`Bronze 0, Iron 0, Steel 0, Runed 9` both before and after they were added. The debt list the
fix was measured against went green while the gap it named stayed open.

## Evidence

- [`src/lib/dev/gearDb.ts:450`](../../../src/lib/dev/gearDb.ts#L450) —
  `if (/rune|runic|arcane|attunement|manaforge|lapidary/.test(r)) return 'Runed';` is the first
  test in `ageOf`, ahead of the exact-id matches on lines 451-454 and ahead of `hasRecipe` /
  `chainAgeOf` on line 456.
- [`src/lib/game/database/progression/research.jsonc:724`](../../../src/lib/game/database/progression/research.jsonc#L724)
  — `arcane_lapidary` is `"tier": 1`, described as gem-cutting, unlocking the Lapidary Bench.
- [`src/lib/game/database/world/buildings.jsonc:1790`](../../../src/lib/game/database/world/buildings.jsonc#L1790)
  — a building gated on `arcane_lapidary`, so this is a live gate and not a dead string.
- [`src/lib/dev/gearDb.ts:456`](../../../src/lib/dev/gearDb.ts#L456) — `chainAgeOf(id)` is the
  authoritative answer the function already has, and the regex prevents it being reached.

## Why nothing caught it

The grid is a dev surface, so nothing asserts its columns. `ageOf`'s later branches are name
matches too (lines 457-462 test the item id for `staff$|rune|arcane`, `steel`, `iron`), so the
regex reads as house style rather than as a bug. And the debt lists that measure coverage are
derived from the same function, so a misfiling is invisible to them by construction: the check
and the thing being checked share the fault.

## Remediation

- [ ] Order `ageOf` so the research chain and the recipe decide the age, with the name matches
      as a last resort for items that have neither.
- [ ] Establish which research ids the regex was written for and whether any of them still
      need it once the chain is consulted first.
- [ ] Re-derive the caster grid and the `R2_DEBT` / `R4_DEBT` lists afterwards, since entries
      may have been removed from them on the strength of a misfiling.
- [ ] Add a test that an item gated on a tier-1 research is not filed in a late age, so a debt
      list cannot go green against a mislabelled column again.

## Out of scope

The per-recipe workaround already applied on `fix/caster-weapon-line-age`, which sets the
three rods to `bronze_working` / `iron_working` / `steel_making`. That is correct for those
items independently of this issue and should not be reverted as part of fixing it.
