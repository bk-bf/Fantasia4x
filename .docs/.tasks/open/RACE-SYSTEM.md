<!-- LOC cap: 240 (created: 2026-06-17) -->

# RACE SYSTEM — Procedural Pool, Lore & Relations

> **Related:** [ROADMAP](ROADMAP.md) · [SOCIAL-LAYER](SOCIAL-LAYER.md) · [KINGDOMS-TRADE](KINGDOMS-TRADE.md) (Phase 2's other-kingdom entity source) · [ENTITIES_SPAWNING (archived)](../archive/ENTITIES_SPAWNING-2026-07-10.md) · [game/DESIGN](../game/DESIGN.md) · [game/ARCHITECTURE](../game/ARCHITECTURE.md) · ADR-023 in [game/DECISIONS](../game/DECISIONS.md)

## Status

**Phase 0 (Foundation) — [x] 2026-06-17, ADR-023.** Shipped in one pass: procedural race
pool, mixed colonies, procedural lore/description, trait-DB cleanup + condition hook, the
known-races pokédex, and the `raceRelations` data stub. This spec records that foundation and
**lays out the forward phases** it deliberately stubbed — relations→social wiring, encounter-driven
pokédex population, and content/variety expansion. Phases 1–3 are **not started** and several are
gated by other specs (SOCIAL-LAYER, an other-kingdom entity source).

> **Trait model superseded (2026-07-06, ADR-028):** `racial-traits.jsonc` → `traits.jsonc` with
> `scope` (racial/personal), `rarity` (rarities.jsonc scale) and typed `kind` payloads; per-pawn draw
> (≤2 racial + ≤3 personal); natural armor as gear (weight → encumbrance); afflictions as real
> permanent wounds. See [TRAITS (archived)](../archive/TRAITS-2026-07-10.md).

> **`Race` → `Culture` rename complete (2026-07-13).** The concept is now **Culture** throughout
> code and UI: `core/Culture.ts`, `types/culture.ts`, `database/culture-lore.jsonc`,
> `CultureScreen.svelte` + `culture/CultureDetail.svelte`, and the `culturePool` / `cultureId` /
> `cultureMix` / `discoverCulture` / `cultureRelations` identifiers. Landed piecemeal across the
> 2026-07-09 trait cleanup and the 2026-07-12 KINGDOMS-TRADE work; no `race*` identifiers remain and
> no user-facing "Race" strings survive. **Phase 0 below is described in the original `Race`/`racePool`
> vocabulary — read it as `Culture`/`culturePool`.** Only Phase 1 (relations → social baseline) is
> still open, and it stays blocked on SOCIAL-LAYER.


---

## Goal

Make race a meaningful axis of identity and emergent story instead of a one-time cosmetic roll.
A game has many distinct peoples; colonists are a *mix* of them; the player learns who they are
(pokédex) and how they regard one another (relations), and those relations eventually drive
social friction between individual pawns.

---

## Phase 0 — Foundation (DELIVERED, ADR-023)

What exists today (`core/Culture.ts`, `database/traits.jsonc` + `culture-lore.jsonc`,
`stores/gameState.ts`, `services/PawnStatService.ts`, `screens/CultureScreen.svelte` + `culture/CultureDetail.svelte`):

- [x] **Race pool** — `GameState.racePool` holds 15–25 prerolled archetype-biased races, each with a
      unique kebab `id`, `archetype`, and `lore`. `race` kept as the home alias (`racePool[0]`).
- [x] **Mixed colony** — `generateColonyPawns` draws each pawn from a random pool race; pawns carry
      `raceId`/`raceName`. Surfaced in the Pawn tab (RACE row + selector tag).
- [x] **Procedural lore + description** — authored trait `flavorLine`s + lore clause banks assembled
      by numeric buckets (stats/size/build) into a 3–4 sentence paragraph.
- [x] **Trait DB fixed to `stats.jsonc`** — stale axes corrected, dead effect fields pruned (kept
      `nightVision`), `id` + `flavorLine` on every trait, new traits for under-used quality/yield axes.
- [x] **Condition-resistance hook** — trait resistances feed `*_resistance` stats in
      `evaluateStat`, so race biology flows into condition onset (cold→hypothermia) with no new machinery.
- [x] **Known-races pokédex** — `RaceScreen` lists discovered races; detail pane reuses `StatBar`
      (rolled range + trait boost → effective range), lore, physique ranges, traits, relations.
- [x] **Relations stub** — `GameState.raceRelations` (symmetric `score`/`disposition` per race pair),
      displayed in the pokédex. **No mechanical effect yet.**
- [x] **Discovery hook** — `discoverRace(state, id)` exists; colony races auto-discovered at bootstrap.
- [x] Migration backfills pool/relations/`raceId` for legacy single-race saves; `Race.test.ts` guards drift.

---

## Phase 1 — Relations → Pawn Social Baseline  `[ ]` **blocked on SOCIAL-LAYER**

Wire the `raceRelations` stub into actual gameplay via the social layer.

- [ ] When `SocialService` seeds a `PawnRelationship`, initialise its `score` from the racial
      baseline of the two pawns' `raceId`s (look up `raceRelations`), **before** proximity/event deltas.
- [ ] Map `disposition` → a starting bias (e.g. `hostile` −40, `wary` −15, `neutral` 0, `friendly`
      +15, `allied` +30); decay toward individual experience over time so a friendship can still form
      across a racial divide (and vice-versa).
- [ ] Mood/break thresholds (SOCIAL-LAYER) then pick this up for free — cross-race colonies become
      harder to keep harmonious. **No new race code** beyond the lookup.
- [ ] Acceptance: two pawns of mutually-`hostile` races start with a negative relationship; a
      regression test asserts the baseline seeding.

## Phase 2 — Encounter-Driven Pokédex  `[x]` **owned by [KINGDOMS-TRADE](KINGDOMS-TRADE.md)** (done 2026-07-12)

Today the pokédex is populated only by the colony's own races; nothing in the world introduces a
*new* race. This phase makes the pokédex grow through play. **The other-kingdom entity source is now
specced** — visitors/caravans in [KINGDOMS-TRADE](KINGDOMS-TRADE.md) §3 are the encounter trigger.

- [x] Define the encounter source (visitors / caravans / rival settlements / migrant-join events) —
      coordinate with ENTITIES_SPAWNING and any future kingdom layer; pick the lightest that fits.
      (2026-07-12 — kingdom visitor/caravan parties, KINGDOMS-TRADE §3)
- [x] On first contact, call `discoverRace(state, id)` → the race appears in the pokédex with its
      full lore even though no colonist is of that race. (2026-07-12 — `kingdomService.recordContact`
      flips the sender's dominant culture on first contact, the whole `cultureMix` once the colony is
      familiar [knowledge tier ≥ 2]; sim-side, since the worker can't reach the store's `discoverCulture`)
- [ ] Optional: a "first encountered: turn N / where" line on the pokédex entry. (still open — nice-to-have)
- [x] Acceptance: encountering a non-colony pool race flips it `discovered` and renders its entry.
      (2026-07-12 — asserted in `kingdomParties.test.ts`)

## Phase 3 — Content & Variety Expansion  `[ ]` (incremental, unblocked)

Pure content depth on the existing generator — do opportunistically.

- [ ] **Stat-focus spread** — most archetypes currently lean CON, so the sentence-1 comparative
      ("endurance over speed") recurs across the pool. Diversify archetype `statFocus`/`statDump` and
      add more `comparative` variants so pokédex entries read more distinctly.
- [ ] **More archetypes** (target ~16) + per-archetype **name banks** (so a Mountain-born race
      *sounds* different from a Marsh-folk one, vs the shared prefix/suffix pool today).
- [ ] **More traits** filling remaining quality/yield axes and a few flavour-only specials.
- [ ] Optional: race **size/diet/lifespan** flavour hooks if/when those systems want them.

---

## Open Questions

- [ ] Should the home race get any starting-population weighting, or is fully-uniform mixing final?
      (Current: fully uniform — locked for Phase 0.)
- [ ] Do racial relations ever shift at runtime (war/alliance events), or stay fixed per game?
      (Current: fixed. Runtime drift would belong to a diplomacy layer, not here.)
- [ ] Romance/lineage across races — deferred to SOCIAL-LAYER Phase 2.

---

## Non-Goals

- Diplomacy / inter-kingdom warfare (separate future system; relations here are pawn-flavour only).
- Race-locked tech or buildings (research stays race-agnostic per current design).
