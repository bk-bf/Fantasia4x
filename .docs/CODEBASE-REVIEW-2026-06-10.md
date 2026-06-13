# Codebase Review — 2026-06-13 (v2)

> **Related:** [game/ARCHITECTURE](game/ARCHITECTURE.md) · [game/DESIGN](game/DESIGN.md) · [game/DECISIONS](game/DECISIONS.md) · [ROADMAP](.tasks/open/ROADMAP.md) · [HOTSPOT: PawnStateMachine](HOTSPOT-PawnStateMachine-2026-06-13.md)

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
> **[x] R1** (`gs.item` removed entirely — craft output is real stockpile stock; ceramics/firewood
> chains work) · **[x] P-1** (legacy `gs.item` pool + `currentItem` gone) · **[x] R3** (butchery is
> recipe-based, one carcass/run; dead `processButchery` removed) · **[x] R4** (colony-stock tool
> gating in `getAvailableJobs`; bootstrap unblocked — tool-free `stone_outcrop`, station tiers,
> Crude Workbench, `stone_pick`/`stone_hoe` added) · **[x] R5** (`clampPickupQuantity` enforces
> carry budget at pickup, floors at 1) · **[x] R8** (moot — per-stack quality dropped with `gs.item`;
> re-attach to instances later) · **[x] R6** (dead `constructBuilding`/`processBuildingQueue`/
> `startBuilding`/`buildingQueue` triad deleted; placement is physical reserve-and-fetch) ·
> **[x] R7** (`isWorking` now derived from FSM state, `currentWork` from the active job; dead
> `getAvailableWorkForPawn`/`canPawnDoWorkByType` + duplicate per-tick call removed) ·
> **[x] R9** (hunting interrupts go through `checkNeedInterrupts` — ADR-010 proximity, job-dist =
> distance to quarry) · **[x] R10** (`killPawn` drops carried items + equipped gear + a `dynamicName`
> corpse "<Name>'s Corpse" on the death tile) · **[x] R2** (drafted pawns now run the health block —
> bleed/heal/collapse/status durations — skipping only the behavioural FSM) · **[x] R12** (dead-code
> deletions: light/fuel helpers, `FATIGUE_PER_SLEEPING_TURN`, the PawnService force-sleep cluster,
> `calculateCraftingTime`, comment drift) · **~ R11.1** (`Events.ts` no longer writes `gs.item`;
> events phase still unwired).
> Plus new: building-material hauling, passive furnaces, and "long jobs yield to needs" (thirst
> added to `checkNeedInterrupts`). Tests **117 → 141**.
> **All Part I defects (R1–R12) are resolved** (R11 doc sync done: real turn order + service table
> + comment fixes). **P-1 and P-6 done** (P-6: scoped `no-console` rule).
> **P-7 — [x] DONE** (from the [PawnStateMachine hotspot](HOTSPOT-PawnStateMachine-2026-06-13.md)):
> the concrete ADR-008 bypass (pawn AI calling `WasmPathfinderService` directly) is fixed — pathfinding
> now routes through the `PathfinderService` interface, and PawnStateMachine is off the `graph:check`
> ADR-008 list. The hotspot decomposition has also **started**: step 4's stateless helpers
> (`isAdjacent`, `findAdjacentApproach`, food selection) are extracted to
> `systems/pawn/pawnQueries.ts`; the handler split (steps 2+3) is next, test-first. **Intentionally deferred** (the review's own
> guidance — not "unfinished"): **P-2** engine↔store inversion (large, no functional change, needs
> in-browser verification), **P-3** services-import-stores (injectable log sink — same caveat),
> **P-4** god-file splits ("no big-bang"; the hotspot gives `PawnStateMachine` a concrete handler-split
> plan), **P-5** per-tick allocation ("don't touch until profiling says so"). Current gate: `check`
> 0 errors · `test` 141 passing · `lint` 0 errors · `build` ok.

---

## Scorecard

| Area                    | 06-10 | Now | Notes                                                                                   |
| ----------------------- | ----- | --- | --------------------------------------------------------------------------------------- |
| Architecture & layering | B−    | A−  | Engine near coordinator-only; per-tile storage model is the single source of truth — the `gs.item` seam is **gone** (ADR-016). The PawnStateMachine→`WasmPathfinderService` ADR-008 bypass is now **fixed** (P-7, routed through the interface). Caveats: 6 other pre-existing ADR-008 bypasses (EntityService/GameEngineImpl/UI `init`) and the engine↔store / services↔stores inversions (P-2/P-3) remain |
| Engine correctness      | C−    | B+  | All R1–R12 fixed + regression-tested (incl. R2 drafted-pawn health); physical production (reserve-and-fetch, building hauling, passive furnaces) shipped |
| Simulation testing      | D     | B+  | 32 → **141** tests; the cross-system seams (craft→build, draft→health, tool gating, death drops) are now covered |
| Tick-loop structure     | C+    | C+  | Same deferred O(P²) churn (D9.1); a passive-production phase added (skips when idle); scale still fine |
| Data-driven design      | A−    | A   | Recipes/wounds/stats/creatures all JSONC; `Work.toolsRequired` + `interaction.toolRequirement` now **wired** into gating; station tiers via `effects.tier` |
| Documentation           | A     | A   | ADR discipline excellent; DESIGN over-promises now true in code; turn order + service table + comments synced to reality (R11) |
| Tooling & CI            | C     | A−  | check/lint/test/build all real and green; ESLint now guards determinism (no `Math.random`) and logging (`no-console`) in the sim core; no CI by choice |

---

# Part I — Defects, ranked by severity

## R1 · CRITICAL — Crafted primary outputs land in the legacy `gs.item` pool, invisible to the entire economy

> **[x] RESOLVED (ADR-016).** `gs.item` removed; `_completeCraft`/`completeCraftOrder` spawn outputs
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
research cost.** Concrete broken chains, all shipped as "[x] done" on the roadmap:

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

> **[x] RESOLVED.** The drafted branch in `tick()` no longer `continue`s before the health block —
> drafted pawns now run caretaking → conditions (bleed/infection/malnutrition/death) → healing →
> the collapse lifecycle → status-effect-duration tick, and only the **behavioural** state machine
> (auto combat-engage / exhaustion-collapse / `tickPawn`) is skipped. A drafted pawn ordered to
> attack counts as "in melee" (no tend/heal mid-fight). So they bleed, heal, can collapse and
> recover, and combat knockdown/collapse durations expire. Regression-tested (drafted bleeding pawn
> loses blood at the same rate as undrafted and can die).

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

> **[x] RESOLVED (ADR-016).** No item carries `isCarcass`/`yields` — the `processButchery` path was
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

> **[x] RESOLVED (colony-stock, step 1).** `JobService.getAvailableJobs` now gates a harvest on its
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

> **[x] RESOLVED.** `ItemService.clampPickupQuantity` caps haul/fetch pickup by the pawn's
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

> **[x] RESOLVED.** Building placement is physical reserve-and-fetch (`placeBuilding` reserves the
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

> **[x] RESOLVED.** `syncPawnWorkingStates` now derives `isWorking` from the real FSM state
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

> **[x] RESOLVED (moot).** `gs.item` stacking is gone; `_completeCraft` no longer writes
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

> **[x] RESOLVED.** `handleHunting` now runs the shared `checkNeedInterrupts` with `jobDist` =
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

> **[x] RESOLVED.** `killPawn` now drops the pawn's carried bulk items, tracked inventory instances,
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

> **[x] RESOLVED.** (1) ARCHITECTURE.md's turn order was rewritten to match `processGameTurn`'s real
> phases (needs → item upkeep → research → jobs → buildings → passive production → pawns → regrowth →
> entities → combat → commit), and the unwired "events" phase is now explicitly *not* part of the
> contract (`Events.ts` exists but isn't ticked). (2) The ARCHITECTURE service table gained
> `jobService`, `recipeService`, `resourceObjectService`, `entityService`, and a note on the
> `systems/` singletons (`pawnStateMachineService`, `combatService`). (3) The stale "drink/wash
> routing is deferred" comments in PawnService were corrected (the FSM routing is implemented).

1. **Events phase**: ARCHITECTURE.md's mandatory turn order lists "5. Events — trigger random or conditional events"; `processGameTurn` has no events phase and `core/Events.ts` (still ~hundreds of lines of logic — ADR-006) is fully unwired. _([x] partial: its resource effect now writes the physical stockpile, not `gs.item`.)_ Carried from the last review — either wire it or cut it from the turn-order contract.
2. **AGENTS.md / ARCHITECTURE.md service table** omits the services added since: `CombatService`, `EntityService`, `JobService`, `RecipeService`, `ResourceObjectService`, `LightingService`(if present), `PawnStatService` is listed but e.g. `OccupancyService` was added correctly — do one sync pass.
3. **DESIGN.md need table** says `WORK_PRIORITY_THRESHOLD_SHIFT` gives "Level 4 → ~78" (+8 from 70); code comment at [PawnStateMachine.ts:114](../src/lib/game/systems/PawnStateMachine.ts#L114) says the same — both fine — but DESIGN also still describes drink/wash routing as deferred in one paragraph (PawnService comment too, [PawnService.ts:482](../src/lib/game/services/PawnService.ts#L482)) while §D zone routing is implemented in the FSM. Stale comments only.

## R12 · LOW — Assorted dead code and drift (cheap deletions)

> **[x] RESOLVED.** Deleted: `JobService._syncLightJobs`/`_completeLight` (+ the `light` switch case;
> the type literal + per-tick purge stay for old-save cleanup), `_hasFuelInStockpile`,
> `_totalFuelInStockpile`; `FATIGUE_PER_SLEEPING_TURN`; the dead `PawnService` cluster
> (`forceSleep`, `forceRest`, `getSleepBuildingBonus`, `getCookingBuildingBonus`,
> `getRacialEatingMultiplier`, `getRacialSleepMultiplier`) + the empty `racialTraits.forEach` in
> `calculateMorale`; `ItemService.calculateCraftingTime` (conflicted with ADR-015); and fixed the
> `findAdjacentApproach` doc drift. _(`shouldPawnSleep` was NOT dead — it's called by
> `clearTemporaryPawnStates`; kept.)_

- `JobService._syncLightJobs` + `_completeLight` — light jobs are purged every tick ([JobService.ts:98](../src/lib/game/services/JobService.ts#L98)); the generator/completer pair is unreachable. Same for `_hasFuelInStockpile`, `_totalFuelInStockpile` (no callers found).
- `PawnStateMachine` `FATIGUE_PER_SLEEPING_TURN` (0.72) is unused — bed recovery is `GROUND + shelterBonus`, so the "bed = 0.72/s" calibration comment block is stale.
- `PawnService`: `forceSleep`, `getCookingBuildingBonus`, `getSleepBuildingBonus`, `shouldPawnSleep` duplicate FSM thresholds (the RECOVERY_CONFIG path) — verify callers and delete; `calculateMorale` contains an empty `racialTraits.forEach` loop.
- `ItemService.calculateCraftingTime(itemId, gameState, pawnId)` re-implements a dexterity speed bonus outside ADR-015's single work model — if any UI calls it, its numbers disagree with `getWorkModifiers`.
- `GameEngineImpl.craftItem` computes `workRequired = (recipe.workAmount || 1) * 5` and `_syncCraftJobs` separately computes `entry.workRequired ?? (craftingTime ?? 1) * 5` — one constant, two homes.
- `findAdjacentApproach`'s doc comment ("Tiles held by pawns that are currently stationary") describes a parameter that is now the full occupancy set.

---

# Part II — Structural debt (not bugs)

### P-1 · The `gs.item` legacy pool itself

> **[x] RESOLVED (ADR-016).** `GameState.item` and the `currentItem` store are gone; all readers
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
`combatFeedback`. The [hotspot](HOTSPOT-PawnStateMachine-2026-06-13.md) confirms `stores/Log` as a
direct outbound edge of `PawnStateMachine` — fold this into the P-4 decomposition (the `combat`/`work`
handlers are where most log calls live, so a sink interface drops in naturally during the split).

### P-4 · God files (carried: old P2-8; sizes re-measured)

| File | LOC | Trend |
| ---- | --- | ----- |
| [GameCanvas.svelte](../src/lib/components/UI/GameCanvas.svelte) | 3,321 | ↑ from 3,134 — 16× the 200-line cap; it now also drives the sim clock (`stepSimulation` from the render loop) |
| [PawnStateMachine.ts](../src/lib/game/systems/PawnStateMachine.ts) | ~~2,710~~ → **988** | [x] **DECOMPOSED 2026-06-13** (was the #1 hotspot). Split into `pawn/handlers/{work,needs,combat}.ts` + shared `pawn/pawnHelpers.ts` + `pawn/pawnQueries.ts` + `pawn/pawnStates.ts`; what remains is the health/lifecycle block + a thin `Record<PawnState,Handler>` dispatcher (`tickPawn` fan-out 16 → ~1). Acyclic; 0 errors / 149 tests. The ADR-016 hauling pipeline was then split out to `pawn/pawnHauling.ts` (pawnHelpers 1,031 → 788). Largest residual is the 988-LOC dispatcher/lifecycle. See the [hotspot report](HOTSPOT-PawnStateMachine-2026-06-13.md) |
| [EntityService.ts](../src/lib/game/services/EntityService.ts) | 2,015 | ↑ — spawning + AI + movement + hunger + corpse lifecycle |
| [Combat.ts](../src/lib/game/systems/Combat.ts) | 1,419 | new since last review |
| [types.ts](../src/lib/game/core/types.ts) | 1,387 | ↑ |
| [JobService.ts](../src/lib/game/services/JobService.ts) | 1,152 | fuel/refuel logic could move to BuildingService |

The [hotspot report](HOTSPOT-PawnStateMachine-2026-06-13.md) gives `PawnStateMachine` a concrete,
graph-validated decomposition (its 15 state handlers cluster cleanly into three domains):

- `handlers/work.ts` — Idle · MovingToResource · Working · Hauling · MovingToDeposit
- `handlers/needs.ts` — Hungry · Tired · Eating · Sleeping · Drinking · Washing · MovingToNeed
- `handlers/combat.ts` — Fighting · Fleeing · Hunting

…leaving a thin dispatcher. Pair that with **a `Record<PawnState, Handler>` table** (drops
`tickPawn`'s fan-out from 16 to ~1; adding a state becomes a one-line registration) and **extract
the stateless helpers** (`isAdjacent`, `hasAvailableFood`, `findAdjacentApproach`, `selectFoodForMeal`)
into `utils/pawnUtils`. Sequence (hotspot): fix P-7 boundary → extract helpers → split handlers +
table → add per-handler tests → push selection logic into services. The report explicitly rejects a
Rust port (branchy game logic, not a hot numeric loop). 20 components are also over the 200-line cap
(BuildingMenu 515, ActivityLogOverlay 525, CraftingScreen 476…). Same overall advice: split along
these seams opportunistically, no big bang.

### P-5 · Per-tick allocation churn (carried: old D9.1/D9.6/D9.7 — still deferred, still fine at current scale)

The index-once/update-once pawn tick rewrite remains undone; new per-pawn-per-tick scans
were added since (`findCombatThreat` over all mobs per pawn; `occupancyService.blockedTiles`
rebuilt per pathfind attempt; `findNearestRestBuilding` scans pawns×buildings inside the
fatigue interrupt). Profiling gate unchanged: don't touch until `__profOut` says so, but
any new system should stop adding full-array `pawns.map(...)` writes for single-pawn
updates.

### P-6 · Logging

> **[x] RESOLVED.** A scoped `no-console` ESLint rule (`['error', { allow: ['warn', 'error'] }]`) now
> covers `src/lib/game/**`, exempting `core/log.ts`. It enforces the gated-shim convention — the
> `import { gatedConsole as console }` local binding shadows the global so shimmed files pass,
> `warn`/`error` stay allowed, and the `[PROF]` profiler lines carry a per-line eslint-disable
> (ADR-011). The one stray raw `console.log` (ItemService tool-break) was routed through the shim.

48 raw `console.*` calls remain under `src/lib/game/` (down from 144) — the remainder are
in completion paths (per-harvest, per-craft logs in JobService run on every completion)
and `ResearchService`. The `gatedConsole` shim idiom works; the scoped `no-console`
ESLint rule from the last review is still the way to close the class permanently.

### P-7 · ADR-008 boundary violation — PawnStateMachine reaches across the WASM boundary directly (NEW, small + actionable)

> **[x] RESOLVED (2026-06-13).** The `PathfinderService` interface gained `isReady()`; a new
> interface-typed `pathfinderService` singleton (in `PathfinderService.ts`) is the single
> composition point that knows the WASM impl. `PawnStateMachine`'s `tryAssignPath`/
> `tryAssignSleepPath`/`handleIdle` now call `pathfinderService.isReady()`/`.findPath()` and the
> direct `WasmPathfinderService` import is gone. `pnpm graph:check` confirms **PawnStateMachine no
> longer appears in the ADR-008 list** (the remaining 6 bypasses — `EntityService.pathTo`,
> `GameEngineImpl.debugLogPawns`/`_processDraftOrders`, and the `init()` calls in
> `GameCanvas`/`GameControls` — are separate, pre-existing, and out of this fix's scope).

> Surfaced by the [PawnStateMachine hotspot](HOTSPOT-PawnStateMachine-2026-06-13.md) (graph-derived).
> **Unlike P-2…P-5 this is a quick, safe fix — not deferred.**

`tryAssignPath`, `tryAssignSleepPath`, and `handleIdle` call `WasmPathfinderServiceImpl.findPath`
and `.isReady` **directly** instead of through the `PathfinderService` interface — even though the
module already imports the interface too (2 call sites), so it straddles the very boundary ADR-008
requires it to respect. With Rust now in the codebase graph the leak is traceable end to end:
`tryAssignPath → WasmPathfinderServiceImpl.findPath → spatial-core::find_path → reconstruct`
(`/api/path`, 3 hops). **Fix:** route `findPath`/`isReady` through `PathfinderService`; delete the
direct `WasmPathfinderService` import. ~5 isolated call sites, no behaviour change. Success check:
the `WasmPathfinderService` edge disappears from this module's `dependsOn` in `pnpm graph`.

---

# Part III — Carried-forward deferred items (unchanged status)

- **D9.1 / D9.6 / D9.7** — index-once tick, deep-clone removal (tied to P-2), event-driven job generation. Profiling-gated.
- **D-perf** — cooldown index for regrowth (the pre-scan added in `processResourceRegrowth` is a good stopgap; full O(map) rebuild still happens on regrowth ticks), tick strides, incremental job board.
- **D-bills** — `productionTargets` still exists in state with nothing driving it; unchanged.
- **ADR-009 step 2** — per-pawn claimed-inventory tool gating (R4 is step 1: any gating at all).

---

# Part IV — Playtest findings (2026-06-13)

From a play session, with `.debug/pawns.log` evidence. Three fixed inline; one investigated
with a proposed fix awaiting sign-off (behavioural FSM change).

## PT-1 · Hauling-to-stockpile "hang" — INVESTIGATED, fix proposed (not applied)

**Symptom:** pawns (#18, #20) appear to "hang for a moment" while moving to the stockpile.

**Evidence:**

- Pawns in `MovingToDeposit` target a **stockpile designation centre tile** — Indigo →
  `target:(119,81)`, Uma → `target:(115,90)` — but **never stand on it**. They "deposit in place"
  1–2 tiles short on every run (Indigo at (121,77)/(120,79); Uma at (115,92)/(115,91)). So
  [`findNearestDepositPoint`](../src/lib/game/systems/PawnStateMachine.ts#L1409) returns the zone
  centre, the pawn paths toward it, the path ends short (tile occupied/blocked),
  `hasReachedDestination` flips while **not** adjacent, and the `// Didn't quite make it — deposit
  in place anyway` branch ([PawnStateMachine.ts:1856](../src/lib/game/systems/PawnStateMachine.ts#L1856))
  fires. Functionally the item is deposited, but the walk-up-then-stop-short reads as a stutter.
- **Soft-queue hygiene smell:** duplicate consecutive entries
  (`queue:[haul(116,98) > haul(116,98) > haul(116,98) > harvest(124,98)]`) and stale/dead refs
  (`?5411`, `harvest(131,84)!`) — not the direct cause, but the queue isn't deduped/compacted.
- **Inconclusive:** sampled `[PAWN-TICK]` lines (~every 30 ticks) show large wall-clock gaps for
  small tick deltas, which *could* be a compute stall during deposit pathfinding — but the log is
  sampled and the session may have been paused / on low game-speed, so this is **not** confirmed.
  Do not implement a speculative perf fix on this evidence alone.

**Proposed fix (needs sign-off):** `findNearestDepositPoint` should return the nearest
**reachable, standable** stockpile/storage tile (or an adjacent free tile), not the zone centre, so
the pawn actually arrives instead of relying on the deposit-in-place fallback. Optionally dedupe
consecutive identical soft-queue entries.

## PT-2 · Inventory weight/volume shows 0.0 — FIXED

**Symptom:** `CARRYING [0.0/20.0 kg]` while a Flint Shard ×1 is carried. **Root cause (= R5's dead
cache):** the UI read the cached `pawn.inventory.weightKg`, a write-only initial-shape field never
updated on inventory mutation. **Fix:** [PawnInventory.svelte](../src/lib/components/pawn/PawnInventory.svelte)
now derives load + budget via `itemService.getCurrentCarryLoad` / `getCarryBudget` (single source of
truth = item defs).

## PT-3 · Info panel / bars — reuse the existing components — FIXED

**Symptom (standing workflow complaint):** COND/FRESH bars sat in an ad-hoc `tile-hud--item` block
in `GameCanvas`, not below the title like every other panel; new bars kept landing in the wrong
place because the reusable components weren't reused. **Fix:** the dropped-item hover panel now
renders through the shared [`SelectedEntityCard`](../src/lib/components/UI/SelectedEntityCard.svelte)
(a `hoverItemCard` model) — title on top, FRESH/COND below it, identical to pawn/mob/building/
resource panels; and `SelectedEntityCard` bars now render via the one reusable
[`StatBar`](../src/lib/components/UI/StatBar.svelte) (`EntityBar` gained optional `color`/
`valueText`), with the panel's private `blockBar` removed. One bar implementation everywhere.

## PT-4 · Crafting cards: show required workstation — FIXED

**Symptom:** crafting cards showed ingredients but not which workstation the recipe needs. **Fix:**
[BuildCard](../src/lib/components/UI/BuildCard.svelte) gained an optional `station` prop (small
`⚒ <name>` row); [CraftingScreen](../src/lib/components/screens/CraftingScreen.svelte) resolves
`recipe.station` → building display name via `buildingService.getBuildingById`. Hand-craftable
recipes (no station) show nothing.

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

_All Part I (R1–R12) and the discrete Part II items (P-1, P-6, R11) are done. What's left is one
quick win plus deliberately-deferred structural work:_

0. **Quick wins:** **[x] P-7 done** — `PawnStateMachine`'s pathfinding now routes through the
   `PathfinderService` interface (ADR-008 bypass closed; off the `graph:check` list). **PT-1**
   (pending sign-off) — make `findNearestDepositPoint` return a reachable, standable tile so haulers
   stop "depositing in place" short of the stockpile.
1. **Before Living World lands:** **P-2** (engine as the only writer; user actions as commands) and **P-3** (inject a log sink so services don't import `stores/`) — both are large, no-functional-change inversions best done with the game running in a browser to verify the activity log / combat floaters / UI snapshot still behave.
2. **Opportunistic (no big-bang):** **P-4** god-file splits along existing seams — for the (former) #1 hotspot `PawnStateMachine`, the report's order is **complete through the decomposition**: P-7 boundary fix → pure helpers (`pawn/pawnQueries.ts`) → handler behaviour-lock tests → `Record<PawnState,Handler>` table → the file split into `pawn/handlers/{work,needs,combat}.ts` + shared `pawn/pawnHelpers.ts` + `pawn/pawnStates.ts` (2,818 → 988 LOC dispatcher). Remaining: optionally sub-split the 1,031-LOC `pawnHelpers.ts`, then push selection logic into services (step 5). Other god-files (GameCanvas 3,321, EntityService 2,015, Combat 1,419) are untouched — same opportunistic approach applies.
3. **Profiling-gated:** **P-5** per-tick allocation churn — only when `__profOut` says so. (The hotspot confirms the convergence: `tickPawn` re-finds each pawn and handlers fan out into 14 modules.)
4. **Physical-production follow-ups** (see [PHYSICAL-PRODUCTION](.tasks/open/PHYSICAL-PRODUCTION.md)): tool-gating step 2 (per-pawn inventory + `minTier`), per-stack craft quality on instances (R8), passive-furnace flagging for forge/hearth.
