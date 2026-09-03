---
id: t4-weapon-fight-verification
title: Twenty tier-4 weapons and the wieldRequirement condition have never been driven through a real fight
status: in-review
kind: test-gap
severity: medium
ready: true
origin: human
rules: []
files:
  - src/tests/game/systems/t4WeaponAudit.test.ts
  - src/tests/game/systems/weaponFightSim.test.ts
  - src/tests/game/systems/weaponStatSweep.test.ts
  - src/lib/game/systems/Combat.ts
symbols: []
branch: fix/t4-weapon-fight-verification
pr: t4-weapon-fight-verification
created: 2026-08-25
updated: 2026-08-27
---

# Twenty tier-4 weapons have never been driven through a real fight

> **Related:** [issues/README](README.md) · [COMBAT-BALANCE](../tasks/open/COMBAT-BALANCE.md) · [AUDIT (archived)](../tasks/archive/AUDIT-2026-08-25.md)

## What breaks

The top tier of the weapon table is balanced on sweeps, not fights. Sixteen melee and four
ranged/arcane tier-4 weapons have their numbers from `t4WeaponAudit` and `weaponStatSweep` —
harnesses that call the real damage kernel but model to-hit, cadence and part selection rather
than running the loop. The sweep and the fight disagree by more than half: a five-trait pile
prices at ×4.47 on paper and ×1.72 in a live duel, because misses and blocks absorb the rest.
So a weapon can read correct in the table and play wrong, and the four ranged/arcane entries
were never covered by the melee sweep at all — they have no pass through the ranged path.

Separately, `wieldRequirement.strength` — the `overmatched` condition, which is what stops an
underpowered pawn swinging a boss weapon — is not exercised in any fight.

## Evidence

- [`t4WeaponAudit.test.ts`](../../src/tests/game/systems/t4WeaponAudit.test.ts) — real `resolveHit` and real cadence over every T4 weapon × 5 stats × 113 traits × 3 opponents, but analytical; classed `[~]` by the project's own evidence rule
- [`weaponStatSweep.test.ts`](../../src/tests/game/systems/weaponStatSweep.test.ts) — defence matrix, precision and proposal pricing; analytical, `[~]`
- [`weaponFightSim.test.ts`](../../src/tests/game/systems/weaponFightSim.test.ts) — the only headless duel harness (`HeadlessSession`, 8 seeds); it covers weapon *comparison*, not the twenty-row roster
- The gap between the two classes is measured, not hypothetical: the same trait pile is ×4.47 analytically and ×1.72 in a live fight
- The four ranged/arcane rows — `rune_strung_warbow`, `rune_cranked_arbalest`, `rune_marked_javelin`, `rune_whistling_sling` — are outside the melee sweep entirely and need their own pass through the ranged path
- `wieldRequirement.strength` / the `overmatched` condition: no fight-driven assertion anywhere in `src/tests/game/systems/`

## Why nothing caught it

Nothing is wrong with the harnesses; they are doing what they were built for, and the project
already classes them honestly as `[~]`. The gap is that a `[~]` never became a `[x]` for these
twenty rows, and a partial mark does not fail a suite. `AGENTS.md` states the rule — a unit or
analytical assertion is a supplement, never a substitute — but the rule is enforced by
convention in a checklist, not by a test that fails when a tier-4 weapon has no fight behind it.
When the checklist was archived, the twenty unticked boxes were the only record.

## Remediation

- [x] Drive each of the sixteen melee tier-4 weapons through `HeadlessSession` against the three opponent profiles (raider / knight / duelist), asserting its best stat is its own power stat.
- [x] Give the four ranged/arcane weapons their own headless pass through the ranged path — ammo lifecycle, `drawPower`, reload, and the thrown/self-consuming case for the javelin.
- [x] Exercise `wieldRequirement.strength` in a fight: an underpowered pawn swinging a boss weapon must take the `overmatched` condition and measurably lose for it.
- [ ] Assert `recoverable` ammo retrieval numerically, and armour-damage degradation for shields — both flagged as unasserted alongside these.
- [x] Add a test that fails when a tier-4 weapon has no headless coverage, so the class cannot silently reopen.

## Out of scope

Rebalancing. Phase 4 of [COMBAT-BALANCE](../tasks/open/COMBAT-BALANCE.md) owns the remaining
tuning decisions (the cadence floor, the trait audit, the data passes); this issue only closes
the evidence gap so those decisions are made against fight data rather than sweep data.
