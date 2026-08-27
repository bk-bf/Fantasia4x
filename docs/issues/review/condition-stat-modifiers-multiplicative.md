---
id: condition-stat-modifiers-multiplicative
title: Conditions reach the sim by multiplying a core stat, which pays the strong, nothing to the weak, and everything that stat feeds
status: in-review
kind: correctness
severity: high
ready: true
origin: human
rules: []
files:
  - src/lib/game/database/pawns/conditions.jsonc
  - src/lib/game/core/rules/body/conditions.ts
  - src/lib/game/services/PawnStatService.ts
  - src/lib/game/database/pawns/stats.jsonc
symbols:
  - conditionStatMultipliers
  - evaluateFormula
  - temperatureTolerance
branch: fix/condition-stat-modifiers-multiplicative
pr: condition-stat-modifiers-multiplicative
created: 2026-08-27
updated: 2026-08-27
---

# Conditions modify core stats, and multiplicatively

> **Related:** [issues/README](README.md) · [core-stat-single-source](core-stat-single-source.md) ·
> [tasks/DB-PASS-QUEUE](../tasks/open/DB-PASS-QUEUE.md) (T1 built the meal lines on top of this)

## What breaks

A condition scales a core stat by a factor — `constitution: 1.12`. Every stat derived from it reads
the stat's **distance from 10**, not the stat itself: `cold_resistance = (CONSTITUTION − 10) × 0.01`.
Multiplying scales the distance from *zero*, so the same buff is worth a different amount to every
pawn, and nothing at all to some.

A bowl of hot bone broth, `stock_warmed`, `constitution: 1.12`:

| pawn | cold_resistance | gain | what the player sees |
| --- | --- | --- | --- |
| con 6 | −0.040 → −0.033 | +0.007 | nothing — still negative, clamped to 0 degrees |
| con 8 | −0.020 → −0.010 | +0.010 | nothing — still negative, clamped to 0 degrees |
| con 10 | 0.000 → 0.012 | +0.012 | a small gain |
| con 14 | 0.040 → 0.057 | +0.017 | half again as much |
| con 20 | 0.100 → 0.124 | +0.024 | **twice** the average pawn's gain |

So the frail pawn — the one who needs the hot meal — gets nothing, and the hardy pawn who needs it
least gets the most. The weaker the pawn, the weaker the medicine. The clamp at
`PawnStatService.ts:721` hides the bottom two rows completely: a negative resistance becomes zero
degrees of tolerance, so the buff moves a number that no reader ever sees.

The same shape runs the other way for debuffs. `tired` sets `strength: 0.7`; on a strong pawn that
removes 6 stat points, on a weak pawn 2.8. A penalty meant to represent one tired body punishes the
capable three times harder.

**Underneath the arithmetic is a targeting problem, and it is the worse half.** A core stat is a hub:
constitution feeds **15** derived stats, dexterity **61**. So a bowl of hot broth that should warm a
pawn also speeds their healing, thickens their blood, raises their stamina and stamina recovery,
slows their fatigue, and hardens them against piercing, blunt, fire, wetness, poison and disease.
None of that was intended and none of it is visible from the condition's data.

**Naming a derived stat directly is already possible, and is already done twice.**
`conditionModifierProduct(entity, key)` is generic over any `ConditionModifiers` key, `stats.jsonc`
gives all 116 derived stats a stable id, and `pain` and `consciousness` — both stats in that file —
are read through it today. The mechanism is not missing. What is missing is that `evaluateStat` never
consults it for the other 114 ids, so an author with a warming meal to write has no wired path to
`cold_resistance` and reaches for `constitution` instead. That is why 50 conditions modify a core
stat: not because the design demands it, but because it is the only channel that is plumbed.

## Evidence

- [`src/lib/game/core/rules/body/conditions.ts:451`](../../src/lib/game/core/rules/body/conditions.ts#L451)
  — `out.strength *= m.strength`, and the same for the other four. Every modifier is a factor, and
  factors from stacked conditions compound.
- [`src/lib/game/services/PawnStatService.ts:246`](../../src/lib/game/services/PawnStatService.ts#L246)
  — `(s?.constitution ?? 10) * sm.constitution` is what reaches the formula, so the multiplier lands
  on the raw stat before the offset is taken.
- [`src/lib/game/database/pawns/stats.jsonc:207`](../../src/lib/game/database/pawns/stats.jsonc#L207)
  — `cold_resistance = (0.0 + (CONSTITUTION − 10) × 0.01)`. **92 of 116 stat formulas** subtract a
  baseline of 10 this way; the offset is the rule, not the exception.
- [`src/lib/game/services/PawnStatService.ts:721`](../../src/lib/game/services/PawnStatService.ts#L721)
  — `Math.max(0, Math.min(TEMP_RES_DEG_CAP, raw))` clamps a below-baseline pawn's tolerance to zero,
  so no cold buff is visible until the buffed stat crosses 10.
- **50 of 127 conditions** in `conditions.jsonc` carry a core-stat modifier, so this is the whole
  condition system, not the meal lines that surfaced it.
- [`src/lib/game/core/rules/body/conditions.ts:102`](../../src/lib/game/core/rules/body/conditions.ts#L102)
  — `conditionModifierProduct(entity, key)` takes **any** `ConditionModifiers` key, and
  `ConditionModifiers` carries an index signature. Its two callers ask for `pain` and
  `consciousness`, which are stat ids in `stats.jsonc`. Conditions already reach two derived stats by
  name; nothing about the mechanism stops the other 114.
- [`src/lib/game/services/PawnStatService.ts:686`](../../src/lib/game/services/PawnStatService.ts#L686)
  — `evaluateStat` applies `conditionStatMultipliers` (five core stats) and
  `traitResistanceBonus(pawn, statId)` (per-derived-stat, additive, traits only). It never asks the
  generic condition reader for the stat it is evaluating. That single missing lookup is the gap.

## Why nothing caught it

Nothing asserts that a condition changes what the sim *reads*, only that it changes the stat.
`mealLines.test.ts` does compare a real reader before and after — it is the reason this was found —
but it drives one generated pawn per line, so it samples one point on the curve and cannot see that
the curve's slope depends on the pawn. A test that ran the same condition against a weak, average
and strong pawn and asserted the reader moved for all three would have failed on the first line
written.

## Remediation

- [ ] **Wire the reader that already exists.** `evaluateStat` should ask the generic condition reader
      for the stat id it is evaluating, exactly as it already asks `traitResistanceBonus`. No new data
      shape: `ConditionModifiers` takes any key, `stats.jsonc` supplies the ids, and `pain` /
      `consciousness` prove the pattern. `conditionModifierProduct` multiplies, so an additive
      sibling is needed alongside it — the product form stays for the keys that want a factor.
- [ ] **Stop modifying core stats.** A condition names the derived stat it means. `constitution` and
      the other four become the exception, used only where a condition genuinely changes the whole
      body, and each remaining use is justified in the same PR or converted.
- [ ] **Additive, not multiplicative,** for everything on the new channel — a fixed contribution
      moves every pawn the same distance whatever their baseline, which is what an offset formula
      wants. A factor stays correct only for a stat read directly rather than as a deviation from 10;
      `workEfficiency`, `moveSpeed`, `hungerRate`, `thirstRate` and `fatigueRate` are that case and
      can stay as they are.
- [ ] Convert the 50 conditions, keeping each one's effect on an average pawn roughly where it is now
      so balance does not move while the mechanism changes.
- [ ] **Drop the zero-clamp at `PawnStatService.ts:721`** — `Math.max(0, Math.min(CAP, raw))` becomes
      `Math.min(CAP, raw)`. **Decided, not open.** A frail pawn is already weaker for having a lower
      stat; zeroing the sum makes them forfeit the whole gear bonus on top, which discounts the same
      weakness twice. Worked case, cold gear worth `+0.015` resistance at 20°/unit:

      | pawn | no gear | with gear | gear was worth |
      | --- | --- | --- | --- |
      | con 10, today | 0.0° | 0.3° | +0.3° |
      | con 8, today | 0.0° (clamped from −0.4°) | 0.0° (clamped from −0.1°) | **nothing** |
      | con 8, dropped clamp | −0.4° | −0.1° | +0.3° |

      The frail pawn stays 0.4° worse than the average one — that is their constitution, and it is
      meant to show. What they stop losing is the coat. Nothing downstream needs a non-negative
      degree: `coldOnset = comfortMin − deg`, and its four readers
      (`PawnStateMachine.ts:390`, `PawnService.ts:365`, `selectionCard.ts:271`, and a debug log) all
      take the onset, so a negative degree simply means a pawn starts feeling cold above their
      comfort floor.
- [ ] Add the check that would have caught it: for every condition with a core-stat modifier, assert
      the sim's own reader moves for a weak, an average and a strong pawn.

## Out of scope

- The meal lines themselves. T1's seven lines are built on this mechanism and are correct once it is;
  none of them need re-authoring, only the numbers behind them.
- `PawnStateMachine`'s immunity calculation, which reads **raw** `pawn.stats.constitution` and is
  deliberately unreachable by conditions. That is a separate decision, noted in T1.
- Trait and gear contributions, which are already additive and land in the same sum correctly. They
  are the model to copy, not something to change.
- The non-stat modifier keys — `workEfficiency`, `moveSpeed`, `hungerRate`, `thirstRate`,
  `fatigueRate`, `pain`, `consciousness`. These are read directly rather than as a deviation from a
  baseline, so a factor is the right shape for them and they stay multiplicative.
