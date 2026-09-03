---
id: armour-stiffness-gaps
title: Heavy iron and bone pieces carry no stiffness, so heavy costs less dodge than medium
status: open
kind: data
severity: medium
ready: false
origin: human
rules: []
files:
  - src/lib/game/database/items/items.jsonc
  - src/lib/game/systems/Combat.ts
symbols: []
created: 2026-08-28
updated: 2026-08-28
---

# Heavy iron and bone pieces carry no stiffness, so heavy costs less dodge than medium

> **Related:** [armour-coverage-holes](../review/armour-coverage-holes.md) · [issues/README](../README.md)

## What breaks

`movementPenalty` is the stiffness axis: `wornStiffness` sums it across worn pieces and it
multiplies the defender's dodge. Two sets of heavy pieces do not carry it, so the player pays
nothing to wear them.

`iron_nasal_helm` is `armorType: "heavy"` with `movementPenalty: 0.0`, while every other
iron-age heavy piece sits at `0.05`. Now that the iron-age medium helms have been given their
`0.02` band, the iron head slot has **medium costing more dodge than heavy** — the ladder is
inverted at exactly one slot, which is the kind of thing a player finds and exploits.

Four of the six `great_bone_*` armour pieces omit the field entirely. `wornStiffness` reads
`?? 0`, so a full heavy bone kit is free to wear: all of heavy's defence, none of its cost.

## Evidence

- [`src/lib/game/database/items/items.jsonc:12957`](../../../src/lib/game/database/items/items.jsonc#L12957)
  — `iron_nasal_helm` declares `"armorType": "heavy"` with `"defense": 16`.
- [`src/lib/game/database/items/items.jsonc:12965`](../../../src/lib/game/database/items/items.jsonc#L12965)
  — the same item's `"movementPenalty": 0.0`.
- `great_bone_helm`, `great_bone_vambraces`, `great_bone_greaves` and `great_bone_gauntlets`
  have no `movementPenalty` key at all; `great_bone_cuirass` and `great_bone_sabatons` do.
- [`src/lib/game/systems/Combat.ts`](../../../src/lib/game/systems/Combat.ts) — `wornStiffness`
  sums the field with `?? 0` and clamps at `STIFFNESS_DODGE_CAP` 0.45 before multiplying
  `defDodge` in `resolveHit`, so an absent field and a zero are the same thing to the sim.

## Why nothing caught it

`armourCoverage` asserts that each age and weight class has a piece in each region; it does
not assert anything about the values those pieces carry. Nothing compares a heavy piece's
stiffness against the medium piece in the same slot and age, which is the comparison that
makes the inversion visible. An omitted field reads as zero rather than failing, so the four
bone pieces never had to declare one.

## Remediation

- [ ] Set `iron_nasal_helm` to the iron-age heavy band, `0.05`, matching its siblings.
- [ ] Give the four `great_bone_*` pieces a deliberate stiffness, consistent with their tier
      and with the two siblings that already declare one.
- [ ] Add a test that, per age and per slot, a heavy piece's `movementPenalty` is at least the
      medium piece's and the medium's at least the light's, so an inversion fails.
- [ ] Make `movementPenalty` required on any item declaring `armorType`, so omission is a load
      error rather than a silent zero.

## Out of scope

Retuning the stiffness bands themselves, and the separate question of whether `movementPenalty`
should feed both dodge and boot move-speed from one field.
