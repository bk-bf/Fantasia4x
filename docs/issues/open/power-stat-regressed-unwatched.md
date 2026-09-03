---
id: power-stat-regressed-unwatched
title: Bare feet cost a greataxe pawn half its kills, and no scheduled run would ever notice
status: open
kind: test-gap
severity: high
ready: false
origin: human
rules: []
files:
  - src/tests/game/systems/combatBalanceAudit.test.ts
  - vitest.config.ts
  - src/lib/game/database/items/items.jsonc
symbols: []
created: 2026-08-27
updated: 2026-08-27
---

# Bare feet cost a greataxe pawn half its kills, and no scheduled run would ever notice

> **Related:** [COMBAT-BALANCE](../../tasks/review/COMBAT-BALANCE.md) · [issues/README](../README.md)

## What breaks

A pawn with nothing on its feet moves at 0.9 of its normal speed, and that one multiplier
takes a `steel_greataxe` fighter from winning most of its duels to losing most of them.
Against the same opponent over the same eight seeds, the STRENGTH 40 build goes from 6 kills
in 8 and 2 deaths to **4 kills in 8 and 5 deaths**. Both builds in the duel are barefoot and
both take the identical multiplier, so this is not one build beating another — it is every
unshod pawn getting substantially worse at fighting, and the effect is large enough to invert
which stat looks better on a weapon.

The audit that names this is `#4 LANDED - a two-hander answers to STRENGTH`, and it fails on
the blood comparison: 34.125 removed by the STRENGTH build against 40 by the DEXTERITY build.
That assertion is a weak witness to the real problem. With 5 and 4 deaths out of 8, it is
comparing two mostly-lost fights and asking which corpse bled more, so it will keep failing
for reasons unrelated to the power stat and will pass again the moment the fights are
winnable. The kill and death counts are the numbers that matter.

## Evidence

- [`src/lib/game/services/PawnService.ts:112`](../../../src/lib/game/services/PawnService.ts#L112)
  — `const BAREFOOT_MOVE_FACTOR = 0.9`, multiplied into `tilesPerSecond` alongside `dexFactor`
  and the rest.
- `git bisect` over the 167 commits from `3d8cfc6b` (2026-07-28, passing) to `d276cb6e`
  identifies `1cfca876` (2026-08-25, `feat: add footwear movement mechanics and stealth
  effects`) as the first bad commit. Every bad commit fails with the identical
  `expected 34.125 to be greater than 40`, so the step is discrete, not accumulated drift.
- Setting `BAREFOOT_MOVE_FACTOR` to `1.0` at `d276cb6e` and changing nothing else makes the
  test pass: `the STRENGTH build is 4.31x faster and removes 1.6x the blood`. Restoring `0.9`
  fails again. The `items.jsonc` `movementPenalty` retuning in the same commit is not required
  to reproduce it.
- At the shipped `0.9`, the two rows are
  `STRENGTH 40: 6433 ticks, 4/8 kills, 5 deaths, blood left 66%` and
  `DEXTERITY 40: 8245 ticks, 3/8 kills, 4 deaths, blood left 60%`.
- [`docs/tasks/review/COMBAT-BALANCE.md:48`](../../tasks/review/COMBAT-BALANCE.md) — records
  the state this replaced: `STRENGTH 40 -> 3763 ticks, 6/8 kills, 2 deaths, 49% left`.
- `fix/mobs-innate-block` turns the same assertion green without touching movement: gating
  `blockChance` behind an equipped shield gives `STRENGTH 40: 3823 ticks, 6/8 kills, 1 death,
  49% left` against `DEXTERITY 40: 9373 ticks, 2/8 kills, 4 deaths, 75% left`, and the suite
  passes 5/5. Measured at 200 fights x 400 ticks, a shieldless CON-30 mob blocked 120 of 1262
  swings before that gate and 0 after. Shieldless creatures absorbing swings is therefore a
  second contributor, and the STRENGTH build's recovered figures land on the numbers
  COMBAT-BALANCE.md:48 records as the fixed state.
- [`src/tests/game/systems/combatBalanceAudit.test.ts:78`](../../../src/tests/game/systems/combatBalanceAudit.test.ts#L78)
  — `meanDuel` averages eight fixed seeds and scores a non-kill as `MAX_TICKS`, which is why a
  fight that stops finishing distorts both metrics.

## Why nothing caught it

The suite that encodes the acceptance criterion is excluded from every run anybody performs.
[`vitest.config.ts:91`](../../../vitest.config.ts#L91) drops `AUDIT_SUITES` unless `RUN_AUDITS`
is set, and nothing sets it on a schedule: the only installed unit is
`fantasia-issue-loop.timer`, `tools/audit/deploy/nightly-audit.sh` never mentions vitest, and
there is no cron entry. `pnpm test` is green with 1335 tests while this fails. The suite only
runs when a person types `pnpm test:audit` or `./audit.sh`, and the audit ledger's last run is
2026-08-25.

The second half is the tracker: a ticked acceptance box with its measurement beside it reads
as a guarantee, and nothing re-checks that the measurement still holds.

## Remediation

- [ ] Establish how the two known contributors combine, since either one alone flips the
      assertion: the barefoot movement factor, and shieldless creatures blocking. Neither has
      been measured with the other held fixed.
- [ ] Decide whether an unshod pawn should lose 10% of its movement at all, and if so whether
      a fight is the right place for it to bite. The commit's own framing is that footwear
      decides how a pawn walks; it currently also decides whether it survives.
- [ ] Re-measure the greataxe duel after that decision and record the kill and death counts,
      not only the blood figures.
- [ ] Make `#4` assert on kills and deaths as well as blood and ticks, so a fight that stops
      being winnable fails loudly instead of being read as a stat-ordering result.
- [ ] Sweep the other three opponent profiles, since the duelist profile already shows three
      tier-4 weapons losing to a build other than their declared `powerStat`.
- [ ] Schedule the audit suites so a regression in them is seen without a person remembering:
      a timer running `pnpm test:audit`, reporting through the registered notifier.
- [ ] Correct COMBAT-BALANCE.md - untick the acceptance criterion at :185 and replace the
      claim at :60 with the measured state.

## Out of scope

Rebalancing weapon damage generally, the `wieldRequirement` failure mode, and the ranged
weapon lines. Only the power-stat relationship and the fact that nothing watches it.
