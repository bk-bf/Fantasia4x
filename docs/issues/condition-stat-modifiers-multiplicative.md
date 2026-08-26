---
id: condition-stat-modifiers-multiplicative
title: Condition stat modifiers multiply a raw stat, but every derived stat reads its distance from 10, so a buff pays the strong and nothing to the weak
status: open
kind: correctness
severity: high
ready: false
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
created: 2026-08-27
updated: 2026-08-27
---

# Condition stat modifiers are multiplicative against offset formulas

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

The same shape runs the other way for debuffs. `tired` sets `strength: 0.7`; on a con-20-equivalent
strong pawn that removes 6 stat points, on a weak pawn 2.8. A penalty meant to represent one tired
body punishes the strong three times harder.

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

## Why nothing caught it

Nothing asserts that a condition changes what the sim *reads*, only that it changes the stat.
`mealLines.test.ts` does compare a real reader before and after — it is the reason this was found —
but it drives one generated pawn per line, so it samples one point on the curve and cannot see that
the curve's slope depends on the pawn. A test that ran the same condition against a weak, average
and strong pawn and asserted the reader moved for all three would have failed on the first line
written.

## Remediation

- [ ] Decide the modifier contract: **additive stat points** (`constitution: +1.2`) is the shape that
      matches offset formulas, since it moves every pawn the same distance regardless of where they
      start. Multiplicative stays defensible only for stats read directly rather than as a deviation.
- [ ] If additive: widen `ConditionModifiers` to carry the two kinds distinctly, so a reader can tell
      `1.12` (a factor) from `+1.2` (points) without guessing at magnitude.
- [ ] Convert the 50 conditions, keeping each one's effect on an average pawn roughly where it is now
      so balance does not move while the mechanism changes.
- [ ] Revisit the `Math.max(0, …)` clamp at `PawnStatService.ts:721`. Whether a below-average pawn
      should be *unable* to benefit from gear, traits and conditions until they cross 10 is a design
      question this issue only exposes; the clamp is correct for the final tolerance and wrong as a
      gate on the contributions.
- [ ] Add the check that would have caught it: for every condition with a core-stat modifier, assert
      the sim's own reader moves for a weak, an average and a strong pawn.

## Out of scope

- The meal lines themselves. T1's seven lines are built on this mechanism and are correct once it is;
  none of them need re-authoring, only the numbers behind them.
- `PawnStateMachine`'s immunity calculation, which reads **raw** `pawn.stats.constitution` and is
  deliberately unreachable by conditions. That is a separate decision, noted in T1.
- Trait and gear contributions, which are already additive and land in the same sum correctly.
