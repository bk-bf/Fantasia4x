# Codebase Review — 2026-06-13 (v2)

> **Related:** [game/ARCHITECTURE](game/ARCHITECTURE.md) · [game/DESIGN](game/DESIGN.md) · [game/DECISIONS](game/DECISIONS.md) · [ROADMAP](.tasks/open/ROADMAP.md)

> **Supersedes the 2026-06-10 review**, which was fully triaged and implemented on
> 2026-06-11 (all D1–D10/P0/P2 items done or explicitly deferred). Items deferred there
> that are still relevant are carried forward in Part III with their original IDs.
> This pass re-traces the simulation core from scratch plus everything that landed
> since: the production-chain expansion (ceramics/smelting/fuel-heat), equipment
> expansion (layered slots, weight/volume inventory), the combat/wound system
> (ADR-012/014), work-driven hunting, thirst/hygiene needs, and the ADR-015 work-model
> unification.

**Verification gate at review time:** `pnpm check` 0 errors (10 a11y/CSS warnings) ·
`pnpm lint` clean · `pnpm test` 117 passing in 21 files · `pnpm build` succeeds.

> **STATUS UPDATE (2026-06-13 — ADR-016 physical-production pass + follow-ups).** The
> reserve-and-fetch rework (spec: [PHYSICAL-PRODUCTION](.tasks/open/PHYSICAL-PRODUCTION.md),
> ADR-016) and its follow-ups closed several items below:
> **✅ R1** (`gs.item` removed entirely — craft output is real stockpile stock; ceramics/firewood
> chains work) · **✅ P-1** (legacy `gs.item` pool + `currentItem` gone) · **✅ R3** (butchery is
> recipe-based, one carcass/run; dead `processButchery` removed) · **✅ R4** (colony-stock tool
> gating in `getAvailableJobs`; bootstrap unblocked — tool-free `stone_outcrop`, station tiers,
> Crude Workbench, `stone_pick`/`stone_hoe` added) · **✅ R5** (`clampPickupQuantity` enforces
> carry budget at pickup, floors at 1) · **✅ R8** (moot — per-stack quality dropped with `gs.item`;
> re-attach to instances later) · **✅ R6** (dead `constructBuilding`/`processBuildingQueue`/
> `startBuilding`/`buildingQueue` triad deleted; placement is physical reserve-and-fetch) ·
> **✅ R7** (`isWorking` now derived from FSM state, `currentWork` from the active job; dead
> `getAvailableWorkForPawn`/`canPawnDoWorkByType` + duplicate per-tick call removed) ·
> **✅ R9** (hunting interrupts go through `checkNeedInterrupts` — ADR-010 proximity, job-dist =
> distance to quarry) · **✅ R10** (`killPawn` drops carried items + equipped gear + a `dynamicName`
> corpse "<Name>'s Corpse" on the death tile) · **~ R11.1** (`Events.ts` no longer writes `gs.item`;
> events phase still unwired).
> Plus new: building-material hauling, passive furnaces, and "long jobs yield to needs" (thirst
> added to `checkNeedInterrupts`). Tests **117 → 138**.
> **Still open:** R2 (the last HIGH), R12, and structural P-2…P-6 (unchanged). Current gate:
> `check` 0 errors · `test` 138 passing · `lint` 0 errors · `build` ok.

---

## Scorecard

| Area                    | 06-10 | Now | Notes                                                                                   |
| ----------------------- | ----- | --- | --------------------------------------------------------------------------------------- |
| Architecture & layering | B−    | A−  | Engine near coordinator-only; per-tile storage model is the single source of truth — the `gs.item` seam is **gone** (ADR-016) |
| Engine correctness      | C−    | B   | R1/R3/R4/R5/R8 fixed + regression-tested; physical production (reserve-and-fetch, building hauling, passive furnaces) shipped. Still open: R2 drafted-pawn health |
| Simulation testing      | D     | B+  | 32 → **133** tests; the cross-system seams (craft→build, draft→health, tool gating) are now covered |
| Tick-loop structure     | C+    | C+  | Same deferred O(P²) churn (D9.1); a passive-production phase added (skips when idle); scale still fine |
| Data-driven design      | A−    | A   | Recipes/wounds/stats/creatures all JSONC; `Work.toolsRequired` + `interaction.toolRequirement` now **wired** into gating; station tiers via `effects.tier` |
| Documentation           | A     | A−  | ADR discipline excellent; the DESIGN over-promises (tool gating, inventory budget) are now true in code; events-phase mismatch (R11) remains |
| Tooling & CI            | C     | B+  | check/lint/test/build all real and green; no CI by choice                               |

---

# Part I — Defects, ranked by severity

## R1 · CRITICAL — Crafted primary outputs land in the legacy `gs.item` pool, invisible to the entire economy

> **✅ RESOLVED (ADR-016).** `gs.item` removed; `_completeCraft`/`completeCraftOrder` spawn outputs
> as physical drops on the station tile → real stockpile stock. Regression-tested (craft an
> intermediate → spend it on a building/recipe).

The colony economy has one source of truth: `stored` DroppedItems on tiles, aggregated
into `gameState.stockpile` ([GameState.ts:200](../src/lib/game/core/GameState.ts#L200)
`aggregateFromDrops`). **Every consumer reads it**: recipe inputs
(`ItemService.getAvailableQuantity` → stockpile only,
[ItemService.ts:328](../src/lib/game/services/ItemService.ts#L328)), building costs
(`BuildingService.resolveBuildingCost` reads `gameState.stockpile`,
[BuildingService.ts:147](../src/lib/game/services/BuildingService.ts#L147)), research
material costs ([ResearchService.ts:140](../src/lib/game/services/ResearchService.ts#L140)),
refuel jobs ([JobService.ts:919](../src/lib/game/services/JobService.ts#L919)), tool wear
([ItemService.ts:626](../src/lib/game/services/ItemService.ts#L626)), butchery stock checks,
casting-mold checks.

But `JobService._completeCraft` routes the **primary output of every craft job into the
legacy `gs.item` array** ([JobService.ts:771](../src/lib/game/services/JobService.ts#L771)) —
only **byproducts** go through `itemService.addItems` → stockpile. The only readers of
`gs.item` are eating (`hasAvailableFood`/`selectFoodForMeal`), equipment
(`PawnEquipment.ts`), the unwired Events system, and the UI's `currentItem` store.

**Net effect: anything you craft cannot be used as a material, fuel, building cost, or
research cost.** Concrete broken chains, all shipped as "✅ done" on the roadmap:

- `make_fire_bricks` outputs `{fire_bricks: 1}` ([recipes.jsonc:508](../src/lib/game/database/recipes.jsonc)) → `gs.item`. The `advanced_kiln` costs `{"fire_bricks": 8, "granite": 6}` ([buildings.jsonc:203](../src/lib/game/database/buildings.jsonc)) → reads stockpile. **The ceramics tier added 2026-06-12 cannot be completed.**
- `split_firewood` puts `green_firewood` (primary) in `gs.item` and `branch` (byproduct) in stockpile — **split firewood can never refuel a campfire**; only the branches can. The test [jobCraftByproducts.test.ts:41-43](../src/lib/game/services/jobCraftByproducts.test.ts) pins this split as if intended.
- Research costing `fire_bricks: 5` ([research.jsonc:284](../src/lib/game/database/research.jsonc)) is unfulfillable.
- A crafted `stone_axe` is invisible to `applyToolWear` (reads stockpile), so crafted tools never wear — and would be invisible to ADR-009 claim-time gating if it existed (R4).

This is the same defect class as the old D1 (producer feeds pool A, consumer reads pool
B), one layer up. **Fix:** route the primary output through `addItems` (stockpile) like
byproducts; carry quality on the stored drop or an `ItemInstance` instead of
`gs.item[].properties.quality`. Then audit the remaining `gs.item` readers (food, equip)
and migrate them to stockpile so the legacy pool can die. Add a sim test: craft an
intermediate → spend it on a building/recipe.

## R2 · HIGH — Drafted pawns are exempt from the entire health simulation

[PawnStateMachine.ts:2507](../src/lib/game/systems/PawnStateMachine.ts#L2507): the
`drafted` branch `continue`s **before** `tendWounds`, `tickConditions`, `healWounds`,
collapse entry/recovery, and `tickStatusEffectDurations`. The comment on it claims the
opposite ("They still tick conditions (bleeding, etc.)"). `tickConditions` has no other
callsite for pawns. Consequences, in the exact scenario drafting exists for (combat):

- A drafted pawn **never loses blood** (limb `bleedRate` is only applied in `tickConditions`), never progresses infection, malnutrition, or dehydration, and never heals. Un-draft it and the backlog of bleed suddenly starts applying. An undrafted bystander with the same wounds bleeds out; the drafted one is immortal short of a destroyed vital part ([Combat.ts:1094](../src/lib/game/systems/Combat.ts#L1094)).
- Combat stamps `statusEffectDurations.collapse` when consciousness drops ([Combat.ts:1075](../src/lib/game/systems/Combat.ts#L1075)) and `isKnockedDown` then blocks its swings ([Combat.ts:1264](../src/lib/game/systems/Combat.ts#L1264)) — but nothing ever decrements that duration for a drafted pawn, so it stays "down" forever (until undrafted) while **mobs keep attacking it**: the mob disengage check looks for `currentState === 'Collapsed'` ([Combat.ts:1302](../src/lib/game/systems/Combat.ts#L1302)), a state a drafted pawn can never enter.
- `PawnService.processPawnTurn` also skips drafted pawns ([PawnService.ts:327](../src/lib/game/services/PawnService.ts#L327)) — mood/morale freeze too. Needs still accrue (`processNeedsTick` doesn't skip), so hunger climbs to 100 with no malnutrition consequence.

**Fix:** in `tick()`, run the health block (tend → conditions → heal → collapse
lifecycle → status-duration tick) for drafted pawns too, and only skip the *behavioural*
state machine (`tickPawn`). That is what the comment already promises. Add a sim test:
drafted pawn with a bleeding wound loses blood and can die.

## R3 · HIGH — Butchery consumes the whole carcass stack but yields one carcass's outputs

> **✅ RESOLVED (ADR-016).** No item carries `isCarcass`/`yields` — the `processButchery` path was
> dead code and was removed. Butchery is now ordinary `butcher_spot` recipes (one carcass per run),
> flowing through reserve-and-fetch.

`ItemService.processButchery` ([ItemService.ts:373-376](../src/lib/game/services/ItemService.ts#L373)):

```ts
const carcassQty = state.stockpile[carcassItem.id] ?? 0;
if (carcassQty > 0) state = this.consumeItems({ [carcassItem.id]: carcassQty }, state);
state = this.addItems(outputs, state);
```

`outputs` is rolled **once** from `carcassItem.yields`, but `consumeItems` takes the
**entire stack**. Hunt three deer, butcher once → all three carcasses vanish, one deer's
meat appears. With the hunting system now driving carcass acquisition (commits c05e616,
f54ef2b), multi-carcass stockpiles are the normal case, so this silently destroys most
hunted food. Related smell: `carcassIntactness` is keyed by **item id**
([ItemService.ts:350](../src/lib/game/services/ItemService.ts#L350)) — all rabbit
carcasses share one freshness value, and `Mob.intactness` (set at death) is a separate,
unconnected number. The existing test ([itemButchery.test.ts](../src/lib/game/services/itemButchery.test.ts))
pins only guard branches, not quantity flow.

**Fix:** consume exactly 1 carcass per butchery action (or roll yields × quantity).
Longer-term, make intactness per-carcass (instance or per-drop field) instead of
per-type.

## R4 · MEDIUM-HIGH — ADR-009 tool gating is still enforced nowhere, while DESIGN.md sells it as a core pillar

> **✅ RESOLVED (colony-stock, step 1).** `JobService.getAvailableJobs` now gates a harvest on its
> `interaction.toolRequirement` vs the matching `WorkCategory.toolsRequired` in colony stock
> (`_colonyHasHarvestTool`). The bootstrap was unblocked first: tool-free `stone_outcrop` scavenge,
> `stone_axe`/`stone_hammer` → craft_spot, station tiers + "Crude Workbench", and added
> `stone_pick`/`stone_hoe`. Deferred: per-pawn inventory + `minTier` (step 2), craft-tool gating.

DESIGN.md: *"Tool-gated gathering: woodcutting requires at least a Stone Axe … Without
the tool, the job cannot be claimed — the forest stays whole"*; ADR-009 calls the
enforcement rules "non-negotiable". Reality:

- `JobService.getAvailableJobs`/`claimJob` contain **no** tool check of any kind.
- `WorkService.canPawnDoWorkByType` honestly documents the gap and always passes ([WorkService.ts:228-234](../src/lib/game/services/WorkService.ts#L228)).
- `WORK_CATEGORIES[].toolsRequired` ([Work.ts](../src/lib/game/core/Work.ts)) is referenced by zero logic — decorative data.
- The only tool effect is **wear**: `interaction.toolRequirement` triggers `applyToolWear` *after* harvest completion ([JobService.ts:543](../src/lib/game/services/JobService.ts#L543)), and only if a matching tool happens to be in stockpile ("bare hands — nothing to wear" is a successful outcome).

So a fresh colony with zero tools fells trees barehanded; the entire ADR-009 bootstrap
problem (primitives → tools → workshops) is optional. This was deferred in the last
review (D5) as "until ADR-009 job-claim work resumes" — but two production-chain
expansions have since shipped on top of the un-gated base, and `ResourceObject`
interactions now carry `toolRequirement` data ready to use. **Fix:** gate at claim time
in `getAvailableJobs` (colony-stockpile check is fine as step 1; per-pawn claimed
inventory per ADR-009 as step 2), or amend ADR-009/DESIGN to say gating is wear-only for
now. Code and design doc must stop disagreeing on a core pillar.

## R5 · MEDIUM — Inventory weight/volume budget is computed, displayed, and never enforced

> **✅ RESOLVED.** `ItemService.clampPickupQuantity` caps haul/fetch pickup by the pawn's
> weight/volume budget (belt/back `inventoryBonus` now matters); the remainder waits for another
> trip. Always floors at 1 so a single over-budget item (heavy carcass) can still be hand-carried.

The equipment expansion added carry budgets: `ItemService.getCarryBudget` /
`getCurrentCarryLoad` / `canAddToInventory`
([ItemService.ts:390-446](../src/lib/game/services/ItemService.ts#L390)) and DESIGN.md
documents "Inventory: weight/volume budgeted". But `canAddToInventory` has **zero
callers**, and the haul pickup path (`JobService._completeHaul`,
[JobService.ts:646-657](../src/lib/game/services/JobService.ts#L646)) adds any quantity
to `pawn.inventory.items` unconditionally (it also never touches the stored
`weightKg`/`volumeL` cache fields, which are write-only initial-shape artifacts). The
UI (`PawnInventory.svelte`) shows a budget the simulation ignores. Belt/back
`inventoryBonus` therefore has no gameplay effect. **Fix:** either enforce at haul-job
claim/pickup (split oversized stacks; cap `unitsTaken` by remaining budget) or strike
the budget claim from DESIGN until it lands. Drop the dead `weightKg`/`volumeL` fields
from `PawnInventory` if load is always derived.

## R6 · MEDIUM — `constructBuilding`/`processBuildingQueue`/`queueBuilding` is a dead legacy triad that eats materials

> **✅ RESOLVED.** Building placement is physical reserve-and-fetch (`placeBuilding` reserves the
> cost, pawns haul it to the site, construction consumes it — ADR-016), and the dead triad is
> **deleted**: `GameEngine(Impl).constructBuilding`, `BuildingService.processBuildingQueue`,
> `GameStateManager.startBuilding`, and the `GameState.buildingQueue` field + `BuildingInProgress`
> type. The ancient-save migration is kept (reads `buildingQueue` loosely) so old saves still
> convert pending entries to `under_construction` buildings.

`GameEngineImpl.constructBuilding`
([GameEngineImpl.ts:187-219](../src/lib/game/systems/GameEngineImpl.ts#L187)) still
consumes materials and pushes a `turnsRemaining`-shaped entry into
`gameState.buildingQueue` — but the countdown was removed from the tick
(`processBuildings` comment: "processBuildingQueue countdown removed"), and
`BuildingService.processBuildingQueue`
([BuildingService.ts:316](../src/lib/game/services/BuildingService.ts#L316)) plus
`GameStateManager.queueBuilding` ([GameState.ts:72](../src/lib/game/core/GameState.ts#L72))
have **zero callers**. The only thing that ever drains the queue is the **load-time
migration** ([gameState.ts:150-172](../src/lib/stores/gameState.ts#L150)) — so a call
today consumes materials and produces a building only after the next save/load, at
(0,0). No UI calls it anymore (placement goes through `buildingService.placeBuilding`),
but it sits on the public `GameEngine` interface as the obvious-looking "build" method —
the exact trap the old D1 documented for crafting. **Fix:** delete all three (plus the
`BuildingInProgress`/`buildingQueue` field once saves are migrated), or make
`constructBuilding` delegate to `placeBuilding`.

## R7 · MEDIUM — Working-pawn `isWorking` flag is driven by a dead priority system, twice per tick

> **✅ RESOLVED.** `syncPawnWorkingStates` now derives `isWorking` from the real FSM state
> (`WORK_LOOP_STATES`: Working/MovingToResource/Hauling/MovingToDeposit/Hunting, minus
> eating/sleeping) and `currentWork` from the pawn's active job's work category (`getJobWorkCategory`)
> — accurate display instead of `'foraging'` fiction. The dead `getAvailableWorkForPawn`/
> `canPawnDoWorkByType` methods are deleted and the duplicate per-tick call removed (one pass,
> before `processPawnTurn` reads `isWorking` for mood). Regression-tested.

`WorkService.syncPawnWorkingStates` runs 2×/tick from `processPawns` and derives
`currentWork` via `getAvailableWorkForPawn`, which reads only the **legacy**
`workPriorities` map ([WorkService.ts:192-213](../src/lib/game/services/WorkService.ts#L192)).
Default assignments created by `ensureDefaultWorkAssignments` have `workPriorities: {}`
and real data in `laborSettings` — so the sort is always empty and every pawn falls
through to `'foraging'`. Result: `pawn.state.isWorking` ≈ "not eating/sleeping",
`currentWork` is fiction, and the +1 working-mood bonus in `calculateStateUpdate` keys
off it. The actual job system (`JobService` + FSM) never reads any of this. **Fix:**
derive `isWorking` from `currentState === 'Working'` (one line in the FSM or a single
sync pass), delete `getAvailableWorkForPawn`/`canPawnDoWorkByType`/`currentWork`, and
remove the second sync call. This finishes the D4 cleanup the last review started.

## R8 · MEDIUM — Craft quality is stamped only on the first stack of an item

> **✅ RESOLVED (moot).** `gs.item` stacking is gone; `_completeCraft` no longer writes
> `properties.quality`. Re-attaching per-stack quality to an `ItemInstance`/stored drop is deferred
> until equipment quality matters (tracked in PHYSICAL-PRODUCTION "Still deferred").

`_completeCraft` ([JobService.ts:772-782](../src/lib/game/services/JobService.ts#L772)):
if the item already exists in `gs.item` it just adds `amount`; `properties.quality` from
`getWorkModifiers(...).quality` is written only when the stack is first created. A
master smith's batch merged into an apprentice's stack inherits the apprentice's
quality; construction quality (stored per building, [JobService.ts:705-727](../src/lib/game/services/JobService.ts#L705))
got this right. Becomes moot if R1's fix moves quality onto instances — fold it into
that work.

## R9 · LOW-MEDIUM — Hunting interrupts bypass the ADR-010 proximity formula

> **✅ RESOLVED.** `handleHunting` now runs the shared `checkNeedInterrupts` with `jobDist` =
> Manhattan distance to the quarry, so the hunt only breaks for hunger/fatigue/thirst per the
> ADR-010 proximity+urgency formula (a pawn about to corner its prey resists a distant food trip).
> On interrupt the `huntTargetId` is cleared.

`handleHunting` aborts the hunt at flat `HUNGER_THRESHOLD`/`FATIGUE_THRESHOLD`
([PawnStateMachine.ts:1296-1301](../src/lib/game/systems/PawnStateMachine.ts#L1296)),
not via `checkNeedInterrupts`. A pawn 3 ticks from cornering a deer drops the chase at
hunger 70 even when food is 60 tiles away — the exact pathology ADR-010 was written to
kill, in the one activity where abandoning mid-task wastes the most prior effort
(chase distance). DESIGN.md says hunting reuses "the same thresholds as idle work
pickup", so this is arguably as-designed — but it reads as an oversight against ADR-010.
Cheap fix: call `checkNeedInterrupts` with `jobDist = dist(pawn, quarry)`.

## R10 · LOW — `killPawn` drops nothing on the map

> **✅ RESOLVED.** `killPawn` now drops the pawn's carried bulk items, tracked inventory instances,
> and equipped gear as `DroppedItem`s on the death tile, plus a `pawn_carcass` corpse — and clears
> the gear off the dead pawn so it isn't duplicated. The corpse uses a new **`dynamicName`** item
> flag: `itemService.makeDynamicName` builds "<Name>'s Corpse" at spawn (stored on `DroppedItem.name`),
> and `getItemDisplayName` (+ the GameCanvas hover) resolves it. Regression-tested.

A pawn dies holding hauled inventory and a full equipment loadout; `killPawn`
([PawnStateMachine.ts:185-249](../src/lib/game/systems/PawnStateMachine.ts#L185)) writes
a `DeadPawnRecord` and flips flags — carried items and equipped gear (now real,
durability-tracked `ItemInstance`s from the equipment expansion) vanish from the
economy. DESIGN.md's combat section: "a slain entity drops a carcass/corpse". Mobs do
(`dropCarcass`); pawns don't. With Tier-2 gear being expensive, permadeath currently
deletes the colony's best equipment. **Fix:** drop inventory + equipment as
DroppedItems at the death tile (corpse item optional until burial mechanics exist).

## R11 · LOW — Doc/code mismatches that will misdirect contributors

1. **Events phase**: ARCHITECTURE.md's mandatory turn order lists "5. Events — trigger random or conditional events"; `processGameTurn` has no events phase and `core/Events.ts` (still ~hundreds of lines of logic — ADR-006) is fully unwired. _(✅ partial: its resource effect now writes the physical stockpile, not `gs.item`.)_ Carried from the last review — either wire it or cut it from the turn-order contract.
2. **AGENTS.md / ARCHITECTURE.md service table** omits the services added since: `CombatService`, `EntityService`, `JobService`, `RecipeService`, `ResourceObjectService`, `LightingService`(if present), `PawnStatService` is listed but e.g. `OccupancyService` was added correctly — do one sync pass.
3. **DESIGN.md need table** says `WORK_PRIORITY_THRESHOLD_SHIFT` gives "Level 4 → ~78" (+8 from 70); code comment at [PawnStateMachine.ts:114](../src/lib/game/systems/PawnStateMachine.ts#L114) says the same — both fine — but DESIGN also still describes drink/wash routing as deferred in one paragraph (PawnService comment too, [PawnService.ts:482](../src/lib/game/services/PawnService.ts#L482)) while §D zone routing is implemented in the FSM. Stale comments only.

## R12 · LOW — Assorted dead code and drift (cheap deletions)

- `JobService._syncLightJobs` + `_completeLight` — light jobs are purged every tick ([JobService.ts:98](../src/lib/game/services/JobService.ts#L98)); the generator/completer pair is unreachable. Same for `_hasFuelInStockpile`, `_totalFuelInStockpile` (no callers found).
- `PawnStateMachine` `FATIGUE_PER_SLEEPING_TURN` (0.72) is unused — bed recovery is `GROUND + shelterBonus`, so the "bed = 0.72/s" calibration comment block is stale.
- `PawnService`: `forceSleep`, `getCookingBuildingBonus`, `getSleepBuildingBonus`, `shouldPawnSleep` duplicate FSM thresholds (the RECOVERY_CONFIG path) — verify callers and delete; `calculateMorale` contains an empty `racialTraits.forEach` loop.
- `ItemService.calculateCraftingTime(itemId, gameState, pawnId)` re-implements a dexterity speed bonus outside ADR-015's single work model — if any UI calls it, its numbers disagree with `getWorkModifiers`.
- `GameEngineImpl.craftItem` computes `workRequired = (recipe.workAmount || 1) * 5` and `_syncCraftJobs` separately computes `entry.workRequired ?? (craftingTime ?? 1) * 5` — one constant, two homes.
- `findAdjacentApproach`'s doc comment ("Tiles held by pawns that are currently stationary") describes a parameter that is now the full occupancy set.

---

# Part II — Structural debt (not bugs)

### P-1 · The `gs.item` legacy pool itself

> **✅ RESOLVED (ADR-016).** `GameState.item` and the `currentItem` store are gone; all readers
> (craft output, eating, equip pool, events, blueprint cost, craft-cancel refund) migrated to
> physical stockpile stock.

Beyond R1's routing bug, the pool is a second inventory ontology: food eaten from it
bypasses stockpile zones, equipment instances are plucked from it, Events would write to
it. Once R1 lands, the remaining readers are enumerable (≈6 sites) — finish the Stage-2
migration and delete `GameState.item`. This also kills the `currentItem` derived store.

### P-2 · Engine↔store dual source of truth (carried: old P0-3)

`processGameTurn` still begins with `this.gameState = { ...get(gameState) }` and ends
with `pushFromEngine` ([GameEngineImpl.ts:291](../src/lib/game/systems/GameEngineImpl.ts#L291));
`getGameState()` still deep-clones via `JSON.parse(JSON.stringify())` over a
240×160-tile map. The store-side throttled-notify design (`createGameStore.setSilent`)
is good; the read-back each tick remains the inversion. Same recommendation as before:
engine is the only writer, user actions become commands. Large, no functional change —
still deferred, still worth doing before the Living World layer adds more per-tick
state.

### P-3 · Services importing Svelte stores (carried: old P0-3 logActivity)

`PawnStateMachine`, `EntityService`, `Combat` import from `stores/Log` /
`stores/combatFeedback`. Same injectable-sink fix as before; the list grew by
`combatFeedback`.

### P-4 · God files (carried: old P2-8; sizes re-measured)

| File | LOC | Trend |
| ---- | --- | ----- |
| [GameCanvas.svelte](../src/lib/components/UI/GameCanvas.svelte) | 3,321 | ↑ from 3,134 — 16× the 200-line cap; it now also drives the sim clock (`stepSimulation` from the render loop) |
| [PawnStateMachine.ts](../src/lib/game/systems/PawnStateMachine.ts) | 2,710 | ↑ from 1,777 — absorbed combat states, hunting, water needs, caretaking, collapse |
| [EntityService.ts](../src/lib/game/services/EntityService.ts) | 2,015 | ↑ — spawning + AI + movement + hunger + corpse lifecycle |
| [Combat.ts](../src/lib/game/systems/Combat.ts) | 1,419 | new since last review |
| [types.ts](../src/lib/game/core/types.ts) | 1,387 | ↑ |
| [JobService.ts](../src/lib/game/services/JobService.ts) | 1,152 | fuel/refuel logic could move to BuildingService |

Natural seams now exist: `PawnStateMachine` splits cleanly into needs-FSM /
combat-FSM / health (tickConditions+healing+caretaking are already pure functions);
20 other components are over the 200-line cap (BuildingMenu 515, ActivityLogOverlay
525, CraftingScreen 476…). Same advice: split opportunistically, no big bang.

### P-5 · Per-tick allocation churn (carried: old D9.1/D9.6/D9.7 — still deferred, still fine at current scale)

The index-once/update-once pawn tick rewrite remains undone; new per-pawn-per-tick scans
were added since (`findCombatThreat` over all mobs per pawn; `occupancyService.blockedTiles`
rebuilt per pathfind attempt; `findNearestRestBuilding` scans pawns×buildings inside the
fatigue interrupt). Profiling gate unchanged: don't touch until `__profOut` says so, but
any new system should stop adding full-array `pawns.map(...)` writes for single-pawn
updates.

### P-6 · Logging

48 raw `console.*` calls remain under `src/lib/game/` (down from 144) — the remainder are
in completion paths (per-harvest, per-craft logs in JobService run on every completion)
and `ResearchService`. The `gatedConsole` shim idiom works; the scoped `no-console`
ESLint rule from the last review is still the way to close the class permanently.

---

# Part III — Carried-forward deferred items (unchanged status)

- **D9.1 / D9.6 / D9.7** — index-once tick, deep-clone removal (tied to P-2), event-driven job generation. Profiling-gated.
- **D-perf** — cooldown index for regrowth (the pre-scan added in `processResourceRegrowth` is a good stopgap; full O(map) rebuild still happens on regrowth ticks), tick strides, incremental job board.
- **D-bills** — `productionTargets` still exists in state with nothing driving it; unchanged.
- **ADR-009 step 2** — per-pawn claimed-inventory tool gating (R4 is step 1: any gating at all).

---

## What's improved since 2026-06-10 (keep doing this)

- **Test suite: 32 → 117 → 133 tests** — including headless sim-invariant tests (entity starvation timing, combat sim, need thresholds) and now the physical-production seams (reserve/fetch/craft, double-spend, building hauling, passive furnaces, station tiers, tool gating). The remaining open defects (R2 draft→health) are exactly where the next tests should go.
- **Physical production (ADR-016)** — reserve-and-fetch made consumption physical: items always occupy a tile or a pawn's hands, no `gs.item` magic pocket. Crafting/building reserve inputs → pawns haul them to the workstation/site → consumed on completion; passive furnaces; carry budgets and ADR-009 tool gating are now real (closing the largest correctness seam this review opened).
- **The per-tile storage model (Stage 2)** is genuinely clean: stored drops as single source of truth, `aggregateFromDrops` everywhere, trigger-based absorption, deterministic stored-pile ids. R1 is a hole in it, not a flaw of it.
- **ADR-014 occupancy** — one collision authority, both pathfinding and movement defer to it; the yoyo/phasing fix is well documented and the trade-off (queue cadence) is written down.
- **ADR-015 single work model** — the efficiency-scalar fork is actually gone (no `calculateWorkEfficiency` anywhere); speed/yield/quality flow from `stats.jsonc` through jobs, tooltips, and construction/craft quality consistently.
- **Claim hygiene** — `killPawn`, the drafted-skip path, and collapse entry all release job claims now; the old D2 leak class is closed and tested.
- **Engine slimming** — GameEngineImpl 892 lines (from 1,157), with butchery in ItemService and honest comments; `processResourceRegrowth`'s cheap pre-scan is a textbook profiling-driven fix.
- **Determinism discipline** — zero `Math.random` outside `core/rng.ts`; seed persisted; world/sim streams split.

## Suggested sequencing

_R1, R3, R4, R5, R6, R7, R8, R9, R10, P-1 are done (ADR-016 pass + cleanups — see status banner). Remaining:_

1. **Now (correctness):** **R2** drafted-pawn health block (move the `continue`, run tend→conditions→heal→collapse for drafted pawns too, ~10 lines + sim test — the one still-open HIGH).
2. **Cleanups (net-negative LOC):** **R12** dead-code list (light-job pair, unused PawnService helpers, etc.).
3. **Design honesty:** **R11** doc sync (events phase: wire or cut; service-table refresh).
4. **Structural (unchanged):** P-2/P-3 layer inversions before Living World lands; P-4 splits opportunistically; P-5/P-6 as evidence demands.
5. **Physical-production follow-ups** (see [PHYSICAL-PRODUCTION](.tasks/open/PHYSICAL-PRODUCTION.md)): tool-gating step 2 (per-pawn inventory + `minTier`), per-stack craft quality on instances (R8), passive-furnace flagging for forge/hearth.
