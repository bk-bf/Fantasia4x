---
id: core-stat-single-source
title: The six core stats are re-declared by hand in ten rosters, nine abbreviation maps and three positional argument lists
status: in-review
kind: drift
severity: high
ready: true
origin: human
rules: []
files:
  - src/lib/game/core/types/culture.ts
  - src/lib/game/core/Culture.ts
  - src/lib/game/entities/Pawns.ts
  - src/lib/game/services/PawnGrowthService.ts
  - src/lib/game/services/PawnStatService.ts
  - src/lib/game/core/powerScale.ts
  - src/lib/game/systems/Combat.ts
  - src/lib/game/core/types/items.ts
  - src/lib/components/util/statView.ts
  - src/lib/components/screens/culture/CultureDetail.svelte
  - src/lib/utils/bodyLabels.ts
symbols: []
branch: fix/core-stat-single-source
pr: core-stat-single-source
created: 2026-08-24
updated: 2026-08-27
---

# Core stats have no single declaration

> **Related:** [issues/README](README.md) · [game/ARCHITECTURE](../game/ARCHITECTURE.md) · [game/DECISIONS](../game/DECISIONS.md)

## What breaks

The roster of six core stats is written out by hand in ten places, the `strength → STR`
abbreviation in nine more, and `PawnStatService`'s formula parameters in three parallel lists
kept in step by a comment. None of it is checked: adding a seventh stat compiles everywhere
and silently reaches none of them, and reordering the formula list feeds every formula in
`stats.jsonc` the wrong numbers with nothing failing.

It has already shipped wrong twice. The culture screen computed its label as
`stat.slice(0, 3).toUpperCase()` and rendered **BRA**/**AWA** while every pawn panel rendered
**BRN**/**AWR** for the same two stats — the current names happen to slice correctly, so the
rename hid it rather than fixing it. And `types/items.ts` declares `powerStat` as a
four-member union while the engine's `PowerStat` has five, so `items.jsonc` cannot express a
power stat the engine accepts.

The ~60 **derived** stats do not have this problem: they are declared once in `stats.jsonc`
and every consumer reads that file. The pattern already exists here; the six core stats were
never put behind it.

## Evidence

- [`types/culture.ts:5`](../../src/lib/game/core/types/culture.ts#L5) — `interface EntityStats`, the nearest thing to a canonical declaration; `StatKey = keyof EntityStats` derives from it
- Nine more rosters restate it: [`Culture.ts:40`](../../src/lib/game/core/Culture.ts#L40), [`Pawns.ts:858`](../../src/lib/game/entities/Pawns.ts#L858), [`PawnGrowthService.ts:27`](../../src/lib/game/services/PawnGrowthService.ts#L27), [`DebugGodmode.svelte:26`](../../src/lib/components/screens/DebugGodmode.svelte#L26), [`CultureDetail.svelte:11`](../../src/lib/components/screens/culture/CultureDetail.svelte#L11), [`pawnBlurb.ts:7`](../../src/lib/utils/pawnBlurb.ts#L7), [`buildFit.ts:19`](../../src/lib/dev/buildFit.ts#L19), [`statView.ts:57`](../../src/lib/components/util/statView.ts#L57), [`traitRegistry.test.ts:14`](../../src/tests/game/core/traitRegistry.test.ts#L14)
- [`PawnStatService.ts:132`](../../src/lib/game/services/PawnStatService.ts#L132) — `FORMULA_VARS`; its 24 arguments are passed **positionally** at [`:314`](../../src/lib/game/services/PawnStatService.ts#L314) under a comment reading `Args MUST match FORMULA_VARS order`, with a third keyed copy at [`:987`](../../src/lib/game/services/PawnStatService.ts#L987)
- [`CultureDetail.svelte:112`](../../src/lib/components/screens/culture/CultureDetail.svelte#L112) — `stat.slice(0, 3).toUpperCase()`, the hand-rolled humanizer AGENTS.md forbids, and the source of the BRA/AWA mismatch
- Nine abbreviation maps restate `strength → STR`: [`PawnStatBanner.svelte:16`](../../src/lib/components/pawn/PawnStatBanner.svelte#L16) and [`:33`](../../src/lib/components/pawn/PawnStatBanner.svelte#L33) (forward and reverse in one file), [`PawnGrowthPanel.svelte:14`](../../src/lib/components/pawn/PawnGrowthPanel.svelte#L14), [`TraitCards.svelte:95`](../../src/lib/components/pawn/TraitCards.svelte#L95), [`conditionInfo.ts:68`](../../src/lib/components/util/conditionInfo.ts#L68) and [`:98`](../../src/lib/components/util/conditionInfo.ts#L98), [`gearDb.ts:708`](../../src/lib/dev/gearDb.ts#L708) and [`:878`](../../src/lib/dev/gearDb.ts#L878), [`selectionCard.ts:64`](../../src/lib/components/UI/gameCanvas/selectionCard.ts#L64); [`statView.ts:190`](../../src/lib/components/util/statView.ts#L190) uses a tenth scheme, the full uppercase word
- [`powerScale.ts:39`](../../src/lib/game/core/powerScale.ts#L39) vs [`Combat.ts:357`](../../src/lib/game/systems/Combat.ts#L357) — `PowerStat` declared twice with identical unions, while `Combat.ts` already re-exports from that module at [`:172`](../../src/lib/game/systems/Combat.ts#L172)
- [`types/items.ts:543`](../../src/lib/game/core/types/items.ts#L543) — the data-facing `powerStat` union omits `charisma`; live drift, not hypothetical
- [`entitySpawning.ts:883`](../../src/lib/game/services/entity/entitySpawning.ts#L883) — a misspelt `statRanges` key is indistinguishable from an absent one, so the creature spawns with defaults and no warning
- [`statView.ts:150`](../../src/lib/components/util/statView.ts#L150) — the carry tooltip still tells the player `loadFraction = STR × 1.2%`; the engine moved to `(CARRY_BASE_KG + strength × CARRY_KG_PER_STRENGTH) × frameFactor` at [`ItemService.ts:749`](../../src/lib/game/services/ItemService.ts#L749)

## Why nothing caught it

`StatKey[]` constrains the *members* of a list, never its *completeness or order*, so the
type system is structurally unable to see any of this. No lint rule looks for a literal that
restates a union. The one test that walks the roster,
[`traitRegistry.test.ts:14`](../../src/tests/game/core/traitRegistry.test.ts#L14), holds its
own copy — and has already gone stale in the other direction, still listing the six
`*Penalty` keys that COMBAT-BALANCE 8d replaced. `variantLadder.test.ts:56` walks the
`statRanges` keys but only asserts `min ≤ max`; it never asks whether the key is a stat.

The commit that exposed this (`c09c6aa9`) had to be a repo-wide text sweep for the same
reason, and the sweep missed `traitRegistry.test.ts` because that file never names a stat —
it holds the derived `*Bonus`/`*Penalty` forms.

## Remediation

- [ ] Add a single core-stat declaration — id, display name, three-letter abbreviation, order — as data next to `stats.jsonc`, and derive `EntityStats`/`StatKey` from it.
- [ ] Replace all ten rosters with imports of that one list.
- [ ] Replace all nine abbreviation maps and the `slice(0, 3)` call with one lookup, alongside [`bodyLabels.ts`](../../src/lib/utils/bodyLabels.ts).
- [ ] Build `FORMULA_VARS` and both argument lists in `PawnStatService` from the declaration so the positional contract cannot drift; delete the `Args MUST match` comment once it is structural.
- [ ] Collapse `PowerStat` to one declaration and widen the `types/items.ts` field to match.
- [ ] Derive the `*Bonus` effect keys from the roster, drop the six dead `*Penalty` entries, and make an unrecognised `*Bonus` key fail a test rather than no-op.
- [ ] Add a test asserting every roster-derived surface covers the declaration exactly — the check that would have caught BRA/AWA.
- [ ] Validate the data-file stat keys against the roster (`modifiers`, `statRanges`, `powerStat`, `primaryStat`, `wieldRequirement`, `statFocus`/`statDump`) so a typo fails a test instead of spawning a default.
- [ ] Fix the stale `carry_weight` tooltip formula.

## Out of scope

Prose. The ~73 stat names inside `description`, `name` and `flavor` strings, and the mentions
in code comments, stay hand-written — a data file cannot rename them and should not try. The
goal is that the next rename touches prose only, not ten rosters, nine abbreviation maps and
three positional argument lists that have to be found first.

Ordinary field access (`pawn.stats.strength`) is not a target either. 1446 of the 2905
occurrences are that, any naming scheme produces them, and a single source would not remove
one of them.
