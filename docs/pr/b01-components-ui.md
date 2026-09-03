---
id: b01-components-ui
status: open
branch: fix/b01-components-ui
created: 2026-08-27
updated: 2026-08-27
issue: b01-components-ui
base: main
verified: pass
---
# fix: Raw data id rendered in the UI — components/UI

> **Related:** [issue](../issues/review/b01-components-ui.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/b01-components-ui` is committed and green. The branch is pushed to origin.

## What it reports doing

# fix: Raw data id rendered in the UI — components/UI

Two places in `src/lib/components/UI/canvas/GameCanvas.svelte` built a player-facing
label out of a resource id instead of the resource's `displayName`.

The similar-selection HUD is armed only by `startSimilarSelect`, which returns early
unless `selectedResourceDef` — `resourceObjectService.getById(selectedResourceTile.resourceId)` —
is non-null. The id and the def come from the same tile, so at the moment the HUD can
exist the display name is already known. It is captured there into `similarDragDisplayName`
and the markup renders that, so there is no lookup at render time and nothing to fall
back to. `displayName` is a required `string` on `ResourceObjectDef`; all 111 rows in
`resources.jsonc` carry one and none is id-shaped.

The resource selection card's first line used `selectedResourceTile.resourceId.replace(/_/g, ' ')`
while `selectedResourceDef` was in scope and already guarded non-null three lines above.
It now uses `selectedResourceDef.displayName`. 48 of the 111 resources have a display
name the id does not spell: `deep_grass_patch` is "Deep Grass", `heartwood_grove` is
"Heartwood Tree", `barrow_cache` is "Barrow Mound".

`tools/audit/lib/extract.mjs:115` — the `handRolledHumanizer` flag matched only
`.replace('_', …)` with a string argument. Two files in `src` are written that way.
The form the repo actually uses, `.replace(/_/g, ' ')`, appears in 23 files and never
raised a candidate. The flag now matches both; it fires on 25 files where it fired on 2.
B01 stays T2 — the flag widens the candidate set, it does not decide.

## Verified

- `pnpm check` — 890 files, 0 errors, 10 warnings, 4 files with problems. All ten
  warnings are a11y and unused-selector notices in `hud/SelectedEntityCard.svelte`,
  `hud/ActivityLogOverlay.svelte`, `pawn/PawnNeeds.svelte` and `dev/SortableTable.svelte`,
  none of them touched here.
- `pnpm vitest run src/tests/game/services/resourceGen.test.ts src/tests/game/services/farmingSoil.test.ts src/tests/game/systems/woundRecovery.test.ts`
  (`VITEST_MAX_FORKS=2`) — 3 files, 35 tests, 0 failures. Those are the suites that load
  the resource-object defs and the one suite that imports `canvas/selectionCard`.
  No test file imports `GameCanvas.svelte`; the full suite cannot exercise this change.
- `pnpm test:related src/lib/components/UI/canvas/GameCanvas.svelte tools/audit/lib/extract.mjs`
  — "No test files found, exiting with code 0". Zero tests ran. This is the harness gap
  the branch was written up against, reproduced.
- The app, run and driven. `./dev.sh --browser --debug --port 5401`, Chromium headless
  shell 147 with `--use-angle=swiftshader` (headless Firefox on this machine reports
  `WEBGL2 false` — "Exhausted GL driver options" — and the game renders "WebGL unavailable"
  instead of a map, so Firefox cannot reach this HUD at all). Clicked a map tile, read the
  selection card, clicked MARK, screenshotted the HUD and viewed it. With `deep_grass_patch`
  selected the card reads `Deep Grass — ×5 nodes` and the HUD reads
  `[⊞ SELECT DEEP GRASS] — drag to designate all · Esc cancel`. Before the change those
  two lines read `deep grass patch — ×5 nodes` and `[⊞ SELECT DEEP GRASS PATCH]`.
  The HUD fits one line; the markup reflow did not wrap it.
- The widened flag, run: `computeFlags` over `walkFiles('src', ['.ts','.svelte'])`
  returns `handRolledHumanizer` for 25 files, 5 of them under `components/UI`.

## On top of the fixer's work

The fixer's change kept `?? similarDragResourceId` and uppercased it. That branch is
unreachable — the only assignment to `similarDragMode = true` sits behind the same lookup
— and reaching for it would render an internal identifier, which the repo forbids. Removed
rather than made less frequent.

The fixer's sweep note claimed every other `.replace(/_/g, …)` under `components/UI`
"already calls a display-name lookup and only falls back when the lookup misses". Four of
the twelve sites have no lookup at all:

- `canvas/GameCanvas.svelte:763` — the resource card line, fixed here.
- `canvas/BuildingInfo.svelte:115` — `bDef.storageFilter.map((c) => c.replace(/_/g, ' '))`.
- `canvas/BuildingInfo.svelte:161` — the refund line, over `Object.entries(bDef.buildingCost)` item ids.
- `tooltip/BuildingStatTooltip.svelte:51` — a local `humanize` applied to `building.effects`
  field names and to `building.category`.

The fixer's account of the mechanical check was also wrong: it said the `handRolledHumanizer`
detector "already exists — it's what routes candidates into this T2 rule for judgment". It
does not match the cited site's code. B01 must have fired on `GameCanvas.svelte` through its
other trigger branch, `kind_in: [markup]` + `rendersIdExpression`.

## Remediation not done

- **"Fix every remaining site under `components/UI` — this is one class, one PR."** Not
  finished. The three sites above outside `GameCanvas.svelte` have no display-name source to
  look up: `storageFilter` holds item categories, `buildingCost` keys need
  `itemService.getItemById(id)?.name` and a decision about what to render when a cost id has
  no item, and `building.effects` keys are data-file field names with no label map anywhere.
  Fixing them means adding a label source, which the issue's `## Out of scope` bars
  ("Widening this PR past the citations above makes it unreviewable"). Raising them, per the
  repo rule that a missing display name gets raised rather than papered over.

## Unfiled defects

- **`vite.config.ts:7-13`.** `findGitRoot` returns a directory only when `.git` is a
  directory. In a git worktree `.git` is a file, so the walk runs to `/` and the config
  throws `ENOENT: no such file or directory, open '/package.json'`. `pnpm check` reports
  111 errors in 111 files, every one that message; `pnpm dev` and `pnpm build` fail the same
  way. Any branch verified from a worktree without patching this either did not run
  `pnpm check` there or read a run from the main checkout. Dropping the `.isDirectory()` test
  fixes it. Patched locally to get the numbers above, reverted before committing; not on the
  branch.
- **`components/pawn/TraitCards.svelte:253` (`STAT_ABBR[stat] ?? stat`) and
  `components/util/conditionInfo.ts:101` and `:104` (`GRANT_STAT_ABBR[stat] ?? stat`)** —
  a stat key with no abbreviation entry renders as the raw key. Reported to me as
  `TraitCards:247`/`:256` and `conditionInfo:95`/`:98`; the code is there, the line numbers
  are off by a few. Same class as this issue but outside `components/UI`, so its own issue
  by this issue's `## Out of scope`. Not matched by the widened `handRolledHumanizer` flag
  either — these strip a `Bonus`/`Penalty` suffix, not an underscore.

## Review it

```bash
git diff main...fix/b01-components-ui          # the whole change
git log --oneline main..fix/b01-components-ui  # what it committed
```

Take it, or drop it:

```bash
git merge --no-ff fix/b01-components-ui     # take it
git branch -D fix/b01-components-ui          # drop it
```

## Facts

| | |
|---|---|
| issue | [`docs/issues/review/b01-components-ui.md`](../issues/review/b01-components-ui.md) |
| severity | medium |
| raised by | the audit (B01) |
| files changed | 1 |
| verified | re-verified on the branch; see the account above |

<details><summary>files</summary>

- `rc/lib/components/UI/canvas/GameCanvas.svelte`

</details>

_Account written after re-running the verification on the branch._
