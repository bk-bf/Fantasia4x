# Fantasia4x → Dwarf Fortress-like: Migration Proposal

> **Related:** [game/DESIGN](../../game/DESIGN.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [ROADMAP](ROADMAP.md)

---

## Executive Summary

This proposal describes a phased migration of Fantasia4x from its current abstract turn-based colony sim into a Dwarf Fortress-style tile-based colony sim — with a rendered scrollable map, pawns that physically exist and move on that map, and resources/buildings anchored to tile coordinates.

The migration is incremental: each phase delivers something playable and does not break what came before. Two existing sibling projects dramatically reduce the total work:

- **Exiled** (`src/lib/webgl/`) — A full WebGL2 tile renderer already ported into the project. Provides the *entire* rendering stack (shaders, font atlas with CP437 glyphs, game grid, character renderer). This is the hardest part of going DF-like and is already done.
- **Celestia** (`/home/kirill/Documents/Projects/Celestia/`) — A Godot 4 Rimworld-like that contains proven design decisions: noise-based terrain generation with tuned parameters, a rich tile data model, A* pathfinding, a pawn state machine, and a work priority system. Nothing ports as-is (GDScript ≠ TypeScript) but the *logic and constants* translate directly.

**What stays the same:** pawn stats/traits/equipment/abilities, race generation, the ModifierSystem, research, crafting, ItemService, GameStateManager pattern, the five-layer architecture. The DF migration is additive to the core pawn identity system, not a replacement.

---

## Asset Inventory

### Exiled — Already in `src/lib/webgl/`

Every file below exists in the project today and is ready to use.

| File                               | What it provides                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `renderer.ts` / `renderer-core.ts` | WebGL2 renderer facade; `beginFrame()`, `endFrame()`, `resize()`                                               |
| `game-grid.ts`                     | Sparse `Map<string, TileData>` tile storage, dirty-tile tracking, viewport culling, batch updates              |
| `tile-types.ts`                    | `TileData` (char, foreground RGB, background RGB, position), `GridCoords` utils, `Viewport`                    |
| `character-renderer.ts`            | Renders ASCII glyphs from the font atlas                                                                       |
| `grid-renderer.ts`                 | Renders the full visible grid each frame                                                                       |
| `font-atlas.ts`                    | Generates a WebGL texture from a monospace font; ships with full CP437 charset (`@`, `#`, `♠`, `▲`, `~`, etc.) |
| `shaders.ts`                       | GLSL shader compilation and program management                                                                 |
| `texture-manager.ts`               | WebGL texture lifecycle                                                                                        |
| `webgl-state.ts`                   | WebGL blend modes, depth, viewport state                                                                       |

**Gap:** None of this is wired to a Svelte component or to `GameState.worldMap`. That connection is what Phase 1 builds.

### Renderer choice — why Exiled over purpose-built libraries

For reference, the main browser alternatives for a Caves of Qud-style colored-glyph grid are:

| Library                   | Rendering    | Roguelike extras                   | Notes                                                                                                                                                                                              |
| ------------------------- | ------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **rot.js** (`rot-js`)     | Canvas 2D    | ✅ Full (FOV, noise, A*, scheduler) | Most direct Qud analogue — `ROT.Display` supports `"rect"` (tile grid) with per-cell foreground + background color and CP437 font mode. Would replace *both* the renderer *and* PathfinderService. |
| **WGLT**                  | WebGL        | ❌ Display only                     | Explicit ASCII terminal emulator; 60fps on large maps. Closest feature-match to what Exiled provides — same rendering model, minimal API.                                                          |
| **Malwoden** (`malwoden`) | Canvas 2D    | ✅ Partial (rot.js-inspired)        | First-class TypeScript API, clean ergonomics. Younger project with a smaller community.                                                                                                            |
| **Phaser**                | WebGL/Canvas | ❌ General engine                   | Tilemap + spritesheet pipeline; closest to Qud's actual *tile sprite* mode. Very heavy for this use case.                                                                                          |

**Decision: keep Exiled.** It is already in the project, ships CP437, runs at WebGL2 performance (equivalent to WGLT), and its `shaders.ts` layer accepts custom GLSL — meaning CRT/scanline postprocessing is addable without replacing anything. The roguelike extras rot.js provides (pathfinding, FOV, noise) are being ported from Celestia where they benefit from sitting inside the service layer alongside `ModifierSystem` and `GameStateManager`.

**Fallback:** If Phase 1 uncovers hard bugs in the Exiled renderer, **WGLT** is the lowest-friction swap — same WebGL rendering model, drop-in `<canvas>` API, no gameplay logic entangled.

---

### Celestia — Port targets (`/home/kirill/Documents/Projects/Celestia/src/`)

GDScript cannot be imported. What we take is the *design logic*: algorithms, constants, state flows, data shapes. All paths are relative to `src/`.

#### World generation

**`world/terrain/noise_generator.gd`** → `WorldGenerator.ts`
```
TERRAIN_NOISE_FREQUENCY  = 0.005   (macro biome shape)
DETAIL_NOISE_FREQUENCY   = 0.05    (subterrain variation)
TERRAIN_OCTAVES          = 5
TERRAIN_LACUNARITY       = 2.0
TERRAIN_GAIN             = 0.6
Primary noise type: SIMPLEX_SMOOTH  →  simplex-noise createNoise2D
Detail noise type:  SIMPLEX         →  simplex-noise createNoise2D (separate instance)
Seed derivation:    detail_seed = base_seed * 6971
                    territory_seed = base_seed * 7919
```

**Additional noise utilities from `map_gen-refactored` branch** (not in `main`) — also port to `WorldGenerator.ts`:
```
getRidgedNoise(x, y):               1.0 - abs(terrainNoise(x, y))
                                    → sharp ridges; use for mountain peak subterrain selection
getWarpedNoise(x, y, warp=30.0):    domain warping via detail noise offsets
                                    warpX = detailNoise(x+500, y+500) * warp
                                    warpY = detailNoise(x-500, y-500) * warp
                                    return terrainNoise(x+warpX, y+warpY)
                                    → organic biome edges, river course variation
getCombinedNoise(x, y, weight=0.5): terrainNoise(x,y)*(1-weight) + detailNoise(x,y)*weight
                                    → transition zone blending; mix macro shape with detail texture
getTerraceNoise(x, y, steps=5):     n = (terrainNoise(x,y)+1)/2
                                    return floor(n*steps)/steps * 2 - 1
                                    → stepped elevation; use for mesa biomes or plateau terrain
```

**`world/terrain/terrain_database.gd`** → `src/lib/game/core/Terrains.ts`

Full biome table — `terrain_database.gd` is **identical** in both `main` and `map_gen-refactored`.

> ⚠️ **Celestia `river` density range is dead code.** GDScript iterates the dict in insertion order: `swamp` (0.20–0.30) and `plains` (0.30–0.45) are checked before `river`, so `river`'s nominal range of 0.00–0.50 is never reached for those overlapping values. The Fantasia4x port fixes this with non-overlapping ranges. **Celestia column is the source; Fantasia4x column is what was actually implemented.**

| Biome      | Celestia range | Fantasia4x range | walkable | movement_cost | Subterrains (detail thresholds)                                                                                            |
| ---------- | -------------- | ---------------- | -------- | ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `forest`   | 0.50 – 0.60    | 0.52 – 0.70      | true     | 1.5           | dirt, grass, deep_grass, bush, tree, tree_stump, fallen_logs, mushroom_patch (thresholds: -0.8,-0.6,-0.4,-0.2,0.4,0.7,0.9) |
| `swamp`    | 0.20 – 0.30    | 0.18 – 0.28      | true     | 2.0           | shallow_water, mud, bog, clay, moss, quicksand, dead_trees (thresholds: -0.8,-0.6,-0.4,-0.2,0.2,0.6,0.8)                   |
| `plains`   | 0.30 – 0.45    | 0.28 – 0.52      | true     | 1.0           | dirt, grass, bush, deep_grass, tall_grass, wildflowers, scrubland, savanna (thresholds: -0.8,-0.6,-0.4,-0.2,0.4,0.6,0.8)   |
| `mountain` | 0.60 – 1.00    | 0.70 – 1.00      | false    | 3.0           | rocky, cave, cliff, mineral_deposit (thresholds: -0.3,0.35,0.85) · scatter: crystal_formation, arcane_glade                |
| `river`    | 0.00 – 0.50 ⚠️  | 0.00 – 0.18      | true     | 2.5           | shallow_water, water, rapids, riverbank (thresholds: -0.6,-0.3,0.0,0.3)                                                    |

Subterrain movement costs to preserve: `tree=2.0`, `bush=1.8`, `mud=3.0`, `bog=3.5`, `rocky=2.5`, `water=0.0` (unwalkable), `cliff=0.0` (unwalkable).

> **Note on `peak`:** Celestia lists `peak` (unwalkable, cost=0) as a mountain noise-subterrain. The Fantasia4x port removes it — it is mechanically identical to `cliff` and the scatter-object system (`crystal_formation`, `arcane_glade`) handles visual variety without a redundant tier. `stone` resource spawning no longer lists `peak` as a valid subterrain.

**`world/terrain/tile.gd`** → extend `WorldTile` in `types.ts`

Fields: `terrainType: string`, `subType: string`, `density: number`, `moisture: number`, `temperature: number`, `movementCost: number`, `walkable: boolean`, `resources: Record<string, number>`, `territoryOwner: string`.
Pathfinding fields (needed on tile for A*): `gCost: number`, `hCost: number`, `fCost: number`, `parent: {x,y} | null`.
Methods to port: `harvestResource(id, amount)` (clamps to available, removes key at 0), `addResource(id, amount)`, `resetPathfinding()`, `calculateFCost()` (`fCost = gCost + hCost`), `hasTerritory()` (`territoryOwner !== ''`), `setTerritory(ownerId)`.

> `calculateFCost()` and the territory helpers are present in `map_gen-refactored` only — not in `main`.

**`world/terrain/resource_database.gd`** → `src/lib/game/core/Resources.ts` (new file)

```
wood:  terrain_subtype: ["tree"],                         resource_amount: [3,6],  harvest_time: 5.0
stone: terrain_subtype: ["rocky","cliff"],                resource_amount: [5,10], harvest_time: 8.0
herbs: terrain_subtype: ["wildflowers","moss","deep_grass"], resource_amount: [2,5],  harvest_time: 3.0
```
> Celestia source lists `"peak"` in stone's `terrain_subtype`. Removed in the Fantasia4x port because `peak` was eliminated from mountain subterrains (see note above). Stone spawns on `rocky` and `cliff` only.
> Each resource also carries `yield_amount: [min,max]` (pawn-skill-based output quantity) and `harvest_tool`/`skill_used` metadata. These are present in `resource_database.gd` but not yet consumed by the TS port — deferred until the pawn skill system is implemented.
Seed derivation per resource: `resourceSeed = baseSeed * 7919 + hashCode(resourceId)`.

**`world/generation/resource_gen.gd`** → `ResourceGeneratorService.ts`

Logic: for each resource id, iterate every tile; if `tile.subType` is in `resource.terrain_subtype` and tile has no resource yet, assign a random amount in `[min, max]` range seeded by the per-resource seed. Skip tiles that already have a resource.

---

#### Pathfinding

**`world/generation/pathfinder.gd`** → `PathfinderService.ts`

Key details to port correctly:
- **Distance heuristic**: octile distance — `1.0*(dx+dy) + (1.414 - 2.0)*min(dx,dy)`. Not Manhattan, not Euclidean.
- **Open set scan**: currently O(n) array scan for lowest f-cost. **Rewrite as a binary min-heap** — the Celestia version is the known performance bottleneck.
- **Terrain cost is commented out** in Celestia (`# * terrain_cost literally a death sentence for performance`) — the TS port should include it but only as the heuristic weight, not repeated per-neighbor. With a proper priority queue it is not a bottleneck.
- `max_search_limit = clamp((width * height) / 10 * 1500 / 10000, 500, 10000)`
- On no path found: return `[]` (not an exception).

**`world/terrain/grid.gd`** → inform `PathfinderService.ts` neighbour logic

8-direction neighbours with diagonal wall-cutting prevention: diagonal is only allowed if at least one of the two orthogonal neighbours is walkable.
```
directions: N, E, S, W, NE, SE, SW, NW
diagonal check: ortho1 = (x+dx, y) ; ortho2 = (x, y+dy)
allow if ortho1.walkable OR ortho2.walkable
```

---

#### Pawn state machine

**`pawn/pawn_state_machine.gd`** → `PawnStateMachine.ts`

```
states: Map<string, handler>
currentState: string
changeState(name): calls exit() on current, enter() on new
tick(turn): calls states[currentState].update()
```
Exact state name strings (these are the keys used across all state files): `"Idle"`, `"Hungry"`, `"Tired"`, `"MovingToNeed"`, `"MovingToResource"`, `"Harvesting"`, `"Eating"`, `"Sleeping"`.

**`pawn/states/idle_state.gd`** — transition trigger: `pawn.currentJob != null && job is HarvestingJob` → `"MovingToResource"`.

**`pawn/states/hungry_state.gd`** — `foodSearchCooldown = 3.0` turns; creates `EatingJob` with `eatUntilFull=true`; → `"MovingToNeed"`. If no food found, stays Hungry and retries after cooldown.

**`pawn/states/tired_state.gd`** — `restSearchCooldown = 3.0` turns; creates `SleepingJob` with `sleepUntilRested=true`; → `"MovingToNeed"`. **Note:** `find_nearest_rest_place()` is a placeholder returning `Vector2i(15,15)` — this needs a real implementation that scans for a bed/shelter building.

**`pawn/states/moving_to_need_state.gd`** — `targetState` is set from `job.type` (`"eating"` → `"Eating"`, `"sleeping"` → `"Sleeping"`); uses same adjacency + pathfind pattern as MovingToResource.

**`pawn/states/moving_to_resouce_state.gd`** — adjacency check before pathfinding: `dx <= 1 && dy <= 1 && (dx+dy > 0)`. Picks best adjacent walkable tile by running `pathfinder.find_path()` for each of the 8 adjacent positions and selecting the shortest. If no path → cancel job → `"Idle"`.

**`pawn/states/harvesting_state.gd`** — progress formula:
```
progress += (1 / job.timeRequired) * pawn.harvestingSpeed * pawn.getWorkSpeed()
```
On completion: `pawn.inventory.addItem(job.type, harvestAmount)` and `mapData.reduceResourceAt(job.targetPosition, amount)`.

**`pawn/states/eating_state.gd`** — `eatingDuration = 2.0`, starts satisfying hunger after 50% progress, `nutritionPerSecond = 10.0` (from `needs_database.gd`), wakes at hunger >= 95. Pauses hunger decay via `needs["hunger"].pause()` on enter, does NOT resume on exit (hunger stays paused until next decay tick — intentional).

**`pawn/states/sleeping_state.gd`** — `sleepingDuration = 5.0` (minimum), `restPerSecond = 8.0`, wakes at rest >= 95. Resumes rest decay via `needs["rest"].resume()` on exit.

---

#### Needs system

**`pawn/needs/need.gd`** → extend `PawnNeeds` in `types.ts`

```
decay_rate:  hunger = 0.08/s,  rest = 0.05/s   (from needs_database.gd)
thresholds:  critical=15, low=30, satisfied=70, full=90
pause() / resume() — stop/start decay during eating/sleeping
```

**`pawn/needs/needs_database.gd`** — config values:
```
hunger: decay_rate=0.08, nutrition_per_second=10.0, base_nutrition_value=20.0
rest:   decay_rate=0.05, rest_per_second=8.0,       base_rest_value=30.0
```

---

#### Work type system

**`pawn/work/worktype_database.gd`** → extend `Work.ts` in `core/`

5 job types and their associated skills:
```
harvesting → skills: harvesting_speed, plant_knowledge
mining     → skills: mining_speed, stone_knowledge
construction → skills: construction_speed, building_quality
hauling    → skills: carrying_capacity, movement_speed
cooking    → skills: cooking_quality, cooking_speed
```

**`pawn/work/workpriority_manager.gd`** → `WorkAssignment.workPriorities` values:
```
DISABLED=0, LOW=1, NORMAL=2, HIGH=3, URGENT=4
```
Default: all types initialized to `NORMAL`. `_adjust_priorities_based_on_traits(pawnId, traits)` modifies on spawn.

Trait → priority adjustments applied at pawn spawn (from `workpriority_manager.gd`, `basic-ui`/`map_gen-refactored` branch):

| Trait          | Work type    | Adjusted priority |
| -------------- | ------------ | ----------------- |
| `nature_lover` | harvesting   | HIGH              |
| `strong`       | mining       | HIGH              |
| `strong`       | hauling      | HIGH              |
| `builder`      | construction | HIGH              |
| `chef`         | cooking      | HIGH              |

---

#### Mood system

**`pawn/mood/mood_manager.gd`** → extend `PawnState.mood` in `types.ts`

```
Thresholds: depressed<15, sad<30, neutral<50, happy>75, ecstatic>90
Modifiers: activeModifiers (permanent), temporaryModifiers {id: {value, duration}}
Trend: drifts toward neutral (50) at 0.1/s when no active modifiers
```

---

### dnd-combat-loop — Data separation pattern (`/home/kirill/Documents/Projects/dnd-combat-loop/`)

`dnd-combat-loop` is a separate Godot 4 project implementing DnD 5e turn-based tactical combat (BG3-style). Its combat system — initiative, action economy, attack/damage rolls, conditions, AI — is **architecturally incompatible** with Fantasia4x's real-time DF-like sim and is not ported.

**What we borrow: the JSON data separation pattern.** Every game entity type has its own `data/*.json` file, fully decoupled from the class that consumes it:

| File                   | Records | Pattern relevance                                                        |
| ---------------------- | ------- | ------------------------------------------------------------------------ |
| `data/conditions.json` | 33      | Per-entry: `{id, name, effects{}, duration_type, is_buff}`               |
| `data/enemies.json`    | 25      | Per-entry: `{id, stats{}, ai_aspects[], resistances[], level_scaling{}}` |
| `data/items.json`      | 60      | Per-entry: `{id, type, properties[], damage, range}`                     |
| `data/classes.json`    | 5       | Per-entry: `{id, hit_die, stats{}, features[]}`                          |

The pattern: **data file → typed loader → game object**, with zero logic in the data file. The loader validates shape and exports a typed array — identical to Fantasia4x's current `ITEMS_DATABASE`, `AVAILABLE_BUILDINGS` etc., just externalized.

**Recommended migration path for Fantasia4x** (when lists outgrow comfortable inline editing):
- Move `Items.ts`, `Buildings.ts`, `Research.ts`, `Work.ts` content to `src/lib/game/data/*.json`
- Types stay in `types.ts` — they are the schema contract
- A thin `dataLoader.ts` per domain imports the JSON and casts to the typed interface
- No change to service layer call sites

**Format note:** JSON has zero setup cost (`resolveJsonModule` in `tsconfig.json`). TOML is preferred if Tauri/Rust integration lands — `serde`+`toml` crate reads the same files natively.

---

## What Changes vs. What Stays

### Stays identical

- `Pawn` stats, traits, equipment, abilities, inventory
- `Race` generation system
- `ModifierSystem` — all stat calculations remain here
- `ResearchService` and the three-tier research spec
- `ItemService` and crafting queue
- `GameStateManager` as the only mutation surface
- `GameEngineImpl` turn coordination pattern
- Five-layer architecture (UI → Stores → Engine → Services → Core)
- SvelteKit 5 + TypeScript stack

### Changes structurally

| Current                                       | After migration                                                                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `WorldTile { type, ascii, discovered }`       | `WorldTile` gains `terrainType`, `subType`, `density`, `moisture`, `movementCost`, `walkable`, `resources: Record<string, number>` |
| `buildingCounts: Record<string, number>`      | `buildings: PlacedBuilding[]` — each building has `{id, type, x, y}`                                                               |
| Pawns have no map position                    | `Pawn` gains `position: {x: number, y: number}`                                                                                    |
| `WorkAssignment` references abstract category | `WorkAssignment` references a tile coordinate target                                                                               |
| `ASCIIMap.svelte` renders a `<pre>` string    | `GameCanvas.svelte` drives `WebGLRenderer` on a `<canvas>`                                                                         |
| World gen is fully random per tile            | World gen uses dual Simplex noise pass                                                                                             |
| Resources are global counts on `GameState`    | Resources are per-tile amounts; harvesting depletes the tile                                                                       |

---

## Migration Phases

---

### Phase 1 — Wire the Renderer

**Status:** `✅ complete`

**Scope:** Visual only. Zero game model changes. The existing `worldMap` drives the WebGL tile display.

**Goal:** Replace the placeholder `ASCIIMap.svelte` (currently a static `<pre>` string) with a scrollable, real-time WebGL tile map backed by the existing world data.

**Work items:**

- [x] Create `GameCanvas.svelte` — a `<canvas>` element that instantiates `WebGLRenderer` from Exiled on mount, subscribes to `$gameState.worldMap`, converts `WorldTile` → `TileData` (char + color) via `fantasia-world.ts`, calls `renderer.beginFrame()` / `endFrame()` each animation frame.
- [x] Add keyboard/mouse scroll: arrow keys and click-drag pan the viewport; scroll-wheel zooms tile size between 8px and 24px.
- [x] Map existing tile types to CP437 glyphs and colors (forest = `♦` green, mountain = `▲` grey, water = `~` blue, land = `.` dim).
- [x] Swap `ASCIIMap.svelte` reference in `MainScreen.svelte` to `GameCanvas.svelte`.

**Sources from Exiled used:** `WebGLRenderer`, `GameGrid`, `TileData`, `FontAtlasGenerator` — all already in `src/lib/webgl/`.

**Nothing from Celestia needed here.**

**Complexity:** Low. No architecture risk.

---

### Phase 2 — Rich World Generation

**Status:** `✅ complete`

**Scope:** Replace the random tile generator with noise-based terrain. No pawn changes.

**Goal:** The world has coherent biomes, sub-terrain variation, and tile-level resource deposits.

**Work items:**

- [x] Install `simplex-noise` npm package (`createNoise2D` — equivalent of Godot's `FastNoiseLite`).
- [x] Create `src/lib/game/core/Terrains.ts` — port `terrain_database.gd`: export `BIOMES` and `SUBTERRAINS` lookup objects with the exact density ranges, movement costs, walkability, and subterrain threshold arrays from the Asset Inventory table above.
- [x] Create `src/lib/game/core/Resources.ts` — port `resource_database.gd`: export `RESOURCES` object with `wood`, `stone`, `herbs` entries including `terrainSubtype[]`, `resourceAmount: [min,max]`, `harvestTime`.
- [x] Rewrite `WorldGenerator.ts`:
  - [x] Primary noise instance: frequency `0.005`, octaves `5`, lacunarity `2.0`, gain `0.6`. Detail noise instance: frequency `0.05`. Derive `detailSeed = baseSeed * 6971`.
  - [x] Per tile: sample primary noise → clamp to [0,1] as `density`; look up biome by density range; sample detail noise → select subType by `subterrain_thresholds` array.
  - [x] Set `movementCost` and `walkable` from subterrain definition (subterrain overrides biome defaults for `water`/`peak`).
- [x] Extend `WorldTile` in `types.ts`: add `terrainType`, `subType`, `density`, `moisture`, `movementCost`, `walkable`, `resources: Record<string, number>`, `territoryOwner`, plus A* scratch fields `gCost`, `hCost`, `fCost`, `parent: {x,y} | null`.
- [x] Create `ResourceGeneratorService.ts` — port `resource_gen.gd`: for each resource in `RESOURCES`, iterate every tile; if `tile.subType` is in `resource.terrainSubtype` and tile has no resource yet, assign random amount in `[min,max]` using per-resource seed `baseSeed * 7919 + hashCode(resourceId)`.
- [x] Update `GameCanvas.svelte` to render subterrain glyphs and biome colors from `TERRAINS` / `SUBTERRAINS` (via `buildGameGrid()` in `fantasia-world.ts`).

**Sources from Celestia used:** `noise_generator.gd` (constants), `terrain_database.gd` (full port to TS), `resource_gen.gd` (algorithm port), `tile.gd` (data model).

**Complexity:** Low-medium. The algorithm is well-defined; main work is the terrain database transcription.

---

### Phase 2b — CoQ Visual Style (Sprite Mode)

**Status:** `✅ complete`

**Scope:** Swap the font-atlas glyph renderer for a CP437 sprite-sheet + 3-color tinting shader, producing a visual style equivalent to Caves of Qud's tile mode. No gameplay changes.

**Goal:** Each terrain cell renders a small 16×16 pixel-art glyph from a static PNG spritesheet. The shader recolors black pixels to a per-tile foreground color and transparent pixels to the background color, enabling infinite color variation from a single grayscale source image.

**Decision rationale:** The font-atlas approach generates glyphs from the browser's system font at runtime. This produces non-square, anti-aliased, resolution-dependent glyphs. Loading a handcrafted CP437 bitmap PNG (e.g., IBM CGA 8×8 scaled to 16×16, or a DF community tileset) gives pixel-perfect square tiles identical to authentic roguelike renderers, and enables the CoQ 3-color tint technique.

**3-color shader technique (from Caves of Qud):**
```
// Per-pixel logic in fragment shader:
// sample pixel from sprite atlas
vec4 sprite = texture2D(u_atlas, uv);
// transparent → background color
// black pixel (luma ≈ 0) → u_fg_color (base glyph color)
// white pixel (luma ≈ 1) → u_detail_color (highlight / shading layer)
float luma = dot(sprite.rgb, vec3(0.299, 0.587, 0.114));
vec3 tinted = mix(u_fg_color, u_detail_color, luma);
gl_FragColor = vec4(tinted, sprite.a) * (1.0 - step(sprite.a, 0.01))
             + vec4(u_bg_color, 1.0) * step(sprite.a, 0.01);
```
`u_bg_color`, `u_fg_color`, `u_detail_color` are per-cell uniforms pushed with each tile draw call, sourced from `TileData`.

**Sprite sheet format (standard CP437 layout):**
- 256 characters arranged in a 16-column × 16-row grid
- Each cell is exactly `N×N` pixels (N = 16 recommended for balance of detail vs. tile density)
- Grayscale PNG with alpha: glyphs are black, background is transparent
- UV for char code `c`: `u = (c % 16) / 16`, `v = floor(c / 16) / 16`

**Work items:**

- [x] **Source the sprite sheet** — used `createSquareCellAtlas()` (generates square cells from browser font on transparent background) as the primary path; external PNG can be swapped in via `loadSpritesheetAtlas()` when available.
- [x] **Extend `TileData`** in `src/lib/webgl/tile-types.ts` — added `detail?: RGB` (defaults to `foreground` when absent).
- [x] **Rewrite the fragment shader** — `src/lib/webgl/shaders/fragment.glsl` now implements 3-color tint: `fragColor = vec4(mix(v_background, mix(v_foreground, v_detail, luma), sprite.a), 1.0)`. Backgrounds are always rendered (no more transparent tiles).
- [x] **Add `createSquareCellAtlas(cellSize)`** to `src/lib/webgl/font-atlas.ts` — renders font on transparent background in N×N square cells, 16-col CP437 grid layout.
- [x] **Update `WebGLRendererCore`** — calls `createSquareCellAtlas(tileWidth)` instead of `createMonospaceFontAtlas()`.
- [x] **Make tiles square** — `GameCanvas.svelte` now uses `tileWidth = tileHeight = 16`; zoom preserves 1:1 ratio.
- [x] **Update `Terrains.ts` characters and colors** — replaced non-CP437 Unicode glyphs (`♦ ═ ╥ ≈ ≡ ✦ ¤ ☼ ○ ∩ ¥`) with standard ASCII chars. Adopted CoQ muted earth-tone palette across all subterrains.

**Sources:** Caves of Qud 3-color shader technique (public documentation); DF wiki tileset repository (Bisasam 20×20 ASCII, CC-licensed).

**Complexity:** Medium. The shader change is contained; the main risk is the UV mapping if the spritesheet cell boundaries don't align cleanly. Fallback: keep the font-atlas path behind a compile flag.

---

### Phase 3 — Pawns on the Map

**Status:** `🚧 next`

**Scope:** Pawns get physical positions and render on the tile grid. A* pathfinding added.

**Goal:** You can see your pawns as `@` glyphs on the map. They can navigate to destinations.

**Work items:**

- [ ] Add `position: { x: number; y: number }` to the `Pawn` interface in `types.ts`. Spawn position assigned by `PawnService` using expanding-square search (port of `pawn_manager.gd::find_nearest_walkable_tile()`) from the settlement origin.
- [ ] Add `path: {x:number, y:number}[]`, `pathIndex: number`, `isMoving: boolean`, `hasReachedDestination: boolean` to `Pawn`. (`TILE_REACH_THRESHOLD = 2.0` from `pawn.gd`.)
- [ ] `GameCanvas.svelte` overlays pawn glyphs (`@`) in race-accent color with selection highlight.
- [ ] **Set up Rust spatial crate** (prerequisite for PathfinderService):
  - [ ] Create `spatial-core/` at project root — `wasm-pack new spatial-core` (or `cargo init` + add `wasm-bindgen` dependency).
  - [ ] Add `wasm-pack build --target web` to the Vite build pipeline (via a `vite-plugin-wasm-pack` or a pre-build script in `package.json`).
  - [ ] Gitignore `spatial-core/pkg/` — it is generated output.
  - [ ] Verify the generated `spatial-core/pkg/spatial_core.d.ts` is importable from TypeScript before proceeding.
- [ ] **Define `PathfinderService` TypeScript interface** at `src/lib/game/services/interfaces/PathfinderService.ts`:
  ```typescript
  export interface PathfinderService {
    findPath(walkable: Uint8Array, costs: Float32Array,
             width: number, height: number,
             sx: number, sy: number, ex: number, ey: number): {x:number, y:number}[];
  }
  ```
- [ ] **Implement A* in Rust** at `spatial-core/src/pathfinder.rs`, exposed via `#[wasm_bindgen]`:
  - [ ] **Distance heuristic**: octile — `1.0*(dx+dy) + (1.414 - 2.0)*min(dx,dy)`. Not Manhattan.
  - [ ] **Open set**: `BinaryHeap` (Rust std) keyed on reverse `fCost` (min-heap via `Reverse<OrderedFloat>`).
  - [ ] **Terrain cost**: include `costs[y*width+x]` in `gCost`. Correct with a real priority queue.
  - [ ] **Neighbour logic**: 8-direction with diagonal wall-cut prevention — diagonal allowed only if at least one orthogonal neighbour is walkable.
  - [ ] **Search limit**: `clamp((width * height / 10 * 1500 / 10000).max(500).min(10000), 500, 10000)`.
  - [ ] Input: flat `&[u8]` walkable grid + `&[f32]` cost grid (zero-copy JS heap views). Output: `Vec<u32>` of interleaved x,y pairs, decoded to `{x,y}[]` in the TS binding wrapper. Returns empty vec if no path or limit hit.
- [ ] **Create `WasmPathfinderService`** at `src/lib/game/services/WasmPathfinderService.ts` — implements `PathfinderService` interface, imports from `spatial-core/pkg/spatial_core`, manages the two sync'd typed arrays (`walkableGrid: Uint8Array`, `costGrid: Float32Array`) and rebuilds them when `GameState.worldMap` changes.
- [ ] In `GameEngineImpl.processGameTurn()`, add pawn movement step before work processing: each pawn with non-empty `path` advances `Math.floor(speedStat / 20)` tiles (minimum 1) per turn, updating `position` via `GameStateManager.updatePawn()`.
- [ ] `PawnService` gets `assignPath(pawnId, path)` and `teleportPawn(pawnId, pos)` — both through `GameStateManager.updatePawn()`.
- [ ] Click on map tile → if pawn selected → call `pathfinderService.findPath()` → `PawnService.assignPath()`.

**Sources from Celestia used:** `pathfinder.gd` (A* algorithm — ported to Rust, not TypeScript), `grid.gd` (`get_neighbors()`, diagonal wall-cut logic), `pawn.gd` (`movement_path`, `current_path_index`, `is_moving` fields).

**Toolchain added:** Rust stable + `wasm-pack`. See ADR-008 in `.docs/game/DECISIONS.md`.

**Complexity:** Medium-high. The A* logic itself is well-defined; the added cost is the `wasm-pack` build pipeline integration and the typed-array sync layer between `GameState.worldMap` and the Rust grid representation.

---

### Phase 4 — Map-Grounded Work and Buildings

**Status:** `❌ not started`

**Scope:** Resources become tile-local. Buildings get placed on the map. Work actions target specific tiles. Pawn state machine formalised.

**Goal:** A pawn assigned to woodcutting walks to a tree tile and chops it. Wood appears in the colony stockpile. Buildings exist at coordinates.

**Work items:**

**4a. Pawn state machine**

- [ ] Create `src/lib/game/systems/PawnStateMachine.ts` — port `pawn_state_machine.gd`. Each pawn holds a `currentState: string` and a `states: Map<string, {enter,update,exit}>` handler map. `changeState(name)` calls `exit()` on current then `enter()` on new. `tick()` calls `states[currentState].update()`.
- [ ] Define state name constants (use exact string keys from Celestia — all inter-state transitions reference these): `"Idle"`, `"Hungry"`, `"Tired"`, `"MovingToNeed"`, `"MovingToResource"`, `"Harvesting"`, `"Eating"`, `"Sleeping"`.
- [ ] Implement state handlers. Port transition logic from Celestia `states/*.gd`:
  - **Idle** — if `pawn.currentJob != null && job.type === "harvesting"` → `"MovingToResource"`. If needs are critical (hunger < 15 or fatigue < 15) → `"Hungry"` / `"Tired"`.
  - **Hungry** — cooldown `3` turns. Finds nearest food source tile; creates `EatingJob` with `eatUntilFull=true`; → `"MovingToNeed"`. If no food → stay, retry after cooldown.
  - **Tired** — cooldown `3` turns. Finds nearest bed/shelter building tile (⚠️ Celestia has `Vector2i(15,15)` hardcoded as placeholder — needs real implementation scanning for sleep buildings); → `"MovingToNeed"`.
  - **MovingToNeed** — sets `targetState` from `job.type` (`"eating"` → `"Eating"`, `"sleeping"` → `"Sleeping"`). Adjacency check before pathfinding: `dx<=1 && dy<=1 && dx+dy>0`. Picks best adjacent walkable tile (shortest path among all 8 neighbours). On no path → `"Idle"`.
  - **MovingToResource** — same adjacency pattern as MovingToNeed. On arrival (`hasReachedDestination && distance < 1.5`) → `"Harvesting"`. On no path → cancel job → `"Idle"`.
  - **Harvesting** — `progress += (1 / job.timeRequired) * pawn.harvestingSpeed * getWorkSpeedModifier()`. On complete: add to stockpile, call `worldMap[y][x].harvestResource(id, amount)` → `"Idle"`.
  - **Eating** — `eatingDuration = 2.0`; pauses hunger decay on enter (`needs.hunger.paused = true`); starts satisfying hunger at 50% progress at `nutritionPerSecond = 10.0`; exits when `hunger >= 95` or time up → `"Idle"` (or `"Hungry"` if still critical).
  - **Sleeping** — `sleepingDuration = 5.0` (minimum); `restPerSecond = 8.0`; wakes at `rest >= 95`; resumes rest decay on exit.
- [ ] Add `currentState: string` to `Pawn`. Remove the separate `isWorking`, `isSleeping`, `isEating` boolean flags from `PawnState` — the state machine replaces them.

**4b. Designations** *(no Celestia equivalent — original system)*

- [ ] Add `designations: Record<string, DesignationType>` to `GameState` — maps `"x,y"` keys to `"harvest" | "construct" | "mine" | "haul" | "clear"`. *(type names from `DesignationManager.gd`, `basic-ui`/`map_gen-refactored` branch)*
- [ ] Create `DesignationService.ts`: `designate(x, y, type)`, `clearDesignation(x, y)`, `getOpenDesignations(type?)`.
- [ ] Map clicks in `GameCanvas.svelte` can enter a designation mode; right-click clears.

**4c. Tile-local harvesting** *(sources: `tile.gd`, `resource_database.gd`, `harvesting_state.gd`)*

- [ ] `WorkService.processWork()` changes: instead of adding to global resource totals, calls `worldMap[y][x].harvestResource(id, amount)` (→ `tile.gd::harvestResource()`) and adds to `GameState.stockpile`. `stockpile: Record<string, number>` is a new field on `GameState`.
- [ ] A pawn in `MovingToResource` state pathfinds to the nearest designated tile matching its job's resource type. `harvestTime` comes from `RESOURCES[id].harvestTime` (→ `resource_database.gd`: wood=5.0, stone=8.0, herbs=3.0 turns).
- [ ] `GameStateManager` gets `addToStockpile(id, amount)` and `depleteWorldResource(x, y, id, amount)` methods.

**4d. Placed buildings** *(no Celestia equivalent — original design; construction progress formula mirrors `harvesting_state.gd`)*

- [ ] Replace `buildingCounts: Record<string, number>` in `GameState` with `buildings: PlacedBuilding[]`.
  ```typescript
  interface PlacedBuilding {
    id: string;
    type: string;          // building definition id
    x: number;
    y: number;
    status: 'planned' | 'under_construction' | 'complete';
    progress: number;      // 0–1
  }
  ```
- [ ] `BuildingService` updated: `placeBuilding(type, x, y)` designates a construction site; pawns with `"build"` designation walk there and advance `progress` per turn via `Harvesting`-equivalent state; on `status === 'complete'` the tile's `walkable` is set to `false` for solid structures and building bonuses apply via `ModifierSystem`.
- [ ] `GameCanvas.svelte` renders building glyphs at their coordinates (use `#` for complete, `+` for under construction).
- [ ] `GameStateManager` gets `addBuilding()`, `updateBuilding()`, `removeBuilding()` methods.

**Sources from Celestia used:** `pawn_state_machine.gd` + all `states/*.gd` (logic port), `workpriority_manager.gd` (priority constants + `_adjust_priorities_based_on_traits()`), `resource_gen.gd` harvest math.

**Complexity:** High. Most invasive phase — touches `GameState`, `GameStateManager`, `WorkService`, `BuildingService`, `PawnService`, and `GameEngineImpl`.

---

### Phase 5 — DF Depth (Long-term)

**Status:** `❌ not started`

Items below are optional and independent. Each can be tackled separately.

| Feature                      | What it needs                                                                                                                                                                                                                                         | Complexity                                           | Done |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---- |
| Fog of war / line-of-sight   | Per-pawn visibility radius; shadow-casting algorithm over the tile grid; `WorldTile.visible: boolean`                                                                                                                                                 | Medium                                               | ☐    |
| Mood depth                   | Port `mood_manager.gd` from Celestia: 5 thresholds, temporary modifiers with expiry, environment/activity checks                                                                                                                                      | Low (Fantasia4x has `mood` already, this extends it) | ☐    |
| Z-levels                     | Add `z: number` dimension to `WorldTile`, `Pawn.position`, pathfinder; ramp/staircase tile types; renderer needs layer switching                                                                                                                      | Very high — optional                                 | ☐    |
| Temperature / season effects | Use `WorldTile.temperature`; seasonal multiplier on needs decay and crop yield                                                                                                                                                                        | Medium                                               | ☐    |
| Territory / danger zones     | Port `territory_database.gd` from Celestia; monster factions own tiles; penalty to resource amounts in their zones                                                                                                                                    | Medium                                               | ☐    |
| Real-time mode               | Replace per-turn step with a `requestAnimationFrame` game loop; pawn speed becomes seconds-per-tile                                                                                                                                                   | Medium — architectural; turn-based is fine for now   | ☐    |
| CRT / retro visual effects   | Add a scanline + bloom postprocess GLSL shader in `shaders.ts` (infrastructure already exists). `rot.js` and WGLT both render to plain canvas so the same pass can wrap either renderer. Optional CSS `filter: saturate()` for cheaper approximation. | Low — purely additive visual layer                   | ☐    |

---

## Porting Gotchas — Known Issues in Celestia Source

These are problems found in the Celestia code that should **not** be copied into Fantasia4x.

| File                                                                        | Issue                                                                                                                                                            | What to do instead                                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pathfinder.gd`                                                             | `get_lowest_f_cost_tile()` is an O(n) linear scan of the open array. Noted as the performance bottleneck (terrain cost was disabled specifically because of it). | Use a binary min-heap for the open set.                                                |
| `pathfinder.gd`                                                             | Terrain movement cost is commented out: `# * terrain_cost literally a death sentence for performance`                                                            | With a min-heap it's free — include it in the TS port.                                 |
| `pathfinder.gd::calculate_movement_cost()`                                  | Instantiates a new `TerrainDatabase` on every call per neighbour.                                                                                                | Pass the terrain definitions in once at construction time.                             |
| `tired_state.gd::find_nearest_rest_place()`                                 | Returns hardcoded `Vector2i(15, 15)` — it's unfinished.                                                                                                          | Implement a scan of `buildings` for sleep-type structures.                             |
| `moving_to_resource_state.gd`, `moving_to_need_state.gd`, `hungry_state.gd` | `find_adjacent_walkable_tile()` is copy-pasted three times. The code itself notes: "has to be centralized we are duplicating this all over the place".           | Extract to `PathfinderService.findAdjacentWalkable(pos)`.                              |
| `pawn_state_machine.gd`                                                     | Uses Godot's `_process(delta)` real-time loop. Fantasia4x is turn-based.                                                                                         | Replace `delta` with a turn tick count; `update(delta)` becomes `update(turn)`.        |
| `terrain_database.gd`                                                       | CP437 `tile_id` arrays reference Godot TileMap tile IDs — meaningless in WebGL context.                                                                          | Map each subterrain to a CP437 character and foreground RGB directly in `Terrains.ts`. |

---

## Architecture Impact Summary

```
types.ts          → WorldTile expands; Pawn gains position + path + stateMachine; new PlacedBuilding; new DesignationType
GameState.ts      → buildingCounts replaced by buildings[]; stockpile added; designations added
GameStateManager  → new mutation methods: addBuilding, updateBuilding, removeBuilding, setDesignation
GameEngineImpl    → turn order gains: pawn movement step + state machine tick
Services (new)    → PathfinderService, DesignationService, ResourceGeneratorService
Services (changed)→ WorkService (tile-local), BuildingService (placed buildings), PawnService (position, spawn)
Systems (new)     → PawnStateMachine
Core data (new)   → Terrains.ts (port of Celestia terrain_database.gd)
Components (new)  → GameCanvas.svelte (replaces ASCIIMap.svelte) + fantasia-world.ts (WorldTile→GameGrid adapter)
src/lib/webgl/    → unchanged; consumed by GameCanvas.svelte
```

---

## Dependency Order

Phases must be done in order — each builds on the previous:

```
Phase 1 (render wiring)
    ↓
Phase 2 (rich world gen)  ← WorldTile must be richer before Phase 3 uses movementCost
    ↓
Phase 3 (pawn positions + pathfinding)
    ↓
Phase 4a (state machine)  ← needed before 4c
Phase 4b (designations)   ← parallel with 4a
Phase 4c (tile harvesting) ← needs 4a + 4b
Phase 4d (placed buildings) ← parallel with 4c
    ↓
Phase 5 (optional depth features, any order)
```

---

## Risk Notes

| Risk                                                 | Likelihood | Mitigation                                                                                                                                                                     |
| ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WebGL renderer has bugs/gaps not visible until wired | Medium     | Phase 1 is low-stakes; bugs surface before any game model changes                                                                                                              |
| A* is too slow for large maps                        | Low        | `GameGrid` already uses sparse storage + viewport culling; Celestia's dynamic search limit prevents worst-case hangs                                                           |
| Replacing `buildingCounts` breaks save compatibility | High       | Old saves will not load after Phase 4d; accept this or write a one-time migration in `gameState.ts`                                                                            |
| Phase 4 scope creep                                  | High       | 4a–4d are explicitly separated; stop after each and verify the loop is playable before continuing                                                                              |
| GDScript port bugs                                   | Medium     | Port algorithms independently with small test cases before integrating; Celestia's pathfinder was self-described as "horrific" — rewrite cleanly rather than copying literally |
