---
id: t4-weapon-fight-verification
status: open
branch: fix/t4-weapon-fight-verification
created: 2026-08-27
updated: 2026-08-27
issue: t4-weapon-fight-verification
base: main
verified: pass
---
# fix: Twenty tier-4 weapons and the wieldRequirement condition have never been driven through a real fight

> **Related:** [issue](../issues/review/t4-weapon-fight-verification.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/t4-weapon-fight-verification` is committed and green. The branch is pushed to origin.

## What it reports doing

# fix: twenty tier-4 weapons and the wieldRequirement condition driven through a real fight

## What the branch changes

One new suite, `src/tests/game/systems/t4WeaponFight.test.ts`, plus one line in
`vitest.config.ts`. No game code changes.

The suite drives `HeadlessSession` over real ticks. Each case builds a two-pawn scenario via
`buildScenario` with hunger, fatigue, thirst and hygiene disabled, places the pair one tile
apart (four for the ranged cases), raises the opponent's blood volume and part HP to 1e7 so it
survives the window, issues `attackTargetWith`, and ticks. Swings are counted by installing a
`SimLogSink` that tallies `logCombatSwing` entries whose attacker name matches the subject
pawn, so hits and damage come from the combat loop rather than from a damage-kernel call.

The `wieldRequirement` path it exercises: `PawnStateMachine` recomputes
`mainHand.weaponProperties.wieldRequirement.strength - pawn.stats.strength` every tick and
passes it to `driveWieldStrain`, which sets `overmatched` at severity `shortfall / 14`. At
severity 1.0 the condition's `flailing` stage applies `hitChance` 0.5, `strength` 0.75,
`dodge` 0.8.

## Verified

- `svelte-check` on the branch: **0 errors, 10 pre-existing warnings, 892 files**.
- `RUN_AUDITS=1 VITEST_MAX_FORKS=2 pnpm vitest run src/tests/game/systems/t4WeaponFight.test.ts`:
  **9 passed / 9, 952.71s**, exit 0. This is the real sim over real ticks, not a unit test.
- Melee stat sweep: 16 weapons x 3 opponent profiles x 6 stats x 2400 ticks = **288 duels**.
  45 of 48 weapon-opponent cells put the weapon's declared `powerStat` top by damage.
- Power-stat build vs flat baseline, 16 weapons x 3 profiles x 6000 ticks = **96 duels**, every
  one a strict increase. Widest: `rune_weighted_warhammer` vs raider 139 -> 1356;
  `rune_banded_longstaff` vs raider 497 -> 2023. Narrowest still positive:
  `rune_fanged_greatcleaver` vs duelist 93 -> 389.
- Warbow, 6000 ticks: 28 arrows drawn from inventory, 41.0 damage per hit against a melee stave
  value of 7, confirming shots price off ammo x `drawPower`.
- Reload span, same 6000-tick window: warbow (`reload` 1) spent 28 arrows, arbalest
  (`reload` 4) spent 8 bolts.
- Sling, 6000 ticks: 51 stones spent, 4 hits.
- Javelin, 3000 ticks: off-hand emptied after the throw, 1 `rune_marked_javelin` drop on the
  ground, 10 total hits as the pawn falls back to its main-hand melee weapon.
- Ammo recovery, 10000 ticks: 32 arrows spent, 20 recovered = **63%** against a declared
  `recoverable` of 60%.
- `overmatched`, `rune_weighted_warhammer` (`wieldRequirement.strength` 20), 1800 ticks:
  STRENGTH 6 -> **20 damage**, conditions `[comfortable, overmatched]`; STRENGTH 30 ->
  **216 damage**, conditions `[comfortable]`. A tenfold damage loss, with the hit-rate drop
  asserted separately. The failure mode is a pawn that keeps swinging and keeps missing, not a
  pawn blocked from equipping.
- Coverage guard: `items.jsonc` yields exactly **20** tier-4 non-natural `rune_` weapons, and
  the suite's 16 melee + 4 ranged rosters equal that set by `toEqual`, so adding or removing a
  tier-4 weapon fails the suite.

## Changed on top of the fixer's work

**The stat sweep only ran against the knight.** The remediation item asks for all three opponent
profiles. Extended to raider, knight and duelist. Against the duelist — dexterity 40,
constitution 25, `iron_boss_shield` — three one-handed weapons declared `dexterity` are beaten
by a strength build:

| weapon | duelist, str build | duelist, dex build |
|---|---|---|
| `rune_ribbed_mace` | 86 | 40 |
| `rune_toothed_cleaver` | 49 | 34 |
| `rune_chained_flail` | 51 | 0 |

All three hold their declared `dexterity` against the raider and the knight; only the high-dodge
shielded profile inverts them, and `rune_chained_flail` on a dexterity build does **zero** damage
over 2400 ticks against it. Rebalancing is out of scope for this issue, so the suite asserts the
mismatch set by equality against a named constant rather than asserting it empty: the test fails
if the set grows *or* shrinks, so a later data pass cannot leave it stale. This is fight evidence
for COMBAT-BALANCE Phase 4, which owns the decision.

**The suite was not in `AUDIT_SUITES`.** It costs 952s and would have run on every default
`pnpm test`, while every sibling heavy weapon suite — `t4WeaponAudit`, `weaponFightSim`,
`weaponMeta*`, `creatureMatchup*` — is excluded. Added to the list in `vitest.config.ts`;
confirmed it is now skipped without `RUN_AUDITS` and collected with it.

## Judgement of the fixer's assertions

No tautologies of the classes looked for: no `toBeDefined()` on a value the loop had already
skipped, no filter emptying a set before its assertion, and the coverage test derives its
expected roster from `items.jsonc` rather than restating the literal lists. Two weak spots left
as they are:

- The warbow's "damage per hit beats the melee stave" assertion landed **1 hit in 28 shots**, so
  the 41.0 figure is a single sample. The hit itself is real, but the mean is not.
- `offHandGone` would also read true if the javelin had never reached the off-hand. The
  co-asserted ground drop of `rune_marked_javelin` rules that out, so the case is sound as a
  pair, not as a single assertion.

The 16 melee rows restate each weapon's `powerStat` and `twoHanded` as literals rather than
reading them from `items.jsonc`. All 16 match the database today. A divergence would fail the
suite rather than pass silently, so this is duplication, not a hole; left alone as out of scope.

## Remediation not done

- *Assert `recoverable` ammo retrieval numerically, and armour-damage degradation for shields* —
  half done. Recovery is asserted at 63% against a declared 60%. **Shield armour-damage
  degradation is not asserted anywhere in the suite**, and I did not add it. Not deferred by the
  issue, not stale — simply not reached.

The other four items are done and ticked.

## Unfiled defect found

**The repository cannot be `pnpm check`'d, dev-run or built from a git worktree.**
`findGitRoot` in `vite.config.ts:7-13` accepts a directory only when `.git` is itself a
directory. In a linked worktree `.git` is a file containing a `gitdir:` pointer, so the walk runs
to the filesystem root and `vite.config.ts:122-124` then does
`readFileSync('/package.json')`. Every Svelte file fails to preprocess: `pnpm check` in a
worktree reports **110 errors** where the same tree reports **0** when checked with the main
checkout as the process cwd. Any vite entry point is affected, so `./dev.sh` and `pnpm build`
fail there too; `vitest.config.ts` is separate, so tests are unaffected. Reproduce:

    node -e "const p=require('path'),f=require('fs');const r=d=>{const g=p.join(d,'.git');if(f.existsSync(g)&&f.statSync(g).isDirectory())return d;const q=p.dirname(d);return q===d?d:r(q)};console.log(r(process.cwd()))"

This is unfiled and I did not fix it. It affects every one of the eleven `fix/` worktrees.

## Review it

```bash
git diff main...fix/t4-weapon-fight-verification          # the whole change
git log --oneline main..fix/t4-weapon-fight-verification  # what it committed
```

Take it, or drop it:

```bash
git merge --no-ff fix/t4-weapon-fight-verification     # take it
git branch -D fix/t4-weapon-fight-verification          # drop it
```

## Facts

| | |
|---|---|
| issue | [`docs/issues/review/t4-weapon-fight-verification.md`](../issues/review/t4-weapon-fight-verification.md) |
| severity | medium |
| raised by | a person |
| files changed | 1 |
| verified | re-verified on the branch; see the account above |

<details><summary>files</summary>

- `src/tests/game/systems/t4WeaponFight.test.ts`

</details>

_Account written after re-running the verification on the branch._
