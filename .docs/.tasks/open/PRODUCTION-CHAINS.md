<!-- LOC cap: 400 (created: 2026-05-26) -->

# PRODUCTION CHAINS & PAWN AUTONOMY — Phase 6 Spec

> **Related:** [game/DESIGN](../../game/DESIGN.md) · [game/DECISIONS](../../game/DECISIONS.md) · [ROADMAP](ROADMAP.md) · [DF-MIGRATION](DF-MIGRATION.md)

---

## Goal

Transform the colony from a frozen, abstract resource machine into a living settlement where:

- Pawns **move autonomously** toward food, rest, and assigned work sites.
- **Primitive materials** (twigs, flint, plant fiber) are hand-gatherable from the map without tools.
- **Tool requirements** are enforced: tree felling requires a stone axe; no axe = no wood.
- **Workshop buildings** are required for non-trivial crafts: no campfire = no cooked food; no crude workbench = no composite tools.
- The **building and crafting menus** show what's blocked and why, guiding the player through the bootstrapping chain.

Reference: RimWorld HSK production chain depth + DF spatial designation model.

---

## Dependency Chain (bootstrapping order)

```
[START] Hand-gather from map
  twigs (ground/forest)  +  flint_shard (rocky/plains)  +  plant_fiber (grass/wildflowers)
        ↓  craft at knapping surface (no building required)
  flint_knife  ·  stone_chopper
        ↓  enables (tool-gated work categories)
  woodcutting → pine_wood / oak_wood        (requires stone_axe — crafted from above)
  surface quarrying → limestone / sandstone
        ↓  construct (now have wood + stone)
  campfire  ·  debris_hut  ·  crude_workbench  ·  knapping_table
        ↓  craft at workbench / knapping_table
  stone_axe  ·  stone_spear  ·  bone_needle  ·  leather_strips
  cooked_meat  ·  roasted_berries  (campfire)
        ↓
  [Tier 1 progression — tanning rack, forge, stonecutting bench …]
```

---

## Phase 6a — Primitive Materials & Initial DB Population

### New items (to add to `Items.ts`)

| id                | name            | gatherable from                                | tool required  | notes                                               |
| ----------------- | --------------- | ---------------------------------------------- | -------------- | --------------------------------------------------- |
| `twig`            | Twig            | forest floor (grass/dirt subterrain in forest) | none           | stack: 20                                           |
| `flint_shard`     | Flint Shard     | rocky/plains subterrain                        | none           | stack: 10                                           |
| `plant_fiber`     | Plant Fiber     | grass/wildflowers/deep_grass                   | none           | stack: 15                                           |
| `bark`            | Bark Strip      | tree stumps / fallen logs                      | none           | stack: 10                                           |
| `surface_stone`   | Surface Stone   | rocky ground                                   | none           | stack: 5                                            |
| `pine_wood`       | Pine Wood       | `tree` subterrain in forest                    | **stone_axe+** | already in DB as crafting cost — add as harvestable |
| `oak_wood`        | Oak Wood        | `tree` subterrain in forest                    | **stone_axe+** | same                                                |
| `flint_knife`     | Flint Knife     | craft                                          | none           | workshopType: `knapping_surface`                    |
| `stone_chopper`   | Stone Chopper   | craft                                          | none           | workshopType: `knapping_surface`                    |
| `stone_axe`       | Stone Axe       | craft                                          | flint_knife    | workshopType: `crude_workbench`                     |
| `stone_spear`     | Stone Spear     | craft                                          | stone_chopper  | workshopType: `crude_workbench`                     |
| `digging_stick`   | Digging Stick   | craft                                          | none           | workshopType: `knapping_surface`                    |
| `roasted_berries` | Roasted Berries | craft (cook)                                   | none           | workshopType: `campfire`; nutrition: 1.8            |
| `cooked_meat`     | Cooked Meat     | craft (cook)                                   | none           | workshopType: `campfire`; nutrition: 3.0            |
| `leather_strips`  | Leather Strips  | craft                                          | flint_knife    | workshopType: `crude_workbench`                     |

### Crafting costs (new and existing items to update)

| output            | inputs                                          | workshopType       | craftingTime |
| ----------------- | ----------------------------------------------- | ------------------ | ------------ |
| `flint_knife`     | 2× `flint_shard` + 2× `twig`                    | `knapping_surface` | 3            |
| `stone_chopper`   | 1× `flint_shard` + 3× `twig` + 1× `plant_fiber` | `knapping_surface` | 3            |
| `digging_stick`   | 2× `twig` + 2× `plant_fiber`                    | `knapping_surface` | 2            |
| `stone_axe`       | 2× `flint_shard` + 3× `twig` + 2× `plant_fiber` | `crude_workbench`  | 5            |
| `stone_spear`     | 4× `flint_shard` + 5× `twig` + 3× `plant_fiber` | `crude_workbench`  | 5            |
| `leather_strips`  | 1× `hide`                                       | `crude_workbench`  | 2            |
| `roasted_berries` | 2× `wild_berries`                               | `campfire`         | 1            |
| `cooked_meat`     | 1× `rabbit_meat` OR 1× `venison`                | `campfire`         | 2            |

### New buildings (to add to `Buildings.ts`)

| id                 | name             | cost                                               | buildTime | workshopType | notes                                                   |
| ------------------ | ---------------- | -------------------------------------------------- | --------- | ------------ | ------------------------------------------------------- |
| `knapping_surface` | Knapping Surface | 3× `surface_stone` + 2× `twig`                     | 1         | —            | enables Tier 0 tool crafts; no roof required            |
| `campfire`         | Campfire         | 5× `twig` + 2× `surface_stone`                     | 1         | —            | enables cooking; provides warmth +0.2                   |
| `crude_workbench`  | Crude Workbench  | 10× `twig` + 3× `plant_fiber` + 2× `surface_stone` | 2         | —            | enables Tier 1 tool crafts                              |
| `debris_hut`       | Debris Hut       | 12× `twig` + 8× `plant_fiber` + 4× `bark`          | 3         | —            | housing tier 0; populationCapacity: 2; no wood required |
| `storage_pile`     | Storage Pile     | 4× `twig` + 2× `plant_fiber`                       | 1         | —            | tagged `isStorage: true`; pawn food-seeking target      |

> **`storage_pile`** is the first food retrieval target for hungry pawns. When a pawn transitions to HUNGRY it paths to the nearest complete `storage_pile` or `campfire` building before eating. If neither exists, it eats in place (abstract).

### Resource spawn additions (to `Resources.ts` / `ResourceGeneratorService`)

| resource_id     | terrain_subtype                                    | min | max |
| --------------- | -------------------------------------------------- | --- | --- |
| `twig`          | `dirt`, `grass`, `fallen_logs`                     | 4   | 12  |
| `flint_shard`   | `rocky`, `riverbank`                               | 2   | 6   |
| `plant_fiber`   | `grass`, `deep_grass`, `wildflowers`, `tall_grass` | 3   | 8   |
| `bark`          | `tree_stump`, `fallen_logs`                        | 2   | 5   |
| `surface_stone` | `rocky`                                            | 3   | 8   |

---

## Phase 6b — Foraging / Scavenging Zone Designation

### New designation types

Add `'forage' | 'scavenge'` to `DesignationType` in `types.ts`.

| type       | description                                                                         | generates                                      |
| ---------- | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| `forage`   | Gather all primitive resources (twig, plant_fiber, bark, wild_berries) from an area | `harvest` jobs for each matching tile          |
| `scavenge` | Collect surface stone and flint shards                                              | `harvest` jobs for flint_shard / surface_stone |
| `harvest`  | (existing) Harvest a specific designated tile                                       | unchanged                                      |

**`JobService._syncHarvestJobs()`** change: treat `forage` and `scavenge` zones identically to `harvest` but generate jobs for *all* non-tool-gated resources on matching tiles. The zone should cover a rectangle, not a single tile (see UI section below).

### Zone designation UI

**`GameCanvas.svelte`** designation mode extension:
- Add `'forage'` and `'scavenge'` to the designation mode selector (already has `'harvest'`).
- **Click-drag to draw a rectangle** — all tiles in the bounding box receive the designation. This mirrors DF's zone painting. The existing single-tile designation click is kept for `harvest` and `construct`.
- Forage zones render with a green tint overlay; scavenge zones render with a grey tint.

### `JobService` changes

`_syncHarvestJobs()` must handle forage/scavenge by iterating the zone area:
```typescript
for (const [key, dtype] of Object.entries(gs.designations ?? {})) {
    if (dtype === 'harvest') { /* existing logic */ }
    if (dtype === 'forage' || dtype === 'scavenge') {
        // key may encode a rectangle as "x1,y1,x2,y2"
        // or: zone stored as individual tile keys (simpler, compatible with current format)
        // → iterate each tile in zone, gather non-tool-gated resources
    }
}
```
> Simplest approach: store each tile in the zone as a separate designation key (current format `"x,y" → type`). Zone painting just writes N keys. No schema change required.

---

## Phase 6c — Tool-Gate Enforcement in JobService

### `WorkCategory.toolsRequired` enforcement

`JobService.getAvailableJobs(pawn, gameState)` must check tool requirements before returning a job.

```typescript
// In getAvailableJobs filter:
const workKey = this._jobTypeToWorkKey(j.type);
const category = WORK_CATEGORIES.find(c => c.id === workKey);
if (category?.toolsRequired?.length) {
    const hasTool = category.toolsRequired.some(toolId =>
        (gs.item ?? []).some(i => i.id === toolId && i.amount > 0) ||
        pawn.equippedItems?.weapon === toolId  // also check equipped
    );
    if (!hasTool) return false; // job exists but pawn can't take it
}
```

### Work category tool requirements (update `Work.ts`)

| category       | toolsRequired                                                       |
| -------------- | ------------------------------------------------------------------- |
| `woodcutting`  | `['stone_axe', 'iron_axe', 'steel_axe']` (any one suffices)         |
| `mining`       | `['stone_pick', 'iron_pick', 'steel_pick']`                         |
| `hunting`      | `['stone_spear', 'iron_spear', 'shortbow', 'longbow']`              |
| `fishing`      | `['digging_stick', 'fishing_spear', 'fishing_rod']`                 |
| `foraging`     | `[]` (no tool required)                                             |
| `construction` | `[]` (primitive building needs no tool)                             |
| `crafting`     | `[]` (workshop requirement is enforced at queue time, not job time) |

### `Item.workshopType` enforcement at queue time

`ItemService.startCrafting()` (called by `CraftingScreen`) must check that a complete building of `item.workshopType` exists:

```typescript
if (item.workshopType) {
    const workshopExists = (gameState.buildings ?? []).some(
        b => b.type === item.workshopType && b.status === 'complete'
    );
    if (!workshopExists) return { success: false, reason: `Requires ${item.workshopType}` };
}
```

---

## Phase 6d — Pawn Autonomous Needs Navigation

### Problem

Currently `handleHungry` immediately consumes food abstractly and transitions to EATING without any pawn movement. Pawns appear frozen.

### Solution: food and rest as map targets

**Food retrieval:**
- When a pawn enters HUNGRY, find the nearest complete `storage_pile`, `campfire`, or any building tagged `isStorage: true`.
- If found: add an `eat` job targeting that building's `(x, y)`, path to it via `tryAssignPath`, transition to `MOVING_TO_NEED`.
- If not found (no storage building exists): consume food abstractly in place (fallback, current behavior).

**Rest:**
- When a pawn enters TIRED, find the nearest complete building with `category === 'housing'` or tagged `isRest: true`.
- If found: path to it, transition to `MOVING_TO_NEED`.
- If not found: sleep in place (current behavior).

### Changes to `PawnStateMachine.ts`

```
handleHungry():
    food = findAvailableFood(gs)
    if (!food) → stay HUNGRY (or go IDLE if truly nothing exists)
    target = findNearestStorageBuilding(gs)
    if (target && pawn.position not adjacent to target):
        gs = tryAssignPath(pawn, target.x, target.y, gs)
        → set activeJob { type:'need', targetX:target.x, targetY:target.y, targetState:'Eating' }
        → transition to MOVING_TO_NEED
    else:
        consumeFood(food, gs)
        → transition to EATING (in-place, fallback)

handleTired():
    target = findNearestRestBuilding(gs)
    if (target && pawn.position not adjacent to target):
        gs = tryAssignPath(pawn, target.x, target.y, gs)
        → set activeJob { type:'need', targetX:target.x, targetY:target.y, targetState:'Sleeping' }
        → transition to MOVING_TO_NEED
    else:
        → transition to SLEEPING (in-place)
```

### New helpers needed in `PawnStateMachine.ts`

```typescript
function findNearestStorageBuilding(pawn: Pawn, gs: GameState): PlacedBuilding | null {
    const storageBuildings = (gs.buildings ?? []).filter(
        b => b.status === 'complete' && STORAGE_BUILDING_IDS.includes(b.type)
    );
    // sort by Manhattan distance to pawn, return nearest
}

const STORAGE_BUILDING_IDS = ['storage_pile', 'campfire', 'food_storage'];
const REST_BUILDING_IDS = ['debris_hut', 'lean_to_shelter', 'woodland_shelter', 'stone_hut'];
```

### Pawn labor settings default

`JobService.getAvailableJobs()` currently returns empty if `laborSettings` is not set. Default all missing keys to `NORMAL (2)` when undefined so newly spawned pawns can claim jobs immediately:

```typescript
const laborLevel = workKey in laborSettings
    ? laborSettings[workKey]
    : (legacyPriorities[workKey] ?? LABOR_LEVEL.NORMAL);  // default NORMAL
```

---

## Phase 6e — Building & Crafting Menu Rework

### Building menu

Current: flat list → click → places abstract building at (0,0).

Target: same list, but with added context:
- **"BLOCKED"** badge if `buildingCost` items not in stockpile or `toolTierRequired` tools missing.
- **"MISSING: <workshopType>"** badge if building requires a workshop that doesn't exist.
- **Progress panel** shows all in-progress buildings (currently shows only first), with individual cancel per building.
- Future (Phase 7): map-placement mode — click a building → map enters placement mode → click tile → blueprint placed at that coordinate (needed for buildings with spatial meaning: forge, tanning rack).

### Crafting menu

Current: flat list → click → queues craft.

Target:
- **"REQUIRES: <workshopType>"** badge on any item whose workshop isn't built yet. Item still visible but unclickable with tooltip explaining the requirement.
- **"MISSING TOOL: <toolId>"** badge on items whose `toolTierRequired` isn't met.
- Filter row: add "by workshop" grouping option (shows all campfire recipes together, etc.)
- Queue panel: shows all queued items with pawn assignment and work-point progress bar.

---

## Implementation Order

| Step | File(s)                 | What                                                                                                                |
| ---- | ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1    | `Items.ts`              | Add primitives + Tier 0/1 tool items with crafting costs                                                            |
| 2    | `Buildings.ts`          | Add knapping_surface, campfire, crude_workbench, debris_hut, storage_pile                                           |
| 3    | `Resources.ts`          | Add twig, flint_shard, plant_fiber, bark, surface_stone spawn entries                                               |
| 4    | `types.ts`              | Add `'forage' \| 'scavenge'` to `DesignationType`; add `isStorage?: boolean; isRest?: boolean` to `Building`        |
| 5    | `Work.ts`               | Update `toolsRequired` on woodcutting/mining/hunting/fishing                                                        |
| 6    | `JobService.ts`         | Enforce `toolsRequired` check in `getAvailableJobs`; default NORMAL labor; handle forage/scavenge designation types |
| 7    | `ItemService.ts`        | Enforce `workshopType` at `startCrafting()`                                                                         |
| 8    | `PawnStateMachine.ts`   | Rewrite `handleHungry` + `handleTired` to pathfind to storage/rest buildings                                        |
| 9    | `GameCanvas.svelte`     | Rectangle designation drawing for forage/scavenge zones                                                             |
| 10   | `BuildingMenu.svelte`   | Blocked badges, multi-building progress panel                                                                       |
| 11   | `CraftingScreen.svelte` | Workshop requirement badges, workshop grouping filter                                                               |

---

## Acceptance Criteria

- [ ] Starting a new game: world has twigs, flint shards, plant fiber visible on map tiles.
- [ ] Designating a forage zone causes pawns to walk to tiles and collect twigs/fiber.
- [ ] Queuing `flint_knife` craft succeeds only when `knapping_surface` is complete.
- [ ] Queuing a woodcutting harvest job does nothing until a pawn has `stone_axe` in colony inventory.
- [ ] A hungry pawn with a `storage_pile` built walks to it before eating.
- [ ] A tired pawn with a `debris_hut` built walks to it before sleeping.
- [ ] BuildingMenu shows "BLOCKED" on `lean_to_shelter` when stockpile has no `pine_wood`.
- [ ] CraftingScreen shows "REQUIRES: campfire" on `roasted_berries` when no campfire exists.
