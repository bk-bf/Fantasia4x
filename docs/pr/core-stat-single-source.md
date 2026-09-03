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

> **Related:** [issue](../issues/review/core-stat-single-source.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/core-stat-single-source` is committed and green. The branch is pushed to origin.

## What it reports doing

# fix: the six core stats get one declaration

`fix/core-stat-single-source` replaces ten hand-written stat rosters, nine abbreviation maps
and three positional argument lists with one exported roster.

## What it changes

`src/lib/game/core/types/culture.ts` now opens with

```ts
export const CORE_STATS = [
  { id: 'strength', name: 'Strength', abbr: 'STR' },
  ...
] as const;
export type StatKey = (typeof CORE_STATS)[number]['id'];
export const CORE_STAT_KEYS: readonly StatKey[] = CORE_STATS.map((s) => s.id);
export const CORE_STAT_ABBR: Record<StatKey, string> = ...;
export type EntityStats = Record<StatKey, number>;
```

The direction of derivation inverts. `EntityStats` was the interface and `StatKey` was
`keyof EntityStats`; now the roster is the source and both fall out of it. Nothing else
declares the six.

- **Rosters.** `gen/culture.ts` (culture stat ranges), `Pawns.ts` (spawn clamp, growth
  profile), `PawnGrowthService.ts` (growth offers), `DebugGodmode.svelte`,
  `CultureDetail.svelte`, `pawnBlurb.ts`, `buildFit.ts`, `statView.ts` (formula baseline)
  and `traitRegistry.test.ts` all import `CORE_STAT_KEYS` or `CORE_STATS`.
- **Abbreviations.** `PawnStatBanner.svelte` (both its forward map and its reverse one),
  `PawnGrowthPanel.svelte`, `TraitCards.svelte`, `conditionInfo.ts` (twice), `gearDb.ts`
  (twice) and `selectionCard.ts` read `CORE_STAT_ABBR`. `CultureDetail.svelte` rendered
  `stat.slice(0, 3).toUpperCase()` and now renders the roster's `abbr`. Every abbreviation
  a player reads is the same string it was — STR, DEX, CON, PER, INT, CHA — checked per
  stat against each map the branch deleted. The order they appear in changes; see below.
- **Formula arguments.** `PawnStatService` compiles each `stats.jsonc` formula with
  `new Function('clamp', ...FORMULA_VARS, body)` and calls it positionally. `FORMULA_VARS`,
  the six positional arguments in `evaluateFormula`, and the first six keys of
  `describeStat`'s readout map are now all built from `CORE_STAT_KEYS`, so the parameter
  names and the arguments cannot separate. The `Args MUST match FORMULA_VARS order` comment
  is gone because the contract is structural.
- **Trait effects.** `Trait.effects` gets `{ [K in `${StatKey}Bonus`]?: number }` instead of
  six hand-written optional fields.
- **`PowerStat`.** Declared in `powerScale.ts` and again in `Combat.ts`; `Combat.ts` now
  re-exports it. `types/items.ts` declared the data-facing `powerStat` as a four-member union
  while the engine's had five, so `items.jsonc` could not express `charisma` —
  `rune_standard_glaive` does. That field now takes `PowerStat`.

Combat itself is untouched apart from the type move: `Combat.ts` loses a duplicate
declaration and gains a re-export.

## What I verified

**Type check.** `pnpm check` — 892 files, 0 errors, 10 pre-existing warnings in
`SelectedEntityCard`, `ActivityLogOverlay`, `PawnNeeds` and `SortableTable`.

**Stat-pipeline parity, main vs branch.** A probe built one pawn from an explicit stat block
(no rng) and evaluated all 116 `stats.jsonc` stats against it bare and under each of the 139
weapons that declare a `powerStat`, plus every `describeStat` var readout — 16,260 values.
Run on `main`'s `src/lib` and on the branch's: every value identical to six decimal places.
That covers `FORMULA_VARS` order, the positional argument list, the keyed copy and
`equippedPowerToken`'s charisma exemption. The only difference in the whole artifact is the
order the `describeStat` readout lists its variables in, which follows the roster.

**Abbreviations.** Extracted every `stat -> three-letter code` pair from `main`'s versions of
the nine maps the branch deletes (`PawnStatBanner` forward and reverse, `PawnGrowthPanel`,
`TraitCards`, `conditionInfo` twice, `gearDb` twice, `selectionCard`, and `CultureDetail`'s
`slice(0, 3)`): six distinct pairs, no stat carrying two codes, and every one equal to
`CORE_STAT_ABBR`. No string a player reads changed.

**Exhaustiveness.** Added `{ id: 'willpower', name: 'Willpower', abbr: 'WIL' }` to
`CORE_STATS` and ran the type check: it errors and names `willpower` at
`equipment.ts:401`, `entitySpawning.ts:713`, `pawnBlurb.ts:7` and `:16`,
`PawnStatService.ts:138`, `selectionCard.ts:58`, `statView.ts:180` and every test fixture
that builds a stat block. A seventh stat cannot be added and silently reach nothing.
Reverted.

**Full suite.** `VITEST_MAX_FORKS=2 pnpm test` — 186 files, 1350 tests, 0 failures.
`main` is 184 files and 1335 tests; the branch adds `coreStats.test.ts` and
`coreStatKeys.test.ts` and 15 tests.

**Audit suites.** `RUN_AUDITS=1 VITEST_MAX_FORKS=2 pnpm test` reached 121 files before the
run was killed on a loaded machine, covering 8 of the 24 audit suites: `styleMatchups`,
`armourStyleAudit`, `weaponFightSim`, `combatBalanceAudit`, `buildFitAudit`, `t4WeaponAudit`,
`maimTargeting`, `carryCapacityAudit` and `weaponPawnFitMedium` — every audit that drives
stats into a fight except the creature-ladder sweeps. All passed except
`combatBalanceAudit` "#4 LANDED — a two-hander answers to STRENGTH", `expected 34.125 to be
greater than 40`. That is the identical number the same audit produces on `main`: a live
combat sim measuring the same value to three decimal places on both sides is the strongest
single piece of evidence here that the refactor moved nothing. The five `weaponMeta` suites,
`weaponPawnFitNone`, `weaponPawnFitHeavy` and the eight `creatureMatchup` suites were not
reached.

## The roster order is the whole risk, and it is settled

`Pawns.ts rollGrowthProfile`, `PawnGrowthService.bankOffer` and `gen/culture.ts
generateStatRanges` all iterate the roster while drawing from the shared rng.
`rollGrowthProfile` builds a weighted pool from it and draws with `rng.pick` until it has
enough distinct favourites, so the roster's order changes the *number* of draws, not just
their assignment — the whole stream downstream of pawn creation shifts with it.

Those three loops, and `DebugGodmode.svelte`, all read
`strength, dexterity, intelligence, perception, charisma, constitution`. The five
player-facing surfaces — `PawnStatBanner`, `PawnGrowthPanel`, `selectionCard`,
`CultureDetail`, and the tie-break in `pawnBlurb`'s sentence — read
`strength, dexterity, constitution, intelligence, perception, charisma`. One roster cannot
be both.

`CORE_STATS` takes the first, so the simulation is byte-identical to `main`. The cost is that
CON moves from third to last in those five panels. The alternative is one line, and it is the
line the issue exists to create — but it is not free: with the panels' order in `CORE_STATS`,
`fsmTransitions.test.ts` "MOVING_TO_DEPOSIT: a fetch-carry routes the pawn through the deposit
state to the station" fails, because seed 112's four pawns are no longer the pawns that scenario
was written against and the fetch does not complete inside its 600-tick budget. Measured on
scenario seed 4242 under that ordering, the `orc_reaver` that spawns after the pawn had 84.0
blood on `main` and 66.0 with it. Distributions are unchanged; seeds are not.

The branch as the fixer committed it used a third order again —
`strength, dexterity, constitution, perception, intelligence, charisma`, copied from the old
`FORMULA_VARS` literal — which has the same seed divergence and the same test failure, and
also reordered the panels. `FORMULA_VARS` is self-consistent under any order, because the
`new Function` parameter names and the arguments now come from the same list; the rng loops
and the panels are not.

## What I changed on top of the fixer's commit

- **Reordered `CORE_STATS`** to `STR DEX INT PER CHA CON`, so the three rng loops keep the
  order they had and the simulation does not move. See above.
- **`gen/culture.ts:39`** — the tenth roster, missed. The issue cites it as
  `core/Culture.ts:40`; that file does not exist.
- **`statView.ts` `BASELINE`** — the eleventh, also a roster; built from `CORE_STAT_KEYS`.
- **Removed `statAbbr` from `bodyLabels.ts`.** The fixer added it and nothing called it. The
  lookup has to serve `gearDb.ts` and `PawnStatService` as well as the UI, so a second entry
  point in a components module is a second lookup.
- **Rewrote `coreStats.test.ts`.** As committed it asserted that `CORE_STAT_KEYS` and
  `CORE_STAT_ABBR` agree with `CORE_STATS` — true by construction. It now walks the roster
  and, for each stat, raises it from 10 to 30 on a constructed pawn and asserts that every
  `stats.jsonc` formula naming that stat's token responds and that no formula naming a
  different core stat moves. A rotated argument list fails it. A second case checks
  `describeStat` reports the same core-stat values the formula was fed, which covers the
  third, keyed list.

## Remediation

All nine items done. Two deviate from the wording:

- **"as data next to `stats.jsonc`"** — the roster is a TypeScript `as const`, not a
  `.jsonc`. The jsonc plugin emits `export default {…}` with no `as const`, so every `id`
  widens to `string` and `StatKey` cannot be derived from it. A data file can hold the
  roster or it can produce the type, not both.
- **"one lookup, alongside `bodyLabels.ts`"** — `CORE_STAT_ABBR` lives with the declaration
  in `core/types`, not in `bodyLabels.ts`. `gearDb.ts` and `PawnStatService` need it too and
  neither is a component; a UI-side copy would be the tenth map again.

## Stale citations in the issue

- `src/lib/game/core/Culture.ts:40` — no such file; the roster is `core/gen/culture.ts:39`.
- `src/lib/game/core/powerScale.ts:39` — actually `core/rules/body/powerScale.ts:11`.
- `src/lib/utils/bodyLabels.ts`, `src/lib/utils/pawnBlurb.ts` — both under
  `src/lib/components/util/`.
- `src/lib/components/UI/gameCanvas/selectionCard.ts` — actually `UI/canvas/selectionCard.ts`.

The `files:` frontmatter carries the first two stale paths.

## Unfiled defects

- **`vite.config.ts` `findGitRoot` cannot see a git worktree.** It tests
  `fs.statSync(gitPath).isDirectory()`, but a worktree's `.git` is a file, so it walks to `/`,
  reads `/package.json`, throws, and the vite config fails to load. `pnpm check` then reports
  110 identical `ENOENT` errors across every `.svelte` file and type-checks nothing, while
  still exiting non-zero — indistinguishable at a glance from a broken branch. Every
  verification run in a worktree hits this. `if (fs.existsSync(gitPath)) return dir;` fixes it;
  I used that locally to get a real type check and reverted it. Not fixed here.
- **`STAT_ABBR[stat] ?? stat`** at `TraitCards.svelte:247` and `:256`, and
  `GRANT_STAT_ABBR[stat] ?? stat` at `conditionInfo.ts:95` and `:98`, fall back to rendering
  the raw internal id. Pre-existing; the fallback survives the refactor.
- `combatBalanceAudit` `#4 LANDED — a two-hander answers to STRENGTH` fails on `main` under
  `RUN_AUDITS=1` (`expected 34.125 to be greater than 40`). Pre-existing, not this branch.

## Overlap with `fix/s01-game-services`

Commit `e8c2d30` on that branch introduces `CORE_STAT_ORDER` inside `PawnStatService.ts` and
derives `FORMULA_VARS`, the positional arguments and `describeStat`'s keys from it, guarded by
`type NoStatKeyMissingFrom<T extends never>` against `StatKey`. This branch does the same
three derivations from `CORE_STATS`, and because `StatKey` is *defined by* `CORE_STATS` here,
that guard has nothing left to catch — the array it checks and the type it checks against
become the same object. If both land, `CORE_STAT_ORDER` and its guard are dead and should be
deleted; if only that one lands, its `PawnGrowthService.ts:14` roster stays unguarded, which
is what this branch fixes.

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
| issue | [`docs/issues/review/core-stat-single-source.md`](../issues/review/core-stat-single-source.md) |
| severity | high |
| raised by | a person |
| files changed | 22 |
| verified | re-verified on the branch; see the account above |

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

_Account written after re-running the verification on the branch._
