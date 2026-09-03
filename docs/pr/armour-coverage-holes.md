---
id: armour-coverage-holes
status: open
branch: fix/armour-coverage-holes
created: 2026-08-27
updated: 2026-08-27
issue: armour-coverage-holes
base: main
verified: pass
---
# fix: Medium armour has no stiffness identity and no neck, hands or feet line at any age, and the shield ladder stops at steel

> **Related:** [issue](../issues/review/armour-coverage-holes.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/armour-coverage-holes` is committed and green. The branch is pushed to origin.

## What it reports doing

# fix: medium armour stiffness at iron, and the coverage check that let a borrowed piece pass

## The fix as committed closed four of six holes

`movementPenalty` is the stiffness axis. `Combat.wornStiffness` sums it across every worn
piece, clamps the total at `STIFFNESS_DODGE_CAP` 0.45, and multiplies `defDodge` by
`1 - total` in `resolveHit`. On boots only, `PawnService` reads the same field again as a
move-speed factor. Nothing else consumes it.

The branch set `movementPenalty: 0.02` on four `iron_mail` pieces — `mail_coif`,
`iron_gauntlets`, `iron_bracers`, `iron_greaves`. It left `spangenhelm` and `kettle_hat` at
`0.0`. Both are iron-age medium head pieces, so two of the three medium helms a player can
forge at iron still read identical to the light line, which is the collision the issue names.
I set both to `0.02`, the band the four mail pieces now use.

`iron_shod_boots` was already `0.06` and is unchanged.

## What the branch also changed

`armourCoverage.test.ts` gained a second `describe` block that walks light and medium
separately across six regions — head, torso, arms, hands, legs, feet — using each class's own
torso layer (`bodyBase` for light, `bodyMid` for medium), so a piece borrowed from another
weight class no longer satisfies a region. Heavy is excluded, which matches ITEM-RULES: heavy
sets are deliberately incomplete and pad from the light and medium lines.

## Verification

`pnpm check` — 890 files, 0 errors, 10 warnings, 4 files with problems. All ten warnings are
pre-existing and in files this branch does not touch (`SelectedEntityCard.svelte`,
`ActivityLogOverlay.svelte`, `PawnNeeds.svelte`, `SortableTable.svelte`).

`vitest run dbStructure armourCoverage itemRules gearSorting armourChain bootsAndStealth
equipCarryLoad` — 7 files, 112 tests, 0 failures.

`RUN_AUDITS=1 vitest run armourStyleAudit styleMatchups carryCapacityAudit` — these three are
the only audit suites that equip a changed item. 3 files, 6 tests, 0 failures; the two combat
suites take 667s and 1515s on one fork. A first attempt at all three together died with exit
144 partway through `styleMatchups` — another agent's `pkill -f vitest`, not this branch — so
I re-ran `armourStyleAudit` and `styleMatchups` individually and both exited 0.
`combatBalanceAudit` is not in this set: it fails on `main` too, bisected by the coordinator
to `1cfca876`'s barefoot movement factor.

**The new coverage block has teeth.** I flipped `copper_scale_gloves` from `medium` to
`heavy`, which removes medium's only copper-age hands piece. Exactly one of the 22 tests
failed — `copper: medium armour covers all six regions without borrowing another class` —
and no other. Reverted.

**Stiffness, real sim, A/B on one scenario.** `HeadlessSession`, a drafted pawn in the iron
mail kit against an `orc_reaver`, 10 seeds, everything identical but the four
`movementPenalty` values:

| | worn stiffness | ticks | injuries taken |
|---|---|---|---|
| `0.0` (pre-branch) | 0.000 | 49,220 | 16 |
| `0.02` (branch) | 0.080 | 50,820 | 21 |

Direction matches the mechanism — 8% off dodge means more swings land. Ten duels is a small
sample and the blood-remaining totals (346.8% → 354.8%) move the other way, so injuries taken
is the signal here, not blood.

**All six changed pieces reach the sim.** Reading `movementPenalty` back off the pawn
equipment `buildScenario` built, not off the data file: a medium iron kit sums to 0.080 with
any of `mail_coif`, `spangenhelm` or `kettle_hat` in the head slot, against 0.000 for the
light iron-age equivalent (`wolf_head`, `wolf_gloves`, `wolf_bracers`, `wolf_greaves`). That
is the separation the issue asked for.

**Medium hands and feet craft and equip.** `HeadlessSession`, anvil, 6 pawns, 1200 ticks:
`iron_bar` 30→26, `buckskin` 20→17, `iron_gauntlets` 0→1, `iron_shod_boots` 0→1, worn into
`gloves` and `boots`.

**The runed shield crafts and equips.** `HeadlessSession`, runecarver bench, 2400 ticks:
`magic_alloy_bar` 9→6, `rune_graven_kite` 0→1, worn into `offHand`. `armourChain.test.ts`
filters `armorType === 'shield'` out of the exhaustive craft-card case and none of its three
headless cases craft a shield, so no off-hand piece had ever been driven by pawns.

## Verifying the fixer's three claims

**Medium has a hands and feet line — true, but not "landed after the issue was filed".** The
pieces are `copper_scale_gloves`/`copper_scale_shoes` (commit `230e0389`, 2026-08-21),
`boar_gloves`/`boar_boots`, `munition_half_plate_gloves`/`_boots` and
`rune_stitched_gloves`/`_boots` (`ee5cbae4`, 2026-08-18), and `iron_gauntlets`/
`iron_shod_boots` (`74092894`, 2026-07-15). Every one predates the issue's `created:
2026-08-25`. The issue was filed against a state that already had them.

I checked coverage through both age paths, because they disagree about what "ungated" means:

- the coverage test's path — `researchRequired` mapped to an age index — gives medium all six
  regions cumulatively from copper on.
- `gearDb.ageOf`, which is what the `/gear-db` grid renders, gives medium one piece of its own
  per region per age with no gap: head Copper/Bronze/Iron/Steel/Runed, torso
  `copper_scale_shirt`/`boarhide_jerkin`/`croc_scale_cuirass`/`munition_breastplate`/
  `rune_stitched_lamellar`, and the same for arms, hands, legs and feet.

"Neck" is not a slot. `SLOT_COVERAGE.head` lists `neck` among the parts a head piece protects,
and `armourCoverage.test.ts` already asserts it.

**`rune_graven_kite` exists — true, and also predates the issue.** Tier 4, recipe
`make_rune_graven_kite` at the runecarver bench gated on `runic_inscription`, sitting directly
after `make_steel_heater_shield`. Both the item and the recipe landed in `230e0389`,
2026-08-21. So the issue's evidence line — "no tier-4 entry" — was already wrong when written.

**The steel shield line citation is stale — true.** `recipes.jsonc` is 7365 lines;
`make_steel_heater_shield` is at line 7263. The cited line 7504 does not exist.

## Remediation

Done:

- iron-age medium `movementPenalty` band — the branch's four pieces plus `spangenhelm` and
  `kettle_hat`.
- the coverage test extended past "the region can be covered", and shown to fail on an
  introduced medium hole.
- headless-verified one piece per line: medium hands, medium feet, and the runed shield.

Not done:

- **author the medium neck/hands/feet line** — stale. The line exists at every age from copper
  to runed and predates the issue by four days to six weeks. Nothing to author.
- **author a runed-tier shield** — stale. `rune_graven_kite` predates the issue by four days.

## Limits of what I am ticking

The new coverage block derives a piece's age from `researchRequired` alone, so a recipe with
no research gate counts as age 0 and satisfies every age above it. `gearDb.ageOf` instead
walks the ingredient chain, which puts `boarhide_jerkin` at Bronze and `croc_scale_cuirass` at
Iron. No cell currently rests on an ungated piece as its earliest entry — medium torso is held
at copper by `copper_scale_shirt`, which is research-gated — so the block's verdicts are
correct today. A future ungated piece would paper over a hole without failing it, which is the
shape of defect the block was written to catch.

## Unfiled defects

- `iron_nasal_helm` (heavy, iron) carries `movementPenalty: 0.0` while every other iron-age
  heavy piece is `0.05`. With the medium band now at `0.02`, the iron head slot has medium
  costing more dodge than heavy. Pre-existing; the branch makes it visible. Not fixed.
- `great_bone_helm`, `great_bone_vambraces`, `great_bone_gauntlets` and `great_bone_greaves`
  omit `movementPenalty` entirely. `wornStiffness` reads `?? 0`, so a full heavy bone kit is
  free to wear. Not fixed.

## A headless setup note

`make_iron_gauntlets` and `make_iron_shod_boots` carry a `dynamicRecipe` leather slot on top
of their `inputs`. A scenario that stocks the listed inputs but no leather leaves
`autoSelectIngredients` returning `null`, so `resolveActiveCost` returns `null`, the order
sits at `pending: true` forever and every pawn reads `Idle` with nothing logged. That is what
my first run hit; it is the scenario, not a defect.

## Review it

```bash
git diff main...fix/armour-coverage-holes          # the whole change
git log --oneline main..fix/armour-coverage-holes  # what it committed
```

Take it, or drop it:

```bash
git merge --no-ff fix/armour-coverage-holes     # take it
git branch -D fix/armour-coverage-holes          # drop it
```

## Facts

| | |
|---|---|
| issue | [`docs/issues/review/armour-coverage-holes.md`](../issues/review/armour-coverage-holes.md) |
| severity | medium |
| raised by | a person |
| files changed | 2 |
| verified | re-verified on the branch; see the account above |

<details><summary>files</summary>

- `rc/lib/game/database/items/items.jsonc`
- `src/tests/game/database/armourCoverage.test.ts`

</details>

_Account written after re-running the verification on the branch._
