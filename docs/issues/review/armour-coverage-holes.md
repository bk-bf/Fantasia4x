---
id: armour-coverage-holes
title: Medium armour has no stiffness identity and no neck, hands or feet line at any age, and the shield ladder stops at steel
status: in-review
kind: data
severity: medium
ready: true
origin: human
rules: []
files:
  - src/lib/game/database/items/items.jsonc
  - src/lib/game/database/items/recipes.jsonc
symbols: []
branch: fix/armour-coverage-holes
pr: armour-coverage-holes
created: 2026-08-25
updated: 2026-08-27
---

# Medium armour has coverage holes, and the shield ladder stops at steel

> **Related:** [issues/README](README.md) · [game/ITEM-RULES](../game/ITEM-RULES.md) · [ARMOUR-PASS](../tasks/open/ARMOUR-PASS.md) · [AUDIT (archived)](../tasks/archive/AUDIT-2026-08-25.md)

## What breaks

Three holes in the gear tables, all of the same shape: a build reaches an age and finds the
slot empty, so it borrows from a neighbouring weight class and plays as something it did not
choose.

**Medium has no neck, hands or feet line at any age.** A medium build covers those regions by
borrowing light or heavy pieces, so the class only exists for the torso and limbs — the
identity dissolves at exactly the slots that distinguish it.

**Medium has no stiffness identity at iron.** `movementPenalty` is the axis that should separate
a mail hauberk from a leather cuirass, and at the iron age the two read the same, so choosing
medium buys nothing over light except weight.

**The shield ladder stops at steel.** `steel_heater_shield` (tier 3) is the top craftable
shield; the runed age has none, so a player who reaches the last tier keeps a steel shield in
the off-hand while every other slot has moved up an age.

## Evidence

- Shields in the item DB, with declared tier: `wattle_buckler` (0), `rawhide_round_shield` (1), `plank_round_shield` (1), `iron_boss_shield` (2), `iron_buckler` (2), `steel_heater_shield` (3) — no tier-4 entry. [`items.jsonc`](../../src/lib/game/database/items/items.jsonc)
- [`recipes.jsonc:7504`](../../src/lib/game/database/items/recipes.jsonc#L7504) — `make_steel_heater_shield`, the last rung that exists
- Medium armour declares no neck/hands/feet piece at any age in [`items.jsonc`](../../src/lib/game/database/items/items.jsonc); the regions are covered only by light and heavy lines
- `movementPenalty` on the iron-age medium pieces does not separate them from the light line — the field is the intended stiffness axis and carries no distinguishing value there

## Why nothing caught it

`armourCoverage.test.ts` checks that a region *can* be covered, and it can — by a borrowed
piece from another weight class. The gear tables were then taught to borrow deliberately
(`gearDb.classifyArmor` returns `{ideal, fallback}` so a bare cell reads "for want of better"),
which made the holes legible in the UI but also made them survivable, so nothing fails. R12
holds the weight class honest *within* a slot at one age — heavier costs more and returns more —
but says nothing about a slot with no entry for that class at all. A missing rung is not an
inconsistent rung.

## Remediation

- [ ] Author the medium neck, hands and feet line across the ages it is missing, generic before thematic per [ITEM-RULES](../game/ITEM-RULES.md).
- [x] Give iron-age medium armour a distinct `movementPenalty` band so stiffness separates it from light.
- [ ] Author a runed-tier shield to close the off-hand ladder.
- [x] Extend the coverage test from "the region can be covered" to "each weight class has its own piece for each region at each age it exists", so a borrowed fallback no longer satisfies the check.
- [x] Headless-verify one new piece per line crafts and equips (state ticks and the stock delta).

## Out of scope

The armour expansion already completed for the other classes, and the `{ideal, fallback}`
borrowing behaviour itself — the fallback display is wanted and stays. This issue fills the
holes it currently papers over.
