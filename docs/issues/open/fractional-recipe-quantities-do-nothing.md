---
id: fractional-recipe-quantities-do-nothing
title: A fractional recipe quantity either rounds back up to a whole unit or leaves float dust in the stockpile
status: open
kind: correctness
severity: high
ready: false
origin: human
rules: []
files:
  - src/lib/game/services/ItemService.ts
  - src/lib/game/core/state/stockpile.ts
symbols: []
created: 2026-08-28
updated: 2026-08-28
---

# A fractional recipe quantity either rounds back up to a whole unit or leaves float dust in the stockpile

> **Related:** [issues/README](../README.md) · [recipe-derived-weight-defects](../review/recipe-derived-weight-defects.md)

## What breaks

Authoring `0.1` of an input in a recipe reads as "a tenth of a bar" and is not that. Which of
two wrong things happens depends on how the input is named.

A `category:` input rounds back up. `expandCategoryCost` reserves `Math.ceil(need / worth)` of
the matched item, so `category:steel: 0.1` still takes a whole 4 kg bar. The recipe consumes
exactly what it consumed before the fraction was authored, and nothing reports that the number
had no effect.

A direct item id spends the fraction but leaves residue. Twelve daggers crafted off one
`copper_bar` at `0.1` each produced ten and left the stockpile holding
`1.3877787807814457e-16` of a bar, as a stored dropped item that never clears — the drop guard
only discards at `quantity <= 0`. One dust stack accumulates per bar spent, per fractional
recipe, and it is a real entry a hauler can be sent to.

This matters beyond the recipes it was found in: fractions are the obvious way to express
"several small blades from one ingot", the syntax accepts them without complaint, and both
failure modes are silent. An earlier fix repriced ten recipes this way and its own tests
passed, because they asserted on the authored number rather than on what a craft consumed.

## Evidence

- [`src/lib/game/services/ItemService.ts:419`](../../../src/lib/game/services/ItemService.ts#L419)
  — `const take = Math.min(avail, Math.ceil(need / worth));` in `expandCategoryCost`. Any
  `need` below one unit's `worth` rounds to a whole unit.
- Headless, 800 ticks, one `steel_stiletto` at `category:steel: 0.1`: `crucible_steel` 10 → 9.
  A whole bar for a tenth of a bar's worth of blade.
- Headless, 48000 ticks, twelve `copper_dagger` at `copper_bar: 0.1`: ten crafted,
  `copper_bar` left at `1.3877787807814457e-16`.
- [`src/lib/game/core/state/stockpile.ts:155`](../../../src/lib/game/core/state/stockpile.ts#L155)
  — `if (remaining <= 0 || !d.stored || d.reservedFor || d.quantity <= 0)` is the only guard
  that discards a drop, so a positive epsilon is kept forever.

## Why nothing caught it

No test asserts what a craft *consumes*; the recipe suites assert on authored fields, which is
why a reprice that changed nothing passed its own new checks. The type of a quantity is
`number`, so a fraction is as valid as an integer to the compiler and the schema. And the
residue is invisible at every readout that rounds for display, so a stockpile holding
1.4e-16 of a bar looks empty.

## Remediation

- [ ] Decide whether a fractional input is supported at all. The alternative already in use is
      a whole input with a multi-output yield — `make_iron_nail` is 1 bar to 300 — which is
      exact and needs no engine change.
- [ ] If fractions stay: make `expandCategoryCost` spend proportionally rather than rounding
      up, and clear residue below an epsilon when a craft settles.
- [ ] If fractions go: reject a non-integer quantity in the recipe schema so it fails at load
      rather than being quietly rounded or accumulated.
- [ ] Add a test that asserts on the stock delta a craft produces, not on the authored number,
      so a reprice that changes nothing cannot pass.
- [ ] Sweep `recipes.jsonc` for existing fractional inputs and say for each which of the two
      behaviours it is currently getting.

## Out of scope

The weights and yields of any specific recipe, and the question of whether a bar is the right
unit for small blades — both belong to the recipe data, not to whether the engine can express
a fraction.
