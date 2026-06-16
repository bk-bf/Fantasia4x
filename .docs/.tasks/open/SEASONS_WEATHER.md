<!-- LOC cap: 460 (created: 2026-05-28; 2026-06-16 made ENGINE-PERFORMANCE-aware: added §0.5 perf constraints + per-subsystem perf notes) -->

# LIVING WORLD — Day/Night, Seasons, Weather & Visual Atmosphere

> **Related:** [ROADMAP](ROADMAP.md) · [game/DESIGN](../../game/DESIGN.md) · [SURVIVAL-HEALTH](SURVIVAL-HEALTH.md) · [ENGINE-PERFORMANCE](ENGINE-PERFORMANCE.md) (the perf budget this spec must respect — §0.5) · archived: [FOG-OF-WAR-DEFERRED](../archive/FOG-OF-WAR-DEFERRED-2026-05-28.md)

## Status: Phase A + A2 COMPLETE — Phases B–D not started

Phase A (ambient day/night uniforms + EnvironmentService) and Phase A2
(LightingService + per-tile `a_light` + campfire point light + flicker) are shipped.
Phases B (seasons + temperature), C (weather), and D (fog of war) are open below.

---

## Goal

The world should breathe. Night is genuinely dark and dangerous. Winter is cold
and threatening. A storm changes what pawns can do. These are not cosmetic —
temperature affects need rates, night affects efficiency and risk, seasons gate
resources. Fog of war is a subfeature of the day/night visibility model, not a
separate system.

Visual delivery is via existing WebGL2 renderer extended with:

1. Ambient uniforms in the tile fragment shader (day/night tint)
2. A secondary fullscreen overlay render pass (weather particles)

---

## Subsystem 0.5 — Performance constraints (READ FIRST)

This spec lands **after** the engine-perf arc ([ENGINE-PERFORMANCE](ENGINE-PERFORMANCE.md)). That arc
proved two costs dominate at the heavy `--profiler` scale (150 pawns + ~140 mobs, 240×160), and
*every* new system here touches both. Honour these or you reintroduce a cliff that was just fixed.

### Constraint 1 — the 38k-tile `worldMap` is THE cliff. Never rebuild it, never flip its ref.

`tile.temperature` (Subsystem 3) and any future per-tile field are added to the **worldMap**, which is
38k `WorldTile`s. The single biggest perf bug of the whole arc (§C, §D6) was code that ran
`worldMap.map(row => row.map(...))` to change a handful of tiles — flipping the worldMap **ref** does
two expensive things at once: a full **terrain vertex rebuild** on the renderer *and* a full 38k-tile
**re-clone across the worker→main boundary** (the 211 ms `onmessage` spikes). The fix everywhere was
the same:

- **Mutate the changed tiles IN PLACE** (ADR-002 amendment — hot/structural worldMap writes mutate;
  the per-tick top-level copy + the worker snapshot clone contain the blast radius).
- **`markTileDirty(x,y)`** (`core/tileDeltas.ts`, worker singleton) for each changed tile. The
  publisher drains these into a **`worldMapDelta`** (changed tiles only) instead of re-sending the
  whole array; `simWorkerClient` patches its cached worldMap in place.
- **Never** assign a new array to `gameState.worldMap` for a per-tile change.

So the spec's "recompute `tile.temperature` once per season change" (Subsystem 3) **must** be an
in-place pass over the affected tiles + `markTileDirty`, *not* a worldMap rebuild — even at season
cadence a 38k rebuild + re-clone is a visible hitch.

### Constraint 2 — temperature is worker-only; it already costs nothing on the wire.

The worldMapDelta ships a **slim tile** (D4): only the 9 fields the main thread reads (`type/
terrainType/subType/movementCost/walkable/resources/resourceCooldowns/x/y`). `temperature` is **already
in the dropped set** (alongside `density/moisture/territoryOwner`) — it's a worker/save-only field the
renderer never receives. So temperature → need-rate math is free on the snapshot. **If a feature ever
needs temperature *visually* (e.g. a heat-map overlay), add it to the slim-tile allowlist deliberately
and measure** — don't assume it's already there.

### Constraint 3 — need-rate effects run in the per-tick hot path: scalar math, zero allocation.

The temperature/weather/night multipliers (Subsystems 1, 3, 4) feed `PawnService.getRestIncreasePerTurn()` /
`getHungerIncreasePerTurn()`, which run **per-pawn, every tick**. Those phases were just de-immutabled
to mutate in place (the 12.5× allocation tax, §9). Add **plain scalar arithmetic** reading cached
`tile.temperature` / `gameState.weather` — **no per-tick `.map()`, no `{...spread}`, no per-tick tile
temperature recompute** (read the cached value). Anything that allocates per pawn per tick reinstates
the tax.

### Constraint 4 — season/weather are cheap scalars; fog-of-war is NOT.

- `season`/`seasonDay`/`weather` are small top-level `GameState` scalars → the sectional-diff snapshot
  (W2) ships only the section that changed. Adding them is essentially free. ✅
- **Fog of war (`tile.visible`, Subsystem 6) is the trap.** A per-tile boolean that flips **every turn**
  is exactly the worldMap-churn pattern Constraint 1 forbids — it would invalidate the worldMap ref or
  bloat `worldMapDelta` every turn. Do **not** persist `visible` on `WorldTile` and ship it. Either
  **compute visibility renderer-side from pawn positions** (already in the snapshot), or route it
  through the **WASM spatial service** (ADR-008). ENGINE-PERFORMANCE §C explicitly defers the
  `nearestPawn` spatial index to be built **once, shared** by fog-of-war + ranged-combat LoS + nearest
  queries — fog must fold into that amortised service, not stand up its own per-tile mask. See
  Subsystem 6.

### Constraint 5 — renderer overlays must not trigger terrain rebuilds.

The weather overlay pass (Subsystem 5) is a GPU-side fullscreen quad — cheap, correct. The day/night
`a_light` field and tint are already shipped (Phase A/A2). The renderer-trace lesson (D1″) was that
**designation churn was wrongly triggering full 38k terrain rebuilds**; keep new ambient/season/weather
state on their own revision/uniform path so a tint or weather change updates a uniform, never bumps
`_terrainRev` (which forces a vertex rebuild).

---

## Subsystem 1 — Day/Night Cycle (Phase A, immediate)

### Time model

Already in place: `turn % 300` gives position within the 300-turn game day.
Map this to a 24h clock as the calendar already does.

```typescript
// GameEngineImpl (or a new EnvironmentService)
function getTimeOfDay(turn: number): number {
  return (turn % TURNS_PER_DAY) / TURNS_PER_DAY; // 0.0 = midnight, 0.5 = noon
}
```

### Ambient light curve

Sinusoidal sunrise/sunset with a floor to prevent full black:

```
ambientLight = clamp(sin(π * t), 0.0, 1.0) * 0.85 + 0.15
// t = timeOfDay mapped 0→1 over the full day
// Result: 0.15 at midnight, 1.0 at noon, 0.15 again at midnight
```

Dawn begins at `t ≈ 0.17` (≈ 05:00), dusk at `t ≈ 0.83` (≈ 20:00).

### Ambient tint

| Phase      | t range   | tint (GLSL vec3)                |
| ---------- | --------- | ------------------------------- |
| Deep night | 0–0.10    | `(0.05, 0.05, 0.15)` blue-black |
| Dawn       | 0.10–0.20 | `(0.9, 0.5, 0.2)` warm orange   |
| Morning    | 0.20–0.35 | `(1.0, 0.85, 0.7)` warm white   |
| Noon       | 0.35–0.65 | `(1.0, 1.0, 1.0)` neutral       |
| Evening    | 0.65–0.80 | `(1.0, 0.8, 0.5)` golden        |
| Dusk       | 0.80–0.90 | `(0.7, 0.3, 0.2)` deep orange   |
| Night      | 0.90–1.0  | `(0.1, 0.1, 0.3)` purple-black  |

The Caves of Qud gradient aesthetic: visible glyphs at all times (minimum tint 0.15),
but unmistakably different at midnight vs noon.

### Shader changes (`src/lib/webgl/shaders/fragment.glsl`)

Add two uniforms:

```glsl
uniform float u_ambient;       // 0.0–1.0 brightness
uniform vec3  u_ambient_tint;  // pre-normalised colour tint
```

Apply as a final multiply before output:

```glsl
vec3 lit = mix(v_background, tinted, sprite.a);
fragColor = vec4(lit * u_ambient * u_ambient_tint, 1.0);
```

Renderer sets these each frame via `shaderManager.setUniform('tileRenderer', 'u_ambient', light)`.

### Gameplay effects of night

- `FATIGUE_THRESHOLD` effectively lowers by 10 at night (pawns get tired sooner without shelter or light)
- Night does not prevent work but triggers a `sleepDrive` modifier if pawn's natural sleep window has passed
- Monster encounters (future combat system) have higher spawn weights at night

---

## Subsystem 2 — Seasons (Phase B)

### Data model additions (`types.ts`)

```typescript
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

// GameState additions:
season: Season;
seasonDay: number; // 0-indexed day within the current season
```

### Season length

`DAYS_PER_SEASON = 30` (configurable constant). One full year = 120 in-game days.
At 300 turns/day and 1 turn/sec that's:

- 1 season = 9 000 real seconds ≈ 2.5 real hours of play (at unpaused 1× speed)
- Seasons will pass naturally over a long session; speed controls accelerate them

Season advances in `GameEngineImpl.processGameTurn()` when `turn % (TURNS_PER_DAY * DAYS_PER_SEASON) === 0`.

### Seasonal modifiers

| Season | Temp offset | Regrowth rate | Precipitation |
| ------ | ----------- | ------------- | ------------- |
| Spring | +0          | ×1.2          | rain 30%      |
| Summer | +15°        | ×1.0          | rain 10%      |
| Autumn | -5°         | ×0.8          | rain 40%      |
| Winter | -20°        | ×0.3          | snow 60%      |

Regrowth multipliers applied to `resource.regrowthTurns` when restocking persistent nodes.

### Seasonal visual palette

Pass `u_season_tint: vec3` uniform alongside ambient:

- Spring: `(0.95, 1.0, 0.9)` slight green
- Summer: `(1.0, 1.0, 0.95)` neutral-warm
- Autumn: `(1.0, 0.85, 0.6)` amber
- Winter: `(0.85, 0.9, 1.0)` cold blue

The season tint multiplies the ambient tint (both are applied in fragment shader).

---

## Subsystem 3 — Temperature (Phase B, alongside Seasons)

### Tile temperature

Each `WorldTile` gains a derived `temperature: number` (°C, conceptual units):

```
tile.temperature = biomeBaseTemp + seasonOffset + weatherMod + shelterMod
```

- `biomeBaseTemp` set in `biomes.jsonc` per biome type
- `shelterMod`: tiles inside a complete building with walls → `+10` in winter / `-5` in summer
- Temperature is recomputed once per season change (not per turn — too expensive)

> **⚠ Perf (Constraints 1 & 2).** `temperature` is a **worldMap** field. The season-change recompute
> **must mutate affected tiles IN PLACE + `markTileDirty(x,y)`** — never `worldMap.map()` (a 38k rebuild
> + cross-worker re-clone, the §C/§D6 cliff). `temperature` is already dropped from the slim-tile
> `worldMapDelta`, so it stays worker-only and costs nothing on the wire — fine, because nothing here
> renders it; the need-rate effects below read the cached value.

### Pawn comfort range

Each pawn (or race template) defines `[comfortMin, comfortMax]` in conceptual °C.
Default: `[5, 30]`. Traits modify: `"Cold Blooded"` → `[15, 40]`, `"Insulated"` → `[-5, 25]`.

**Need rate effects** when outside comfort:

```
cold = max(0, comfortMin - tile.temperature)
heat = max(0, tile.temperature - comfortMax)
fatigueRateMultiplier += cold * 0.03
hungerRateMultiplier  += heat * 0.02
```

This feeds directly into existing `PawnService.getRestIncreasePerTurn()` and
`getHungerIncreasePerTurn()` multiplier chains.

> **⚠ Perf (Constraint 3).** These multiplier chains run per-pawn every tick on the de-immutabled hot
> path. Compute them as **scalar arithmetic reading the cached `tile.temperature`** — no per-tick tile
> recompute, no allocation. Same rule for the night `FATIGUE_THRESHOLD`/`sleepDrive` effects (Subsystem 1)
> and the weather multipliers (Subsystem 4): scalar reads only.

---

## Subsystem 4 — Weather (Phase C)

### State model

```typescript
// GameState addition:
weather: WeatherState;

export interface WeatherState {
  type: 'clear' | 'rain' | 'heavy_rain' | 'snow' | 'blizzard' | 'heat_wave' | 'fog';
  intensity: number; // 0.0–1.0
  turnsRemaining: number;
  temperatureOverride?: number; // heat_wave / blizzard delta
}
```

### Weather transitions

Stochastic Markov chain evaluated once per in-game day (every 300 turns):

- Clear → rain: `precipitationChance` from season table above
- Rain → heavy_rain: 20%
- Snow (winter only) → blizzard: 15%
- Any → clear: base 60% per day (weather clears naturally)

Weather duration drawn from `[50, 600]` turns (uniform random).

### Weather gameplay effects

| Weather    | Temp delta | Fatigue× | Hunger× | Move cost×     |
| ---------- | ---------- | -------- | ------- | -------------- |
| Rain       | −3         | ×1.1     | ×1.0    | ×1.1           |
| Heavy rain | −5         | ×1.25    | ×1.1    | ×1.3           |
| Snow       | −10        | ×1.3     | ×1.2    | ×1.5           |
| Blizzard   | −20        | ×1.8     | ×1.4    | ×2.5 (outdoor) |
| Heat wave  | +15        | ×1.2     | ×1.4    | ×1.1           |

Multipliers applied in `PawnService` need-rate functions; weather state injected via argument.

---

## Subsystem 5 — WebGL Visual Overlays (Phase C/D)

### Ambient day/night (Phase A, in fragment.glsl — see Subsystem 1)

### Dynamic point lighting (Phase A2 — per-tile light field)

**Problem this solves.** The Phase-A ambient (`u_ambient`, `u_ambient_tint`) is a
single global multiply applied identically to every tile — spatially uniform, so it
reads as a moving gel rather than light. The campfire "glow" was a CSS
`radial-gradient` `<div>` in `WorldEffectsLayer.svelte` composited _above_ the canvas:
it floats on its own DOM layer, cannot multiply the tiles beneath it, cannot warm the
glyph colours, and cannot be occluded. Nothing in the scene radiates light from a
position. This subsystem makes light **spatially varying** and **emitted from sources**.

**Model — per-tile coloured light (Caves of Qud faithful).** CoQ computes light
_per cell_, not per pixel. We do the same: a `LightingService` computes a light colour
per tile each frame and the renderer feeds it to the GPU as a vertex attribute.

```
litTile = tileColour * clamp( ambientLight·ambientTint  +  Σ pointLight, 0, MAX )
```

- `ambientLight·ambientTint` — the existing day/night base (from EnvironmentService).
  Multiplicative darkening.
- `Σ pointLight` — additive contribution from every emitter in range. Brightening, so a
  fire lifts nearby tiles _out of_ the blue night and warms their glyphs.

**Emitters.** `LightingService` derives a `LightEmitter[]` from `GameState` each frame:

```typescript
export interface LightEmitter {
  x: number; // tile coords
  y: number;
  color: [number, number, number]; // normalised RGB (e.g. fire = [1.0, 0.55, 0.2])
  radius: number; // tiles to falloff edge
  intensity: number; // peak additive strength at the source (0–~1.5)
}
```

Initial source: lit, complete `campfire` buildings (`building.lit === true`). Later:
torches, lava tiles, glowing flora, pawn-carried lanterns. Emitters are _presentation_
state derived from `GameState` — no new persisted fields.

**Falloff.** Smooth quadratic-ish falloff to the radius edge, zero beyond:

```
d = distance(tile, emitter) / emitter.radius      // 0 at source, 1 at edge
falloff = clamp(1 - d, 0, 1)^2                     // smooth, 0 past the edge
contribution = emitter.color * emitter.intensity * falloff
```

**Anti-blocky trick (critical for the look).** Sample the light field at each tile's
**four corners**, not its centre, and pass those as the per-vertex `a_light` attribute.
The GPU interpolates light across the quad for free → smooth gradients across tiles with
**zero per-pixel cost**. Without this, lights look like lit squares.

**Flicker.** Fire emitters modulate `intensity` with cheap time-based value noise
(`intensity * (0.85 + 0.15·noise(t))`) so the warmth genuinely ripples across
surrounding tiles instead of pulsing a fixed blurred circle.

### Shader changes (Phase A2)

`vertex.glsl` — new attribute + varying:

```glsl
in  vec3 a_light;   // per-corner light colour (ambient + accumulated point light)
out vec3 v_light;   // interpolated across the quad by the GPU
```

`fragment.glsl` — replace the global `u_ambient * u_ambient_tint` multiply with the
interpolated per-tile light:

```glsl
// was: fragColor = vec4(lit * u_ambient * u_ambient_tint, 1.0);
fragColor = vec4(lit * v_light, 1.0);
```

The CPU folds `ambientLight·ambientTint` into `a_light`, so the global uniforms become
redundant for the colour multiply (kept only if needed elsewhere).

### Renderer integration (Phase A2)

- `GridRenderer.generateBatchVertexData()` gains a 3-float `a_light` per vertex
  (vertex stride 20 → 23 floats). For each tile it queries
  `lightingService.sampleCorner(worldX, worldY)` for all four corners.
- `WebGLRendererCore` holds the active `LightEmitter[]` + ambient, set each frame from
  `GameCanvas` via `setLighting(emitters, ambientLight, ambientTint)`.
- The DOM `campfire-glow` element and its `worldEffects.setCampfireOverlays` pathway are
  **removed** — the fire now illuminates real tiles.

### Spatial-boundary note (ADR-008)

Phase A2 radial falloff has **no occlusion** and is therefore _not_ spatial logic per
ADR-008 — it lives in a TS `LightingService`. Light **occlusion / shadow-casting** (walls
blocking light) IS the same algorithm as fog-of-war visibility and **must** route through
the WASM spatial service interface. It is deferred to Subsystem 6 and must not be inlined
into the renderer or `LightingService`.

### Weather overlay pass (Phase C)

New shader program `'weatherOverlay'` registered in `ShaderManager` alongside `'tileRenderer'`.
Renders a fullscreen screen-space quad after the tile pass.

Shader files: `static/shaders/weather-overlay-vert.glsl` / `static/shaders/weather-overlay-frag.glsl`.

**Vertex shader:** fullscreen quad via two triangles (`gl_Position` from `[-1,1]` NDC).

**Fragment shader uniforms:**

```glsl
uniform float u_time;           // cumulative seconds
uniform float u_intensity;      // 0.0–1.0 from WeatherState.intensity
uniform int   u_weather_type;   // 0=clear 1=rain 2=snow 3=blizzard 4=heat
uniform vec2  u_resolution;     // canvas width/height in px
```

**Effect implementations:**

- **Rain**: near-vertical streaks using `fract(uv.y * 40.0 + u_time * 2.5 * uv.x * 3.0)` — short bright lines with slight angle randomisation per column
- **Snow**: slow white dots using `fract(sin(floor(uv * 80.0) * 127.1 + u_time * 0.08))` — large flakes, no horizontal drift
- **Blizzard**: snow at high intensity + horizontal UV distortion `uv.x += sin(uv.y * 12.0 + u_time) * 0.01`
- **Heat shimmer**: UV distortion only, no particle: `uv.y += sin(uv.x * 8.0 + u_time * 3.0) * 0.003 * u_intensity`, applied to a texture sample of the tile buffer (requires render-to-texture — Phase D only)

For MVP: rain and snow as additive alpha overlays are sufficient. Heat shimmer deferred.

### Renderer integration

In `WebGLRendererCore.render()`:

1. Tile pass (existing)
2. Weather pass: bind `weatherOverlay` program, draw fullscreen quad, `gl.blendFunc(gl.SRC_ALPHA, gl.ONE)` (additive for rain/snow brightness)

Weather uniforms updated from `gameState.weather` each frame.

---

## Subsystem 6 — Fog of War as Visibility (Phase D, deferred)

Night reduces pawn vision radius. No full shadow-casting until the WASM spatial service
is extended (see archived FOG-OF-WAR-DEFERRED spec).

Short-term model:

```
visionRadius = pawn.baseVision ?? 8
if (ambientLight < 0.4) visionRadius = Math.floor(visionRadius * (ambientLight / 0.4))
```

`tile.visible` = true if within visionRadius of any pawn. Updated once per turn in
`GameEngineImpl` (O(pawns × radius²) — acceptable for colony scale).
`tile.discovered` persists (never reset).

> **⚠ Perf (Constraint 4) — do NOT persist `visible` on `WorldTile` and ship it.** A per-tile boolean
> that flips every turn is the exact worldMap-churn pattern Constraint 1 forbids: it would either flip
> the worldMap ref (full re-clone + terrain rebuild) or push a large `worldMapDelta` *every turn*. Two
> acceptable shapes instead: **(a)** compute visibility **renderer-side from pawn positions** (already in
> the snapshot every flush) — zero new wire cost; or **(b)** route it through the **WASM spatial service**
> (ADR-008). ENGINE-PERFORMANCE §C defers the `nearestPawn` spatial index specifically so fog-of-war +
> ranged-combat LoS + nearest queries are built **once, amortised, in one spatial service** — fog must
> fold into that, not stand up its own per-tile mask. The shadow-casting form is already gated to the
> WASM interface (Subsystem 5 spatial-boundary note); the cheap night-dimming form below is
> renderer-side.

Night tiles outside vision are rendered with `u_ambient` forced to `0.05` (near-black,
but character outlines still visible at 5% brightness — Caves of Qud feel).

---

## Subsystem 7 — Shelter & Light follow-ons (carried over from PRODUCTION-CHAIN-EXPANSION §F/§G)

These three depend on the lighting/temperature/weather machinery in this spec, so they live here
rather than in the (now-implemented) production-chain spec. The production-chain data already
exists — roofs, doors, windows, `torch`/`candle` items, storage `requiresEnclosure` — so this is
behaviour wiring on top of that.

1. **Full enclosure detection** (`isEnclosed(tile)` = surrounded by walls + a roof + a door).
   Production-chain approximates it with *roof presence* for the storage `storageDecayMultiplier`
   benefit and for weather-shelter of loose items; replace that with a real flood-fill / 4-wall +
   roof + door check. **Consumers:** §F storage full-benefit gate **and** this spec's temperature
   (an enclosed, hearth-warmed room holds heat). Design the check once, here, for both. Perf:
   memoise per-room, recompute on wall/roof/door build or deconstruct (not per tick).

2. **Window daylight injection** — a `window` build tile lets daylight into the tiles behind it,
   raising their `lightLevel` by day (so pawns work indoors without torches) but not at night.
   Feeds the per-tile light field this spec's day/night subsystem computes; the production-chain
   **crafting light penalty already reads `lightLevel`**, so windows automatically help once they
   contribute to it.

3. **Torch & candle as placeable point lights** — `torch`/`candle` items exist; make a placed/
   carried one a point light (same per-tile point-light path as the campfire in Subsystem 1),
   consuming the item over time. Lets a colony light interiors and night work areas. Fire near
   stored **dry firewood** (production-chain §1) is what later introduces **fire-spread risk** —
   model that here alongside weather hazards.

---

## Renderer decomposition — deferred until rendering is feature-complete

The GameCanvas decomposition (P-4 in CODEBASE-REVIEW) is **intentionally paused** mid-way: the clean
leaf modules are extracted (`gameCanvas/{spriteSheets,hudSpriteIcon,BuildingFuelPanel,selectionCard,
overlay}`, ~700 LOC off), but the render/input core (`updatePawnOverlay`/`updateWorldEffectOverlays`/
`drawDesignations` + camera + input) is left in place. Reason: the overlay/ambient path is about to
**grow** with this spec — weather particle overlays (rain/snow, Subsystem 5) and a **fog tint**
(below). Those are *scoped expansions of the existing ambient-tint + overlay-pass machinery*, not new
systems, so churning the render core now would just be redone. Revisit the `OverlayRenderer`
extraction **after** Phases C–D land and rendering is feature-complete.

### Fog as an ambient-tint overlay (scoped expansion, Phase C)

A `fog` weather type desaturates + greys the scene by reusing the **same ambient-tint multiply** the
day/night cycle already applies (Subsystem 1) — a global hue shift toward flat grey + lowered
contrast, optionally a light screen-space haze in the weather pass. This is **distinct from
fog-of-war** (Subsystem 6, a per-tile visibility mask): fog-the-weather is atmosphere/hue; fog-of-war
is what a pawn can see. Both can coexist.

## Implementation Order

| Phase | Deliverable                                                                                   | Depends on |
| ----- | --------------------------------------------------------------------------------------------- | ---------- |
| A     | Ambient uniforms + day/night light curve in fragment.glsl                                     | —          |
| A     | `EnvironmentService` computing `ambientLight` + `ambientTint` per turn                        | —          |
| A2    | `LightingService` + per-tile `a_light` attribute (point lights, corner-interpolated, flicker) | Phase A    |
| B     | Season state + temperature in `GameState` + need rate hooks                                   | Phase A    |
| B     | Season palette uniform in fragment.glsl                                                       | Phase A    |
| C     | `WeatherState` + Markov transitions + need rate hooks                                         | Phase B    |
| C     | `weatherOverlay` shader (rain + snow particles)                                               | Phase A    |
| D     | `tile.visible` from vision radius + night FOW                                                 | Phases A-C |
| D     | Heat shimmer (render-to-texture required)                                                     | Phase C    |

---

## New Files

| Path                                          | Purpose                                                              |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `src/lib/game/services/EnvironmentService.ts` | Computes ambient light, season, weather transitions                  |
| `src/lib/game/services/LightingService.ts`    | Derives light emitters + samples the per-tile light field (Phase A2) |
| `static/shaders/weather-overlay-vert.glsl`    | Fullscreen quad vertex shader                                        |
| `static/shaders/weather-overlay-frag.glsl`    | Rain/snow/blizzard/heat particle fragment shader                     |

---

## Acceptance Criteria

1. At midnight the game world visually darkens; at noon it is bright neutral white.
2. Dawn and dusk show warm orange/amber tints on all tiles.
3. Season advances every 30 in-game days; `gameState.season` updates correctly.
4. Cold tiles increase pawn fatigue rate; heat tiles increase hunger rate.
5. Rain weather triggers a particle overlay visible on the canvas.
6. Snow weather triggers slow white particle overlay with slight drift.
7. All ambient/weather uniforms are set from game state, not hardcoded per frame.
8. No weather or ambient logic lives inside Svelte components.
9. A lit campfire visibly brightens and warms the tiles around it, falling off smoothly with distance, and lifts them out of the night tint.
10. Point light is per-tile but smoothly interpolated (no visible square blocking) and flickers subtly over time.
11. The old DOM `campfire-glow` overlay is removed; illumination comes from the tile renderer.
12. **Perf (§0.5):** enabling seasons/temperature/weather/fog on the heavy `--profiler` scene holds the
    post-arc TPS bar (comfortably 200+ TPS @4× after warmup) — no harvest-style cliff. Specifically: the
    season-change temperature pass mutates tiles in place + `markTileDirty` (no `worldMap.map()`, no ref
    flip → `worldMapRef` stays 0 in the `[TRIG]` probe); need-rate effects allocate nothing per tick; and
    fog-of-war ships no per-tile `visible` field on the worldMap.
