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

> **Related:** [issue](../issues/mana-crystal-dead-end.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/mana-crystal-dead-end` is committed and green. Nothing has been pushed anywhere.

## What it reports doing

## Summary

The Remediation list has four items. Items 1–3 (deciding `mana_crystal`'s fate, resolving `make_ash`'s shadow) are the two fixes the issue's **Out of scope** section explicitly defers to the runic/magic-reagent and ash-economy redesigns — I left `recipes.jsonc` untouched. Only item 4 was actionable now: a regression test so the next shadow fails loudly instead of shipping silently.

**Changed:** `src/tests/game/services/recipeService.test.ts` — added `'a recipe owning a crafting card is the recipe that card resolves to'`. It walks every authored recipe whose id follows the `make_<itemId>` convention (the naming pattern that ties a recipe to the item's own crafting card), and asserts `getRecipeForItem(itemId)` resolves back to that same recipe — i.e. no earlier-declared recipe with the same output shadows it. I confirmed by hand (scripted probe over the raw JSONC, then via the real `RecipeService`) that `make_ash` is the only recipe currently shadowed this way, so it's carried as a named, explicit exclusion (`knownDeferredShadows`) rather than silently passing — the moment a *second* card gets shadowed, this test fails without needing an update.

Not done: giving `mana_crystal` a consumer chain or removing its vent, and dispatching/deleting `make_ash` — both out of scope per the issue, deferred to the redesigns that own them.

**Verification:**
- `pnpm check` — 0 errors (10 pre-existing a11y/CSS warnings, unrelated to this change)
- `pnpm test:related src/tests/game/services/recipeService.test.ts` — 7 passed, including the new test

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
| issue | [`docs/issues/mana-crystal-dead-end.md`](../issues/mana-crystal-dead-end.md) |
| severity | low |
| raised by | a person |
| files changed | 1 |
| verified | `check` + `test:related` green |

<details><summary>files</summary>

- `rc/tests/game/services/recipeService.test.ts`

</details>

_Written unattended by `tools/audit/fix.mjs`. The branch is local; nothing was pushed._
