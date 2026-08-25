---
id: armour-resistance-fields-dead
title: slashResistance, pierceResistance and crushResistance are authored on armour and read by nothing
status: open
kind: data
severity: medium
ready: false
origin: human
rules: []
files:
  - src/lib/game/core/types/items.ts
  - src/lib/game/database/items/items.jsonc
  - src/lib/game/systems/Combat.ts
  - src/lib/game/core/PawnEquipment.ts
symbols: []
created: 2026-08-25
updated: 2026-08-25
---

# slashResistance, pierceResistance and crushResistance are read by nothing

> **Related:** [issues/README](README.md) · [game/ITEM-RULES](../game/ITEM-RULES.md) · [AUDIT (archived)](../tasks/archive/AUDIT-2026-08-25.md)

## What breaks

Armour advertises damage-type resistance that does not exist. `armorProperties` declares
`slashResistance`, `crushResistance` and `pierceResistance`, nine item entries set them, and
the tooltip surfaces them to the player — but the damage path never reads any of the three.
A piece authored as pierce-resistant mitigates a thrust exactly as much as a piece that is
not, so the player picks armour against a weapon type on a number that changes nothing.
It also makes the fields a trap for future work: a designer tuning a mail hauberk against
arrows is editing a value with no consumer.

## Evidence

- [`types/items.ts:797`](../../src/lib/game/core/types/items.ts#L797) — the three fields declared on `armorProperties`
- [`items.jsonc:4751`](../../src/lib/game/database/items/items.jsonc#L4751) — `"pierceResistance": 0.2`, one of nine such declarations across the item DB
- `src/lib/game/systems/Combat.ts` and `src/lib/game/services/` contain **no** reference to any of the three names — the mitigation path (`partArmorReduction` / `partArmorPoints`) resolves defence from `defense` and `durability` only
- [`PawnEquipment.ts:402`](../../src/lib/game/core/PawnEquipment.ts#L402) — the only `crushResistance` consumer anywhere, and it is the *equipment-effect* switch (the jewellery/bonus path), not armour mitigation; `slashResistance` and `pierceResistance` are absent even there
- [`ItemStatTooltip.svelte`](../../src/lib/components/UI/ItemStatTooltip.svelte) and [`naturalGear.ts`](../../src/lib/components/util/naturalGear.ts) surface the values, so the dead number reaches the player

## Why nothing caught it

An optional field with no consumer is invisible to the type system — `slashResistance?:
number` is satisfied by writing it and by never writing it, and equally satisfied by nobody
reading it. No test asserts that a resistance-bearing piece mitigates its damage type
differently from one without, because the assertion would have had to be written against a
behaviour that was never implemented. The gear audits check coverage and class consistency,
not whether a declared field reaches the combat kernel.

## Remediation

- [ ] Decide: wire the three fields into `partArmorReduction` as per-damage-type multipliers, or delete them.
- [ ] If wired — apply them alongside the existing `defense × (0.5 + 0.5 × condition)` term and give each armour line a deliberate profile (mail resists slash, plate resists pierce, padding resists crush).
- [ ] If deleted — strip the fields from `types/items.ts`, the nine `items.jsonc` entries, the tooltip and `naturalGear.ts`, so nothing advertises them.
- [ ] Either way, add a test that a field declared on `armorProperties` has at least one reader in the combat path, so the next dead field fails instead of shipping.
- [ ] Headless-verify the chosen behaviour with a typed weapon against a resistant and a non-resistant piece (state ticks and the mitigation delta).

## Out of scope

`fireResistance`, `coldResistance` and `heatResistance` — those are read by the exposure path
and are not part of this defect. The per-part coverage model is also settled and unchanged;
this issue is only about whether the damage-type numbers do anything.
