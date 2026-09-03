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

> **Related:** [issue](../issues/review/recipe-derived-weight-defects.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/recipe-derived-weight-defects` is committed and green. The branch is pushed to origin.

## What it reports doing

# fix: recipes that derive absurd item weights

`fix/recipe-derived-weight-defects` — commit `d9d6dca3` on top of the fixer's `181a66f6`, pushed to `origin`.

## What the branch changes

Five recipes in `src/lib/game/database/items/recipes.jsonc`.

- `make_copper_dagger` `{copper_bar 1, medium_bones 1} → 1` becomes `{copper_bar 1, medium_bones 2} → 6`.
- `make_sewing_kit` `{iron_bar 1, category:thread 1} → 1` becomes `{iron_bar 1, category:thread 2} → 8`.
- `make_steel_stiletto` `{category:steel 1, category:leather 1} → 1` becomes the same inputs `→ 10`.
- `make_wattle_buckler` `branch` 4→11, `cordage` 8→20.
- `make_wicker_vest` `branch` 15→8, `cordage` 120→60.

A bar is stock several pieces are cut from, so the bar stays whole and the recipe yields the batch — the shape `make_iron_nail` (1 bar → 300 nails), `make_steel_bodkin_arrow` (1 bar → 10 arrows) and `make_pilum` (1 bar → 2) already use. Work amounts are unchanged, matching those recipes, which do not scale work with batch size.

## The fixer's mechanism did not work

The fixer's commit priced ten recipes at a fraction of a bar (`copper_bar: 0.1`, `category:steel: 0.1`, `gold_bar: 0.05`). Two defects, both found in the sim, neither visible to the tests it wrote — those tests read the authored number, not what a craft consumes.

- **A fractional `category:` quantity does nothing.** `ItemService.expandCategoryCost` (`src/lib/game/services/ItemService.ts:419`) takes `Math.ceil(need / worth)`, so `category:steel: 0.1` reserves one whole bar. Headless, 800 ticks, one stiletto queued: `crucible_steel` 10→9. The stiletto cost exactly what it cost before the fix.
- **A fractional direct id leaves float dust.** Headless, 48000 ticks, twelve daggers queued off one bar at `copper_bar: 0.1`: ten crafted and `copper_bar` settled at `1.3877787807814457e-16`, held as a stored dropped item. Nothing clears it — `reserveForOrder` (`src/lib/game/core/state/stockpile.ts:155`) only skips a drop at `quantity <= 0`. Every fractional recipe leaves one such stack per bar spent.

## The seven amulets are reverted

`gold_bar`/`silver_bar` are back at 2, as on `main`. A gold bar is 4 kg and an amulet 0.15 kg, so a whole-bar batch would have to yield about 27 amulets, and 54 attuned gems to feed it. There is no smaller gold input in the database: `native_gold` is 5 kg of ore, and there is no gold wire or leaf. The seven amulets also sit beside nine gold recipes with the same ratio and no issue against them — `make_ruby_ring` derives 4.10 kg into a 0.10 kg ring (41×), `make_filigree_diadem` 19×, `make_bronze_torc` 12×, `make_silver_pendant` 10×. Repricing the amulets alone makes an amulet a twentieth of the cost of the ring next to it. That is a design call, not a defect fix.

## Derived mass, through the data

Derived per output unit = Σ(input mass) × process retention ÷ output count, resolving a `category:` key to the pool's median kg-per-craft-value — which is what `expandCategoryCost`'s `take × worth` actually spends. Retention from `ITEM-RULES` Gate 3e: forging 0.82, basketry 0.46, joinery 0.72.

| recipe | outputs | raw | derived/piece | authored | ratio |
|---|---|---|---|---|---|
| `make_copper_dagger` | 6 | 5.00 kg | 0.68 kg | 0.50 kg | 1.37× |
| `make_sewing_kit` | 8 | 4.10 kg | 0.42 kg | 0.40 kg | 1.05× |
| `make_steel_stiletto` | 10 | 5.36 kg | 0.44 kg | 0.30 kg | 1.47× |
| `make_wattle_buckler` | 1 | 4.30 kg | 1.98 kg | 2.00 kg | 0.99× |
| `make_wicker_vest` | 1 | 5.40 kg | 2.48 kg | 2.50 kg | 0.99× |
| the seven amulets | 1 | 8.20 kg | 8.20 kg | 0.15 kg | 54.67× |

The fixer's two withy figures (~1.98 kg, ~2.48 kg) check out against the data. The amulet row is what reverting costs and is unfixed.

## The issue's premise about carry weight is wrong

`ItemService.getCurrentCarryLoad` reads `def.weightKg × inst.matWeight` (`ItemService.ts:637`); `matWeight` comes from `aggregateMaterialMods` over the materials a craft actually used, not from summing ingredient masses. No code anywhere derives an item's weight from its recipe — the only occurrences of a retention constant in the repo are `ITEM-RULES.md` and the test added here. The authored weights were already sane (`steel_stiletto` 0.3 kg, `copper_dagger` 0.5 kg, `ruby_amulet` 0.15 kg), so no player was ever carrying 4.8 kg of stiletto. The defect is real but it is an economy defect: a 0.3 kg blade costing a 4 kg bar. The issue's carry-budget framing does not hold.

## Tests

`src/tests/game/database/itemRules.test.ts` — R23 rewritten. The fixer's three assertions read the authored number (`inputs[key] >= 1`) and would have passed on a recipe that consumes a whole bar anyway, which is what the stiletto did.

- a bow with a recipe consumes real wood (kept from the fixer; passes on all bows).
- a repriced recipe derives a per-piece mass inside 0.6×–1.5× of the piece's own `weightKg`.
- no repriced recipe spends more than half a bar per piece it makes.
- **no recipe input is a fraction of a countable solid** — the rule that would have caught the fixer's mechanism. Fluids are exempt; they are already fractional by design.

`src/tests/game/services/recipeWeightFix.test.ts` — rewritten as two headless regressions with exact assertions rather than `> 0`.

## What was run

```
pnpm check                                          891 files, 0 errors, 10 warnings (pre-existing, unrelated files)
pnpm vitest run  (full suite)                       185 files, 1341 passed, 0 failed
  database + recipe + craft suites, named           15 files, 121 passed
RUN_AUDITS=1 buildFit/carryCapacity/t4Weapon        3 files, 12 passed
```

`pnpm check` needs `vite.config.ts:7-13` patched to run in a worktree at all (`findGitRoot` demands `.git` be a directory; in a worktree it is a file). Patched locally, run, reverted; not committed.

Headless, `HeadlessSession` over real ticks:

- 800 ticks, 6 pawns at `stone_forge` + `anvil`: `copper_bar` 4→3, `crucible_steel` 4→3, `iron_bar` 4→3 → 6 daggers, 10 stilettos, 8 sewing kits. Every stockpile entry a whole number.
- 1600 ticks, 6 pawns at `craft_spot`: `branch` 40→21, `cordage` 200→120 → 1 vest, 1 buckler. Equipping both moves the pawn's carry load 0.00 kg → 4.50 kg, the sum of the two authored weights.

## Remediation

Done:

- **Fractional bar cost or multi-output yield** — multi-output, verified in the sim.
- **`wicker_vest` and `wattle_buckler`** — the fixer's numbers, confirmed against the data at 0.99× each.
- **Headless-verify the carry budget** — 1600 ticks, 0.00 → 4.50 kg.

Not done:

- **Add the missing wooden stave to the three bows** — stale. All three carry wood on `main`: `make_self_bow` `branch: 3` plus a `stave` slot (`recipes.jsonc:2258`), `make_war_bow` and `make_hunting_recurve` a `category:log` input plus a `stave` slot (`recipes.jsonc:2655`, `2708`). None derives 0.09 kg; `make_self_bow` derives 0.79 kg against an authored 0.80 kg.
- **Reprice the seven jewellery recipes** — reverted, reasons above. A person decides whether the whole gold line moves.
- **A test bounding each item's derived mass against a per-category plausible range** — not written. Over the 719 single-output recipes with a weighed output, 542 fall outside 0.6×–1.5× and 219 exceed 4×, including legitimate mass-losing processes (`make_hard_cheese` 11.4×, `tan_vermin_hide` 13.6×) that Gate 3e explicitly exempts. A DB-wide bound needs a per-process retention table and a debt list, which is its own pass. The narrow version — the bow-wood rule and the per-piece bound on the repriced recipes — is in.

## Unfiled defect

`make_war_bow` and `make_hunting_recurve` each consume two pieces of wood for one stave: a `category:log` input plus a `dynamicRecipe` stave slot that also takes wood, and `ItemService.ts:483` adds the slot cost on top of the base cost rather than merging it. Headless, 800 ticks: one war bow took `oak_log` 20→18. Both derive 2.23 kg into a 1.0 kg and a 0.9 kg bow, where `make_self_bow`, which has only the stave slot, derives 0.79 kg into a 0.8 kg bow. Written up at `/home/ubuntu/fx-verify/NEW-ISSUE-bow-double-wood.md`, `ready: false`. Not fixed.

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
| issue | [`docs/issues/review/recipe-derived-weight-defects.md`](../issues/review/recipe-derived-weight-defects.md) |
| severity | medium |
| raised by | a person |
| files changed | 3 |
| verified | re-verified on the branch; see the account above |

<details><summary>files</summary>

- `rc/lib/game/database/items/recipes.jsonc`
- `src/tests/game/database/itemRules.test.ts`
- `src/tests/game/services/recipeWeightFix.test.ts`

</details>

_Account written after re-running the verification on the branch._
