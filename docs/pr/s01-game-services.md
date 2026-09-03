---
id: s01-game-services
status: open
branch: fix/s01-game-services
created: 2026-08-27
updated: 2026-08-27
issue: s01-game-services
base: main
verified: pass
---
# fix: Hand-maintained roster restates a declared set — game/services

> **Related:** [issue](../issues/review/s01-game-services.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/s01-game-services` is committed and green. The branch is pushed to origin.

## What it reports doing

# fix: hand-maintained roster restates a declared set — game/services

## What it changes

`PawnStatService` wrote the six core stat names out three times, in three shapes that had to
stay in lockstep by hand:

- `FORMULA_VARS[0..5]` — the parameter names given to `new Function` when a `stats.jsonc`
  formula is compiled.
- the first six **positional** arguments of the `fn(...)` call in `evaluateFormula`.
- the first six keys of the `all` map in `describeStat`, which feeds the stat-derivation
  readout.

Nothing checked that the three agreed. Swapping two entries in one of them feeds every
formula in `stats.jsonc` the wrong number, with no compiler error and no runtime error —
`PERCEPTION` would simply evaluate to the pawn's constitution.

The branch introduces one ordered roster, `CORE_STAT_ORDER`, and derives all three from it:
`FORMULA_VARS` spreads `CORE_STAT_ORDER.map(k => k.toUpperCase())`, the positional args
spread `CORE_STAT_ORDER.map(k => coreStatValue(k, s, sm))`, and `describeStat` builds its
keys from the same array. The three lists are now the same array, so they cannot diverge.

Two compile-time guards tie that roster to `EntityStats`, the interface `StatKey` derives
from:

- `satisfies readonly StatKey[]` rejects an entry that is not a stat.
- `NoStatKeyMissingFrom<Exclude<StatKey, (typeof CORE_STAT_ORDER)[number]>>` rejects a stat
  the roster omits.

Order is preserved exactly: `strength, dexterity, constitution, perception, intelligence,
charisma`, which is the order `main` used at all three sites. It is not `EntityStats`
declaration order and must not be — the positional contract with `new Function` depends on
it, and `describeStat`'s key order is the display order of the derivation readout.

## Verified

- `pnpm check` — **0 errors, 10 pre-existing warnings**, 890 files.
- `npx vitest run src/tests/game/services src/tests/game/core/{bodyPlans,stealth,traitExpansion}
  src/tests/game/systems/{fractures,fsmTransitions,pawn/rally,statAxisProposal}` —
  **97 files, 679 tests passed**.
- Earlier run of the 14 suites that name `PawnStatService`, including
  `weaponStatSweep` — **132 tests passed**.
- Exhaustiveness guard, run rather than reasoned: adding `willpower: number` to
  `EntityStats` and running `tsc --noEmit` produces
  `PawnStatService.ts(121,3): error TS2344: Type '"willpower"' does not satisfy the
  constraint 'never'`. Reverted. The guard fires and names the missing stat.
- **Headless parity, the real sim.** `HeadlessSession` + `buildScenario`, seed 11, flat 20×20,
  6 pawns, `workReady`, 1000 ticks. Dumped `evaluateStat` for all 116 stat ids, the `vars`
  from `describeStat` for each, `computeCapacities` and `getWorkModifiers('woodcutting')`,
  for every pawn. Ran the same probe against `main`'s `PawnStatService.ts` swapped into the
  same worktree. Output **byte-identical, 162241 bytes over 10941 lines**.
  Repeated with `transientConditions: ['knockdown']` on every pawn so the condition stat
  multipliers are live (`strength ×0.5`, `dexterity ×0.2`) — the numbers move relative to the
  first run, and are again **byte-identical between `main` and the branch, 162342 bytes**.
  This is a refactor with zero observable delta, which is what it should be. Probe deleted.

## Changed on top of the fixer's work

The fixer's completeness guard was
`const _coreStatOrderCoversStatKey: StatKey extends … ? true : never = true; void _x;` —
a runtime const plus a `void` statement, reporting `Type 'true' is not assignable to type
'never'`. Replaced with a purely type-level constraint that emits nothing and names the
missing stat. Behaviour identical; the guard was verified to fire in both forms.

## Remediation

- Confirm each citation — done, and **three of the four are stale**:
  - The six names the issue quotes — `BRAWN`, `AGILITY`, `VIGOUR`, `AWARENESS`, `INTELLECT`
    — appear nowhere in `src`. The roster reads `STRENGTH`, `DEXTERITY`, `CONSTITUTION`,
    `PERCEPTION`, `INTELLIGENCE`, `CHARISMA`.
  - `PawnStatService.ts:132` — `FORMULA_VARS` is at **:109** on `main`, entries at 110-115.
    Also cited `:314` for the positional args (actually **:243**) and `:987` for the keyed
    copy (actually **:749**); `main`'s file is **839 lines**, so `:987` does not exist.
  - The comment quoted as `Args MUST match FORMULA_VARS order` is not in the file. `grep
    'Args MUST'` on `main` returns nothing; the repo carries no comments.
  - `culture.ts:5` for `interface EntityStats` — it is at **:3**.
  - The `Related` link to `docs/issues/core-stat-single-source.md` is dead; the file is at
    `docs/issues/review/core-stat-single-source.md`.
  The substance survives all of it: `FORMULA_VARS` did hand-write the six core stat names,
  and their order was positionally load-bearing at two further sites.
- Fix every remaining site under `game/services` — **not done, and one remains.**
  `src/lib/game/services/PawnGrowthService.ts:14` declares
  `const STAT_KEYS: StatKey[] = ['strength','dexterity','intelligence','perception','charisma','constitution']`
  and drives the birthday/season growth offer from it. `StatKey[]` constrains members, never
  completeness: the `willpower` experiment above produced no error in that file, so a seventh
  stat would silently never be offered for growth. It is the same class, in the same
  directory, and this branch does not touch it. It is left alone deliberately —
  `PawnGrowthService.ts` is in the `files:` list of `docs/issues/review/core-stat-single-source.md`,
  whose remediation item 2 is "replace all ten rosters with imports of that one list", and
  which is being worked on `fix/core-stat-single-source` right now. Fixing it here would put
  a second, different roster mechanism into a file that branch is rewriting.
  Not fixed elsewhere under `game/services`: `entitySpawning.ts:712` builds a full
  `EntityStats` object literal, so the compiler already requires completeness — not a finding.
- Add the check that would have caught it — done, see the two guards above, and the run that
  proves the completeness one fires. The rule is **not demotable**: `tools/audit/rules/S-single-source.jsonc`
  sets `"demotable": false` on S01, so no `audit.mjs demote`. The check is local to this
  file's roster; nothing generic can find the class, which is why S01 sits at T2.
- `pnpm check` and tests green — done, numbers above.

## Unfiled defects found

**`pnpm check` cannot run in any git worktree.** `vite.config.ts:7-13`:

```ts
if (fs.existsSync(gitPath) && fs.statSync(gitPath).isDirectory()) return dir;
```

In a worktree `.git` is a **file**, not a directory, so `findGitRoot` walks past it to `/`
and `APP_VERSION` reads `/package.json`. Every `.svelte` file then fails preprocessing with
`ENOENT: no such file or directory, open '/package.json'` — 110 errors across 111 files, and
`pnpm check` exits 1 before type-checking anything. `vite dev` and `vite build` take the same
path. This affects all eleven `fix/` worktrees, so no run of `pnpm check` inside one has ever
reported on the code. Dropping the `isDirectory()` clause makes it pass; that one-line change
was applied temporarily to produce the 0-errors result above and reverted before committing.
`vitest.config.ts` does not share the helper, so the test runs are unaffected. Unfiled, not
fixed — it is outside this issue and would collide across all eleven branches.

## Conflict warning

`PawnStatService.ts` is being changed by three branches at once. `fix/core-stat-single-source`
remediation item 4 is "build `FORMULA_VARS` and both argument lists in `PawnStatService` from
the declaration" — the same lines this branch rewrites, from a roster it intends to put in a
data file next to `stats.jsonc`. These two will conflict in `FORMULA_VARS`, `evaluateFormula`
and `describeStat`; take that branch's version if it lands, since it sources the roster from
data rather than a module-local array. `fix/condition-stat-modifiers-multiplicative` touches
`conditionStatMultipliers`, which this branch calls but does not change; if it adds `charisma`
to `StatMultipliers`, the `k === 'charisma'` arm of `coreStatValue` becomes dead and should
be deleted with it.

## Review it

```bash
git diff main...fix/s01-game-services          # the whole change
git log --oneline main..fix/s01-game-services  # what it committed
```

Take it, or drop it:

```bash
git merge --no-ff fix/s01-game-services     # take it
git branch -D fix/s01-game-services          # drop it
```

## Facts

| | |
|---|---|
| issue | [`docs/issues/review/s01-game-services.md`](../issues/review/s01-game-services.md) |
| severity | high |
| raised by | the audit (S01) |
| files changed | 1 |
| verified | re-verified on the branch; see the account above |

<details><summary>files</summary>

- `rc/lib/game/services/PawnStatService.ts`

</details>

_Account written after re-running the verification on the branch._
