---
id: equip-ignores-stock
title: A pawn can equip an item the colony does not have
status: open
kind: correctness
severity: high
ready: false
origin: human
rules: []
files:
  - src/lib/game/sim/commands.ts
symbols: []
created: 2026-08-27
updated: 2026-08-27
---

# A pawn can equip an item the colony does not have

> **Related:** [issues/README](../README.md)

## What breaks

`equipPawnItem` puts an item in a pawn's hand without checking that the item exists anywhere.
Nothing is removed from the stockpile, because there was nothing to remove. A pawn ends the
tick wearing gear the colony never crafted, and the stock count is untouched, so the same id
can be equipped again on the next pawn, and the one after that.

Observed while verifying a crafting ladder on `fix/caster-weapon-line-age`: a probe issued
`equipPawnItem` for `copper_rod` in a colony holding none, and the pawn came out of the tick
with `copper_rod=undefined ... worn offHand=copper_rod` — no stock, item worn.

The command is reachable from the debug and dev surfaces as well as from headless scenarios,
so any scenario that equips a starting loadout silently mints it. That also means every
headless verification which asserts "a pawn can equip X" proves nothing about whether X was
obtainable, which is usually the thing being tested.

## Evidence

- [`src/lib/game/sim/commands.ts:555`](../../../src/lib/game/sim/commands.ts#L555) —
  `equipPawnItem` maps the pawn through `equipItem(pw, p.itemId, s.turn)` and returns. There
  is no stock lookup, no decrement, and no failure path.
- [`src/lib/game/sim/commands.ts:571`](../../../src/lib/game/sim/commands.ts#L571) —
  `useConsumableItem`, the command immediately below it, does the opposite: it returns state
  unchanged when `stockedDose(s, p.itemId)` is falsy. The pattern this command needs already
  exists three lines away.
- [`src/lib/game/headless/Scenario.ts:219`](../../../src/lib/game/headless/Scenario.ts#L219) —
  `for (const itemId of g.equip ?? []) cmd('equipPawnItem', ...)`, so every scenario `equip:`
  list goes through the unchecked path.

## Why nothing caught it

No test asserts that equipping consumes stock, and the headless scenarios that equip a
loadout are written to test something else — they take the pawn being equipped as setup, not
as the assertion. The type system cannot express "this id exists in the stockpile", and the
command returns a new state either way, so nothing downstream distinguishes a real equip from
a minted one.

## Remediation

- [ ] Decide whether equipping consumes from stock or requires a carried instance, and whether
      a scenario's `equip:` list is allowed to bypass that as explicit setup.
- [ ] Make `equipPawnItem` refuse, or consume, per that decision — mirroring the shape of
      `useConsumableItem` at commands.ts:571.
- [ ] If scenario setup keeps a bypass, make it a separate named command so a test cannot use
      it by accident when it means to prove obtainability.
- [ ] Add a test that equipping from an empty stockpile does not produce an equipped pawn, so
      the class cannot come back.
- [ ] Check `unequipPawnItem` returns the instance to the world in the same accounting, since
      the two have to balance.

## Out of scope

The wider question of item instance ownership and carrying, and any change to how stockpiles
reserve items for jobs.
