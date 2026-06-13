<!-- LOC cap: 300 (created: 2026-06-13) -->

# PHYSICAL PRODUCTION — reserve-and-fetch crafting

> **Related:** [game/DESIGN](../../game/DESIGN.md) · [game/DECISIONS](../../game/DECISIONS.md) (ADR-016) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [ROADMAP](../open/ROADMAP.md)

> **Archived 2026-06-13.** Pass 1 + Pass 2 shipped (recorded as ADR-016). The "Still deferred"
> follow-ups below are tracked live in the [open codebase review](../../CODEBASE-REVIEW-2026-06-10.md).

## Problem

The colony has two halves and only one is physical. **Gathering** is physical (harvest →
loose `DroppedItem` on a tile → haul into a pawn's inventory → `stored` drop on a stockpile
tile). **Consumption is an ethereal shared pocket**: crafting / building / eating / butchery
all reach into the aggregate `gameState.stockpile` (or the dead-end `gameState.item` array)
from anywhere, at queue time, with no pawn holding or carrying the material. Symptoms:

- `craftItem` consumes inputs the instant the player clicks; the craft job targets `(0,0)`, so the pawn crafts wherever it stands and never visits the workshop.
- Craft **output** lands in `gameState.item`, invisible to every material/cost/fuel consumer → the fire_bricks→advanced_kiln tier is uncompletable (review R1).
- Butchery consumes the **whole carcass stack** but yields one carcass (review R3).
- ADR-009 tool gating (R4) and the carry-weight budget (R5) are meaningless because no pawn ever physically holds inputs.

## Principle

**Items are always physical objects occupying a location** — a tile (loose or `stored`
`DroppedItem`) or a pawn's inventory. There is no global item pool. To produce an item by
any means, a pawn must have held the input items, carried them to the production location
(usually a workstation tile), and the output is created **at that location**.

## Model (Pass 1 — active crafting)

1. **Reserve, don't consume.** A craft order locks matching `stored` drops via
   `DroppedItem.reservedFor = orderId` (splitting a stack if only part is needed). Reserved
   stock is physically present but excluded from "available" — so a second order can't
   double-spend it. Nothing is deleted at queue time.
2. **Fetch.** JobService emits one `fetch` job per reserved drop not yet on the station:
   source = the reserved drop, dest = the chosen station tile. The station is picked by
   `buildingService.bestCraftStation` — the best workshop that can run the recipe (see station
   tiers below). A pawn carries it (reusing the haul machinery) and stages it as a
   `stored reservedFor` drop **on** the station.
3. **Craft.** Once every reserved drop sits on the station tile, the `craft` job becomes
   claimable, targeted at the station tile. The pawn walks there and spends
   `recipe.workAmount × quantity` work points (same model as construction).
4. **Produce.** On completion the staged inputs are destroyed and the outputs spawn as drops
   **on the station tile** (absorbed if the tile is also a stockpile, else they wait to be
   hauled). Quality from `pawnStatService.getWorkModifiers(...).quality`; tool/mold wear kept.

**Long jobs yield to needs (ADR-010).** A craft job is a normal work job, so a pawn working it
re-checks hunger / fatigue / thirst every tick via `checkNeedInterrupts`. When a need crosses
its proximity-weighted threshold the pawn **releases the job** (its accumulated `workDone` stays
in the global pool, `claimedBy` → null) and breaks off to eat / sleep / drink — so another pawn
can claim the half-finished job meanwhile and this one resumes it later. Thirst routes to a
drink zone/well only when there's no stored water to sip in place (auto-drink covers that
first); hygiene stays non-interrupting (mood-only).

`gameState.item` is removed entirely; its readers (craft output, eating, equip pool, events,
blueprint cost, craft-cancel refund) move to physical stock.

**Butchery is already recipe-based** — and therefore physical via this pass for free. Each
carcass is the input to a `butcher_spot` recipe (`make_rabbit_meat`: `{rabbit_carcass: 1}` →
`{rabbit_meat: 1}`, …), so a butchery order reserves one carcass, a pawn fetches it to the
butcher spot, and the meat spawns there — exactly the reserve-and-fetch flow. The old
`item.isCarcass`/`yields` multi-yield path (`processButchery`/`craftButchery` + CraftingScreen
carcass branches) was **dead code** — no item in `items.jsonc` carries `isCarcass`/`yields` — and
was **removed** in Pass 2. Reviving a one-carcass→meat+hide+bone multi-yield model is a separate
content follow-up.

## Pass 2 — follow-ups

- [x] **Passive furnaces.** `Recipe.passive` flag + a `PASSIVE_STATIONS` default
  (bloomery / charcoal_pit / pottery_kiln / advanced_kiln). A passive order's inputs are still
  fetched/staged, but no craft job is generated; `GameEngineImpl.processPassiveProduction`
  accrues work each tick once the furnace is **supplied** and **lit** (fuel-burning furnaces;
  charcoal_pit, which has no fuel tank, runs once loaded), completing through the shared
  `JobService.completeCraftOrder`. stone_forge/hearth stay active (a pawn works them) until
  their content is split from cooking/shaping — flag per-recipe via `Recipe.passive` when ready.
- [x] **Building-material hauling.** `placeBuilding` RESERVES the build cost to the building
  (instant zero-work buildings still consume immediately); `_syncFetchJobs` carries it to the
  build site; `_syncConstructJobs` gates the construct job on `_buildingSupplied`; completion
  consumes the staged materials; `cancelBuilding` releases the reservation. The fetch/staging
  system is now polymorphic over a reservation **owner** = craft order OR building.
- [x] **Butchery (dead-code removal).** Butchery was already recipe-based/physical; the
  vestigial `isCarcass`/`yields`/`processButchery`/`craftButchery` path (no item data triggered
  it) was removed.
- [x] **R5 carry-budget enforcement.** `ItemService.clampPickupQuantity` caps each haul/fetch
  pickup by the pawn's weight/volume budget (belt/back raise it); the remainder stays for another
  trip; **always floors at 1** so a single over-budget item (a heavy carcass; later a rescued pawn)
  can always be hand-carried.
- [x] **Station tiers + R4 tool gating + bootstrap.**
  - **Station tiers:** generic crafting stations form a tier ladder (`effects.tier`: craft_spot 0
    → Crude Workbench 1). A higher tier *supersedes* lower ones and crafts their shared recipes
    faster (`effects.craftingBonus` baked into the order's `workRequired`) —
    `buildingService.stationFulfills`/`bestCraftStation`/`craftingBonusOf`. Specialised stations
    (sawtable, forge…) have no tier → exact-match only.
  - **ADR-009 tool gating (colony-stock, step 1):** `JobService.getAvailableJobs` filters a harvest
    whose `interaction.toolRequirement` is set unless the colony stockpile holds a tool from the
    matching `WorkCategory.toolsRequired` (`_colonyHasHarvestTool`); the job stays open until one is
    crafted. Tool-free scavenges are exempt. (Closes review **R4**.)
  - **Bootstrap (ADR-009):** `stone_outcrop` is now a **tool-free scavenge** (small_stone 5–10,
    flint_shard 0–2 — flint is the intended scarce gate); `stone_axe`/`stone_hammer` recipes moved
    to **craft_spot** (tier 0) and `makers_bench` renamed **"Crude Workbench"**, breaking the
    circular build cost; added missing **`stone_pick`/`stone_hoe`** items + recipes so mining/planting
    are tool-satisfiable. Chain: forage + scavenge stone → tier-0 tools → Crude Workbench → axe →
    woodcutting.

### Still deferred

- [ ] **Tool gating step 2** — per-pawn *claimed-inventory* check + `minTier` (currently colony-wide,
  any-tier); **craft-tool gating** (e.g. forge tongs for metalworking) — gating is gathering-only.
- [ ] **Per-stack craft quality** (review R8) — dropped with `gs.item`; re-attach quality to an
  `ItemInstance`/stored drop when equipment quality matters.
- [ ] **Butchery multi-yield** — one carcass → meat + hide + bone + intactness scaling (content task).
- Unrelated review items not in this spec's scope: R2 (drafted-pawn health), R9 (hunting
  need-interrupt), R10 (`killPawn` drops nothing). _(R6 dead-triad and R7 `isWorking` are now done.)_

## Verification

- Reserve→fetch→craft round trip; double-spend guard; output on the station; building materials
  fetched then consumed on completion; passive furnace produces when supplied + lit; long jobs
  release to the pool on hunger/fatigue/thirst; carry-budget clamp (≥1); station-tier supersession;
  tool gating (woodcut needs an axe, scavenge is free); no `gs.item` references remain.
- Gates (current): `pnpm check` 0 errors · `pnpm test` **133** passing · `pnpm lint` 0 errors ·
  `pnpm build` succeeds.
