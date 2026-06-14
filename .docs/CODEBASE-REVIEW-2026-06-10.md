# Codebase Review — open items

> **Related:** [game/ARCHITECTURE](game/ARCHITECTURE.md) · [game/DESIGN](game/DESIGN.md) · [game/DECISIONS](game/DECISIONS.md) · [ROADMAP](.tasks/open/ROADMAP.md) · [resolved (archive)](.tasks/archive/CODEBASE-REVIEW-RESOLVED-2026-06-13.md)

Living tracker of **open** architecture/defect items. Completed work — R1–R12, P-1/P-6/P-7,
PT-2/3/4, and the full PawnStateMachine decomposition — is in the
[resolved archive](.tasks/archive/CODEBASE-REVIEW-RESOLVED-2026-06-13.md). Gate at last update:
`check` 0 errors · `test` 178 · `lint` 0 · `build` ok.

---

## Structural debt (deferred by design — no big-bang)

- [x] **P-2 · Engine↔store dual source of truth.** `processGameTurn` begins with
  `this.gameState = { ...get(gameState) }` and ends with `pushFromEngine`; `getGameState()`
  deep-clones via `JSON.parse(JSON.stringify())` over a 240×160 map. The store-side throttled-notify
  is good; the read-back each tick is the inversion. Target: engine is the only writer, user actions
  become commands. Large, no functional change — do before the Living World layer adds per-tick state.
- [x] **P-3 · Services importing Svelte stores.** Done 2026-06-14. New `core/logSink.ts` defines a
  `SimLogSink` interface + live-binding `simLog` singleton (no-op default); `stores/simLogBridge.ts`
  registers an impl delegating to `Log`/`combatFeedback`, wired via side-effect import from
  `gameState.ts`. `Combat`, `EntityService`, and the pawn state machine now emit through `simLog.*`
  instead of importing stores. `CombatTextKind` moved to `core/logSink` (re-exported from
  `combatFeedback` for the renderer). Graph layer-violation warnings 24→20; headless sims/tests get
  the no-op sink (no UI logging side effects).
- [x] **P-2b · `GameEngineImpl` god-module → extract UI-coordination facade.** Done 2026-06-14.
  Engine 43 → 23 methods (god-module check now ✓). Most of the coordination cluster turned out to be
  **dead** (`getPawnNeeds`/`getCraftableItems`/`startResearch`/`assignPawnToWork`/`getAll*`/
  `calculateBuildingEffects`/… — zero callers) and was deleted from the class + `GameEngine`
  interface. The three genuinely-used methods (`getItemById`, `getBuildingById`, `craftItem`) moved
  to a new `systems/GameCoordinator.ts` singleton — the UI-facing command/query facade; writes route
  through `applyCommand` (P-2). Living-World UI coordination should grow there, not on the engine.
  Call sites (CraftingScreen, EquipmentDoll, PawnEquipment, +page) repointed to `gameCoordinator`.
  - **Codegraph blind spot (follow-up):** the dead methods were *not* flagged by `graph:check`'s
    `orphan` rule nor `/api/orphans` — both intentionally skip class methods (`!n.className`), since a
    method may be reached polymorphically via its interface. Only the `god-module` rule (>40 fns)
    pointed here; the deadness was found by grepping callers. Worth a future rule: flag interface/class
    methods whose sole reference is the interface declaration (guard against polymorphism false-positives).
- [ ] **P-4 · God files (remaining).** PawnStateMachine is done (see archive). Still oversized
  (LOC as of 2026-06-14 — all have **grown** since the original review, hence the bump):

  Progress 2026-06-14: types.ts, Combat data-table, and the JobService→BuildingService fuel-rules
  move are **done** (✅ rows below); EntityService + GameCanvas remain.

  | File | LOC | Decomposition status |
  | ---- | --- | -------------------- |
  | `core/types.ts` | 1,478 → **16** ✅ | **Done.** Split into `core/types/` domain modules (`world`, `race`, `health`, `items`, `buildings`, `jobs`, `entities`, `research`, `gamestate`); `types.ts` is now a `export *` barrel — zero call-site churn. Largest module 340 LOC. |
  | `systems/Combat.ts` | 1,499 → **932** ✅ | **Done (data table).** `BODY_PART_DEFS` table + `BodyPartDef`/`PART_DEF_MAP`/`OUTER_PARTS`/`createDefaultBodyParts`/`rollBodyPart` moved to `core/BodyParts.ts` (569 LOC); Combat re-exports `PART_DEF_MAP`/`createDefaultBodyParts` for existing importers; dead `CLOT_FLOOR` export removed. Optional follow-up: lift damage/wound math into `combatMath.ts` (entangled with class tuning constants — deferred, lower value). |
  | `services/JobService.ts` | 1,337 → **1,261** ✅ (fuel) | **Partial.** Refuel **rules** (`getRefuelThresholdRatio`/`getRefuelRequirements`/`canSatisfyRefuelRequirements`/`hasRequiredFuelTypesForRefuel` + defaults + `RefuelRequirements`) extracted to a focused new `services/fuelRules.ts` (free functions; JobService calls `fuelRules.*`). _Note:_ they went to `fuelRules.ts` rather than `BuildingService` because BuildingService was already at the 40-fn god-module limit — adding them there tripped the warning, so a dedicated module is the cleaner home. **Remaining:** the per-job-type handler split into `services/jobs/<type>.ts` (ADR-017 registry) — the bigger structural piece, still open. |
  | `services/EntityService.ts` | 2,022 | **Open.** Mirror the `pawn/*` decomposition: split the section banners into an `entity/` dir of pure `(state,…)=>state` modules — `spawning`, `ai` (the ~700-LOC stepping brain; may sub-split hostile/passive), `feeding`, `foraging`, `decay`, `movement`, `queries`. EntityService stays the singleton facade. Note: methods are `this`-coupled (e.g. `this.entityName`/`this.adjacent`), so this is a real refactor (convert to free functions), not a mechanical move. |
  | `components/UI/GameCanvas.svelte` | 3,421 | **Open, highest risk** (renderer + input + ~2,700-LOC `<script>`). Extract leaf-first: (1) `<BuildingFuelPanel>` settings UI + HUD-sprite-icon action + `selectionCard.ts` card builders (low-risk leaves); (2) overlay painting → `gameCanvas/overlay.ts`; (3) camera → `gameCanvas/camera.svelte.ts`; (4) pointer/keyboard + drag state-machines last — most coupled. **Sim-clock note:** the rAF loop here calls `gameState.stepSimulation(dt)` (sim + render share one schedule). Decoupling fully is a design change — flag, don't fold into this split. |

  Plus 21 components over the 200-line cap (ActivityLogOverlay 525, CraftingScreen/BuildingMenu 484,
  ResearchScreen 452, ZonePanel 447, EntityScreen 422…). Split along existing seams opportunistically.
  Optional: sub-split the 788-LOC `pawnHelpers.ts` (movement / finders / need-distance / hunt) — no
  longer a god-module, low priority.

  **Suggested order:** `types.ts` (mechanical, zero churn) → `Combat.ts` (data-table extraction is a
  big cheap win) → `JobService.ts` (ADR-017-aligned) → `EntityService.ts` (pawn/* precedent) →
  `GameCanvas.svelte` (opportunistic, leaf-first). Each is independent; none needs a big-bang.
- [ ] **P-4b · PawnStateMachine Step 5 — push selection into services.** `handleIdle` and
  `checkNeedInterrupts` still make the "what should this pawn do next" decision inline. Move job
  selection into `JobService` and need-target selection into `PawnService`, leaving the handlers to
  *apply* a decision. The deepest, still-deferred part of the hotspot decomposition.
- [ ] **P-5 · Per-tick allocation churn.** Index-once/update-once tick rewrite undone; per-pawn-per-tick
  scans added since (`findCombatThreat` over all mobs; `occupancyService.blockedTiles` rebuilt per
  pathfind; `findNearestRestBuilding` scans pawns×buildings). Profiling-gated — don't touch until
  `__profOut` says so; but no new system should add full-array `pawns.map(...)` writes for single-pawn
  updates.

## Latent defects (found in passing — not yet scheduled)

- [ ] **INV-1 · `inventory.items` overloaded: haul-carry vs equip-screen pool.**
  `syncPawnInventoryWithGlobal` / `syncAllPawnInventories` (`core/PawnEquipment.ts`), called from
  `components/pawn/PawnEquipment.svelte` on equip/unequip/consume, **overwrite** `pawn.inventory.items`
  with the *colony stockpile* (non-material, minus equipped). So the same field means "what this pawn
  is hauling" (written by haul/fetch pickup) in the sim, but "the equip-screen item pool" after the
  equip UI runs. Effect: `getCurrentCarryLoad` (→ the `[load/max kg]` readout in `PawnInventory.svelte`,
  and `clampPickupQuantity`) can reflect a slice of the whole colony's goods after the equip screen is
  opened, not what the pawn actually carries. Found while fixing equipped-gear carry weight
  (2026-06-14, equipped items now count toward weight). Fix direction: give the equip UI its own
  derived pool (don't mutate `inventory.items`); keep `inventory.items` strictly the pawn's carried
  goods. Medium; touches the equip screen + the legacy global-item sync.
- [ ] **LIGHT-1 · §G light→work-speed is inert (`tile.lightLevel` never written).**
  `WorldTile.lightLevel` is declared (`core/types/world.ts`) and READ by the work loop
  (`pawn/handlers/work.ts` → `lightWorkMultiplier`, ~0.4 dark … 1.0 day), but **nothing ever writes
  it** — no worldgen pass, no per-turn tick. So it's always `undefined` → defaults to `1`, and
  darkness never actually slows work; the §G "light → sight → work speed" model does nothing in the
  sim. (The visual point lighting + the hovered-tile readout via `computeTileLightLevel` are separate
  and DO work — see the data-driven `lightRadius` change 2026-06-14.) Fix direction: add a per-turn
  pass that writes `lightLevel = computeTileLightLevel(turn, buildings, x, y)` for occupied/work
  tiles (or compute lazily in the work handler from ambient + nearby emitters). Found 2026-06-14 while
  generalising building light. Small-ish; mostly deciding where to compute it without scanning the
  whole 240×160 map per tick.

## Carried-forward deferred (unchanged status)

- [ ] **D9.1 / D9.6 / D9.7** — index-once tick, deep-clone removal (tied to P-2), event-driven job generation. Profiling-gated.
- [ ] **D-perf** — cooldown index for regrowth, tick strides, incremental job board.
- [ ] **D-bills** — `productionTargets` exists in state with nothing driving it.
- [ ] **ADR-009 step 2** — per-pawn claimed-inventory tool gating (R4 was step 1).
- [ ] **R11 remainder — Events phase.** ARCHITECTURE's turn order no longer lists it, but
  `core/Events.ts` (~hundreds of lines, ADR-006) is still fully unwired — either wire it or cut it.

## Tier 0 — broken-loop bugs ✅ DONE 2026-06-14

Sourced from playtest + `game/NOTES.md`. Made the *existing* combat/survival/production slice
visibly broken; all small. Shipped 2026-06-14 — gates: `check` 0 · `test` 162 · `lint` 0 · `build` ok.

- [x] **NT-1 · Trait cards leak `Efficiency: [object Object]`.** Root cause: `PawnTraits`/`RaceScreen`
  only special-cased the literal keys `workSpeed/workYield/workQuality`; a work-mult map under any other
  key (legacy persisted `workEfficiency`) fell to the neutral branch and `formatEffectValue` stringified
  the object. Fix: both renderers now handle **any object-valued effect** generically via a shared
  `workAxisLabel(key)`, and `formatEffectValue` formats objects as a `%` list (never `[object Object]`).
- [x] **NT-2 · Death not finalised — pawn lingered in UI.** Combat killed pawns by setting
  `isAlive=false` directly, **bypassing `killPawn`** (no corpse/gear/`deadPawns`/mood). Added
  `reapDeadPawns(state)` — an end-of-turn reaper (in `processGameTurn` after combat) that finalises any
  un-flagged dead pawn (`corpseDropped` marker) and **removes all dead pawns from `pawns[]`** so they
  leave every UI list. `PawnScreen` falls back to the first living pawn when its selection is reaped.
  Corpse swap (`pawn_carcass`) was already in `killPawn` (R10). Tests in `deathDrops.test.ts`.
- [x] **NT-3 · Combat + infection too fast.** Attack interval `BASE_ATTACK_INTERVAL_TICKS` 30→60
  (+ floor 18→`MIN_ATTACK_INTERVAL_TICKS` 36) — halves all pawn/mob attack speed. Infection:
  `infectionRiskPerWound` 0.0012→0.0004 **and** a new `infectionRiskMaxPerTick` 0.0008 cap so many
  combat wounds can't stack into a near-instant lethal infection (the "died mid-combat" report).
  *(Follow-up: hit-accuracy rebalance now that swings are slower — NT backlog.)*
- [x] **NT-4 · Drafted pawn auto-engages adjacent hostile.** **Decision: auto-attack** (not
  click-to-target). A drafted pawn with no explicit `attack` order now swings at the nearest adjacent
  hostile (new `else if (pawn.drafted)` branch in the Combat pawn-attack loop) — walk a drafted pawn up
  to an enemy and it fights instead of standing inert. Test in `combatSim.test.ts`.
- [x] **PT-1 · Hauling deposited short ("hang").** `findNearestDepositPoint` now returns the nearest
  **standable** tile (walkable + unoccupied via `occupancyService.isBlocked`) — the zone tile itself for
  a stockpile, an adjacent free tile for a building — instead of the nearest-by-distance tile the pawn
  couldn't stand on. Falls back to deposit-in-place only when nothing in the tier is standable. Soft-queue
  preview deduped. Tests in `pawn/depositPoint.test.ts`.

## Tier 0 UI polish (from NOTES — cheap, opportunistic)

- [ ] **NT-U1 · Toggleable health panel** in the info panel showing only damaged limbs/wounds; "no damage"
  when all healthy.
- [ ] **NT-U2 · Info-panel buttons** moved adjacent (right) and outside the panel.
- [ ] **NT-U3 · Fixed-width info-panel skeleton** so long descriptions wrap instead of stretching the
  panel across the viewport; unify panel width across all object types.
- [x] **NT-U4 · Draft target line draws while paused** (currently only renders after unpausing).

## NT backlog (deferred — not Tier 0)

- [ ] **MOOD spec** — companion death → strong negative mood; defeating a hostile → positive mood;
  consider a `mood.jsonc` to centralise mood effects. *Content/feature — defer per skateboard model.*
- [ ] **Hit-accuracy rebalance** — after NT-3 speed halving, cross-reference combat logs vs entity stats;
  likely buff accuracy. Do *after* the speed change so they're tuned together.
- [ ] **Entity stamina / breaks** — give mobs stamina + forced rests like pawns. Needs investigation.

## Tier 1 / Tier 2 (after Tier 0)

- **Tier 1 — before Living World:** ✅ P-2 (engine as sole writer) + P-3 (inject log sink) done
  2026-06-14 — large, no-functional-change inversions. Still worth an in-browser smoke (activity log /
  combat floaters / UI snapshot). P-2b (facade extraction) remains open before Living World lands.
- **Tier 2 — next feature:** Living World B–D (seasons / weather / fog) — ROADMAP Wave 6.

## Suggested sequencing

1. **Tier 0 now:** NT-1 → NT-2 → NT-3 → PT-1 → NT-4 (+ UI polish NT-U* opportunistically).
2. **Tier 1 (before Living World):** ✅ P-2 + P-3 inversions done; P-2b facade extraction still open.
3. **Tier 2:** Living World B–D.
4. **Opportunistic (no big-bang):** P-4 god-file splits (GameCanvas, EntityService, Combat) along seams; P-4b Step 5 selection→services.
5. **Profiling-gated:** P-5 per-tick allocation — only when `__profOut` says so.
6. **Physical-production follow-ups** (ADR-016; spec archived at [PHYSICAL-PRODUCTION](.tasks/archive/PHYSICAL-PRODUCTION-2026-06-13.md)): tool-gating step 2 (per-pawn inventory + `minTier` + craft-tool gating), per-stack craft quality on instances (R8), butchery multi-yield (content), passive-furnace flagging for forge/hearth.
