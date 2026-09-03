---
id: caster-weapon-line-age
status: open
branch: fix/caster-weapon-line-age
created: 2026-08-27
updated: 2026-08-27
issue: caster-weapon-line-age
base: main
verified: pass
---
# fix: Every staff, rod and scepter is carved on a runed bench while claiming tier 1-3, so the caster has no progression

> **Related:** [issue](../issues/review/caster-weapon-line-age.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/caster-weapon-line-age` is committed and green. The branch is pushed to origin.

## What it reports doing

# fix: the caster weapon line is filed in the age its chain can actually reach

`chainAgeOf` (`src/lib/dev/chainAge.ts`) prices an item by walking its recipe chain and taking
the latest `ageTier` of any station on the way. R4 in `itemRules.test.ts` fails when that age
exceeds `AGE_CEILING[tier]` — `[0, 2, 3, 4, 5]`, so tier 1 may reach bronze, tier 3 steel, tier 4
runed. Thirteen elemental casters declared tier 1-3 while every chain ended at a runed station,
and fourteen ids sat on `R4_DEBT` so the suite stayed green.

## What the branch changes

**Re-tiers thirteen elemental casters to 4**, matching the station each recipe already names:
`cinder_rod`, `hoarfrost_rod`, `storm_rod`, `ember_staff`, `frost_staff`, `spark_staff` at
`runecarver_bench` (`runed:1`); `emberglass_scepter`, `rimeglass_scepter`, `stormglass_scepter`,
`pyre_staff`, `rime_staff`, `tempest_staff`, `manaforge_greatstaff` at `attunement_altar`
(`runed:2`).

**Re-tiers `great_bone_maul` 2 → 4.** Its own recipe is at the primitive `bone_carvers_bench`;
the runed station is one step back — `great_bone` comes only from `flense_great_bear` at the
`sanguinary_altar` (`runed:1`), which is chain age 5. The Great Bear's creature tier puts its R2
band at 4. Both debts clear on the one re-tier, as the issue predicted.

**Adds three one-handed caster rods** to hold the vacated rungs, plain material names, recipes
asking a haft, a cut gem and the age's metal:

| item | tier | station | chain age |
|---|---|---|---|
| `copper_rod` | 1 | `casting_hearth` (`bronze:1`) | bronze |
| `iron_rod` | 2 | `anvil` (`iron:1`) | iron |
| `steel_rod` | 3 | `anvil` | steel, via `faceting_lathe` for `cut_sapphire` |

**Empties `R2_DEBT` and `R4_DEBT`.** The stale-entry tests now have nothing to exempt.

## What I changed on top of the fixer's work

**The three new rod recipes declared `researchRequired: "arcane_lapidary"`, copied from
`cinder_rod`.** `gearDb.ageOf` matches `researchRequired` against
`/rune|runic|arcane|attunement|manaforge|lapidary/` and returns `Runed` before it ever looks at
the chain, so all three new rods filed under Runed — beside the very items they were authored to
precede. The caster grid was unchanged by the fix:

```
Battlemage (1H Staff)   before and after fixer:  Bronze 0  Iron 0  Steel 0  Runed 9
```

Set to `bronze_working` / `iron_working` / `steel_making` — the same researches the three
correctly-laddering staves at those same two stations already declare (`bronze_capped_staff` at
`casting_hearth`, `iron_shod_staff` and `steel_shod_longstaff` at `anvil`). After:

```
Bronze 2  Iron 2  Steel 2  Runed 14      (each early age: one Stunwaller staff + one Battlemage rod)
```

**`casterRodChain.test.ts` ran every scenario at `researchMaxTier: 9`**, which unlocks all
research, so it proved the recipe works and nothing about reachability at an age — the whole
subject of the issue. Tightened to `1` for the Copper Rod and `2` for the Iron and Steel Rods.

**`dbStructure.test.ts` had never been run on this branch and held two failures.** Both are
consequences of the re-tier, and both are fixed in the data:

- *Boss gear is runed work.* At tier 4 with a boss part in its chain, `great_bone_maul` files as
  Boss, and `dbStructure` requires every boss piece to be cut at a runed station. Its recipe sat
  at the primitive `bone_carvers_bench` while its two siblings from the same carcass,
  `make_great_fang_javelin` and `make_great_fang_dirk`, are `bonecarving` at `runecarver_bench`,
  and the whole `great_bone` armour set is at `runic_loom`. Moved to `runecarver_bench`.
  `alchemyChain.test.ts` §B then needed that bench in its scenario — its subject is that
  `great_bone` is not a dead drop, not where it is worked, so the building list changed and the
  assertions did not.
- *Unfastened hafts.* `UNFASTENED_HAFTS = 72` is a ratchet that may only shrink. The three new
  rods hang a gem on a haft with nothing holding it, taking it to 75. Each now takes
  `category:fastener: 2`, the same line `ember_staff` (6) and `make_great_fang_javelin` (5)
  carry. Back to 72.

## Verified

- `pnpm check` — **0 errors, 10 pre-existing warnings, 891 files.** Requires a local patch to
  `findGitRoot` in `vite.config.ts:7-13`, which accepts `.git` only as a directory; in a worktree
  it is a file, so the walk reaches `/` and reads `/package.json`. Unpatched: 110 `ENOENT` errors,
  identical with and without this change. The patch is not committed.
- `pnpm vitest run` (default suite) — **1338 passed across 185 files, 0 failures.** `main` is
  1335 across 184; this branch adds `casterRodChain.test.ts` and its three tests.
- `pnpm vitest run` on `dbStructure`, `itemRules`, `gearSorting`, `armourCoverage`,
  `casterRodChain` — **92 passed across 5 files.**
- `RUN_AUDITS=1` on `t4WeaponAudit` and `buildFitAudit`, the two audits that read `tier` and
  build coverage — **10 passed across 2 files, 792 s**, and `t4WeaponAudit` again after the
  station and fastener changes — **7 passed, 677 s**, sweeping 135 combat traits × 27 weapons ×
  3 opponent profiles.
- Not run: `weaponMeta{None,Light,Medium,Heavy}`. Their harness sweeps a hard-coded list of
  fourteen steel melee ids (`weaponMetaHarness.ts:45-62`) and reads no `tier`. No rod, staff or
  scepter is in it, so they cannot exercise this change.
- Headless, `HeadlessSession` over real ticks, one rung per age, six pawns, needs off:
  - bronze colony (research tier ≤ 1): **800 ticks, `copper_bar` 10→9, `copper_rod` 0→1, worn
    `offHand=copper_rod`**
  - iron colony (≤ 2): **800 ticks, `iron_bar` 10→9, `iron_rod` 0→1, worn `offHand=iron_rod`**
  - steel colony (≤ 2): **800 ticks, `bloom_steel` 10→9, `steel_rod` 0→1, worn
    `offHand=steel_rod`**
- The research gate bites, checked by driving it the other way: the same bronze scenario at
  research tier ≤ 0 produced **0 rods in 6400 ticks**, against 1 in 800 at tier ≤ 1.

## Remediation

All five items done. None deferred, none stale.

## Unfiled, found while verifying

- **`equipPawnItem` equips an item the colony does not have.** In the tier-0 probe the stockpile
  held zero `copper_rod` and the command still put one on the pawn: `copper_rod=undefined ...
  worn offHand=copper_rod`. The command checks no stock before binding the item.
- **`gearDb.ageOf` files every recipe gated on `arcane_lapidary` as Runed.** That research is
  tier 1 with a tier-0 prerequisite and unlocks the `bronze:1` `lapidary_bench`; the runed magic
  ladder above it is `attunement` (tier 2) and `runic_inscription` (tier 3). Every cut gem
  inherits the misfile, and `gearSorting.test.ts:17` carries the same claim in `AGE_BY_RESEARCH`.
  Working around it per-recipe, as here, does not fix it.
- **`War-Caster (2H Staff)` has no row before Runed.** The bronze, iron and steel shod staves the
  issue names as the correctly-laddering line classify as `Stunwaller (2H Staff)`, because
  `gearDb` routes on `weaponProperties.arcane` and those three do not set it. Out of this issue's
  scope, which asks for one rod or stave per vacated age.

## Review it

```bash
git diff main...fix/caster-weapon-line-age          # the whole change
git log --oneline main..fix/caster-weapon-line-age  # what it committed
```

Take it, or drop it:

```bash
git merge --no-ff fix/caster-weapon-line-age     # take it
git branch -D fix/caster-weapon-line-age          # drop it
```

## Facts

| | |
|---|---|
| issue | [`docs/issues/review/caster-weapon-line-age.md`](../issues/review/caster-weapon-line-age.md) |
| severity | high |
| raised by | a person |
| files changed | 4 |
| verified | re-verified on the branch; see the account above |

<details><summary>files</summary>

- `rc/lib/game/database/items/items.jsonc`
- `src/lib/game/database/items/recipes.jsonc`
- `src/tests/game/database/itemRules.test.ts`
- `src/tests/game/services/casterRodChain.test.ts`

</details>

_Account written after re-running the verification on the branch._
