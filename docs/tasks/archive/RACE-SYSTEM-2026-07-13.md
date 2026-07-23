<!-- LOC cap: 240 (created: 2026-06-17) -->

# RACE SYSTEM — Procedural Pool, Lore & Relations

> **Related:** [ROADMAP](../open/ROADMAP.md) · [SOCIAL-LAYER](../open/SOCIAL-LAYER.md) · [KINGDOMS-TRADE](KINGDOMS-TRADE-2026-07-12.md) (Phase 2's other-kingdom entity source) · [ENTITIES_SPAWNING (archived)](../archive/ENTITIES_SPAWNING-2026-07-10.md) · [game/DESIGN](../game/DESIGN.md) · [game/ARCHITECTURE](../game/ARCHITECTURE.md) · ADR-023 in [game/DECISIONS](../game/DECISIONS.md)

## Status

**CLOSED / ARCHIVED — 2026-07-13.** Nothing here is still open; every phase has shipped or been
relocated into the correctly-sequenced spec that owns it. This standalone spec should not have
outlived Phase 0 — its forward phases belonged in the specs they depend on, not in a parallel
open document.

- **Phase 0 — Foundation** — `[x]` shipped 2026-06-17, ADR-023 (procedural culture pool, mixed
  colonies, lore, condition-resistance hook, pokédex, `cultureRelations` stub, save migration).
- **Phase 1 — Relations → pawn social baseline** — **relocated to [SOCIAL-LAYER](../open/SOCIAL-LAYER.md)**
  (§1 "Cultural seeding", "What already exists", Phase B `seedRelationship`). It can only be built
  *after* the social layer exists, so it lives inside that spec, in sequence.
- **Phase 2 — Encounter-driven pokédex** — `[x]` shipped 2026-07-12, owned by
  [KINGDOMS-TRADE](KINGDOMS-TRADE-2026-07-12.md) §3 (visitor/caravan first-contact discovery).
- **Phase 3 — Content & variety expansion** — unblocked opportunistic content depth; folded into the
  ROADMAP "loose ends, do opportunistically" row. No standalone spec needed.

The forward-phase detail below is retained as the historical design record only.

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
> vocabulary — read it as `Culture`/`culturePool`.** Phase 1 (relations → social baseline) now lives
> in [SOCIAL-LAYER](../open/SOCIAL-LAYER.md); this spec is archived.


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

## Phase 1 — Relations → Pawn Social Baseline  **→ MOVED to [SOCIAL-LAYER](../open/SOCIAL-LAYER.md)**

> This phase is now owned by [SOCIAL-LAYER](../open/SOCIAL-LAYER.md) — see its §1 "Cultural seeding",
> the "What already exists" seams, and Phase B `seedRelationship`. The text below is the original
> statement, kept for provenance.

Wire the `cultureRelations` stub into actual gameplay via the social layer. (`CultureRelation`
carries `score` + `disposition`; dispositions are `hostile`/`wary`/`neutral`/`friendly`/`allied`.)

- [ ] When `SocialService` seeds a `PawnRelationship`, initialise its `score` from the cultural
      baseline of the two pawns' `cultureId`s (look up `cultureRelations`), **before** proximity/event deltas.
- [ ] Map `disposition` → a starting bias (e.g. `hostile` −40, `wary` −15, `neutral` 0, `friendly`
      +15, `allied` +30); decay toward individual experience over time so a friendship can still form
      across a cultural divide (and vice-versa).
- [ ] Mood/break thresholds (SOCIAL-LAYER) then pick this up for free — cross-culture colonies become
      harder to keep harmonious. **No new culture code** beyond the lookup.
- [ ] Acceptance: two pawns of mutually-`hostile` cultures start with a negative relationship; a
      regression test asserts the baseline seeding.

## Phase 2 — Encounter-Driven Pokédex  `[x]` **owned by [KINGDOMS-TRADE](KINGDOMS-TRADE-2026-07-12.md)** (done 2026-07-12)

Today the pokédex is populated only by the colony's own races; nothing in the world introduces a
*new* race. This phase makes the pokédex grow through play. **The other-kingdom entity source is now
specced** — visitors/caravans in [KINGDOMS-TRADE](KINGDOMS-TRADE-2026-07-12.md) §3 are the encounter trigger.

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

## Phase 3 — Content & Variety Expansion  **→ tracked as a ROADMAP opportunistic loose-end**

> Unblocked content depth with no dependency and no need for its own spec; folded into the ROADMAP
> "loose ends, do opportunistically" row. Original list kept below.

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
