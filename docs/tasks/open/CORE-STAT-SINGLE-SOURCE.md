<!-- LOC cap: 200 (created: 2026-08-24) -->

# CORE-STAT SINGLE SOURCE

> **Related:** [ROADMAP](ROADMAP.md) · [COMBAT-BALANCE](COMBAT-BALANCE.md) · [AUDIT](AUDIT.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [game/DECISIONS](../../game/DECISIONS.md)

## Status

**Open — finding recorded 2026-08-24, remediation not started.** Accepted as-is for now: the rename
that exposed it (`c09c6aa9`) is committed, `check` is clean, and with
[traitRegistry.test.ts](../../../src/tests/game/core/traitRegistry.test.ts)'s roster updated the
suite is green apart from four failures that predate the commit.

## What exposed it

Commit `c09c6aa9` renamed the six core stats back to their earlier names — `brawn→strength`,
`agility→dexterity`, `vigour→constitution`, `awareness→perception`, `intellect→intelligence`,
`charisma` unchanged. It touched **117 files** and ~2040 lines, and it had to be done with a
repo-wide text sweep because there was no other way to do it.

The 2905 occurrences of the six names across `src/` are not themselves the problem. 1446 sit in
`.ts`/`.svelte` files and are mostly ordinary field access (`pawn.stats.strength`), which any naming
scheme produces and which a single source would not remove; the other 1459 are data-file keys. The
problem is the subset the compiler never checks: **the roster of six is re-declared by hand in ten
places, the display abbreviation in nine more, and the formula engine's parameter order in three
parallel lists that are kept in step by a comment.**

The sweep itself missed a file for that reason.
[traitRegistry.test.ts](../../../src/tests/game/core/traitRegistry.test.ts) never mentions a stat by
name — it holds a roster of the twelve derived `strengthBonus`/`strengthPenalty` keys — so a search
for the stat names as words did not find it, and the commit landed with that test red.

## The duplicated declarations

### The roster — ten hand-maintained copies

| Where | Form |
|---|---|
| [types/culture.ts:5](../../../src/lib/game/core/types/culture.ts#L5) | `interface EntityStats` — the closest thing to a canonical declaration; `StatKey = keyof EntityStats` derives from it |
| [Culture.ts:40](../../../src/lib/game/core/Culture.ts#L40) | `const STATS = [...]` |
| [Pawns.ts:858](../../../src/lib/game/entities/Pawns.ts#L858) | `const STAT_KEYS: (keyof EntityStats)[]` |
| [PawnGrowthService.ts:27](../../../src/lib/game/services/PawnGrowthService.ts#L27) | `const STAT_KEYS: StatKey[]` |
| [DebugGodmode.svelte:26](../../../src/lib/components/screens/DebugGodmode.svelte#L26) | `const STAT_KEYS: StatKey[]` |
| [CultureDetail.svelte:11](../../../src/lib/components/screens/culture/CultureDetail.svelte#L11) | `const STAT_ORDER` |
| [pawnBlurb.ts:7](../../../src/lib/utils/pawnBlurb.ts#L7) | `const STATS` |
| [buildFit.ts:19](../../../src/lib/dev/buildFit.ts#L19) | `type CoreStat` — a second union of the same six |
| [statView.ts:57](../../../src/lib/components/util/statView.ts#L57) | `BASELINE.stats` — six literal keys at 10 |
| [traitRegistry.test.ts:14](../../../src/tests/game/core/traitRegistry.test.ts#L14) | `STAT_KEYS` — the twelve `*Bonus`/`*Penalty` forms, six of which are dead (see below) |

Typing one of them as `StatKey[]` does not help: the type constrains the *members*, never the
*completeness or order* of the list. A seventh stat added to `EntityStats` compiles everywhere.

The last row has already gone stale in the other direction. COMBAT-BALANCE 8d replaced `*Penalty`
with a signed `*Bonus`, and [Pawns.ts:285](../../../src/lib/game/entities/Pawns.ts#L285) now applies
trait effects only when the key ends in `Bonus` — but the test roster still lists all six `*Penalty`
forms, so it would wave through a stat trait carrying a key the engine ignores. The applier is
guarded (`if (pawn.stats[s] !== undefined)`), so an unrecognised `*Bonus` key is a silent no-op too:
authoring `wisdomBonus: 5` on a trait does nothing and reports nothing.

### The display abbreviation — nine copies, a tenth scheme, and one string slice

`strength → STR` is written out independently in
[PawnStatBanner.svelte:16](../../../src/lib/components/pawn/PawnStatBanner.svelte#L16) and again at
[:33](../../../src/lib/components/pawn/PawnStatBanner.svelte#L33) (forward and reverse maps in one
file), [PawnGrowthPanel.svelte:14](../../../src/lib/components/pawn/PawnGrowthPanel.svelte#L14),
[TraitCards.svelte:95](../../../src/lib/components/pawn/TraitCards.svelte#L95),
[conditionInfo.ts:68](../../../src/lib/components/util/conditionInfo.ts#L68) and again at
[:98](../../../src/lib/components/util/conditionInfo.ts#L98),
[gearDb.ts:708](../../../src/lib/dev/gearDb.ts#L708) and again at
[:878](../../../src/lib/dev/gearDb.ts#L878), and
[selectionCard.ts:64](../../../src/lib/components/UI/gameCanvas/selectionCard.ts#L64).
[statView.ts:190](../../../src/lib/components/util/statView.ts#L190) uses a tenth scheme — the full
uppercase word (`STRENGTH`) rather than the three-letter chip.

[CultureDetail.svelte:112](../../../src/lib/components/screens/culture/CultureDetail.svelte#L112)
skips the map entirely and computes the label as `stat.slice(0, 3).toUpperCase()`. AGENTS.md forbids
exactly this ("Don't hand-roll `id.replace(...)` humanizers at the callsite") and the reason showed up
on screen: under the previous names that slice produced **BRA** and **AWA**, while every pawn panel
rendered **BRN** and **AWR** for the same two stats. The culture screen and the pawn screens
disagreed about what the stats were called, and shipped that way. The rename hid it by accident —
the current six names all happen to slice to their correct abbreviation.

### The formula engine — three positional lists in one file

[PawnStatService.ts](../../../src/lib/game/services/PawnStatService.ts) resolves every `stats.jsonc`
formula through a compiled function whose parameters are `FORMULA_VARS`
([:132](../../../src/lib/game/services/PawnStatService.ts#L132)). The 24 arguments are then passed
**positionally** at [:314](../../../src/lib/game/services/PawnStatService.ts#L314), under a comment
reading `Args MUST match FORMULA_VARS order`. A third copy of the same set, keyed rather than
ordered, backs the tooltip breakdown at
[:987](../../../src/lib/game/services/PawnStatService.ts#L987).

Reordering the list, or inserting a stat anywhere but the end, silently feeds every formula in the
game the wrong numbers. Nothing fails to compile and no test asserts the correspondence.

### `PowerStat` — declared twice, plus a narrower third

[powerScale.ts:39](../../../src/lib/game/core/powerScale.ts#L39) and
[Combat.ts:357](../../../src/lib/game/systems/Combat.ts#L357) both `export type PowerStat` with
identical five-member unions — and `Combat.ts` already re-exports `powerScale` from that same module
at [:172](../../../src/lib/game/systems/Combat.ts#L172), so it could have imported the type.
[types/items.ts:543](../../../src/lib/game/core/types/items.ts#L543) declares the data-facing
`powerStat` field as a **four**-member union omitting `charisma`, so `items.jsonc` cannot express a
power stat the engine accepts. That drift is live now, not hypothetical.

### The data files reference the stats by unchecked string key

1459 of the 2905 occurrences are in `src/lib/game/database/`, and only ~73 of those are prose. The
rest are structured references — 158 condition `modifiers`, 132 creature `statRanges`, 125
`powerStat`, 116 `primaryStat`, 22 `wieldRequirement`, 20 culture `statFocus`/`statDump` — each
naming a core stat as a bare JSON key that nothing validates against the roster.

[entitySpawning.ts:883](../../../src/lib/game/services/entity/entitySpawning.ts#L883) reads
`sr?.strength` and falls back to the fixed def value when it is absent, so a misspelt `statRanges`
key is indistinguishable from an unspecified one — the creature spawns with default stats and no
warning. [variantLadder.test.ts:56](../../../src/tests/game/core/variantLadder.test.ts#L56) walks
those keys but only asserts `min ≤ max`; it never asks whether the key is a stat.

## The comparison that makes it plain

The ~60 **derived** stats do not have this problem. They are declared once in
[stats.jsonc](../../../src/lib/game/database/pawns/stats.jsonc) and every consumer reads that file —
[PawnAttributes.svelte:29](../../../src/lib/components/pawn/PawnAttributes.svelte#L29) filters it for
capacity ids, `statView.ts` builds its rich view from it, `PawnStatService` compiles its formulas.
Adding a derived stat is one data entry. The pattern already exists in the codebase; the six core
stats were simply never put behind it.

## Related drift of the same shape

The carry-capacity tooltip at
[statView.ts:150](../../../src/lib/components/util/statView.ts#L150) tells the player
`loadFraction = STR × 1.2%`. The engine stopped using that formula in the COMBAT-BALANCE 12c carry
rework: capacity is now `(CARRY_BASE_KG + strength × CARRY_KG_PER_STRENGTH) × frameFactor`
([ItemService.ts:749](../../../src/lib/game/services/ItemService.ts#L749)) and `loadFraction` is a
derived output, not an input. The formula is written down in two places and the player-facing one is
wrong.

## Remediation

- [ ] Add a single core-stat declaration — id, display name, three-letter abbreviation, order — as
      data, next to `stats.jsonc`, and derive `EntityStats`/`StatKey` from it.
- [ ] Replace all ten rosters with imports of that one list.
- [ ] Replace all nine abbreviation maps and the `slice(0, 3)` call with one lookup, in the same
      place [bodyLabels.ts](../../../src/lib/utils/bodyLabels.ts) sits for anatomy labels.
- [ ] Build `FORMULA_VARS` and both argument lists in `PawnStatService` from that declaration so the
      positional contract cannot drift; delete the `Args MUST match` comment once it is structural.
- [ ] Collapse `PowerStat` to one declaration and widen the `types/items.ts` field to match it.
- [ ] Derive the `*Bonus` effect keys from the roster instead of listing literals, drop the six dead
      `*Penalty` entries, and make an unrecognised `*Bonus` key fail a test rather than no-op.
- [ ] Add a test asserting every roster-derived surface covers the declaration exactly — the check
      that would have caught BRA/AWA.
- [ ] Validate the data-file stat keys against the roster — `modifiers`, `statRanges`,
      `powerStat`, `primaryStat`, `wieldRequirement`, `statFocus`/`statDump` — so a typo fails a test
      instead of silently spawning a default.
- [ ] Fix the stale `carry_weight` tooltip formula.

## Out of scope

Prose is not renamable from a data file and should not be. The ~73 stat names inside `description`,
`name` and `flavor` strings, plus the mentions in code comments, stay hand-written, and any future
rename will always have to sweep them. The goal is that such a sweep touches **prose only** — not ten
rosters, nine abbreviation maps and three positional argument lists that have to be found first.
