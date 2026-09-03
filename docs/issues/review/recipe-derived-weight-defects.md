---
id: recipe-derived-weight-defects
title: Recipes that consume whole bars and staveless bows derive absurd item weights
status: in-review
kind: data
severity: medium
ready: true
origin: human
rules: []
files:
  - src/lib/game/database/items/recipes.jsonc
  - src/lib/game/database/items/items.jsonc
symbols: []
branch: fix/recipe-derived-weight-defects
pr: recipe-derived-weight-defects
created: 2026-08-25
updated: 2026-08-27
---

# Recipes that consume whole bars and staveless bows derive absurd item weights

> **Related:** [issues/README](README.md) · [game/ITEM-RULES](../game/ITEM-RULES.md) · [AUDIT (archived)](../tasks/archive/AUDIT-2026-08-25.md)

## What breaks

Item mass is derived from what a recipe consumes, so a wrong ingredient list produces a wrong
weight the player carries. A Steel Stiletto weighs **4.8 kg** because its recipe consumes a
whole 4 kg steel bar; a Copper Dagger 3.7 kg; a Sewing Kit 3.4 kg. A bar is stock several
pieces are cut from, not a single knife's worth. In the other direction three bows have no
wooden stave at all and derive to **0.09 kg** — a war bow lighter than its own string. Every
one of these figures feeds the carry budget, so a pawn hauling daggers fills its pack on
nothing, and the bow costs no capacity to carry.

The derivation is correct; the recipes are the broken half.

## Evidence

- **Small metal items consume a whole bar** — Steel Stiletto derives to 4.8 kg, Copper Dagger 3.7 kg, Sewing Kit 3.4 kg. Largest single defect in the DB by item count. [`recipes.jsonc`](../../src/lib/game/database/items/recipes.jsonc)
- **Three bows have no stave** — `make_war_bow`, `make_hunting_recurve` and `make_self_bow` are `{sinew, thread}` only, deriving to 0.09 kg. [`recipes.jsonc`](../../src/lib/game/database/items/recipes.jsonc)
- **Jewellery consumes two gold bars a piece** — `make_ruby_amulet` and its six siblings derive to 7.1 kg. [`recipes.jsonc`](../../src/lib/game/database/items/recipes.jsonc)
- **`wicker_vest`** takes 30 cordage for a 2.5 kg vest and derives 4.8 kg; **`wattle_buckler`** is too thin and derives 0.74 kg for a 2 kg shield. [`items.jsonc`](../../src/lib/game/database/items/items.jsonc)

## Why nothing caught it

The weight derivation was added to make mass follow from materials, and it does — it faithfully
reports what the recipe says. Nothing compares the derived figure against the item's own sense
of scale, because before the derivation there was no second number to compare against. A knife
weighing as much as the bar it came from is arithmetically correct and physically absurd, and
only the second reading catches it. No test bounds a derived weight by item category.

## Remediation

- [x] Give small metal items a fractional bar cost or a multi-output yield, so one bar produces several knives instead of one heavy one.
- [ ] Add the missing wooden stave to `make_war_bow`, `make_hunting_recurve` and `make_self_bow`.
- [ ] Reprice the seven jewellery recipes off whole gold bars.
- [x] Fix `wicker_vest` (30 cordage) and `wattle_buckler` (too thin for a 2 kg shield).
- [ ] Add a test bounding each item's derived mass against a per-category plausible range, so the next staveless bow fails instead of shipping.
- [x] Headless-verify the carry budget moves as expected for a pawn holding the repriced items (state ticks and the kg delta).

## Out of scope

The derivation itself, and the carry-aid ladder that consumes these weights — both are audited
and working. This issue only corrects the recipes whose ingredient lists produce the wrong
input to a correct formula.
