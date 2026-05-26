<!-- LOC cap: 700 (created: 2026-05-26, revised: 2026-05-26) -->

# PRODUCTION CHAINS & PAWN AUTONOMY — Phase 6 Spec

> **Related:** [game/DESIGN](../../game/DESIGN.md) · [game/DECISIONS](../../game/DECISIONS.md) · [ROADMAP](ROADMAP.md) · [DF-MIGRATION](DF-MIGRATION.md)

---

## Goal

Transform the colony from a frozen, abstract resource machine into a living settlement where:

- Pawns **move autonomously** toward food, rest, and assigned work sites.
- **Primitive materials** (twigs, flint shards, plant fiber) are hand-gatherable from the map without tools.
- **Tool requirements** are enforced: tree felling requires a stone axe; no axe = no wood.
- **Workshop buildings** are required for non-trivial crafts: no campfire = no cooked food.
- **Fuel** is a concrete resource that buildings consume per turn — fire goes out without it.
- **Walls** are individually placed tile segments with a clear material progression, not pre-built "huts".
- The **building and crafting menus** show what's blocked and why, guiding the player through the bootstrapping chain.

Reference: RimWorld HSK production chain depth · DF spatial designation model · Vintage Story clay/storage model.

---

## Dependency Chain (bootstrapping order)

```
[START] Hand-gather from map — no tools required
  twig  ·  flint_shard  ·  plant_fiber  ·  wild_oats (existing)  ·  wild_berries (existing)
         ↓
  craft at CRAFT SPOT (free designated ground tile — no materials, no building)
    firestarter  (2× twig + 1× flint_shard)           — single-use ignition tool
    flint_knife  (2× flint_shard + 2× twig)
    stone_chopper  (1× flint_shard + 3× twig + 1× plant_fiber)
    digging_stick  (2× twig + 2× plant_fiber)
    rope  (4× plant_fiber)                             — binding material + fuel
         ↓
  use firestarter → light CAMPFIRE (5× twig + 4× plant_fiber, no stone)
  feed campfire with fuel items (twig, plant_fiber, rope, wood…)
         ↓ campfire enables (direct fire, no vessel)
    spit_meat  (1× meat + 2× twig — impaled on a spit over the fire)
         ↓ gather clay_lump → craft clay_cooking_pot (2× clay_lump, fired at the campfire itself)
    stews  (2–4 food ingredients + clay_cooking_pot → name derived from contents)
         ↓
  stone_axe (2× flint_shard + 3× twig + 2× rope)      — requires flint_knife to craft
  stone_hammer (2× surface_stone + 3× twig + 1× rope)
  stone_spear (3× flint_shard + 4× twig + 1× rope)
         ↓ woodcutting (requires stone_axe) unlocks
  pine_wood / oak_wood
         ↓ gather clay (swamp/riverbank, digging_stick improves yield)
  clay_lump
         ↓ build primitive walls (individual segments)
    twig_wall    (8× twig + 4× plant_fiber)
    wicker_wall  (6× twig + 4× plant_fiber + 3× rope)
    daub_wall    (4× wicker_wall complete + 6× clay_lump)   — plaster over existing wicker
         ↓
  "sacrifice" flint_knife + stone_chopper + stone_axe + stone_hammer
  → builds MAKER'S BENCH (see Phase 6e)
         ↓ Maker's Bench enables
  woven_basket  ·  clay_pot  ·  leather_strips  ·  stone_spade
         ↓ clay working
  clay_storage_jar  (preservation + bulk storage)      — Vintage Story inspiration
         ↓
  [Tier 1 — tanning rack, stone forge, pottery kiln, fired_brick…]
```

---

## Phase 6a — Items: Primitives, Tools, and Food

### New / updated items in `Items.ts`

#### Primitive raw materials (all `type: 'material'`)

| id              | name          | category    | fuelValue | notes                                                          |
| --------------- | ------------- | ----------- | --------- | -------------------------------------------------------------- |
| `twig`          | Twig          | `primitive` | 3         | gatherable: `dirt`, `grass`, `fallen_logs`                     |
| `flint_shard`   | Flint Shard   | `primitive` | —         | gatherable: `rocky`, `riverbank`                               |
| `plant_fiber`   | Plant Fiber   | `primitive` | 2         | gatherable: `grass`, `deep_grass`, `wildflowers`, `tall_grass` |
| `bark`          | Bark Strip    | `primitive` | 8         | gatherable: `tree_stump`, `fallen_logs`                        |
| `surface_stone` | Surface Stone | `primitive` | —         | gatherable: `rocky`                                            |
| `rope`          | Rope          | `primitive` | 4         | crafted from plant_fiber; dual-use: binding + fuel             |
| `clay_lump`     | Clay Lump     | `primitive` | —         | gatherable: swamp/riverbank with digging_stick                 |

> `fuelValue` is a new field on `Item` (see Phase 6f). Items without it cannot be used as campfire fuel.

#### Tier 0 tools (crafted at Craft Spot)

| id              | name          | craftingCost                                    | workshopType | notes                                   |
| --------------- | ------------- | ----------------------------------------------- | ------------ | --------------------------------------- |
| `firestarter`   | Firestarter   | 2× `twig` + 1× `flint_shard`                    | `craft_spot` | single-use; required to ignite campfire |
| `flint_knife`   | Flint Knife   | 2× `flint_shard` + 2× `twig`                    | `craft_spot` | required to craft Tier 1 tools          |
| `stone_chopper` | Stone Chopper | 1× `flint_shard` + 3× `twig` + 1× `plant_fiber` | `craft_spot` | required to craft Tier 1 tools          |
| `digging_stick` | Digging Stick | 2× `twig` + 2× `plant_fiber`                    | `craft_spot` | improves clay/root gathering yield      |

#### Tier 1 tools (crafted at Maker's Bench)

| id             | name         | craftingCost                               | workshopType   | notes                     |
| -------------- | ------------ | ------------------------------------------ | -------------- | ------------------------- |
| `stone_axe`    | Stone Axe    | 2× `flint_shard` + 3× `twig` + 2× `rope`   | `makers_bench` | unlocks woodcutting       |
| `stone_hammer` | Stone Hammer | 2× `surface_stone` + 3× `twig` + 1× `rope` | `makers_bench` | construction bonus        |
| `stone_spear`  | Stone Spear  | 3× `flint_shard` + 4× `twig` + 1× `rope`   | `makers_bench` | hunting                   |
| `stone_spade`  | Stone Spade  | 2× `surface_stone` + 2× `twig` + 2× `rope` | `makers_bench` | improves clay/earth yield |

#### Direct-fire food (campfire, no vessel required)

| id          | name              | workshopType | recipe                            | nutrition | notes                      |
| ----------- | ----------------- | ------------ | --------------------------------- | --------- | -------------------------- |
| `spit_meat` | Spit-Roasted Meat | `campfire`   | 1× any meat + 2× `twig` (as spit) | 3.0       | replaces old `cooked_meat` |

> A twig is consumed as the spit — no bowl, no vessel. Nothing else is cookable directly over fire.

#### Stewed food (campfire + `clay_cooking_pot` required)

See **§ Dynamic Stew System** below. No hardcoded stew IDs — a single `stew` item type derives its display name and nutrition from its ingredient list at render time.

#### Crafted goods

| id                 | name             | craftingCost                 | workshopType   | notes                                                                  |
| ------------------ | ---------------- | ---------------------------- | -------------- | ---------------------------------------------------------------------- |
| `clay_cooking_pot` | Clay Cooking Pot | 2× `clay_lump`               | `campfire`     | cooking **tool** (not consumed); enables stew recipes                  |
| `woven_basket`     | Woven Basket     | 4× `plant_fiber` + 2× `rope` | `makers_bench` | container: 15 slots, no preservation                                   |
| `clay_pot`         | Clay Pot         | 3× `clay_lump`               | `makers_bench` | container: 10 slots, preservationBonus: 0.3                            |
| `clay_storage_jar` | Clay Storage Jar | 5× `clay_lump` + 2× `rope`   | `makers_bench` | container: 30 slots, preservationBonus: 0.7; Vintage Story inspiration |
| `leather_strips`   | Leather Strips   | 1× `hide`                    | `makers_bench` | crafting material                                                      |

> **Storage progression:** woven_basket → clay_pot → clay_storage_jar. Getting to cooked meals (`clay_cooking_pot`, 2× clay_lump, no bench) is deliberately easy. Getting to preserved meals (`clay_storage_jar`, 5× clay_lump + 2× rope + Maker's Bench) is a mid-game milestone.

> `clay_cooking_pot` is fired at the same campfire it will be used in. No Maker's Bench required — the fire itself tempers the clay.

---

### Dynamic Stew System

**Enabler:** a `clay_cooking_pot` must be present in the colony stockpile (not consumed per recipe). `ItemService.startCrafting()` checks for one alongside the standard `workshopType: 'campfire'` check.

**Recipe model:** instead of fixed item IDs, a single `stew` entry in `Items.ts` acts as the template. The queued craft stores `components: string[]`; the produced item instance carries them forward to drive the display name and nutrition value.

```typescript
// Queued craft entry:
{ itemId: 'stew', components: ['wild_berries', 'wild_oats', 'common_carp'],
  workshopType: 'campfire' }

// Produced item instance:
{ id: 'stew', displayName: 'Fish Porridge',
  components: ['wild_berries', 'wild_oats', 'common_carp'],
  nutrition: 4.5 }  // Σ(ingredient.nutrition) × 1.5 cooking multiplier
```

**Ingredient slots:** 2 minimum, 4 maximum. Any `type: 'food'` item is a valid ingredient. Non-food items are rejected at queue time.

**Name derivation rules** (evaluated top-to-bottom, first match wins):

| Condition                     | Name pattern           | Example                             |
| ----------------------------- | ---------------------- | ----------------------------------- |
| protein + grain (`wild_oats`) | `"[Protein] Porridge"` | *Fish Porridge*, *Venison Porridge* |
| protein only (single source)  | `"[Protein] Stew"`     | *Carp Stew*, *Rabbit Stew*          |
| 3+ distinct protein sources   | `"Mixed Stew"`         | *Mixed Stew*                        |
| grain only                    | `"Oat Gruel"`          | *Oat Gruel*                         |
| berries + grain               | `"Berry Porridge"`     | *Berry Porridge*                    |
| berries only                  | `"Berry Mash"`         | *Berry Mash*                        |
| `herbs` present in any slot   | prepend `"Herb "`      | *Herb Fish Stew*                    |

**Protein label mapping** (first protein wins unless 3+ sources):
- `common_carp`, any fish → "Fish"
- `rabbit_meat` → "Rabbit"; `venison` → "Venison"; `boar_meat` → "Boar"
- Two different meat species → "Mixed Meat" (e.g. *Mixed Meat Porridge*)

**Nutrition:** `Σ(ingredient.nutrition) × 1.5`. Four-ingredient stews yield meaningfully more than eating the same items raw — the cooking multiplier is the payoff for acquiring a clay_cooking_pot.

---

## Phase 6b — Buildings: Campfire & Fuel System

### Campfire

```
id: 'campfire'
buildingCost: { twig: 5, plant_fiber: 4 }
buildTime: 1
category: 'production'
requiresLighting: true     ← needs firestarter item in colony to activate
maxFuel: 60                ← fuel units
fuelConsumptionRate: 1     ← fuel units consumed per turn
effects: { warmth: 0.3, cookingEnabled: true }
```

**Lighting mechanic:** A `campfire` placed on the map starts in state `unlit`. A pawn with a `firestarter` item in colony stockpile claims a `light` micro-job (new job type) targeting the campfire tile, walks to it, spends the firestarter (consumed), sets building `lit: true`. The campfire then burns per `fuelConsumptionRate` per turn. When `fuel` reaches 0, `lit` becomes `false` and cooking stops.

**Refueling mechanic:** `JobService` generates `refuel` jobs for any lit campfire (or campfire the player has marked for auto-refuel) when `fuel < maxFuel / 3`. A pawn with haul labor enabled picks fuel items from the stockpile and hauls them to the campfire.

### New fields on `PlacedBuilding` (types.ts)

```typescript
fuel?: number;    // current fuel units (buildings that consume fuel)
lit?: boolean;    // is the campfire/forge burning?
```

### New fields on `Building` definition (types.ts)

```typescript
requiresLighting?: boolean;    // must be lit with a tool before functioning
maxFuel?: number;              // total fuel capacity
fuelConsumptionRate?: number;  // fuel units consumed per turn while active
isStorage?: boolean;           // pawn food/item seeking target
isRest?: boolean;              // pawn sleep seeking target
```

---

## Phase 6c — Buildings: Walls (individual placed segments)

No "hut" buildings in the primitive tier. Shelter is constructed wall-by-wall, with a clear material progression.

| id               | name           | buildingCost                                  | buildTime | movementCost | notes                                 |
| ---------------- | -------------- | --------------------------------------------- | --------- | ------------ | ------------------------------------- |
| `twig_wall`      | Twig Wall      | 8× `twig` + 4× `plant_fiber`                  | 1         | blocked      | tier 0; fragile                       |
| `wicker_wall`    | Wicker Wall    | 6× `twig` + 4× `plant_fiber` + 3× `rope`      | 2         | blocked      | tier 1; stronger                      |
| `daub_wall`      | Daub Wall      | 4× `twig` + 3× `plant_fiber` + 6× `clay_lump` | 3         | blocked      | tier 2; insulating                    |
| `mud_brick_wall` | Mud Brick Wall | 6× `mud_brick` + 2× `rope`                    | 3         | blocked      | tier 2; requires `mud_brick` crafting |
| `twig_door`      | Twig Door      | 6× `twig` + 4× `rope`                         | 1.5       | walkable     | tier 0 doorway                        |

> **Placement model:** wall buildings are placed one tile at a time in `GameCanvas`. The building menu shows "Walls & Doors" as a sub-category. Each segment is a full `PlacedBuilding` with `x, y` coordinates. Walls placed on a tile set `tile.walkable = false`.

> `mud_brick` is a crafted item: 2× `clay_lump` at Craft Spot (sun-dried, no kiln needed) → `mud_brick`.

---

## Phase 6d — Buildings: Craft Spot and Maker's Bench

### Craft Spot (`craft_spot`)

A free designated location — no materials, no `buildTime`. Works like a DF "designation" rather than a structure. Unlocks all Tier 0 tool crafts.

```
id: 'craft_spot'
buildingCost: {}          ← zero cost
buildTime: 0              ← instant placement
category: 'production'
workshopType: 'craft_spot'
effects: { craftingEnabled: true, tier: 0 }
description: 'A designated area where a pawn squats to knap stone and weave fiber.
              No structure — just intent.'
```

> `buildTime: 0` means the PlacedBuilding starts at `status: 'complete'` immediately on placement. `JobService` skips generating a construct job for it.

### Maker's Bench (`makers_bench`)

The first real workshop. Building cost is the **sacrifice of all primitive tools**. This forces a genuine tradeoff: the player has spent early turns crafting survival tools, then invests them as the "price of progress."

```
id: 'makers_bench'
buildingCost: {
    flint_knife: 1,
    stone_chopper: 1,
    stone_axe: 1,
    stone_hammer: 1,
    twig: 15,
    rope: 4
}
buildTime: 4
category: 'production'
workshopType: 'makers_bench'
description: 'A proper workbench assembled from your first tools — laid flat, wedged with
              cordage, the working surface of someone who means to stay.
              Unlocks composite tools, leather work, and clay containers.'
effects: { craftingEnabled: true, tier: 1, craftingBonus: 0.2 }
```

---

## Phase 6e — Resource Spawns (`Resources.ts`)

Add entries to `RESOURCES` for all new gatherable primitives:

| id              | terrainSubtypes                                    | min | max | harvestTime | toolRequired           |
| --------------- | -------------------------------------------------- | --- | --- | ----------- | ---------------------- |
| `twig`          | `dirt`, `grass`, `fallen_logs`                     | 4   | 12  | 2           | none                   |
| `flint_shard`   | `rocky`, `riverbank`                               | 2   | 6   | 3           | none                   |
| `plant_fiber`   | `grass`, `deep_grass`, `wildflowers`, `tall_grass` | 3   | 8   | 2           | none                   |
| `bark`          | `tree_stump`, `fallen_logs`                        | 2   | 5   | 2           | none                   |
| `surface_stone` | `rocky`                                            | 3   | 8   | 3           | none                   |
| `clay_lump`     | `mud`, `bog`, `riverbank`                          | 4   | 10  | 4           | digging_stick improves |

> `toolRequired` is advisory metadata (shown in UI), not enforced at the resource level. Tool-gate is enforced in `JobService.getAvailableJobs()` via the work category's `toolsRequired` array.

Add `woodcutting: true` flag to the existing `wood` resource entry so `JobService` knows it requires the tool gate (vs. `twig` which does not).

---

## Phase 6f — New Type Fields (`types.ts`)

```typescript
// On Item:
fuelValue?: number;          // fuel units contributed when used as campfire/forge fuel
isContainer?: boolean;       // can hold other items in storage
storageCapacity?: number;    // number of item slots if container
preservationBonus?: number;  // 0–1 multiplier on food spoilage rate
isCookingVessel?: boolean;   // when present in colony, enables stew recipes at campfire
components?: string[];       // stew instances only: ingredient IDs (drives displayName + nutrition)

// On Building:
requiresLighting?: boolean;
maxFuel?: number;
fuelConsumptionRate?: number;
isStorage?: boolean;
isRest?: boolean;

// On PlacedBuilding:
fuel?: number;
lit?: boolean;
```

---

## Phase 6g — Pawn Autonomous Needs Navigation

### Problem

`handleHungry` immediately consumes food abstractly with no pawn movement. `handleTired` also has no movement. Pawns appear frozen.

### Solution: path to spatial targets

**Hungry** → find nearest complete building with `isStorage: true` (Maker's Bench doesn't qualify; campfire or designated food-drop tile does) → `tryAssignPath` → `MOVING_TO_NEED { targetState: 'Eating' }`. Fallback: eat in place if no storage building.

**Tired** → find nearest complete building with `isRest: true` (any housing) → `tryAssignPath` → `MOVING_TO_NEED { targetState: 'Sleeping' }`. Fallback: sleep in place.

Initial buildings with `isStorage: true`: `campfire` (food cooked and retrieved here). Storage containers (`woven_basket`, `clay_pot`) carry `isContainer: true` but pawn pathfinding targets buildings, not item locations (Phase 7: path to nearest container).
Initial buildings with `isRest: true`: any wall-enclosed structure is NOT auto-detected (Phase 7) — for now a placeholder: any complete building with `category === 'housing'`.

### Fix labor default

`JobService.getAvailableJobs()` must default unconfigured work types to `NORMAL (2)` instead of blocking all jobs:
```typescript
const laborLevel = workKey in laborSettings
    ? laborSettings[workKey]
    : LABOR_LEVEL.NORMAL;  // was: 0 (blocked everything for new pawns)
```

---

## Phase 6h — Tool-Gate Enforcement

### In `JobService.getAvailableJobs()`:
Check `WorkCategory.toolsRequired` — if the category needs any tool, at least one must exist in `gameState.stockpile` or `gameState.item[]`. A pawn cannot claim a gated job without the tool anywhere in the colony (individual pawn inventory checks come in Phase 7).

### In `ItemService.startCrafting()`:
Check `item.workshopType` — a complete `PlacedBuilding` of that type must exist. Return error + reason string if not.

### `Work.ts` tool requirement updates:
| category       | toolsRequired                                          |
| -------------- | ------------------------------------------------------ |
| `woodcutting`  | `['stone_axe', 'iron_axe', 'steel_axe']`               |
| `mining`       | `['stone_pick', 'iron_pick', 'steel_pick']`            |
| `hunting`      | `['stone_spear', 'iron_spear', 'shortbow', 'longbow']` |
| `fishing`      | `['digging_stick', 'fishing_spear', 'fishing_rod']`    |
| `foraging`     | `[]`                                                   |
| `construction` | `[]`                                                   |
| `crafting`     | `[]`                                                   |

---

## Phase 6i — Building & Crafting Menu Rework

### Building menu additions:
- **Walls & Doors** sub-category showing all wall segment types.
- **"REQUIRES LIGHTING"** badge on campfire if no `firestarter` in stockpile.
- **"BLOCKED"** badge if materials missing.
- Fuel gauge on active campfire in progress panel.
- Multi-building progress panel (show all `under_construction` buildings, not just first).

### Crafting menu additions:
- **"REQUIRES: <workshopType>"** badge — item visible but unclickable, tooltip explains.
- **Workshop grouping filter** — "show by workshop": Craft Spot | Campfire | Maker's Bench | All.
- Progress bar per queued item (work-points, not turns).

---

## Phase 6j — Designation Zone Extension (forage / scavenge)

Add `'forage' | 'scavenge'` to `DesignationType`. Rectangle zone painting in `GameCanvas` (click-drag). Each tile in zone stored as individual `"x,y"` key (no schema change).

`JobService._syncHarvestJobs()`: for `forage` tiles generate harvest jobs for all non-tool-gated resources (`twig`, `plant_fiber`, `bark`, `flint_shard`, `surface_stone`, `clay_lump`). For `scavenge` tiles generate jobs only for stone/flint.

---

## Implementation Order

| Step | File(s)                 | What                                                                                                                                                                                                                                                                    |
| ---- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `types.ts`              | Add `fuelValue`, `isContainer`, `storageCapacity`, `preservationBonus` to `Item`; add `requiresLighting`, `maxFuel`, `fuelConsumptionRate`, `isStorage`, `isRest` to `Building`; add `fuel`, `lit` to `PlacedBuilding`; add `'forage'\|'scavenge'` to `DesignationType` |
| 2    | `Items.ts`              | Add all primitive materials, Tier 0/1 tools, food renames, containers                                                                                                                                                                                                   |
| 3    | `Buildings.ts`          | Add campfire (revised), craft_spot, makers_bench, wall types, twig_door                                                                                                                                                                                                 |
| 4    | `Resources.ts`          | Add twig, flint_shard, plant_fiber, bark, surface_stone, clay_lump spawn entries                                                                                                                                                                                        |
| 5    | `Work.ts`               | Update `toolsRequired` on woodcutting/mining/hunting/fishing                                                                                                                                                                                                            |
| 6    | `JobService.ts`         | Labor default NORMAL; tool-gate check; forage/scavenge designation handling; `light` and `refuel` job types                                                                                                                                                             |
| 7    | `ItemService.ts`        | Enforce `workshopType` at `startCrafting()`                                                                                                                                                                                                                             |
| 8    | `GameEngineImpl.ts`     | Add campfire fuel tick (per-turn `fuel -= fuelConsumptionRate` for lit buildings; set `lit = false` at 0)                                                                                                                                                               |
| 9    | `PawnStateMachine.ts`   | Rewrite `handleHungry` + `handleTired` to pathfind to isStorage / isRest buildings                                                                                                                                                                                      |
| 10   | `GameCanvas.svelte`     | Rectangle zone designation painting; wall placement mode                                                                                                                                                                                                                |
| 11   | `BuildingMenu.svelte`   | Walls sub-category; blocked/fuel badges; multi-building progress                                                                                                                                                                                                        |
| 12   | `CraftingScreen.svelte` | Workshop badges; workshop grouping filter                                                                                                                                                                                                                               |

---

## Acceptance Criteria

- [ ] New world: twig/flint_shard/plant_fiber visible as tile resources.
- [ ] Forage zone designation: pawns walk to tiles and collect primitives.
- [ ] Firestarter crafted at Craft Spot (zero-cost designation).
- [ ] Campfire placed, firestarter in stockpile → pawn lights it. Cooking enabled. Fuel depletes per turn.
- [ ] Fuel haul job generated when campfire fuel < 20; pawn hauls twig/fiber to campfire.
- [ ] `spit_meat` can be queued only when campfire is complete and lit.
- [ ] `clay_cooking_pot` crafted with 2× `clay_lump` at a lit campfire; no Maker's Bench required.
- [ ] Queuing a stew requires a lit campfire + `clay_cooking_pot` in colony stockpile; accepts 2–4 food ingredients.
- [ ] Stew display name derives correctly from ingredients (e.g. `[wild_oats, common_carp]` → "Fish Porridge").
- [ ] `clay_pot` and `clay_storage_jar` require `makers_bench`; visible as locked in CraftingScreen before bench is built.
- [ ] `stone_axe` cannot be crafted until `makers_bench` exists.
- [ ] `makers_bench` build cost consumes flint_knife + stone_chopper + stone_axe + stone_hammer from stockpile.
- [ ] Woodcutting jobs exist but no pawn can claim them until a `stone_axe` is in the colony.
- [ ] Hungry pawn with campfire on map walks to campfire before eating.
- [ ] Tired pawn with any housing wall-enclosure walks toward it (Phase 7 refinement; Phase 6: any `isRest` building).
- [ ] Twig walls, wicker walls, daub walls placeable as individual 1-tile segments.
- [ ] CraftingScreen shows "REQUIRES: makers_bench" on `stone_axe` when none is built.

