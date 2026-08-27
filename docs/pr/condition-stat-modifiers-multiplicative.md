---
id: condition-stat-modifiers-multiplicative
status: open
branch: fix/condition-stat-modifiers-multiplicative
created: 2026-08-27
updated: 2026-08-27
issue: condition-stat-modifiers-multiplicative
base: main
verified: pass
---
# fix: Conditions reach the sim by multiplying a core stat, which pays the strong, nothing to the weak, and everything that stat feeds

> **Related:** [issue](../issues/condition-stat-modifiers-multiplicative.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/condition-stat-modifiers-multiplicative` is committed and green. Nothing has been pushed anywhere.

## What it reports doing

Clean working tree, only the intended files changed. The `/tmp` scratch files are outside the repo and harmless to leave.

## Summary

**Mechanism (`src/lib/game/core/rules/body/conditions.ts`, `src/lib/game/services/PawnStatService.ts`):**
- Added `conditionModifierSum()`, an additive sibling to the existing `conditionModifierProduct()`, summing a `ConditionModifiers` key across a pawn's active condition stages and transient conditions.
- Wired it into `evaluateStat()` alongside `traitResistanceBonus()`, so any derived stat a condition names directly now gets a flat point-delta instead of nothing — extending the existing `pain`/`consciousness` pattern to the other 114 stat ids.
- Excluded four ids (`pain`, `consciousness`, `dodge`, `block`) from that new path via `CONDITION_MULTIPLIER_KEY_IDS`: these are stats.jsonc ids that happen to share their exact name with a pre-existing raw modifier key consumed multiplicatively elsewhere (`conditionMult` in Combat.ts, `conditionPainMultiplier`/`conditionConsciousnessMultiplier`). Wiring the generic additive channel to every stat id without this guard corrupted `dodge`/`block` — a debuff's `"dodge": 0.5` (meant to be multiplied) was instead being *added* to the dodge stat, making defenders progressively unhittable. Caught via a full `pnpm test:related` run and traced with ad hoc instrumentation (a scripted headless combat trace), per the debugging convention.
- Dropped the zero-clamp in `temperatureTolerance`, as decided in the issue: `Math.max(0, Math.min(CAP, raw))` → `Math.min(CAP, raw)`.

**Data (`conditions.jsonc`):** Converted all 62 conditions carrying a `strength`/`dexterity`/`constitution`/`perception`/`intelligence` modifier (the issue cited 50; the file has since grown to 62 — noted rather than silently reconciled) to name a specific derived stat additively instead: `strength`→`melee_damage`, `dexterity`→`cutting_resistance`, `perception`→`aim_range`, `intelligence`→`caretaking_quality`, `constitution`→`stamina` generally, `cold_resistance` for the three warmth-themed meal buffs (matching T1's own worked example), and `knockdown_resistance` for `pain_shock`/`hypovolemia` (their "footing" language, and the one case load-bearing for an existing fight-collapse test). Each delta was computed from the target formula so an average (stat=10) pawn's move matches what the old multiplicative system produced there — only now every pawn gets that same move, not a scaled fraction of it.

**Tests:** Updated `windchill.test.ts`, `encumbrance.test.ts`, `magicGear.test.ts`, `wieldRequirement.test.ts` to assert against the new derived-stat keys instead of the old raw-stat keys they were probing directly; `fractures.test.ts` needed only a title fix (its assertion passes unchanged since `fractured`'s strength now reaches `melee_damage`, same as before). Added `conditionStatAdditivity.test.ts`, the missing check from the remediation list: for `stock_warmed`, `tired`, and `fortified`, it drives a weak/average/strong pawn through the real reader and asserts the move is the same size for all three (not compressed toward zero for the weak pawn, as the bug did).

**Not done:** The `temperatureTolerance` tooltip still labels a condition-driven `cold_resistance` delta as "Constitution" in its source breakdown (`PawnStatService.ts:711`), since that attribution is computed as `evaluateStat - traitResistanceBonus` and doesn't know about the new condition term. This is a cosmetic UI-label gap, not a value bug, and no test exercises it — flagging it rather than touching UI code that wasn't named in the remediation.

**Verification:**
- `pnpm check` — 0 errors (10 pre-existing warnings, unrelated files).
- `pnpm test:related` on all changed files — 147 test files / 1100 tests passed.

## Review it

```bash
git diff main...fix/condition-stat-modifiers-multiplicative          # the whole change
git log --oneline main..fix/condition-stat-modifiers-multiplicative  # what it committed
```

Take it, or drop it:

```bash
git merge --no-ff fix/condition-stat-modifiers-multiplicative     # take it
git branch -D fix/condition-stat-modifiers-multiplicative          # drop it
```

## Facts

| | |
|---|---|
| issue | [`docs/issues/condition-stat-modifiers-multiplicative.md`](../issues/condition-stat-modifiers-multiplicative.md) |
| severity | high |
| raised by | a person |
| files changed | 9 |
| verified | `check` + `test:related` green |

<details><summary>files</summary>

- `rc/lib/game/core/rules/body/conditions.ts`
- `src/lib/game/database/pawns/conditions.jsonc`
- `src/lib/game/services/PawnStatService.ts`
- `src/tests/game/services/windchill.test.ts`
- `src/tests/game/systems/encumbrance.test.ts`
- `src/tests/game/systems/fractures.test.ts`
- `src/tests/game/systems/magicGear.test.ts`
- `src/tests/game/systems/wieldRequirement.test.ts`
- `src/tests/game/services/conditionStatAdditivity.test.ts`

</details>

_Written unattended by `tools/audit/fix.mjs`. The branch is local; nothing was pushed._
