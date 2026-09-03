---
id: mana-crystal-dead-end
status: open
branch: fix/mana-crystal-dead-end
created: 2026-08-27
updated: 2026-08-27
issue: mana-crystal-dead-end
base: main
verified: pass
---
# fix: mana_crystal is a dead-end drop and make_ash is shadowed by two byproduct producers

> **Related:** [issue](../issues/review/mana-crystal-dead-end.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/mana-crystal-dead-end` is committed and green. The branch is pushed to origin.

## What it reports doing

# fix: mana_crystal is a dead-end drop and make_ash is shadowed by two byproduct producers

## What the branch changes

One added test in `src/tests/game/services/recipeService.test.ts`, 19 lines. No production
code, no data.

`RecipeService.getRecipeForItem(itemId)` returns `producedBy.get(itemId)?.[0]` — the first
recipe in declaration order that lists the item among its outputs. A crafting card for an item
therefore resolves to whichever recipe was declared first, which need not be the recipe
authored for that item. `make_ash` outputs `ash`; `burn_charcoal` (line 33 of `recipes.jsonc`)
emits `ash` as a byproduct and is declared ~960 lines earlier, so the ash card reaches
charcoal-burning and `make_ash` is unreachable.

The test walks `recipes.jsonc` for ids matching the `make_<itemId>` convention where
`<itemId>` is a real item and appears in that recipe's outputs, and asserts
`getRecipeForItem(itemId)` returns that same recipe. `make_ash` is carried in a
`knownDeferredShadows` set.

## Verified

- `pnpm vitest run src/tests/game/services/recipeService.test.ts` — 7 passed.
- `pnpm vitest run` over recipeService, recipeDiscipline, jobCraftByproducts, fuelRules,
  itemReferences, itemRules, dbStructure — 97 passed across 7 files.
- `pnpm check` — 0 errors, 10 warnings, 890 files. See the vite.config defect below: the
  command cannot run in a git worktree as shipped; this figure is from a temporary local edit
  to `findGitRoot`, reverted.
- `AUDIT_SUITES` (`vitest.config.ts:47-59`) are weapon/armour/combat balance suites. Nothing
  in them touches the recipe registry, so `RUN_AUDITS=1` was not run.
- Unit test only. Nothing behavioural changed, so there is no tick delta to report and no
  headless run was done.

### Coverage of the new test, measured

Instrumented the loop, ran it, reverted the instrumentation.

- 774 recipes in `recipes.jsonc`, 560 with a `make_` prefix, 535 reach the assertion.
- Exclusion removed → 1 failure: `make_ash does not own the card for "ash"; resolves to
  burn_charcoal`. It is the only shadow among the 535, which confirms the fixer's claim.
- Exclusion restored, second shadow injected by adding `"tallow": 1` to `burn_charcoal`'s
  outputs → 1 failure: `make_tallow does not own the card for "tallow"; resolves to
  burn_charcoal`. Reverted. `knownDeferredShadows` is a set of one literal id, not a pattern;
  a new shadow fails the test rather than being swallowed.

### Blind spot in the new test

25 of the 560 `make_*` recipes are skipped because the text after `make_` is not an item id —
the convention does not hold for them. A shadow on any of their outputs would not be caught:

- butchery cards named for the animal, e.g. `make_dire_wolf` → `wolf_meat` + 5 byproducts
- cards whose output is named differently, e.g. `make_scale_cuirass` → `croc_scale_cuirass`,
  `make_brigandine_coat` → `iron_plated_jack`, `make_confit` → `confit_meat`

The other guard in the test (`ownedItemId in r.outputs`) never fires on current data.

## Changed on top of the fixer's work

Nothing. The branch is one commit, `830c5525`, already pushed to
`origin/fix/mana-crystal-dead-end`; local and remote heads match.

## Remediation items not done

- Item 1, fold both into the runic / magic-reagent redesign — deferred by the issue's
  `## Out of scope`: "Doing either fix now. Both are deliberately deferred to the reworks that
  own them."
- Item 2, give `mana_crystal` a consumer chain or remove it with its vent — same deferral, and
  the item's own text conditions it on "when that pass runs".
- Item 3, resolve `make_ash` under the ash-economy pass — same deferral.

## Unfiled defects found

**`vite.config.ts` `findGitRoot` fails in every git worktree.** Lines 7-13 accept a directory
only when `.git` is a directory; in a worktree `.git` is a file, so the walk reaches `/` and
line 123 reads `/package.json`. `pnpm check` then reports 110 identical `ENOENT ... '/package.json'`
errors and exit 1 for reasons unrelated to any branch. Dropping `&& fs.statSync(gitPath).isDirectory()`
gives 0 errors. Line 138 feeds the same value to `server.fs.allow`, so `pnpm dev` in a worktree
serves with the filesystem root allowed. Not fixed — out of this branch's scope.

**Recipe ids that name an item that does not exist.** `make_brigandine_coat` outputs
`iron_plated_jack` and `make_scale_cuirass` outputs `croc_scale_cuirass`. Whatever surfaces a
recipe by id will read as the wrong garment. Not fixed.

## Review it

```bash
git diff main...fix/mana-crystal-dead-end          # the whole change
git log --oneline main..fix/mana-crystal-dead-end  # what it committed
```

Take it, or drop it:

```bash
git merge --no-ff fix/mana-crystal-dead-end     # take it
git branch -D fix/mana-crystal-dead-end          # drop it
```

## Facts

| | |
|---|---|
| issue | [`docs/issues/review/mana-crystal-dead-end.md`](../issues/review/mana-crystal-dead-end.md) |
| severity | low |
| raised by | a person |
| files changed | 1 |
| verified | re-verified on the branch; see the account above |

<details><summary>files</summary>

- `rc/tests/game/services/recipeService.test.ts`

</details>

_Account written after re-running the verification on the branch._
