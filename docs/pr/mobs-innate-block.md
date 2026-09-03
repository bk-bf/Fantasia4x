---
id: mobs-innate-block
status: open
branch: fix/mobs-innate-block
created: 2026-08-27
updated: 2026-08-27
issue: mobs-innate-block
base: main
verified: pass
---
# fix: Every creature negates a share of melee blows with no shield, because block derives from constitution and mass

> **Related:** [issue](../issues/review/mobs-innate-block.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/mobs-innate-block` is committed and green. The branch is pushed to origin.

## What it reports doing

# fix: a defender holding no shield no longer rolls block

## What the branch changes

`blockChance` in `src/lib/game/systems/Combat.ts:2054` returns `0` before evaluating anything
when `shieldDef(defender)` finds no `armorType: "shield"` item in `offHand`. Previously the
CONSTITUTION+mass `block` stat was evaluated for every defender and a shieldless one rolled it
with a `blockBonus` of 0, so any creature negated a share of melee while holding nothing.
`BLOCK_CAP`, the force-factor curve, `parryChance` and the bash procs are untouched.

`evaluateStat('block', …)` has exactly one caller — this line — so the gate is complete for
combat. The raw `block` stat still reads non-zero for a shieldless pawn in the dev build panel
(`src/lib/dev/buildStats.ts:181`); that is a stat readout, not a roll.

Two cases added to `src/tests/game/systems/combatSim.test.ts`: 2000 `resolveHit` rolls against
a shieldless pawn and a shieldless mob at `constitution: 30` assert 0 blocks, and a positive
control asserts a pawn with a `wattle_buckler` blocks more than 0.

## Headless verification

Mechanism: `combatService.tickCombat` driven directly — the function `GameEngineImpl` calls on
every engine tick — with a real Pawn attacker and a goblin Mob defender adjacent, both healed
each tick so the exchange runs to the tick budget. `BLOCK` counted off `setSimLogSink`'s
`pushCombatText`, swings off `pushAttackLunge`. 200 independent fights x 400 ticks per arm.
"Before" is `git show main:src/lib/game/systems/Combat.ts` swapped into the worktree, the probe
re-run, and the branch file restored. This drives the real combat loop, not a full
`HeadlessSession` colony.

| defender | before | after |
|---|---|---|
| shieldless mob, constitution 30 | 1262 swings, 120 blocked | 1259 swings, 0 blocked |
| shieldless mob, default constitution 12 | 1232 swings, 96 blocked | 1229 swings, 0 blocked |
| mob with `orc_iron_slab` in offHand | 1276 swings, 394 blocked | 1253 swings, 365 blocked |

The shielded arm drops 394 to 365 because the *attacking pawn* is shieldless in that fight and
was blocking some of the mob's return swings. The shielded mob keeps its block.

The report this replaces claimed "4 blocked swings over 4000 ticks before, 0 after" from a probe
that was deleted. That reading is not reproducible as a measurement: a single continuous fight
produces 14-20 swings over 4000 ticks, so 4 blocks rests on a sample of ~20. The direction was
right; the sample was too small to carry the claim. The numbers above replace it.

## Edge cases, measured

`combatService.resolveHit`, 4000 rolls each, before -> after:

| defender | before | after |
|---|---|---|
| pawn con30, no shield | 325 | 0 |
| pawn con12, no shield | 313 | 0 |
| mob con12, no shield | 343 | 0 |
| wolf, no shield | 329 | 0 |
| pawn, `wattle_buckler` offHand | 970 | 954 |
| pawn, `wattle_buckler` mainHand | 351 | 0 |
| pawn, `orc_iron_slab` mainHand | 342 | 0 |
| pawn, 2H greatsword + `orc_iron_slab` offHand | 2223 | 2157 |
| mob, `orc_iron_slab` offHand | 2204 | 2207 |
| mob with only head and torso limbs, `orc_iron_slab` offHand | 2192 | 2156 |

**Two-handed shield-equivalent: none exists.** All eight items with
`armorProperties.armorType: "shield"` — `wattle_buckler`, `rawhide_round_shield`,
`plank_round_shield`, `orc_iron_slab`, `iron_boss_shield`, `iron_buckler`,
`steel_heater_shield`, `rune_graven_kite` — declare `slot` and `equipmentSlot` `offHand`, and
none carries `twoHanded`. The `offHand` gate has no blind spot in the current data.

**Shield in the main hand: 0 block, and unreachable.** `getEquipmentSlot` returns
`armorProperties.equipmentSlot` (`offHand`) for every shield, so `resolveEquipSlot` and
`equipItem` never place one in a hand slot. The single slot-forcing path,
`equipOrder(target)` at `src/lib/components/UI/canvas/GameCanvas.svelte:4239`, offers Main Hand
only for `type: 'weapon'` and hand tools; shields are `type: 'armor'` and take the untargeted
branch. Forced anyway, the defender blocked 0 of 4000 after the fix and 351 of 4000 before —
before the fix it got the innate rate and no `blockBonus`, which was already wrong.

**Body plan with no offHand: unchanged, and unreachable.** `shieldDef` reads
`equipment.offHand` and never consults `limbs`, so a mob with only head and torso limbs holding
`orc_iron_slab` blocks 2156 of 4000 after the fix and 2192 before. This branch neither creates
nor fixes that. In the data it cannot happen: `offHand` entries in
`src/lib/game/database/items/lootpool.jsonc` appear only in humanoid pools (goblin, orc,
bandit), and the two goblin pools carry a `goblin_net`, which is not `armorType: "shield"` and
grants no block. Unfiled, not this issue.

**Shield-carrying mobs keep their block.** Orc and bandit pools roll `orc_iron_slab`,
`iron_boss_shield` and `rawhide_round_shield` into `offHand` at 0.3-0.6 chance; those mobs still
block, at the rates above.

## The decision and its citation

`docs/tasks/archive/AUDIT-2026-08-25.md:804` reads exactly what the report quotes:
`| Tank | CONSTITUTION + mass | one-hand + shield | heaviest plate | shields (block), knockdown-resist |`.
The quotation is accurate. It is weaker support than presented: line 798 introduces that table
as "each row = primary stats -> the gear it *wants*", so it describes a build archetype's
shopping list, not the gate on the block formula.

The direct evidence is in the same file and was not cited. Line 279 records the shield rework
and closes with "Layer 2 (dodge/block build traits) + creature block deferred" — shieldless
creature block was never an implemented design decision. Line 281 states the finding and the
three options verbatim. The chosen option is the one those lines support; the justification
reached for the weaker of the two.

## Verification commands

- `pnpm check` — 890 files, **0 errors, 10 pre-existing warnings**. `vite.config.ts:7-13`'s
  `findGitRoot` requires `.git` to be a directory and it is a file in a worktree, which makes
  svelte-check report 110 `ENOENT` errors having checked nothing; patched locally for the run
  and reverted, not committed.
- `VITEST_MAX_FORKS=2 pnpm vitest run` over `combatSim`, `combatRanged`, `creatureDurability`,
  `weaponStatSweep`, `statAxisProposal`, `armourChain`, `armourCoverage`, `itemRules` —
  **168 passed across 8 files**.
- `RUN_AUDITS=1 VITEST_MAX_FORKS=2 pnpm vitest run src/tests/game/systems/combatBalanceAudit.test.ts`
  — **5 passed**, including `#4 LANDED`, which is red on `main`.
- `styleMatchups` and `armourStyleAudit` were launched in the same `RUN_AUDITS=1` run and were
  still executing after 80 minutes when I stopped waiting. No claim is made about them. They are
  characterization audits over shield and armour matchups, so their reported numbers will move
  with this change even where nothing fails.

## The branch also turns a red combat audit green

`combatBalanceAudit #4 LANDED — a two-hander answers to STRENGTH, the stat it names` fails on
`main` at `expected 34.125 to be greater than 40` — that is
`expect(100 - strong.blood).toBeGreaterThan(100 - nimble.blood)`, i.e. the DEXTERITY build was
removing more blood with a steel greataxe than the STRENGTH build. On this branch the same
assertion reads 51 against 25:

```
STRENGTH 40 / DEXTERITY 10 (2H greataxe)   3823 ticks   6/8 kills   1 deaths   blood left 49%
STRENGTH 10 / DEXTERITY 40 (2H greataxe)   9373 ticks   2/8 kills   4 deaths   blood left 75%
```

`#2` in the same file asserts the sim replays identically on a seed, and the only difference
between the two runs is the one-line gate, so the gate is what crosses it. That failure was
bisected to a barefoot movement factor in `1cfca876` and treated as unrelated; a share of it was
shieldless mobs eating the slow build's swings. Not claimed as a fix for it — stated as an
observed side effect worth someone checking before the barefoot factor is chased further.

## What I changed on top of the fixer's work

Nothing in the code. The diff is as committed. The work was reproducing the verification the
report asserted and testing the three cases a passing test would not reach.

## Remediation

All four done. Nothing deferred, nothing stale — the issue's `Combat.ts` line citations
(2752/2754/2756/1114/383) no longer resolve; `blockChance` is at 2054 and the live call site at
1190, but every claim they carry holds at the current lines.

## Review it

```bash
git diff main...fix/mobs-innate-block          # the whole change
git log --oneline main..fix/mobs-innate-block  # what it committed
```

Take it, or drop it:

```bash
git merge --no-ff fix/mobs-innate-block     # take it
git branch -D fix/mobs-innate-block          # drop it
```

## Facts

| | |
|---|---|
| issue | [`docs/issues/review/mobs-innate-block.md`](../issues/review/mobs-innate-block.md) |
| severity | medium |
| raised by | a person |
| files changed | 2 |
| verified | re-verified on the branch; see the account above |

<details><summary>files</summary>

- `rc/lib/game/systems/Combat.ts`
- `src/tests/game/systems/combatSim.test.ts`

</details>

_Account written after re-running the verification on the branch._
