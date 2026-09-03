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

> **Related:** [issue](../issues/review/condition-stat-modifiers-multiplicative.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/condition-stat-modifiers-multiplicative` is committed and green. The branch is pushed to origin.

## What it reports doing

# fix: conditions name a derived stat and add to it, instead of scaling a core stat

## What the branch changes

A condition's `modifiers` used to carry factors on the five core stats — `constitution: 1.12`,
`strength: 0.7`. `evaluateFormula` multiplied the raw stat before the formula took its distance
from 10, so the same condition was worth a different amount to every pawn, and it moved every
derived stat that core stat feeds (constitution 15, dexterity 61).

The branch adds `conditionModifierSum()` beside the existing `conditionModifierProduct()` and has
`evaluateStat` add it to whatever stat id it is evaluating, next to `traitResistanceBonus`. All 62
conditions carrying a core-stat factor were rewritten to name one derived stat and give it a flat
point delta: `strength`→`melee_damage`, `dexterity`→`cutting_resistance`, `perception`→`aim_range`,
`intelligence`→`caretaking_quality`, `constitution`→`stamina`, with `cold_resistance` for the three
warmth conditions and `knockdown_resistance` for `pain_shock`/`hypovolemia`. Zero core-stat keys
remain in `conditions.jsonc`. `workEfficiency`, `moveSpeed`, `hungerRate`, `thirstRate` and
`fatigueRate` stay factors, as the issue directed.

Four stat ids — `pain`, `consciousness`, `dodge`, `block` — are held out of the additive channel by
`CONDITION_MULTIPLIER_KEY_IDS`, because a modifier of that exact name is already consumed as a
factor elsewhere.

The zero-clamp in `temperatureTolerance` is gone: `Math.max(0, Math.min(CAP, raw))` → `Math.min(CAP, raw)`.

## The most severe thing found

**The conversion moved balance, in the direction the issue was filed to stop.** Two of the five
target stats reach nothing the sim reads:

- **`stamina` has no sim reader.** 26 of the 194 additive modifiers land on it. The only references
  to the stat id outside tests are in `src/lib/dev/buildStats.ts`, the dev stat-reference page.
  Combat's stamina comes from `calcMaxStamina(stats)` (`src/lib/game/entities/Pawns.ts:44`), which
  reads raw `pawn.stats` and never saw conditions. So every constitution debuff in the file —
  dehydration, malnutrition, disease — is now inert. Before, `constitution: 0.6` moved
  `knockdown_resistance`, `heal_rate`, `stamina_recovery_rate`, `blood_clotting`, `fatigue_rate` and
  the piercing/blunt/fire/cold/wetness/poison resistances, all of which the sim reads.
- **`cutting_resistance` is clamped away for any pawn at or below dexterity 10.**
  `physicalResistance` (`src/lib/game/systems/Combat.ts:457`) returns `clamp(res, 0, 0.9)`, and
  `cutting_resistance = (DEXTERITY − 10) × 0.01` is ≤ 0 there. Measured: a dex-10 pawn goes
  0.0000 → −0.0300 under `tired`, a dex-6 pawn −0.0400 → −0.0700; both floor to 0 in combat. Only a
  pawn above dexterity 10 feels any of the 68 `cutting_resistance` debuffs. That is the issue's own
  complaint — pays the strong, nothing to the weak — relocated from the arithmetic to the clamp.

`melee_damage` (66 modifiers), `aim_range` (18), `cold_resistance` (3), `knockdown_resistance` (4)
do reach real readers. `caretaking_quality` (9) reaches `caretake.ts:92` but the deltas are
±0.0014–0.0028 on a value near 1, so nothing observable.

I did not re-target the 62 conditions. Choosing what a hungry body should actually lose is a design
call, and doing it silently inside a verification pass would be worse than reporting it.

## What I verified, and how

**Full suite, `VITEST_MAX_FORKS=2 vitest run`** — 185 files, 1341 tests, 0 failures, 587 s.
The reported `main` baseline is 184 files / 1335 tests; the extra file and its 6 tests are this
branch's, and the count confirms the run collected the final version of that file, not the fixer's
3-test one.

**`RUN_AUDITS=1`, the 24 audit suites** — AUDIT_RESULT.

**`svelte-check`** — 891 files, 0 errors, 10 warnings, all pre-existing and in unrelated files.
`vite.config.ts:7-13` needs a local `findGitRoot` patch to run at all inside a worktree (`.git` is a
file there, not a directory); patched, run, reverted, never committed.

**Headless, `HeadlessSession` + `buildScenario`, real ticks.** Three drafted pawns at core stats
6/10/20, seed 11, 20 ticks, fatigue pinned to 100 so the sim raises `tired`. Same pawn object,
same tick, condition on and off:

| stat | stat 6 | stat 10 | stat 20 |
| --- | --- | --- | --- |
| melee_damage | 0.6000→0.3000 (−0.3000) | 1.0000→0.7000 (−0.3000) | 1.7500→1.4500 (−0.3000) |
| cutting_resistance | −0.0400→−0.0700 (−0.0300) | 0.0000→−0.0300 (−0.0300) | 0.1000→0.0700 (−0.0300) |
| aim_range | 0.2840→0.2340 (−0.0500) | 0.3150→0.2650 (−0.0500) | 0.3940→0.3440 (−0.0500) |
| dodge | 0.1480→0.1480 (0.0000) | 0.9200→0.9200 (0.0000) | 0.6320→0.6320 (0.0000) |

`tired` carries `melee_damage −0.3`, `cutting_resistance −0.03`, `aim_range −0.05`, `dodge 0.79`.
The first three move by exactly the data value at every stat level. The old multiplicative
`strength: 0.7` would have moved a strength-6 pawn by −0.18 (POWER 4.2 → 0.42) and a strength-20
pawn by roughly twice the average pawn's −0.30.

**The guard, driven backwards.** `conditionModifierSum(pawn, 'dodge')` reads 0.790 on those tired
pawns while `evaluateStat('dodge')` does not move. With `CONDITION_MULTIPLIER_KEY_IDS` emptied and
the same scenario re-run, dodge went 0.1480→0.9380, 0.9200→1.7100, 0.6320→1.4220 — the factor 0.79
added instead of multiplied, +0.7900 at every level. Restored, and `git diff` on the file is clean.

**The dropped clamp, measured over ticks.** Three pawns at constitution 6/10/20, no traits, seed 11,
1600 ticks:

| | coldDeg | coldOnset | coldExposure after 1600 ticks |
| --- | --- | --- | --- |
| con 6, branch | −0.80 | 5.80 | 32.61 |
| con 6, clamp restored | 0.00 | 5.00 | 28.25 |
| con 10 | 0.00 | 5.00 | 28.25 |
| con 20 | 2.00 | 3.00 | 17.35 |

With the clamp the frail pawn was indistinguishable from the average one. Without it they start
feeling cold 0.8° above their comfort floor and take 15% more cold exposure over the same ticks.
`banked_warmth` (+0.02 cold_resistance = +0.40°) moves the con-6 pawn's onset 5.80→5.40 on the
branch; with the clamp it moved 5.00→5.00 — the buff was worth nothing to them, which is the
worked case in the issue.

**A real fight.** Seeds 23/37/41/53, one drafted pawn at core stats 10 with a steel longsword
against an `orc_reaver`, fatigue pinned so `tired` holds, up to 6000 ticks each: 10 swings taken,
6 landed, 6 swings landed by the pawn for 21 damage. A separate 6-fight sweep at core stats
6/10/20, fresh and tired, showed damage per landed hit 1.00/2.75/11.33 fresh against 1.75/4.25/15.50
tired, on 2–9 landed hits per fight. Both samples are too small to call a hit-rate delta and I do
not claim one; the fights establish that the branch's stat values reach a real combat resolution
without producing anything degenerate.

**Delta arithmetic, checked against each target formula at stat 10.** `melee_damage` = m−1,
`cutting_resistance` = 0.1(m−1), `aim_range` = 0.25(m−1), `caretaking_quality` = 0.007(m−1),
`stamina` = 40(m−1), `knockdown_resistance` = 0.25(m−1), `cold_resistance` = 0.1(m−1). Every
converted value matches, to 4 decimal places. The two `aim_range` roundings (−0.0187 for −0.01875,
−0.0812 for −0.08125) are 0.03% short.

At the extremes the change is deliberate and asymmetric: a fixed contribution costs a weak pawn more
than the old system did and a strong pawn less. `melee_damage` can now go below zero — a stat-6 pawn
sits at 0.60 and `tired` + `staggering` + `malnutrition/severe` sum to −1.20. Combat floors it
rather than inverting: `partArmorReduction` returns 0 for `rawDamage <= 0`, `blockChance` takes
`Math.max(0, incoming)`, and `final = scaled <= 0 ? 0 : Math.max(1, round(scaled))`. So such a pawn
deals 0 damage where the old system floored at 1. No healing, no NaN.

## What I changed on top of the fixer's work

- **`PawnStatService.ts:711` tooltip attribution, which the fixer skipped as cosmetic.** The
  temperature breakdown computed its "Constitution" line as `evaluateStat − traitResistanceBonus`,
  so a condition's `cold_resistance` delta was shown to the player as constitution. Added
  `conditionModifierContributions()` in `conditions.ts` and subtracted the condition total from the
  constitution line, giving each contributing condition its own row under its display name. Verified
  in the sim: a con-6 pawn with `banked_warmth` reads `Constitution −0.80 | Banked Warmth 0.40`,
  where it previously read `Constitution −0.40`. `raw` is unchanged, so no value moves.
- **Folded the three condition-modifier traversals into one.** `conditionModifierProduct`,
  `conditionModifierSum` and the new contributions reader walk the same stages and transients;
  `eachConditionModifier` is now the single traversal, still allocation-free on the hot path.
- **Replaced `conditionStatAdditivity.test.ts` with a data-driven check.** The fixer's version
  covered 3 conditions by name; the remediation asks for every condition. The new one builds its
  cases from `conditions.jsonc` × `stats.jsonc`: 282 modifier keys that are stat ids, across 62
  conditions. 194 are on the additive channel and are asserted to move `evaluateStat` by exactly the
  data value at stat 6, 10 and 20; 88 are asserted not to move it at all while
  `conditionModifierSum` still reports them. It also asserts no core-stat key survives in the data,
  that a warmth condition is worth the same degrees to a frail pawn as a hardy one, and that the
  temperature breakdown names the condition rather than constitution.

  Two families need a weaker assertion and get one. `collapse` carries `dodge: 0.0`, a factor that
  sums to zero, so the guard case asserts the reader does not move rather than that something was
  held back. `keen_witted` and `berserk` carry a `consciousness` factor, which scales the
  consciousness capacity and therefore every consciousness-scaled formula; for those the test
  asserts the additive contribution equals the data value instead of asserting the whole reader
  delta does.

## The guard list is complete

The multiplicative modifier keys the code consumes are `pain` and `consciousness` (via
`conditionModifierProduct`), `hungerRate`/`fatigueRate`/`thirstRate`/`relaxationRate`/`hygieneRate`
(`conditionNeedMultipliers`), `workEfficiency` and `moveSpeed` (`statView.ts`, `PawnService.ts`,
`PawnStatService.ts`), `dodge`/`hitChance`/`critChance`/`weaponDamage`/`attackSpeed`/`block`
(`Combat.conditionMult`, and `dodge` again in `selectionCard.ts:98`), and the five core stats
(`conditionStatMultipliers`). Intersected with the 116 stat ids in `stats.jsonc`, that is exactly
`{pain, consciousness, dodge, block}` — the four the fixer guarded. The rest are camelCase and
collide with nothing.

`conditionStatMultipliers` now always returns 1s, since no condition carries a core-stat key. It is
still called from `PawnStatService`, `Combat.ts:1685`, `statView.ts`, `selectionCard.ts` and
`PawnStatBanner.svelte`. Dead weight, not a defect, and outside this issue.

## How this sits with the sibling branches

`fix/s01-game-services` (`e8c2d304`) and `fix/core-stat-single-source` (`6f757e80`) also touch
`PawnStatService.ts`. Neither is on `main`. `e8c2d304`'s change is the `CORE_STAT_ORDER`
exhaustiveness type around line 116; `6f757e80` does not touch the file at all. My edits are the
import block, the guard set near line 68, one line in `evaluateStat`, and `temperatureTolerance` —
no textual overlap, and no shared symbol. `main` at `d276cb6e` has no change to
`PawnStatService.ts`, `conditions.ts` or `conditions.jsonc` relative to this branch's merge base.

Nothing here touches the core-stat roster order, so the rng-draw hazard that broke `fsmTransitions`
on `fix/core-stat-single-source` does not apply. The full suite is green, and the seeded headless
probes gave identical numbers for the unaffected pawns across the two runs of the guard A/B
(con 10 coldExposure 28.25, con 20 17.35, both runs).

## Remediation items not done

- **Convert the 62 conditions, keeping each one's effect on an average pawn roughly where it is
  now.** Not ticked. The conversion is complete and the per-condition arithmetic is exact, but
  balance did move: the `constitution`→`stamina` group (26 modifiers) reaches no sim reader, and the
  `dexterity`→`cutting_resistance` group (68) is clamped to zero for any pawn at or below dexterity
  10. Fixing it means re-choosing target stats, which is a design decision, not a verification one.

## Unfiled

`physicalResistance` (`src/lib/game/systems/Combat.ts:457`) clamps to `[0, 0.9]` the six
resistances combat routes through it — cutting, piercing, blunt, fire, cold, lightning. All eleven
resistance formulas in `stats.jsonc` start at 0.0 and take a distance from 10, so a below-average
pawn's resistance is negative and floored to zero: their weakness never costs them anything, and
gear or traits that would lift them out of the hole are spent filling it instead. That is the same
defect as the `temperatureTolerance` zero-clamp this issue told us to drop, in a second place. Not
fixed.

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
| issue | [`docs/issues/review/condition-stat-modifiers-multiplicative.md`](../issues/review/condition-stat-modifiers-multiplicative.md) |
| severity | high |
| raised by | a person |
| files changed | 9 |
| verified | re-verified on the branch; see the account above |

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

_Account written after re-running the verification on the branch._
