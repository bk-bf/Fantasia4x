---
id: bow-double-wood
title: War bow and hunting recurve each consume two pieces of wood for one stave
status: open
kind: data
severity: medium
ready: false
origin: audit
rules: []
files:
  - src/lib/game/database/items/recipes.jsonc
symbols: []
created: 2026-08-28
updated: 2026-08-28
---

# War bow and hunting recurve each consume two pieces of wood for one stave

> **Related:** [issues/README](README.md) · [game/ITEM-RULES](../game/ITEM-RULES.md) · [recipe-derived-weight-defects](review/recipe-derived-weight-defects.md)

## What breaks

`make_war_bow` and `make_hunting_recurve` each list a `category:log` input **and** a
`dynamicRecipe` stave slot that also takes wood. The two are added together, not merged, so a
single bow costs two logs where the bow has one stave. Crafting one war bow in the sim takes
`oak_log` 20 → 18. The player pays twice for the same part, and the recipe derives 2.23 kg of
material into a 1.0 kg bow — 2.2× its own weight, where `make_self_bow`, which has only the
stave slot, derives 0.79 kg into a 0.8 kg bow.

## Evidence

- [`recipes.jsonc:2655`](../../src/lib/game/database/items/recipes.jsonc#L2655) — `make_war_bow`
  inputs are `{"category:log": 1, "category:thread": 2}`, and
  [`recipes.jsonc:2660`](../../src/lib/game/database/items/recipes.jsonc#L2660) adds a `stave`
  slot with `"acceptsCategory": "wood"`, `"quantity": 1`. The log pool and the wood pool overlap.
- [`recipes.jsonc:2708`](../../src/lib/game/database/items/recipes.jsonc#L2708) and
  [`recipes.jsonc:2713`](../../src/lib/game/database/items/recipes.jsonc#L2713) — `make_hunting_recurve`
  is the same shape.
- [`ItemService.ts:483`](../../src/lib/game/services/ItemService.ts#L483) —
  `total[id] = (total[id] ?? 0) + qty` adds the dynamic slot's pick on top of the expanded base
  cost. Nothing checks whether the base cost already bought that material.
- [`recipes.jsonc:2258`](../../src/lib/game/database/items/recipes.jsonc#L2258) —
  `make_self_bow` has no `category:log` line, only `branch` for the limbs plus the stave slot,
  and derives to its own weight. It is the shape the other two should take.
- Headless: 6 pawns, `makers_bench`, 800 ticks, one `war_bow` queued —
  `oak_log` 20 → 18, `sinew` 20 → 16, `war_bow` 0 → 1.

## Why nothing caught it

A `dynamicRecipe` slot and a static input are separate fields with separate readers, so no test
compares them. `ITEM-RULES R23` asks whether a bow consumes wood at all, which both recipes pass
twice over. The derived-mass rule would catch it — 2.23 kg of stock into a 1.0 kg bow — but the
mass bound is only applied to the handful of recipes an earlier issue repriced, not to bows.

## Remediation

- [ ] Drop the `category:log` input from `make_war_bow` and `make_hunting_recurve`, leaving the
      `stave` slot as the only wood, and add the limb material the self bow uses if the stave
      alone underweighs the bow.
- [ ] Re-derive both bows' mass from the corrected recipes and check each lands within
      0.6×–1.5× of its authored `weightKg`.
- [ ] Add a rule that no recipe's static inputs and `dynamicRecipe` slots can both claim the
      same material category, so a duplicated part fails instead of shipping.
- [ ] Headless-verify one craft of each bow consumes exactly one wood item (state ticks and the
      log delta).

## Out of scope

The `dynamicRecipe` resolution in `ItemService.resolveActiveCost` — adding the slot cost on top
of the base cost is correct for every recipe whose static inputs do not overlap the slot. This is
a data defect in two recipes, not an engine defect.
