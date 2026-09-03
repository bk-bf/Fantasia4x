---
id: armour-resistance-fields-dead
status: open
branch: fix/armour-resistance-fields-dead
created: 2026-08-27
updated: 2026-08-27
issue: armour-resistance-fields-dead
base: main
verified: pass
---
# fix: slashResistance, pierceResistance and crushResistance are authored on armour and read by nothing

> **Related:** [issue](../issues/review/armour-resistance-fields-dead.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/armour-resistance-fields-dead` is committed and green. The branch is pushed to origin.

## What it reports doing

`fix/armour-resistance-fields-dead` — reconstructed from the diff; the fixer session left no account.

## What the branch changes

It takes the **wire it up** side of the issue's first decision, and wires the three fields as a
multiplier on the piece's own `defense`, not as a separate mitigation term.

`partArmorReduction` in `src/lib/game/systems/Combat.ts` walks the defender's armour slots, and for
each piece covering the struck part pushes a `defense` figure onto a layer-sorted list; the incoming
`blockable` damage is then reduced layer by layer until it hits zero. The branch adds a lookup from
`DamageType` to armour field — `cutting → slashResistance`, `piercing → pierceResistance`,
`blunt → crushResistance` — and multiplies that piece's contribution by `1 + resistance`:

    defense × (0.5 + 0.5 × condition) × (1 + typeResistance)

`damageType` is threaded down from `resolveHit`, which already had it. `fire`, `frost` and
`lightning` have no matching field and fall through at `× 1`, so they see the old number.
`partArmorPoints` — the hit-location weighting and the fit harness — is untouched and stays
damage-type agnostic. The resistances are not in `ARMOR_QUALITY_FIELDS`, so Masterwork does not
scale them; only `defense` is scaled before the multiplier applies.

Seven items carry the nine declarations: `plate_cuirass` (slash .30 / pierce .25 / crush .15),
`great_helm` (slash .30), `bone_plated_cuirass` (crush .20), and pierce-only on `cave_bear_plate`,
`orc_warplate`, `croc_scale_cuirass` (.20) and `orc_scrap_plate` (.15).

`partArmorReduction` was exported so the added unit test can call it. `docs/game/ITEM-RULES.md`'s
"fields the sim actually reads" list moves the three from the dead column to the live one and leaves
`magicResistance` dead.

## Verified

- `pnpm check` — **891 files, 0 errors, 10 pre-existing warnings** (`SelectedEntityCard`,
  `ActivityLogOverlay`, `PawnNeeds`, `SortableTable`).
- `pnpm vitest run` over the combat and armour suites that are not audits —
  `combatSim`, `combatRanged`, `bloodHunt`, `creatureDurability`, `draftedHealth`, `fractures`,
  `magicGear`, `wieldRequirement`, `deathDrops`, `services/armourChain`, `headless/invariants`:
  **11 files, 123 tests passed**.
- `RUN_AUDITS=1 pnpm vitest run` over `armourStyleAudit`, `combatBalanceAudit`, `styleMatchups`,
  `weaponFightSim`, `maimTargeting`, `t4WeaponAudit`, `weaponPawnFit{None,Medium,Heavy}`,
  `buildFitAudit`, `carryCapacityAudit`: **10 files passed, 1 failed — 27 passed / 1 failed**.
  The failure is `combatBalanceAudit #4 LANDED — a two-hander answers to STRENGTH`,
  `expected 34.125 to be greater than 40`. Re-running that one test with `main`'s `Combat.ts` swapped
  in produces the **identical** numbers, `34.125` and `40`, so it is pre-existing on `main` and
  untouched by this branch. The pawns there wear no armour, so the changed line is never reached.
- Final run of the two files this commit touches: **2 files, 35 tests passed**.

### Headless — real sim, real ticks

`HeadlessSession` + `buildScenario`, 24×24 flat, one drafted colonist (str 6 / dex 6 / con 40,
hunger, fatigue, thirst and hygiene disabled) ordered to attack one `gnoll_marauder` — claw is
`cutting`, bite is `piercing`, so it exercises `slashResistance` and `pierceResistance`. 8 seeds
(11, 23, 37, 41, 59, 71, 83, 97), 4000 ticks each or until a death. The metric is injury damage on
the parts a `bodyOuter` piece covers — chest, abdomen, both shoulders — because whole-body damage is
dominated by the head, arms and legs the piece does not cover and drowns the signal.

**With and without the armour**, 8 seeds, 30,690 ticks bare against 28,220 armoured:

| kit | covered-part damage |
|---|---|
| bare chest | 388.9 |
| `croc_scale_cuirass` (defense 16, pierce .20) | 20.0 |
| `plate_cuirass` (defense 30, all three) | 12.0 |

**With and without the resistances**, same seeds, same scenario, `Combat.ts` swapped between this
branch and `main`:

| kit | `main` | branch | delta |
|---|---|---|---|
| `croc_scale_cuirass` | 21.0 | 20.0 | −1.0 |
| `plate_cuirass` | 12.0 | 12.0 | 0 |
| bare (control) | 388.9 | 388.9 | 0 |

The bare control being byte-identical confirms the two runs differ only in the changed line.

**So the fields do now reach combat, and the effect at the authored values is about one point of
damage in 29,640 ticks.** The reason is the shape of `partArmorReduction`: `blockable` is decremented
by `defense` and clamped at zero, so `× (1 + resistance)` only changes an outcome for a hit landing in
the narrow band between `defense` and `defense × (1 + resistance)`. On `plate_cuirass` nothing a gnoll
lands on the chest reaches 30 in the first place, so `defense` already zeroes it and the resistance is
worth exactly nothing; on the much thinner `croc_scale_cuirass` (16 → 19.2 against a bite) hits do land
in the band, and the delta is one landed puncture across eight duels.

The wiring is correct and the field is no longer dead. Whether the *player* can feel it is a tuning
question this branch does not answer, and it is what the unticked half of remediation item 2 is for.

## Changed on top of the fixer's work

- `src/tests/game/systems/armourFieldReaders.test.ts` — new, remediation item 4. Three assertions:
  every field authored under `armorProperties` anywhere in `items.jsonc` is named by code under
  `src/lib/game` outside `database/`, `dev/` and `core/types/`; each of the three damage-type
  resistances is named by `src/lib/game/systems/Combat.ts` itself; and the exemption list contains
  nothing that has stopped being authored. Run against `main`'s `Combat.ts` it fails both of the first
  two — `pierceResistance, slashResistance` dead in the sim, and all three absent from the mitigation
  path — and passes on this branch. Excluding `core/types` matters: the first draft scanned the type
  declaration too, so a field declared and never read counted as read and the test passed on `main`.
- `src/tests/game/systems/combatSim.test.ts` — removed the `//` comment stating `plate_cuirass`'s stat
  block, which the repo forbids, and replaced the issue-slug test title with what the test asserts.

## Remediation not done

- **"give each armour line a deliberate profile (mail resists slash, plate resists pierce, padding
  resists crush)"** — the second half of item 2, not done. It is an authoring pass over `items.jsonc`
  that has to go through the `items` skill, and the current data contradicts the sketch: `plate_cuirass`
  resists slash .30 above pierce .25, `mail_hauberk` carries no resistance at all, and no padding line
  carries `crushResistance`. Seven of about 250 armour items have any resistance. Ran out of budget;
  it is the item that would make the wired term visible in play. The first half — apply the term
  alongside `defense × (0.5 + 0.5 × condition)` — is done.
- **"If deleted — strip the fields…"** — not applicable; item 1 was decided the other way.

## Unfiled defects found

- **`vite.config.ts:7` breaks every git worktree.** `findGitRoot` requires `.git` to be a directory
  (`fs.statSync(gitPath).isDirectory()`), but in a linked worktree `.git` is a regular file. It
  therefore walks to `/` and `APP_VERSION` reads `//package.json`, which does not exist. Preprocessing
  then fails for every `.svelte` file: `pnpm check` in a worktree reports **110 errors, all
  `ENOENT: no such file or directory, open '/package.json'`**, and `server.fs.allow` is set to `/`.
  Dropping the `isDirectory()` test fixes it. Both `pnpm check` figures above were taken with that
  one-line change applied temporarily and reverted; `vite.config.ts` is unmodified on the branch. Not
  fixed — out of this issue's scope, and it affects every `fix/` worktree in this batch.
- **Four more dead `armorProperties` fields**, beyond the `magicResistance` the issue's Out of scope
  already names: `armorLayer`, `armorSet`, `intimidation` and `visionProtection` are authored in
  `items.jsonc` and named by no code under `src/lib/game` outside the database and the `gearDb` dev
  tool. They are the exemption list in the new test, so they are recorded rather than silent. Same
  defect shape as this issue, different fields. Not fixed.
- **`combatBalanceAudit #4` fails on `main`.** A strength-40 greataxe build removes 34.125 blood where
  the dexterity-40 build removes 40, on a weapon whose power stat is strength. Reproduced with `main`'s
  `Combat.ts`, identical numbers. Nothing to do with this branch.

## Review it

```bash
git diff main...fix/armour-resistance-fields-dead          # the whole change
git log --oneline main..fix/armour-resistance-fields-dead  # what it committed
```

Take it, or drop it:

```bash
git merge --no-ff fix/armour-resistance-fields-dead     # take it
git branch -D fix/armour-resistance-fields-dead          # drop it
```

## Facts

| | |
|---|---|
| issue | [`docs/issues/review/armour-resistance-fields-dead.md`](../issues/review/armour-resistance-fields-dead.md) |
| severity | medium |
| raised by | a person |
| files changed | 3 |
| verified | re-verified on the branch; see the account above |

<details><summary>files</summary>

- `ocs/game/ITEM-RULES.md`
- `src/lib/game/systems/Combat.ts`
- `src/tests/game/systems/combatSim.test.ts`

</details>

_Account written after re-running the verification on the branch._
