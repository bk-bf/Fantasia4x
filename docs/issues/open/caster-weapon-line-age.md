---
id: caster-weapon-line-age
title: Every staff, rod and scepter is carved on a runed bench while claiming tier 1-3, so the caster has no progression
status: open
kind: data
severity: high
ready: true
origin: human
rules: []
files:
  - src/lib/game/database/items/items.jsonc
  - src/lib/game/database/items/recipes.jsonc
  - src/tests/game/database/itemRules.test.ts
symbols: []
created: 2026-08-25
updated: 2026-08-27
---

# Every staff, rod and scepter is carved on a runed bench while claiming tier 1-3

> **Related:** [issues/README](README.md) · [game/ITEM-RULES](../game/ITEM-RULES.md) · [AUDIT (archived)](../tasks/archive/AUDIT-2026-08-25.md)

## What breaks

A player who commits to a caster gets no weapon progression. Thirteen staves, rods and
scepters declare `tier` 1-3, but every one of them is made at a **runed** bench or altar, so
none is reachable until the last age of the game. The caster spends the primitive, bronze,
iron and steel ages with nothing craftable in the slot, then unlocks the entire line at once.
The tiers the line claims to occupy are empty: there is no early wooden rod or bone-topped
stave to hold those rungs. A melee build ladders through four ages of real weapons over the
same span.

`great_bone_maul` fails the same rule from the other direction — tier 2, made at the runed
`sanguinary_altar`, and separately demanding a Great Bear's bone.

## Evidence

- [`itemRules.test.ts:273`](../../src/tests/game/database/itemRules.test.ts#L273) — `R4_DEBT`, the exemption list that keeps R4 green; the fourteen ids below are named there rather than fixed
- [`itemRules.test.ts:299`](../../src/tests/game/database/itemRules.test.ts#L299) — R4 itself: `chainAgeOf(i.id) > AGE_CEILING[i.tier]` is the failure every listed item would produce
- The thirteen casters and their declared tiers, all gated behind a runed station: `cinder_rod` (1), `hoarfrost_rod` (1), `storm_rod` (1), `ember_staff` (1), `frost_staff` (1), `spark_staff` (1), `emberglass_scepter` (2), `rimeglass_scepter` (2), `stormglass_scepter` (2), `pyre_staff` (2), `rime_staff` (2), `tempest_staff` (2), `manaforge_greatstaff` (3) — [`items.jsonc`](../../src/lib/game/database/items/items.jsonc)
- [`itemRules.test.ts:294`](../../src/tests/game/database/itemRules.test.ts#L294) — `great_bone_maul`, on `R4_DEBT` for the altar and on `R2_DEBT` for the Great Bear bone; the comment records that both clear together on a re-tier
- The non-runed staff line that *does* ladder correctly — `bronze_capped_staff` (1), `iron_shod_staff` (2), `steel_shod_longstaff` (3), `rune_banded_longstaff` (4) — shows the shape the elemental line is missing

## Why nothing caught it

R4 is the check, and it works: it prices every ingredient chain in building `ageTier`s and
fails when the latest station outranks the item's tier. All fourteen items are on an explicit
`R4_DEBT` exemption set, so the suite stays green while the defect ships. The debt list is
honest — [`itemRules.test.ts:310`](../../src/tests/game/database/itemRules.test.ts#L310)
fails if an entry is silently fixed — but nothing forces the list to shrink, so an exemption
added for a design decision that was never made stays indefinitely.

## Remediation

- [ ] Decide the age each elemental line actually belongs to, and set `tier` to match the station its recipe already names.
- [ ] Author the early caster weapons the vacated tiers need — a plain material-named rod/stave per age, generic before thematic per [ITEM-RULES](../game/ITEM-RULES.md).
- [ ] Re-tier `great_bone_maul` so it clears both `R4_DEBT` (station age) and `R2_DEBT` (creature tier) together.
- [ ] Remove all fourteen ids from `R4_DEBT`; the stale-entry test at `itemRules.test.ts:310` then proves they are genuinely fixed.
- [ ] Headless-verify one caster per age crafts and equips (`HeadlessSession`, state the tick count and the stock delta).

## Out of scope

The magic-reagent economy the runed tier sits on (`mana_crystal`, `magic_alloy_bar`) — that is
its own redesign, tracked in [`mana-crystal-dead-end`](mana-crystal-dead-end.md). This issue
moves the caster weapons to honest ages and fills the holes; it does not rework what they are
made of.
