<!-- LOC cap: 180 (created: 2026-07-10) -->

# WORK-EXPERIENCE — DONE 2026-07-10

> **Related:** [ROADMAP](../open/ROADMAP.md) · [game/DESIGN](../../game/DESIGN.md) · [game/DECISIONS](../../game/DECISIONS.md) (ADR-015 single work model)

**Implemented 2026-07-10** — `pnpm check` 0 errors; full suite 889/890 (the 1 failure is the
pre-existing `recipeService` green_firewood drift, unrelated). New module:
`core/workExperience.ts`; touched: `stats.jsonc` (all 35 work formulas → `SKILL` token,
`medical_skill` → `caretaking_quality`), `PawnStatService` (SKILL resolution + `workSkillInfo`),
`JobService` (`_grantWorkXp`), `jobs/craft.ts` (per-unit rolls), `jobs/caretake.ts`,
`ResourceObjectService` (retired the double-count `skillId` path), `itemQuality.ts` (recentred
bands), `Pawns.ts` (seeding), `saveManager.ts` (migration), Attributes/Work UI split.

## Goal

Make work capability (speed / yield / quality) driven by a per-pawn **experience level (1–50)** that
rises with use, with **core stats demoted to a small tertiary supplement**. Fixes three coupled
problems at once:

1. **Runaway quality.** Core stats now climb to 100; the current linear stat term
   (`(DEX−10)·0.04…`) blows the `crafting_quality` axis past Legendary, so masterwork gear is trivial.
2. **No progression / no independence.** Work quality is a pure function of birth stats — a fresh,
   never-crafted pawn produces at full quality, and skill can't be grown or specialised.
3. **Batch shares one roll.** A quantity-N craft rolls quality **once** and stamps all N units
   ([craft.ts](../../../src/lib/game/services/jobs/craft.ts)) — a lucky Masterwork roll makes the
   whole +3 stack Masterwork.

With low starting levels, a young colony's flint/wicker comes out Crude/Standard and Masterwork
requires a **leveled artisan** — no per-material cap needed.

## Model

**Per-pawn, per-category state** — lives in the previously dormant `pawn.skills: Record<string, number>` map:

- **Level 1–50** per work category (`crafting`, `construction`, `cooking`, `metalworking`,
  `leatherworking`, `planting`, `foraging`, `fishing`, `butchery`, `caretaking`, `research`…). Rises
  via **learn-by-doing** (XP on job completion → level curve). Seeded at pawn-gen by **forking the
  core-stat distribution generator** (bell-curve + 0–2 favoured "talent" categories). **Starting
  levels are random** (no floor) — a green colony is uniformly unskilled by design.
- **Style bias** (`pawn.workStyle` ∈ [−1, 1]) — one innate per-pawn value on the **speed ↔
  quality/yield** spectrum, pushed toward the extremes so most pawns trade off (fast-but-rough vs
  slow-but-fine) and the **rare near-balanced roll is good at both** (+10% all-rounder bonus).

## Formula (as landed)

```
workAxis = SKILL × statSupplement[axis] × capacities × Π(trait mults)
SKILL    = levelBase(level) × styleWeight[axis]
```

- **`levelBase(level)`** — piecewise linear: 1 → 0.6, 25 → 1.0, 50 → 2.0.
- **`styleWeight[axis]`** — ±25% speed↔finesse tilt + 0.1×(1−|style|) all-rounder bonus.
- **`statSupplement[axis]`** — tertiary, ≈ +0.27 max at stat 100:
  speed ← STR+DEX ×0.0015; yield ← INT+PER ×0.0015; quality ← all four ×0.0007.
- **capacities** (manipulation / sight / consciousness…) kept — injury/darkness still dampen work.
- **Traits stay multiplicative** over the whole result — the 31 trait entries untouched.
- Quality bands recentred: Crude <0.8, Standard <1.2, Fine <1.55, Superior <1.85, MW <2.15, else Legendary.

## Phases

### Phase A — Experience-level core
- [x] Seed `pawn.skills` levels + `workStyle` at pawn-gen (`seedWorkLevels`/`rollWorkStyle` in
      `core/workExperience.ts`, called from `Pawns.ts`; mobs keep `{}` → neutral level)
- [x] XP → level (1–50) curve + learn-by-doing: `JobService._grantWorkXp` on EVERY job completion
      (the one chokepoint), `xpToNext`/`applyWorkXp`/`workXpForJob`
- [x] Thread the level into `getWorkModifiers`/`evaluateStat` as the `SKILL` formula token
      (+ `workSkillInfo` for the UI tooltip: factor + level)
- [x] Rewrite all 35 `*_speed`/`*_yield`/`*_quality` formulas → `SKILL × supplement × capacities`
- [x] Style split (speed vs quality/yield) via `styleSpeedWeight`/`styleFinesseWeight`
- [x] Rebalance `rollCraftQuality` thresholds — median competent crafter lands **Standard**
- [x] Save migration: `ensureWorkSkills` in `saveManager.loadGame`
- [x] Retired the parallel `ResourceObjectService` `skillId × skillMultiplier` yield path (would have
      double-counted the level — ADR-015 one work model) and the `skill_construction` work-points
      special case in `pawn/handlers/work.ts`

### Phase B — Per-unit batch roll
- [x] `completeCraftOrder` takes a roll CLOSURE; each unit of a batch rolls its own tier → one drop
      per rolled tier (test: ×3 order splits 1 Crude + 2 Standard)

### Phase C — UI split (Attributes vs Work tabs)
- [x] `PawnAttributes` gained a `categories` prop; **Attributes tab** shows
      physical/capacity/combat/resistance only (banner included)
- [x] **Work screen pawn detail** (`PopulationOverview`) shows `categories={['work']}` only —
      header renamed WORK SKILLS; caretaking speed + quality live there
- [x] `medical_skill` deleted; **`caretaking_quality`** added as a work stat; tend roll
      (`jobs/caretake.ts`) rides it × `TEND_SKILL_SCALE` (0.35 ≈ old baseline parity)
- [x] `statView` tooltip surfaces `SKILL` as `factor (Lv N)`

## Acceptance
- [x] A DEX/INT-100 pawn at **level 1** crafts Crude/Standard — supplement caps ≈ +0.25, can't carry
      quality (guarded by `subjobStats.test.ts` "small supplement" case)
- [x] Quality rises with category level; Masterwork is earned (bands + `itemQuality.test.ts`)
- [x] A +3 primitive craft can return a mix of tiers (per-unit roll test)
- [x] Speed-leaning vs quality-leaning pawns observably differ; balanced all-rounders rare
      (`rollWorkStyle` extreme-pushed distribution; style-twin test)
- [x] Attributes tab and Work tab show **different** tables; medical only under Work as
      caretaking speed/quality
- [x] `pnpm check` clean (0 errors); `pnpm test:related` green (693/693); full suite 889/890
      (1 pre-existing recipe drift)

## Open questions (deferred — tune against playtest)
- [ ] `levelBase` curve shape + `statSupplement` constants (landed: piecewise 0.6/1.0/2.0, ×0.0015/×0.0007)
- [ ] XP gain rate / per-level cost (landed: `40 + 12·L^1.4` per level, job XP = workRequired clamped 4–300
      → ~60k XP ≈ ~1,000+ jobs to master a category)
- [ ] Does style bias ever shift, or stay fixed at birth? (landed: fixed at birth)
