<!-- LOC cap: 180 (created: 2026-07-10) -->

# WORK-EXPERIENCE

> **Related:** [ROADMAP](ROADMAP.md) · [game/DESIGN](../../game/DESIGN.md) · [game/DECISIONS](../../game/DECISIONS.md) (ADR-015 single work model)

## Goal

Make work capability (speed / yield / quality) driven by a per-pawn **experience level (1–50)** that
rises with use, with **core stats demoted to a small tertiary supplement**. Fixes three coupled
problems at once:

1. **Runaway quality.** Core stats now climb to 100; the current linear stat term
   (`(DEX−10)·0.04…`) blows the `crafting_quality` axis past Legendary, so masterwork gear is trivial.
2. **No progression / no independence.** Work quality is a pure function of birth stats — a fresh,
   never-crafted pawn produces at full quality, and skill can't be grown or specialised.
3. **Batch shares one roll.** A quantity-N craft rolls quality **once** and stamps all N units
   ([craft.ts:141](../../../src/lib/game/services/jobs/craft.ts)) — a lucky Masterwork roll makes the
   whole +3 stack Masterwork.

With low starting levels, a young colony's flint/wicker comes out Crude/Standard and Masterwork
requires a **leveled artisan** — no per-material cap needed.

## Model

**Per-pawn, per-category state** — lives in the dormant `pawn.skills: Record<string, number>` map
(currently seeded `{}`, read but always 0):

- **Level 1–50** per work category (`crafting`, `construction`, `cooking`, `metalworking`,
  `leatherworking`, `planting`, `foraging`, `fishing`, `butchery`, `caretaking`, `research`…). Rises
  via **learn-by-doing** (XP on job completion → level curve). Seeded at pawn-gen by **forking the
  core-stat distribution generator** (`rollGrowthProfile`'s favoured-category + bell-curve approach) so
  pawns are born with a talent spread. **Starting levels are random** (no floor) — a green colony is
  uniformly unskilled by design.
- **Style bias** — one innate per-pawn value on the **speed ↔ quality/yield** spectrum, rolled from the
  same distribution. Level sets *how good overall* (the correlation: a leveled pawn is better at
  everything); style sets *how that level splits*. Most pawns trade off (fast-but-rough vs
  slow-but-fine); a **rare few roll near-balanced** = the prized all-rounders.

## Formula

Replaces the `(1.0 + (DEX−10)·k…)` base in every `*_speed` / `*_yield` / `*_quality` in `stats.jsonc`:

```
workAxis = levelBase(level) × styleWeight[axis] × statSupplement[axis] × capacities × Π(trait mults)
```

- **`levelBase(level)`** — 1→50 curve, centred so mid-level ≈ 1.0 (Standard). Novice ≈ 0.6, master ≈ 2.0.
  (Exact shape tuned in impl.)
- **`styleWeight[axis]`** — the speed↔quality tilt from the pawn's style bias.
- **`statSupplement[axis]`** — **tertiary**, soft-capped so stat 100 adds ≈ +0.25 at most, never the base:
  - `speed` ← STR + DEX
  - `yield` ← INT + PER
  - `quality` ← both (STR/DEX/INT/PER)
- **`capacities`** (manipulation / sight / consciousness) **stay** — injury/darkness still dampen work
  (orthogonal to skill; keeps the wounded-in-the-dark model).
- **Traits stay multiplicative over the whole result** (ADR-015 `traitWorkMult`) — the 31 trait
  `workSpeed`/`workYield`/`workQuality` entries need **no re-authoring**.

## Phases

### Phase A — Experience-level core
- [ ] Seed `pawn.skills` levels + a style-bias value at pawn-gen (fork `rollGrowthProfile`) — `Pawns.ts`,
      `entity/entitySpawning.ts`
- [ ] XP → level (1–50) curve + learn-by-doing: grant category XP on job completion, persist on the pawn,
      convert to level (hook craft/work handlers)
- [ ] Thread the pawn's category level into `getWorkModifiers` / the formula evaluator so `stats.jsonc`
      formulas can reference it
- [ ] Rewrite the ~20 `*_speed`/`*_yield`/`*_quality` formulas → `levelBase × styleWeight × tertiary-stat
      × capacities`
- [ ] Style split logic (speed vs quality/yield) in `getWorkModifiers`
- [ ] Rebalance `rollCraftQuality` thresholds so the median crafter lands **Standard**, not Fine
- [ ] Save migration: existing pawns with empty `skills` get seeded levels

### Phase B — Per-unit batch roll
- [ ] `complete`/`completeCraftOrder` roll quality **per unit**, not once per order — a +N batch yields a
      **mix** of tiers (identity-bearing drops don't coalesce into one stamped stack)

### Phase C — UI split (Attributes vs Work tabs)
- [ ] **Attributes tab** ([PawnAttributes.svelte](../../../src/lib/components/pawn/PawnAttributes.svelte)):
      physical stats, capacities, combat only — **remove medical**
- [ ] **Work tab** (work screen): work skills only — per-category speed / yield / quality, **including
      `caretaking` speed + `caretaking` quality** (the former "medical skill", moved here and split)
- [ ] Remove physical / capacity / combat from the Work tab
- [ ] Split the shared renderer ([statView.ts](../../../src/lib/components/util/statView.ts)) so each tab
      gets its own filtered stat set (kills the current duplicate table)

## Acceptance
- [ ] A DEX/INT-100 pawn at **level 1** in a category crafts Crude/Standard — core stats can't carry
      quality alone
- [ ] Quality rises visibly with category level; a leveled artisan reliably makes Fine+, Masterwork is
      earned not lucky
- [ ] A +3 primitive craft can return a mix of tiers (not 3× the same)
- [ ] Speed-leaning vs quality-leaning pawns are observably different; balanced all-rounders are rare
- [ ] Attributes tab and Work tab show **different** tables; medical appears only under Work as
      caretaking speed/quality
- [ ] `pnpm check` clean; `pnpm test:related` on touched files green

## Open questions
- [ ] `levelBase` exact curve + `statSupplement` soft-cap constants (tune against playtest)
- [ ] XP gain rate / per-level cost curve for 1–50 (how many crafts to master a category)
- [ ] Does style bias ever shift, or is it fixed at birth? (assume fixed for now)
