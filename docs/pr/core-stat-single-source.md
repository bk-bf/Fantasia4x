---
id: core-stat-single-source
status: open
branch: fix/core-stat-single-source
created: 2026-08-27
updated: 2026-08-27
issue: core-stat-single-source
base: main
verified: pass
---
# fix: The six core stats are re-declared by hand in ten rosters, nine abbreviation maps and three positional argument lists

> **Related:** [issue](../issues/core-stat-single-source.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/core-stat-single-source` is committed and green. Nothing has been pushed anywhere.

## What it reports doing

The test run (`test:related` across the core-stat files) is still executing in the background — it's pulling in a large slice of the suite since `core/types/culture.ts` is imported almost everywhere. I'll pick back up once the watcher notifies me it's done.

## Review it

```bash
git diff main...fix/core-stat-single-source          # the whole change
git log --oneline main..fix/core-stat-single-source  # what it committed
```

Take it, or drop it:

```bash
git merge --no-ff fix/core-stat-single-source     # take it
git branch -D fix/core-stat-single-source          # drop it
```

## Facts

| | |
|---|---|
| issue | [`docs/issues/core-stat-single-source.md`](../issues/core-stat-single-source.md) |
| severity | high |
| raised by | a person |
| files changed | 22 |
| verified | `check` + `test:related` green |

<details><summary>files</summary>

- `rc/lib/components/UI/canvas/selectionCard.ts`
- `src/lib/components/pawn/PawnGrowthPanel.svelte`
- `src/lib/components/pawn/PawnStatBanner.svelte`
- `src/lib/components/pawn/TraitCards.svelte`
- `src/lib/components/screens/DebugGodmode.svelte`
- `src/lib/components/screens/culture/CultureDetail.svelte`
- `src/lib/components/util/bodyLabels.ts`
- `src/lib/components/util/conditionInfo.ts`
- `src/lib/components/util/pawnBlurb.ts`
- `src/lib/components/util/statView.ts`
- `src/lib/dev/buildFit.ts`
- `src/lib/dev/gearDb.ts`
- `src/lib/game/core/types/culture.ts`
- `src/lib/game/core/types/items.ts`
- `src/lib/game/entities/Pawns.ts`
- `src/lib/game/services/PawnGrowthService.ts`
- `src/lib/game/services/PawnStatService.ts`
- `src/lib/game/systems/Combat.ts`
- `src/tests/game/core/traitRegistry.test.ts`
- `src/tests/game/core/variantLadder.test.ts`
- `src/tests/game/core/coreStats.test.ts`
- `src/tests/game/database/coreStatKeys.test.ts`

</details>

_Written unattended by `tools/audit/fix.mjs`. The branch is local; nothing was pushed._
