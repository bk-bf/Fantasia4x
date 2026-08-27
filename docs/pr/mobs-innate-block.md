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

> **Related:** [issue](../issues/mobs-innate-block.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/mobs-innate-block` is committed and green. Nothing has been pushed anywhere.

## What it reports doing

Clean. Now, tick the remediation checklist in the issue file per the tracker instructions... wait, instructions explicitly say not to edit `docs/issues/`. So I leave that to the harness.

## Summary

**Decision:** Of the three options the issue posed, I gated `block` behind holding a shield entirely. Evidence for this: `docs/tasks/archive/AUDIT-2026-08-25.md`'s own design table lists block as `Tank | CONSTITUTION + mass | one-hand + shield | ... | shields (block)` — the mechanic is defined as the shield-holder's axis, not a universal bracing floor. A "small bracing term" would just re-introduce the same unintended tax at a smaller magnitude; "pawn-only" would still let a shieldless duelist or archer roll block, which the design table never grants them either.

**Change:** `blockChance` (`src/lib/game/systems/Combat.ts:2054`) now returns `0` immediately when the defender has no shield in `offHand`, before touching the CONSTITUTION+mass base term. `BLOCK_CAP` and the force-factor curve are untouched, as scoped.

**Test:** Added two cases to `src/tests/game/systems/combatSim.test.ts`: a negative check (pawn and mob defenders with `constitution: 30` and no shield never produce a `blocked` result over 2000 `resolveHit` rolls) and a positive control (the same attacker vs. a pawn wearing a `wattle_buckler` does block some blows), so the gate is proven in both directions rather than just asserting zero.

**Headless verification:** Built a real `tickCombat` loop (the same function `GameEngineImpl` drives every engine tick) with a real Pawn attacker and a shieldless Mob defender (`constitution: 30`), hooking `setSimLogSink` to count `BLOCK` float emissions. Before the fix: 4 blocked swings over 4000 ticks. After: 0. This was a throwaway probe file, deleted after use per the headless skill's convention.

**Remediation list:** all four items done — decision made, `blockChance` changed at the base term, tests added covering pawn and mob, headless-verified before/after with the tick count and delta above.

**Out of scope, untouched:** shield ladder, parry, bash procs, `BLOCK_CAP`, force-factor curve.

**Verification commands run:**
- `pnpm check` — 0 errors, 10 pre-existing unrelated warnings.
- `pnpm vitest run src/tests/game/systems/combatSim.test.ts` — 33/33 passed.
- `pnpm test:related src/lib/game/systems/Combat.ts src/tests/game/systems/combatSim.test.ts` — 638/638 passed across 87 files.

Working tree has two modified files staged for review: `src/lib/game/systems/Combat.ts` and `src/tests/game/systems/combatSim.test.ts`. Nothing committed, per instructions.

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
| issue | [`docs/issues/mobs-innate-block.md`](../issues/mobs-innate-block.md) |
| severity | medium |
| raised by | a person |
| files changed | 2 |
| verified | `check` + `test:related` green |

<details><summary>files</summary>

- `rc/lib/game/systems/Combat.ts`
- `src/tests/game/systems/combatSim.test.ts`

</details>

_Written unattended by `tools/audit/fix.mjs`. The branch is local; nothing was pushed._
