---
id: mobs-innate-block
title: Every creature negates a share of melee blows with no shield, because block derives from constitution and mass
status: open
kind: correctness
severity: medium
ready: true
origin: human
rules: []
files:
  - src/lib/game/systems/Combat.ts
  - src/lib/game/services/PawnStatService.ts
symbols: []
created: 2026-08-25
updated: 2026-08-27
---

# Every creature negates a share of melee blows with no shield

> **Related:** [issues/README](README.md) · [COMBAT-BALANCE](../tasks/open/COMBAT-BALANCE.md) · [AUDIT (archived)](../tasks/archive/AUDIT-2026-08-25.md)

## What breaks

`block` was designed as the heavy tank's negation axis — constitution plus body mass, plus a
shield's `blockBonus`, deliberately not weight-penalised so a pawn in full plate blocks what it
cannot dodge. But `blockChance` is evaluated for any defender, and a mob has constitution and
mass, so **every creature in the game blocks a share of incoming melee while holding nothing**.
Measured at ~1.8%. A wolf parries with a wolf. It is small, but it is a flat tax on every
melee exchange in the game that no design decision put there, and it scales with the creature's
mass, so the largest beasts get the most of it.

## Evidence

- [`Combat.ts:2752`](../../src/lib/game/systems/Combat.ts#L2752) — `blockChance(defender: Pawn | Mob, …)`; the signature admits mobs
- [`Combat.ts:2754`](../../src/lib/game/systems/Combat.ts#L2754) — `const bonus = shield?.blockBonus ?? 0`; with no shield the bonus is 0, but the base term below is not
- [`Combat.ts:2756`](../../src/lib/game/systems/Combat.ts#L2756) — `pawnStatService.evaluateStat('block', defender) + bonus`; `block` is constitution + mass and returns a positive value for a shieldless defender, so nothing gates the roll on holding a shield
- [`Combat.ts:1114`](../../src/lib/game/systems/Combat.ts#L1114) — `blockChance` is called on the live hit path for every defender
- [`Combat.ts:383`](../../src/lib/game/systems/Combat.ts#L383) — the design comment states block is the shield/tank axis; creature block was explicitly deferred, not implemented

## Why nothing caught it

The shield audit was adversarial and thorough, and it checked the things block was built for:
that block scales with constitution, that it stays high under plate while dodge stays low, that
the cap holds, that bash procs are heavy-shield only. Every one of those tests uses a pawn
holding a shield. None asks what a defender with **no** shield blocks, because the question only
arises once you notice the stat has no shield gate — and the stat reads correctly in isolation.
`Pawn | Mob` in the signature is the type system doing what it was told.

## Remediation

- [ ] Decide the intended behaviour: gate block behind holding a shield, keep a small innate "bracing" term deliberately, or make innate block pawn-only.
- [ ] Implement the decision in `blockChance` — the change is at the base term, not the cap.
- [ ] Add a test asserting a shieldless defender's block chance matches the decision (zero, or a stated bracing floor), covering both a pawn and a mob.
- [ ] Headless-verify a melee exchange against a shieldless creature before and after (state ticks and the negated-blow count).

## Out of scope

The shield ladder, parry, and the bash procs — all audited and behaving. `BLOCK_CAP` and the
force-factor curve are unchanged. This issue is only about whether a defender holding nothing
should roll block at all.
