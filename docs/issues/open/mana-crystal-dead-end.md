---
id: mana-crystal-dead-end
title: mana_crystal is a dead-end drop and make_ash is shadowed by two byproduct producers
status: open
kind: data
severity: low
ready: false
origin: human
rules: []
files:
  - src/lib/game/database/items/recipes.jsonc
  - src/lib/game/database/items/items.jsonc
symbols: []
created: 2026-08-25
updated: 2026-08-25
---

# mana_crystal is a dead-end drop and make_ash is shadowed

> **Related:** [issues/README](README.md) · [ROADMAP](../tasks/open/ROADMAP.md) · [AUDIT (archived)](../tasks/archive/AUDIT-2026-08-25.md)

## What breaks

Two leftovers from the unfinished runic tier, both cosmetic today and both blocked on the same
redesign.

**`mana_crystal` goes nowhere.** It is mined at the `mana_crystal_vent` and its only consumer is
`grind_mana_crystal`, whose output feeds nothing that ships. A player who works a vent
accumulates a resource with no use, and the vent reads as content when it is a stub.

**`make_ash` is unreachable from its own card.** `burn_charcoal` and `make_coke` both emit `ash`
as a byproduct and are declared first, so `getRecipeForItem` (first-producer-wins) resolves the
ash card to charcoal-burning. Ash is still obtainable via the byproduct, so nothing is lost —
the direct recipe is simply dead.

Both are held rather than fixed: pruning a reagent mid-redesign is churn the redesign undoes.

## Evidence

- `grind_mana_crystal` is `mana_crystal`'s only consumer, and its output has no downstream recipe — [`recipes.jsonc`](../../src/lib/game/database/items/recipes.jsonc)
- `burn_charcoal` and `make_coke` declare `ash` as a byproduct ahead of `make_ash`, so first-producer-wins resolves the card away from the direct recipe — [`recipes.jsonc`](../../src/lib/game/database/items/recipes.jsonc)
- The same shadow class was fixed for butchery by dispatching on the carcass rather than the output meat; the remaining two were left because their reworks own them
- `magic_alloy_bar`, previously listed with these, **now has a consumer** (`rune_etched_belt`) and is no longer part of this issue

## Why nothing caught it

`getRecipeForItem` returning the first producer is correct for the single-producer case and
silently wrong when two recipes share an output — there is no error, just a card that resolves
elsewhere. A reachability test would catch it, but the project's reachability checks are static
and were satisfied: the item *is* producible, by the byproduct path. Nothing asserts that a
recipe with its own card is the one the card reaches. And a resource with no consumer is
invisible to every check that asks whether something can be made rather than whether it is
worth making.

## Remediation

- [ ] Fold both into the runic / magic-reagent redesign rather than fixing them piecemeal — the redesign decides whether `mana_crystal` survives at all.
- [ ] When that pass runs: give `mana_crystal` a real consumer chain or remove it and its vent together.
- [ ] Resolve `make_ash` under the ash-economy pass — either dispatch the card to the direct recipe or delete it and keep the byproduct.
- [ ] Add a test that a recipe owning a crafting card is the recipe that card resolves to, so the next shadow fails instead of shipping.

## Out of scope

Doing either fix now. Both are deliberately deferred to the reworks that own them; this issue
exists so the deferral is recorded rather than remembered.
