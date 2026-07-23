<!-- VISITORS — kingdom guests as non-colonist PAWNS: kin/family from another realm who live at the
     colony for a spell (eat their own food, gather at the campfire, haul), can be viewed but not
     commanded, leave a lore-gift if kept happy, and cost mood + relations if evicted. Extends
     KINGDOMS-TRADE §3 (visitor parties, currently mobs). Design locked with the user 2026-07-14; NOT yet built. -->
<!-- LOC cap: 320 (created: 2026-07-14) -->

# VISITORS — Kingdom Guests as Non-Colonist Pawns

> **Related:** [ROADMAP](ROADMAP.md) · [KINGDOMS-TRADE (archived)](../archive/KINGDOMS-TRADE-2026-07-12.md) · [SOCIAL-LAYER](SOCIAL-LAYER.md) · [game/DESIGN](../../game/DESIGN.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [game/DECISIONS](../../game/DECISIONS.md) (ADR-032 draft below) · [ENGINE-PERFORMANCE](../archive/ENGINE-PERFORMANCE.md)

**Status:** Design locked (2026-07-14), unimplemented. Foundation + Phases 1–4 below are the build order.
This supersedes the mob-based `visitor` party from KINGDOMS-TRADE §3 (the **caravan** stays a mob; only the
**visitor** kind is promoted to pawns). Config for both already lives in [`events.jsonc`](../../../src/lib/game/database/events.jsonc) `visitors` / `caravan`.

---

## 1. The fantasy — a guest, not a colonist

Every so often a small party (**1–5**) arrives from a known realm — **most often the off-colony family of
one of your pawns** (a sister, a father), sometimes just friendly strangers. They are **not colonists**: you
cannot draft them, cannot change their gear, cannot assign them arbitrary work. But they are **not scenery**
either — they **live with the colony**: they run the full needs/mood loop (hunger, thirst, fun…), gather
around the **campfire**, socialise with your pawns, and **pitch in on mundane hauling**. They **bring their
own food** so a young colony isn't bled dry feeding guests.

They stay a **random 3 days – 2 weeks**, then leave. Keep their mood up and they **leave a parting gift** — an
item fitting their kingdom's lore. Throw them out early (a button) and it **stings**: a **mood debuff** on your
colonists (you turned away kin) and a **relations hit** with their kingdom.

## 2. The foundation decision (locked)

- [ ] **Visitors are non-colonist `Pawn` objects** living in `state.pawns` behind an `isVisitor` flag — NOT
  mobs. Rationale: everything the fantasy needs (the `fun`/social need, **mood** → gift, pawn-style viewing,
  haul-job eligibility) is the *colonist* system; mobs have only hunger+fatigue and no mood. Reusing the pawn
  stack is the only path that isn't a from-scratch rebuild on the mob side. The entire cost of this choice is
  **fencing** visitors out of colonist-only assumptions (§4). See **ADR-032 draft** (§9).
- [ ] **The caravan stays a mob** (`entity/kingdomParties.ts`) — trade party, camps ~15 tiles out, unchanged.
- [ ] **Map-click only** — visitors do **not** appear in the Pawn/Work roster screens (keeps colonist lists clean).
- [ ] **~70 % kin, ~30 % stranger** — a visitor party is usually sourced from a real colonist's off-colony
  relative (KingdomService already tracks kin per kingdom); else generated from the sending culture.

## 3. Where it plugs in (pre-existing machinery)

- **Pawn type**: [`entities.ts:264`](../../../src/lib/game/core/types/entities.ts#L264) (`Pawn`). Add fields (§5).
- **Spawn**: replace the visitor branch of [`spawnKingdomParty`](../../../src/lib/game/services/entity/kingdomParties.ts) with a pawn spawn; reuse `generateColonyPawns`
  ([`Pawns.ts:628`](../../../src/lib/game/entities/Pawns.ts#L628)) + KingdomService kin lookup (`colonyKinInKingdom`, [`KingdomService.ts:303`](../../../src/lib/game/services/KingdomService.ts#L303)). Arrival still rolled by
  `maybeScheduleArrival` ([`KingdomService.ts:149`](../../../src/lib/game/services/KingdomService.ts#L149)) on the shared events.jsonc cadence.
- **Needs/mood/FSM/movement tick already iterate all `state.pawns`** and only skip the dead — visitors are
  included **for free** and SHOULD be ([`processNeedsTick`](../../../src/lib/game/services/PawnService.ts#L422), [`PawnStateMachine.tick`](../../../src/lib/game/systems/PawnStateMachine.ts#L1428)). Only food/water *sourcing* is fenced (§4).
- **Campfire**: the `campfire` building already exists (`buildings.jsonc`) — the gather anchor.
- **Mood debuff**: `mood.jsonc` effect + `MoodModifier` via `computeMoodTarget` ([`PawnService.ts:673`](../../../src/lib/game/services/PawnService.ts#L673)).
- **Relations**: `adjustColonyRelation` ([`KingdomService.ts:534`](../../../src/lib/game/services/KingdomService.ts#L534), clamps ±100).

## 4. Fencing surface — exclude visitors here (from the blast-radius sweep)

A `colonists(state)` helper (all non-visitor, living pawns) is the single tool; repoint each gate to it.

- [ ] **Population gates** → colonist count: HUD [`ResourceSidebar.svelte:39`](../../../src/lib/components/UI/ResourceSidebar.svelte#L39); research pop-gate [`ResearchService.ts:156`](../../../src/lib/game/services/ResearchService.ts#L156); recipe pop-gate [`ItemService.ts:434`](../../../src/lib/game/services/ItemService.ts#L434); building min-pop + construction workers [`BuildingService.ts:302`](../../../src/lib/game/services/BuildingService.ts#L302)/`:355`; save-meta headcount [`saveManager.ts:129`](../../../src/lib/stores/saveManager.ts#L129).
- [ ] **Food & water sourcing** → visitor eats/drinks its **carried stash**, not colony stores: [`hasAvailableFood`](../../../src/lib/game/systems/pawn/pawnQueries.ts#L97); food fetch/eat [`handlers/needs.ts:137`](../../../src/lib/game/systems/pawn/handlers/needs.ts#L137)/`:620`; drink `consumeFromStockpiles` [`handlers/needs.ts:229`](../../../src/lib/game/systems/pawn/handlers/needs.ts#L229). (Needs still *rise* normally — only the source changes.)
- [ ] **Work** → **haul-only**: guard [`JobService.getAvailableJobs`](../../../src/lib/game/services/JobService.ts#L238) to haul jobs for visitors; skip visitors in `WorkService.ensureDefaultWorkAssignments` ([`:173`](../../../src/lib/game/services/WorkService.ts#L173)); no colony work-XP (`applyWorkXp`).
- [ ] **UI controls** → view yes, command no: hide DRAFT [`selectionCard.ts:551`](../../../src/lib/components/UI/gameCanvas/selectionCard.ts#L551) (MOVE is drafted-only, falls away); reject `toggleDraft` command for visitors; hide equipment swap ([`PawnEquipment.ts:168`](../../../src/lib/game/core/PawnEquipment.ts#L168)/`:224` + `PawnEquipment.svelte`) and the force-work/rest/stance panels.
- [ ] **Culture / kin bookkeeping** → don't attribute visitor cultures to the colony pokédex/headcount ([`gameState.ts:486`](../../../src/lib/stores/gameState.ts#L486)); don't treat visitors as colony kin anchors in `reuniteKin`/`colonyKinInKingdom` ([`KingdomService.ts:303`](../../../src/lib/game/services/KingdomService.ts#L303)).
- [ ] **Roster screens** → exclude from Pawn/Work grids ([`WorkScreen.svelte:9`](../../../src/lib/components/screens/WorkScreen.svelte#L9), `PawnScreen.svelte:71`) per §2 map-click-only.

**No change needed** (confirmed absent): colony mood-average, food-per-capita, housing-per-pawn, and any
victory/defeat keyed on pawn count — none exist today. If added later, count colonists only.

## 5. Data & type changes

- [ ] `Pawn` (COLD snapshot fields — rarely change, ride the PAWN_COLD split): `isVisitor?: boolean`,
  `visitorKingdomId?: string`, `departTurn?: number`, `foodStash?: Record<string, number>` (item id → units).
- [ ] `mood.jsonc`: new effect `guest_evicted` (negative, timed) — applied to colonists on early eviction.
- [ ] New command `evictVisitor(pawnId)` (sim/commands) → despawn + apply mood/relation penalties.
- [ ] Gift picker: `giftForKingdom(kingdom)` → a lore-fitting item id (reuse kingdom `lore`/wealth → item table).

## 6. Config (`events.jsonc` `visitors`)

- [ ] **Drop** `anchorRing` (visitors gather at the campfire, not a distant ring).
- [ ] **Add** `stayDaysRange: [3, 14]`, `foodStashDays` (days of food each guest carries), `giftMoodThreshold`
  (mood ≥ this on leave → gift), `giftChance`, `evictMoodPenalty`, `evictMoodDays`, `evictRelationPenalty`.
- [ ] **Set** `partySize: [1, 5]` (was `[2, 4]`).

## 7. Build order (phased; each phase is playable + testable)

- [ ] **Foundation** — `isVisitor` field + `colonists()` helper + repoint every §4 population/culture gate.
  Pawn-based visitor spawn (kin-weighted) replacing the mob visitor branch. Verify: a visitor arrives, wanders,
  is absent from population/research/recipe gates and roster screens.
- [ ] **Phase 1 — live with the colony**: carried food/water stash (fence §4 sourcing); campfire-gather idle
  behavior (replaces `anchorRing`); `fun`/mood tick (free). Verify: guest eats own food (colony stores flat),
  loiters at campfire, mood moves.
- [ ] **Phase 2 — restricted work**: haul-only job eligibility; no default labor; no work-XP. Verify: guest
  hauls, ignores all other jobs.
- [ ] **Phase 3 — view, don't control**: selection card shows "Guest of ⟨Kingdom⟩"; DRAFT/MOVE/equip/force-work
  hidden + command rejected. Verify: click-to-view works, no command controls.
- [ ] **Phase 4 — depart / evict / gift**: auto-leave after `stayDaysRange` (walk to edge, despawn); `evictVisitor`
  button → colonist `guest_evicted` mood debuff + `adjustColonyRelation` hit; gift on leave when mood ≥ threshold.
  Verify: natural leave + gift; eviction penalties land.

## 8. Open tuning questions (resolve during build)

- [ ] Gift item table per kingdom lore — reuse the caravan stock generator, or a bespoke small gift pool?
- [ ] Do visitors socialise via the existing SOCIAL-LAYER conversation system (they're pawns, so it may fire
  automatically) — desired, but confirm it doesn't spam the chronicle or pair-bond a guest with a colonist.
- [ ] Should a guest's death (starved/killed at the colony) carry a relations penalty like a killed caravan mob
  (`onKingdomMobKilled` −45)? Likely yes.

## 9. ADR-032 draft (add to `DECISIONS.md` + onboard into `codegraph.config.json` when built)

**Non-colonist pawns live in `state.pawns` behind an `isVisitor` flag.** Guests reuse the entire pawn stack
(needs, mood, FSM, movement, haul jobs, selection card) instead of a parallel entity type or an extended mob.
The cost — and the rule — is that **colonist-only reads must go through `colonists(state)`**, never raw
`state.pawns`, for: population counts, research/recipe/building gates, food/water sourcing, work eligibility,
culture/kin attribution, and roster screens (§4). Needs/mood/FSM/movement ticks deliberately include visitors.
Graph-checkable candidate: flag raw `state.pawns.length` in the gate modules once `colonists()` exists.

## 10. Acceptance criteria

- [ ] `isVisitor` (+ `visitorKingdomId`, `departTurn`, `foodStash`) on `Pawn`; survives COLD snapshot split & save/load.
- [ ] `colonists(state)` helper; all §4 population/culture/roster gates read it — no raw `state.pawns` count in a colonist gate.
- [ ] Visitor kind spawns as pawns (kin-weighted ~70/30); caravan unchanged as a mob.
- [ ] Visitor eats/drinks from `foodStash` only — colony food/water untouched by a guest (asserted in a test).
- [ ] Visitor gathers at the campfire when idle; needs/mood tick normally.
- [ ] Visitor claims only haul jobs; gains no work-XP; absent from the Work grid.
- [ ] Selection card views a visitor; DRAFT/MOVE/equipment/force-work controls hidden and the commands rejected.
- [ ] Auto-departure after `stayDaysRange`; parting gift when mood ≥ `giftMoodThreshold`.
- [ ] `evictVisitor` applies `guest_evicted` colonist mood debuff + kingdom relation penalty.
- [ ] `events.jsonc` `visitors` updated (§6); ADR-032 written into `DECISIONS.md` + onboarded into `codegraph.config.json`.
- [ ] `docs/game/DESIGN.md` (visitor mechanic) + `ARCHITECTURE.md` (`colonists()` helper / visitor spawn) updated; ROADMAP row added.
