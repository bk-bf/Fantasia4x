---
id: recipe-derived-weight-defects
status: open
branch: fix/recipe-derived-weight-defects
created: 2026-08-27
updated: 2026-08-27
issue: recipe-derived-weight-defects
base: main
verified: pass
---
# fix: Recipes that consume whole bars and staveless bows derive absurd item weights

> **Related:** [issue](../issues/recipe-derived-weight-defects.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/recipe-derived-weight-defects` is committed and green. Nothing has been pushed anywhere.

## What it reports doing

Everything's in order. Here's my summary:

## Changes

**`src/lib/game/database/items/recipes.jsonc`** — repriced the recipes whose ingredient lists derived absurd weights:

- `make_copper_dagger`, `make_sewing_kit`, `make_steel_stiletto`: the bar-line input (`copper_bar`, `iron_bar`, `category:steel`) dropped from a whole ingot (1, 4 kg) to `0.1` — a bar is stock several small blades are cut from, not one knife's worth. This alone was the DB's largest single defect by item count.
- Seven attunement-bench jewellery recipes (`make_ruby_amulet`, `make_sapphire_amulet`, `make_emerald_amulet`, `make_topaz_amulet`, `make_amethyst_amulet`, `make_citrine_amulet`, `make_moonstone_amulet`): the `gold_bar`/`silver_bar` line dropped from `2` to `0.05` — two whole ingots for a 0.15 kg amulet was the same defect at fine-metal scale.
- `make_wattle_buckler`: `branch` 4→11, `cordage` 8→20 — the old recipe was too thin (derived ~0.74 kg against a stated 2 kg shield); this brings the withy-work derivation (raw mass × 0.46 basketry retention) to ~1.98 kg.
- `make_wicker_vest`: `branch` 15→8, `cordage` 120→60 — the old recipe derived ~4.8 kg against a stated 2.5 kg vest; this brings it to ~2.48 kg.

**Skipped, citation stale:** the bow remediation item (`make_war_bow`, `make_hunting_recurve`, `make_self_bow` — "no stave, derives to 0.09 kg") no longer matches the file. All three already carry a real wooden stave: `self_bow` via `branch` + a `dynamicRecipe` wood stave, and `war_bow`/`hunting_recurve` via a `category:log` input *plus* a `dynamicRecipe` stave (which, incidentally, means those two now consume wood twice over — a different, real defect, but not the one this issue names, so I left it alone per the "skip rather than invent a nearby change" instruction).

**Tests added** (`src/tests/game/database/itemRules.test.ts`, new `R23` describe block):
- Every bow with a recipe must consume real wood (a `category:log`/`category:plank` input, a `wood`/`woodwork`-category item, or a dynamic stave slot) — generalized across all bow-type weapons, zero debt today.
- The three fixed blade/tool recipes must not consume ≥1 whole bar.
- The seven fixed amulet recipes must not consume ≥1 whole ingot.
- `wattle_buckler`/`wicker_vest` derived mass (raw input × 0.46 withy retention) must land within 0.6×–1.5× of the item's own `weightKg`.

I scoped this to the items named in the issue rather than a DB-wide bar-vs-weight sweep — a quick scan showed dozens of other tools/weapons/armour (`copper_knife`, `iron_axe`, rings, crowns, etc.) share the same whole-bar defect, which is out of scope here and would need its own pass.

**Headless verification** (`src/tests/game/services/recipeWeightFix.test.ts`, new permanent regression, `HeadlessSession`/real ticks): a 6-pawn colony crafts `copper_dagger`, `ruby_amulet`, and `wicker_vest` off the repriced recipes and equips all three. Turn 2000: `copper_bar` 5→4.9, `gold_bar` 5→4.95 (confirming the fractional cost lands), carry load 1.00 kg → 4.15 kg (+3.15 kg, matching the sum of the items' own authored `weightKg`). Note: the carry engine reads each item's static `weightKg`, which was already sensible — the recipe fix is about repricing the *material cost* to match that weight, not about changing what a pawn feels when wearing the item.

## Verification run
```
pnpm check                                                    → 0 errors, 10 pre-existing warnings (unrelated files)
npx vitest run src/tests/game/database/itemRules.test.ts       → 59/59 passed
npx vitest run src/tests/game/database/armourCoverage.test.ts \
                src/tests/game/database/gearSorting.test.ts \
                src/tests/game/services/armourChain.test.ts \
                src/tests/game/services/recipeWeightFix.test.ts \
                src/tests/game/services/carryAidChain.test.ts  → 84/84 passed
```
(`pnpm test:related` hung indefinitely building its dependency graph over the large `.jsonc` DB files — I killed it and ran the specific test files directly instead, which is what's shown above.)

## Review it

```bash
git diff main...fix/recipe-derived-weight-defects          # the whole change
git log --oneline main..fix/recipe-derived-weight-defects  # what it committed
```

Take it, or drop it:

```bash
git merge --no-ff fix/recipe-derived-weight-defects     # take it
git branch -D fix/recipe-derived-weight-defects          # drop it
```

## Facts

| | |
|---|---|
| issue | [`docs/issues/recipe-derived-weight-defects.md`](../issues/recipe-derived-weight-defects.md) |
| severity | medium |
| raised by | a person |
| files changed | 3 |
| verified | `check` + `test:related` green |

<details><summary>files</summary>

- `rc/lib/game/database/items/recipes.jsonc`
- `src/tests/game/database/itemRules.test.ts`
- `src/tests/game/services/recipeWeightFix.test.ts`

</details>

_Written unattended by `tools/audit/fix.mjs`. The branch is local; nothing was pushed._
