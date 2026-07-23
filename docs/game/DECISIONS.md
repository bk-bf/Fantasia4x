<!-- LOC cap: none — append-only decision log, one entry per locked ADR (created: 2026-05-25; cap lifted 2026-07-09) -->

# DECISIONS [GAME]

> **Related:** [ARCHITECTURE](ARCHITECTURE.md) · [DESIGN](DESIGN.md)

ADR-001 [GAME]: Layered Architecture with Singleton Services (2026-05-25, Accepted)
ADR-002 [GAME]: GameStateManager as Only Mutation Surface (2026-05-25, Accepted — amended: hot-path mutable-in-place)
ADR-003 [GAME]: ModifierSystem for All Stat Calculations (2026-05-25, Accepted — superseded by ADR-015 for work)
ADR-004 [GAME]: AI Generation Server-Side Only (2026-05-25, Abandoned — never built)
ADR-005 [GAME]: Save Persistence via saveManager (IndexedDB) (2026-05-25, Accepted — amended 2026-07-09)
ADR-006 [GAME]: Data Files Contain Definitions, Not Logic (2026-05-25, Accepted)
ADR-007 [GAME]: SvelteKit + WebGL2 over Godot for Merged Project (2026-05-26, Accepted)
ADR-008 [GAME]: Rust/WASM Spatial Core via wasm-pack (2026-05-26, Accepted)
ADR-009 [GAME]: Hardcore Production Chain Design (2026-05-26, Accepted)
ADR-010 [GAME]: Dynamic Need-Priority Interruption via Proximity + Urgency Formula (2026-05-29, Accepted)
ADR-011 [GAME]: Gated Hot-Path Logging + On-Demand Tick Profiler (2026-05-30, Accepted)
ADR-012 [GAME]: Combat Wound Model — Merge-and-Escalate + Capacity-Driven Downing (2026-06-11, Accepted)
ADR-013 [GAME]: Deferred Combat Depth — Tissue Layers, Nerves & Arteries (2026-06-11, Deferred — partially superseded by ADR-024)
ADR-014 [GAME]: Hard Tile Occupancy via Central OccupancyService (2026-06-12, Accepted — amended by ADR-021)
ADR-015 [GAME]: Single Work Model in stats.jsonc — supersedes ADR-003 for work (2026-06-13, Accepted)
ADR-016 [GAME]: Physical Production — reserve-and-fetch crafting (2026-06-13, Accepted)
ADR-017 [GAME]: Data-driven colony jobs (jobs.jsonc registry) (2026-06-13, Accepted)
ADR-018 [GAME]: Perception via Target Persistence + Push Alerting (2026-06-14, Corrected — premise falsified; demoted to deferred AI feature)
ADR-019 [GAME]: Line of Sight via `blocksSight` Occluder + WASM Raycast (2026-06-14, Accepted — design, impl deferred)
ADR-020 [GAME]: Sim Scaling Strategy — Wrapper-Agnostic Ladder (2026-06-14, Accepted — ladder superseded by ADR-021; wrapper resolved by ADR-030)
ADR-021 [GAME]: Sim/Render Decouple — soft-body pathfinding, terrain cache, MAX_STEPS cap, sim→Worker (2026-06-14, Accepted)
ADR-022 [GAME]: Throttled job-board reconcile (not event-driven) — emission-derived board, 6-tick cadence (2026-06-16, Accepted)
ADR-023 [GAME]: Procedural race pool + pawn `raceId` — `racePool` canonical, `race` = home alias (2026-06-17, Accepted)
ADR-024 [GAME]: Data-Driven Body Plans + Part-Bound Natural Weapons & Armour (2026-06-20, Accepted)
ADR-025 [GAME]: Graded Wind via `windchilled` + Per-Pawn Upwind Wind-Shadow (2026-06-20, Accepted)
ADR-026 [GAME]: Incremental-Only Terrain — No Full-Map Rebuild on a Delta (2026-06-22, Accepted)
ADR-027 [GAME]: Dense Glyph Overlays Render via the Cached Chunk Path (2026-07-05, Accepted)
ADR-028 [GAME]: Typed Trait Kinds + Condition Relationship Graph (TRAIT-SYSTEM-V2) (2026-07-06, Accepted)
ADR-029 [GAME]: Anatomy-Bound Natural Gear + Layered Subtractive Armour + Unified On-Hit Procs (2026-07-08, Accepted)
ADR-030 [GAME]: Desktop Wrapper — Electron over Tauri (2026-07-09, Accepted)
ADR-033 [GAME]: Headless, API-Driven Sim — dev-only in-thread driver over the existing engine + command registry (2026-07-18, Accepted — implemented same day)

---

### ADR-001 [GAME]: Layered Architecture with Singleton Services

- **Date**: 2026-05-25
- **Status**: Accepted

#### Context

Early versions had business logic scattered across Svelte components and static data files, making the codebase hard to test or extend.

#### Decision

Strict five-layer architecture (UI → Stores → GameEngine → Services → Core). Each service implements an interface and exports a singleton (`export const fooService = new FooServiceImpl()`). No layer may import from a layer above it.

#### Consequences

All game logic is testable in isolation. Components stay thin. Adding a new system means adding a service, not modifying existing components.

---

### ADR-002 [GAME]: GameStateManager as Only Mutation Surface

- **Date**: 2026-05-25
- **Status**: Accepted — **amended 2026-06-15** (hot-path mutable-in-place exception; see below)

#### Context

Direct field assignment to `GameState` objects produced hard-to-trace bugs and inconsistent derived state.

#### Decision

`GameStateManager` (in `core/GameState.ts`) is the sole mutation point. It uses spread-operator updates (`{ ...state, ...patch }`) to produce new state objects. Services and the engine call its methods; nothing else writes to state.

#### Consequences

State transitions are predictable and traceable. Enables future undo/redo or time-travel debugging.

#### Amendment (2026-06-15) — hot per-tick phases mutate entity fields IN PLACE

The immutable `{...spread}`/`.map()` style was measured (R1 benchmark) to be **the dominant
per-tick simulation cost — ~12.5× the mutable equivalent** (ENGINE-PERFORMANCE.md). So the **hot
per-tick phases** now **mutate entity fields in place** instead of rebuilding objects every tick:
`pawnService.processNeedsTick`/`clearTemporaryPawnStates`, `workService.syncPawnWorkingStates`, the
pawn FSM updaters (`transitionTo`/`goIdle`/`haltMovement` + the `mutatePawn` helper used across
`pawn/handlers/{needs,work}.ts`), and `entity/entityLifecycle.stepHunger`.

This is **safe and bounded** because: (1) `GameEngineImpl.processGameTurn` shallow-copies the
top-level state each tick (turn bump), so ref-based reactivity still fires; (2) under `?simworker`
the worker→main snapshot crosses the boundary via `postMessage` (structured-clone), and the bridge
reassembles entities onto a fresh per-id mirror (slim merge / full-resync — ADR-021 W2b), so the
renderer/UI only ever see copies, never the worker's live mutable objects (no cross-thread aliasing);
(3) the few in-tick before/after-diff spots capture an explicit copy. **Corollary the W2b snapshot
relies on:** hot scalars (position/needs/state/pain/blood) mutate *in place* and ship in a fixed
slim projection **every flush** (no diff needed — they change constantly). The heavy **cold** fields
(limbs/injuries/conditions/conditionTimers/inventory/equipment/skills/stats) instead ship via
**per-field ref-diff**: the worker re-sends a cold field only the flush its object ref changes, so an
idle entity costs nothing and the main-thread mirror is always current (detail panels are live +
instant on open). This requires cold fields to take a **new ref on change** — combat + the
command/`GameStateManager` path already do (immutable); the two in-place spots
(`tickConditions`/`stepHunger` conditions, and wound clotting's `limbs`) slice-on-change. This
**replaced** the original staggered full-resync round-robin (`RESYNC_EVERY`), which left the
selected-entity panels ≤2s stale — pill/health lagging the sim (ENGINE-PERFORMANCE §B). **Scope of the exception:** only the per-tick sim hot loops, behind the worker. The
**command/structural path stays immutable through `GameStateManager`** (it's not hot, and immutability
keeps it traceable). The undo/time-travel consequence above is therefore **forfeited for live entity
state** (never used). **Do not "restore" immutability in the hot loops** — it reinstates the 12.5×
tax. The full Rust-SoA alternative was evaluated and rejected (ENGINE-PERFORMANCE §9).

---

### ADR-003 [GAME]: ModifierSystem for All Stat Calculations

- **Date**: 2026-05-25
- **Status**: Accepted (superseded by ADR-015 for **work** speed/yield/quality; still authoritative for equipment & trait effect display)

#### Context

Work efficiency and pawn ability bonuses were being computed ad-hoc in multiple files with no audit trail.

#### Decision

All bonus/penalty calculations go through `ModifierSystem`. Every result includes `sources[]` — an array of `{ description, value }` objects explaining each contribution. UI can display the full breakdown.

#### Consequences

No manual flat-sum arithmetic for stats. Bonus sources are inspectable by the UI. Adding a new bonus source is a one-line change in the modifier method.

---

### ADR-004 [GAME]: AI Generation Server-Side Only

- **Date**: 2026-05-25
- **Status**: **Abandoned (2026-07-09)** — scaffolded at project start, never implemented, and no LLM generation is planned. The `generate-character`/`generate-event` API routes were empty one-line stubs with no callers, `@google/generative-ai` was imported nowhere, and the dep + stubs have been removed. Kept as a record of the discarded direction.

#### Original decision (never built)

Gemini API calls (`@google/generative-ai`) were to live exclusively in `src/routes/api/`, with client-side code calling the SvelteKit API route via `fetch` to keep API keys out of the browser bundle. This was never wired up; race/pawn/event generation is fully procedural (ADR-023).

---

### ADR-005 [GAME]: Save Persistence via saveManager (IndexedDB)

- **Date**: 2026-05-25
- **Status**: Accepted — **amended 2026-07-09** (moved localStorage → IndexedDB; owner is `saveManager.ts`, not `gameState.ts`)

#### Decision

`src/lib/stores/saveManager.ts` is the sole persistence layer. Saves live in **IndexedDB** (`DB_NAME = 'fantasia4x'`); the legacy `localStorage['fantasia4x-save']` key (`LS_SAVE_KEY`) is a **pre-IDB migration fallback only** — read once to import an old save, never the live write path. No other code owns save serialisation. (`localStorage` is still used for lightweight UI prefs in `uiPrefs.ts` — a separate concern.)

---

### ADR-006 [GAME]: Data Files Contain Definitions, Not Logic

- **Date**: 2026-05-25
- **Status**: Accepted

#### Context

`Items.ts` and `Buildings.ts` grew to 2000+ lines by mixing item definitions with helper functions (`getCraftableItems`, `getTotalCraftingTime`, etc.), blocking testability and modding.

#### Decision

`core/` files export only static definition arrays/objects. All computation on those definitions belongs in the corresponding service. No new logic functions may be added to data files.

#### Consequences

Data files stay scannable for balancing. Logic is testable independently. Modders can replace data files without touching service code.

---

### ADR-007 [GAME]: SvelteKit + WebGL2 over Godot for Merged Project

- **Date**: 2026-05-26
- **Status**: Accepted

#### Context

Fantasia4x (SvelteKit + WebGL2) and Celestia (Godot 4) are being merged into a single DF/Caves-of-Qud-style colony sim. The question was whether to migrate into Godot or stay in the browser stack.

#### Decision

Stay in SvelteKit + WebGL2, targeting desktop distribution via a webview wrapper (Tauri was the initial assumption; **the wrapper was later settled on Electron — see ADR-030**). Celestia's game logic (pawn state machine, needs, mood, work priorities) will be ported into TypeScript services. Pure spatial computation (pathfinding, fog of war, spatial queries) will be implemented in Rust and compiled to WASM via wasm-pack, exposed through TypeScript service interfaces (see ADR-008).

#### Rationale

- Fantasia4x has ~17k lines of well-architected TypeScript game logic (modifier system, service layer, state manager, research/crafting trees) that would be discarded in a Godot migration.
- SvelteKit UI development is dramatically faster with AI-assisted coding than constructing Godot UI nodes manually — this was a hard blocker in Celestia's development.
- The existing WebGL2 renderer is already tile-grid based, which is exactly the visual model for DF/CoQ style.
- TypeScript's type system handles complex data modelling (30+ interfaces in `types.ts`) far better than GDScript.
- Tauri bundles to ~3–5 MB (vs Godot's native export overhead) and web deployment stays zero-friction.
- For the planned entity count (see ADR-008), TypeScript A\* is sufficient.

#### Consequences

Celestia's Godot-specific features (scene tree, physics, TileMap rendering) must be re-implemented. Spatial service interfaces should be defined against an abstraction layer to allow future replacement without changing callsites.

---

### ADR-009 [GAME]: Hardcore Production Chain Design

- **Date**: 2026-05-26
- **Status**: Accepted

#### Context

Early build had abstract work output: pawns assigned to a category produced 1 unit/turn globally, with no tool requirements enforced and no spatial movement involved. This made survival trivial — any work assignment produced any resource immediately.

The goal is "peak production chain complexity" comparable to RimWorld: Hardcore SK (a heavily modded version of Rimworld focused on industrial-era production chains). Every resource step should require the previous one; the early game should feel genuinely precarious and rewarding to navigate.

#### Decision

**Survival bootstrapping tier** — the starting colony has nothing. Players must:

1. Designate **foraging/scavenging zones** on-map to gather hand-collected primitives (twigs, plant fiber, flint shards, surface stone) — these require no tools.
2. Craft **Tier 0 tools** (Flint Knife, Stone Chopper) from those primitives at a Knapping Surface (zero-build-cost ground designation).
3. Use Tier 0 tools to **fell trees** (woodcutting is tool-gated: requires stone axe or better) and gather larger stone.
4. Use wood + stone to construct **basic workshop buildings** (Campfire, Crude Workbench, Debris Hut).
5. Use those workshops to craft **Tier 1 tools and processed materials**.

**Enforcement rules (non-negotiable):**

- `WorkCategory.toolsRequired` is enforced at job-claim time in `JobService.getAvailableJobs()`. A pawn without the required tool in inventory cannot claim the job — the job simply stays open.
- `Item.workshopType` is enforced at craft-queue-addition time in `ItemService`. A crafting order for an item that requires a workshop that doesn't exist (no complete `PlacedBuilding` of that type) cannot be queued.
- There is no "fallback" to tool-free gathering for gated resources. If no pawn has a stone axe, the forest does not get cut.

#### Consequences

The early game has a genuine bootstrap problem: hand-gathered primitives → tools → workshops → better tools → better workshops. This is the intended design. Tutorials and documentation must communicate the starting dependency chain clearly. Balancing requires that starting map always spawns enough surface flint and twigs to reach Tier 0 tools without needing to move more than 20 tiles.

#### Amendment (2026-06-16) — step 2: per-pawn carried tools (was colony-stock)

Tool gating shipped in two steps. **Step 1** (R4) gated at job-claim on **colony stock** (`_colonyHasHarvestTool`). **Step 2** (2026-06-16) makes the *work* gate **per-pawn**: a pawn must physically **hold** a qualifying tool (equipped — tools go in the `belt` slot) to work a tool-gated harvest, and `minTier` is enforced against the held tool's `tier`. To avoid a soft-lock, a toolless pawn can still *claim* a gated job while a tool exists in colony stock, then **auto-grabs** it: an `activeJob.toolFetch` first leg routes the pawn to the nearest stored tool, equips it (`acquireToolAndProceed`), and proceeds to the site. When no tool exists anywhere the job stays open (bootstrap-safe). Wear moved with the tool — the **working pawn's** equipped tool loses durability and is unequipped on break, after which the gate sends the pawn to grab a replacement. Logic: `jobService.{requiredToolForJob,pawnHasToolFor,colonyHasToolFor,findStockToolDropFor}` (gate in `getAvailableJobs`), `handlers/work` (detour), `jobs/harvest` (per-pawn wear). The old colony-level `applyToolWear` is now unused for harvest.

**Craft-tool gating (completed 2026-06-16).** The same per-pawn machinery now covers crafting, driven by data the same way resources.jsonc gates harvesting: a **per-station `toolRequirement: {workType, minTier}` on the building def** (`buildings.jsonc`), with an optional per-recipe `Recipe.toolRequirement` override. The station was chosen over per-recipe/per-item because it's the fewest tags (~one per crafting station) and **self-maintaining on expansion** — a new recipe at a station inherits its tool with no extra authoring. `recipeService.toolRequirementForRecipe(recipe)` resolves recipe-override→station (reading `buildings.jsonc` as raw data to stay cycle-free), and `jobService.requiredToolForJob` branches on craft jobs (`craftQueueId → order → recipe → station tool`) so the gate, auto-grab detour, and per-pawn wear (`jobs/craft` calls the shared `wearWorkingPawnTool`) all apply to craft jobs with no new FSM code (new `craftTool` claim-gate on the craft `JobDef`). Passive furnace recipes never trigger it (no pawn job). Gated: **butcher_spot→butchery, tanning_rack→leatherworking, anvil + stone_forge→metalworking**, all at `minTier 0`. Bootstrap is guaranteed by a **tool-free starter recipe per gated work type**: butchery/leatherworking accept `flint_knife` (a `craft_spot` craft), and metalworking accepts **`wooden_tongs`** — Green-Wood Tongs, a tool-free `craft_spot` recipe added ahead of the new `iron_tongs`/`steel_tongs` items (forged at the anvil as durable upgrades). So no gated station can ever soft-lock. Forge *smelting* recipes are `passive` (no pawn job) so the metalworking gate only bites active shaping. Constraint: the single `belt` tool slot means a pawn holds one tool at a time (swaps via auto-grab per task).

---

### ADR-008 [GAME]: Rust/WASM Spatial Core via wasm-pack

- **Date**: 2026-05-26
- **Status**: Accepted — implemented starting at Phase 3 of DF-MIGRATION

#### Context

Phase 3 of the DF migration ports the full pawn state machine from Celestia, meaning all entities (50 player pawns + enemies + animals + allies) run concurrent pathfinding requests every turn. Total mobile entities easily reach 200–400. This is at or above the threshold where a TypeScript implementation becomes a measurable bottleneck, and the state machine is being built now — deferring to a later rewrite is costlier than doing it correctly once.

Additionally, the project was (at the time) targeting Tauri, whose backend is Rust, making the toolchain overlap a natural fit. **The wrapper later became Electron (ADR-030), so the Tauri-synergy rationale below is moot** — but the Rust/WASM decision stands on its own: WASM runs ~identically under any webview, so the spatial core is wrapper-agnostic.

#### Decision

Pure spatial computation is implemented in Rust, compiled to WASM via `wasm-pack`, and called from TypeScript through service interfaces. The Rust crate lives at `spatial-core/` in the project root.

**Rust handles exclusively:**

- `PathfinderService` — A\* with binary min-heap, octile heuristic, terrain costs, diagonal wall-cut prevention
- `SpatialIndexService` — nearest-entity queries, expanding-ring scan
- `FogOfWarService` — recursive shadowcasting

**TypeScript handles everything else:** pawn state machine, needs system, mood, work priorities, inventory, game state mutation, UI. These systems call the TypeScript service interfaces; they never import from `spatial-core` directly.

#### Why Rust over C++

- **`wasm-pack` + `wasm-bindgen`** auto-generates TypeScript `.d.ts` bindings from `#[wasm_bindgen]` annotations — zero hand-written glue code.
- **Tauri synergy** — same `cargo` toolchain, potential future code sharing with the desktop backend.
- **Memory safety** — no undefined behaviour; a binary heap off-by-one that segfaults in C++ panics loudly in Rust debug mode and is provably safe in release.
- **Better DX** — `cargo` vs CMake/Emscripten; hot-rebuild with `wasm-pack build --dev`.

#### Data marshaling

The world grid is mirrored as two flat typed arrays kept in sync whenever `GameState.worldMap` changes:

```typescript
const walkable = new Uint8Array(width * height); // 0 = blocked, 1 = walkable
const costs = new Float32Array(width * height); // movementCost per tile
```

`wasm_bindgen` accepts `&[u8]` / `&[f32]` as zero-copy views into the JS heap — no serialisation overhead. Path results are returned as `Vec<u32>` (interleaved x,y pairs) and decoded on the TS side.

#### Architecture constraint

All callsites depend on the TypeScript interface, never on the Rust implementation directly. This keeps the door open for a future HPA\* upgrade or a pure-TS fallback for environments where WASM is unavailable (e.g. unit tests).

#### Consequences

`wasm-pack` and the Rust toolchain are added to the dev environment. CI must run `wasm-pack build` before the SvelteKit build. The `spatial-core/pkg/` output directory is gitignored and regenerated on build.

---

### ADR-010 [GAME]: Dynamic Need-Priority Interruption via Proximity + Urgency Formula

- **Date**: 2026-05-29
- **Status**: Accepted

#### Context

The original pawn need system used two flat thresholds: `HUNGER_THRESHOLD = 70` (seek food from Idle) and `CRITICAL_HUNGER = 87` (interrupt active work). This produced pathological behaviour: a pawn working 1 tile from a campfire would stubbornly work until 87% hunger before eating, while a pawn working 60 tiles from food would interrupt at the same 87% and make a very long round-trip. Pawns routinely reached 100% hunger, collapsed from exhaustion, and then starved while asleep — the system had no spatial awareness.

#### Decision

**Replace flat critical thresholds with a proximity-weighted urgency formula** active from `HUNGER_THRESHOLD` (70), checked every turn in `Working` and `MovingToResource` states.

**Core formula** (`shouldInterruptForNeed`):

```
urgency     = (need − threshold) / (100 − threshold)   // 0..1 across threshold→100
urgencyBias = urgency²                                   // quadratic: slow start, steep near 100%
maxDetour   = max(distToJob, 5) × (1 + urgencyBias × 14)
interrupt   = distToFood ≤ maxDetour  OR  need ≥ 100
```

**Threshold adjustments** applied before the formula:

1. **Work priority** (`laborSettings` level 1–4): each level above/below the default (2) shifts the threshold ±4 pts. A pawn on a critical-priority job (level 4) has an effective threshold of ~78; a low-priority job (level 1) has ~66. At need = 100 the pawn always interrupts regardless.

2. **Job-queue lookahead** (`Pawn.jobQueue`): when the pawn picks a job from Idle, it soft-previews the next 4 unclaimed jobs and stores their IDs. The need check computes `minQueueFoodDist` — the minimum distance from any queued job's tile to the nearest campfire. If all upcoming work is far from food, the threshold is lowered by up to 5 pts so the pawn eats sooner rather than collapsing later.

Combined threshold formula (`computeAdjustedNeedThreshold`):

```
adjustedThreshold = baseThreshold
    + (laborLevel − 2) × 4          // priority shift
    − (minQueueFoodDist / 20) × 5   // queue pressure (clamped 0..1)
// result clamped to baseThreshold ± 12
```

**Concrete examples** (base hunger threshold 70, campfire 15 tiles away, job 20 tiles away):

| Hunger | Labor level | Queue near food | Effective threshold | Interrupts?                     |
| ------ | ----------- | --------------- | ------------------- | ------------------------------- |
| 75     | 2           | Yes             | 70                  | No (food 15 > maxDetour ~7)     |
| 83     | 2           | No              | 65                  | Yes (effective urgency crossed) |
| 87     | 4           | Yes             | 78                  | Yes (maxDetour ~27 > 15)        |
| 100    | any         | any             | any                 | Always yes                      |

**Both `Working` and `MovingToResource` run this check every turn.** En-route checks use the current pawn-to-job distance which shrinks as the pawn walks, naturally re-evaluating continuously.

#### Consequences

- Pawns no longer collapse at 100% before eating — they eat when food is conveniently close to their work path, and divert further only as urgency grows.
- Work priority from the Work tab has a direct mechanical effect on pawn survival behaviour, not just on which jobs are claimed.
- `Pawn.jobQueue` is a read-only soft hint; it is never claimed and may become stale if another pawn claims a previewed job. The need formula degrades gracefully (missing jobs are skipped, `computeMinQueueFoodDist` returns null → full queue pressure applied).

---

### ADR-011 [GAME]: Gated Hot-Path Logging + On-Demand Tick Profiler

- **Date**: 2026-05-30
- **Status**: Accepted
- **Spec**: superseded SIMULATION-PERF spec (deleted; see [ENGINE-PERFORMANCE](../tasks/archive/ENGINE-PERFORMANCE.md))

#### Context

`GameEngineImpl.processGameTurn()` runs `TICKS_PER_SECOND` (60) times per second; one tick = one `processGameTurn()` call. The sim could not hold 60 TPS even with a single pawn and almost nothing happening. Per-phase wall-clock profiling proved that hot-path `console.*` calls (many fired every tick, several per pawn) were **~75% of total per-tick cost** — at 1 pawn, TOTAL dropped from **6.7 ms → 1.5 ms** when console output was suppressed; the `pawns` phase alone went 5.0 ms → 0.40 ms. The cost is string interpolation + I/O (extra-expensive under a debugger/CDP) and it scales per-pawn, making it the single biggest blocker both to a steady 60 TPS and to large pawn counts. A reliable, low-overhead way to measure tick cost was also needed: live TPS read from the turn-counter delta is unreliable under CDP/Playwright (timer scheduling + HMR can stack duplicate `setInterval` loops and report >60 TPS).

#### Decision

**1. Gated logger (`core/log.ts`).** A module-level `enabled` flag (default `false`) backs `glog`/`gdebug`/`gwarn` (no-ops unless enabled) and a `gatedConsole` object `{ log, debug, info, warn }` plus an always-live `error`. Hot-path modules silence all per-tick logging with **one line** that shadows the global `console` for the whole file:

```typescript
import { gatedConsole as console } from '../core/log';
```

No call sites change. Applied to the per-tick services: `WorkService`, `PawnService`, `JobService`, `ResearchService`, `LocationServices`. Toggle at runtime from the dev console with `gameDebug(true)` (exposed via `globalThis.gameDebug = setGameDebug`); `isGameDebug()` gates any remaining heavy log-building (e.g. `GameEngineImpl.debugLogPawns()`).

**2. On-demand tick profiler — RETIRED 2026-06-15.** `processGameTurn()` used to wrap each phase in a `t(label, fn)` timer toggled by `profileTurns()` (`[PROF]`/`[PROF-PAWN]`/`__profOut`). **Removed:** the instrumentation scaled with entity count and, crucially, couldn't see the worker→main boundary — the cost that actually dominated once the sim went off-thread (ADR-021 §B). Profiling is now **browser-native**: Firefox Profiler → `pq` / `scripts/profile-self.mjs`. The `t()` runners are now no-op pass-throughs. *(The gated logger, point 1, stays.)*

**3. `GameEngineImpl` console shadowing** — moot now the `[PROF]` output is gone; it still avoids shadowing `console` so real warnings surface.

#### Consequences

- Steady **60/60 TPS** at current scale (1.2 ms/tick); diagnostics remain one keystroke away (`gameDebug(true)`).
- New hot-path code must add the `gatedConsole as console` import rather than calling the global `console` directly; profiler phases must be wrapped in `t(...)` to stay measurable.
- **Scaling caveat (flagged, out of scope here):** even console-free the tick is ~1.2 ms with a single pawn and per-pawn work scales linearly. Reaching 500+ entities on 1000×1000 maps needs deeper algorithmic work — spread/incremental work scheduling, spatial indices, and a cooldown index so resource regrowth isn't O(map). See the spec. 60 TPS is solid at the current scale.
- The formula is pure and stateless (`shouldInterruptForNeed` has no side effects), making it straightforward to tune constants in isolation.

---

### ADR-012 [GAME]: Combat Wound Model — Merge-and-Escalate + Capacity-Driven Downing

- **Date**: 2026-06-11
- **Status**: Accepted
- **Spec**: [tasks/archive/COMBAT-SYSTEM-2026-06-11.md](../tasks/archive/COMBAT-SYSTEM-2026-06-11.md)

#### Context

Combat is RimWorld-inspired (legible body-part HP + a capacity system already drives stats). Two model choices needed locking in. (1) RimWorld keeps every hit as a **discrete** injury and merely groups them in the UI; our first pass did that and produced unreadable stacks ("5× crush on the little finger"). (2) Downing originally used a bolted-on hard `pain ≥ 80` threshold that ran **parallel** to the existing `consciousness` capacity, which already folds in pain, blood loss and organ damage — two pain brains that never reconciled.

#### Decision

**1. Wounds merge by type per part (`wounds.jsonc` + `core/Wounds.ts`).** One wound per damage type per body part; same-type hits accumulate damage and **escalate severity** (5 crushes → one severe/destroyed crush), rather than piling up. This diverges from RimWorld's discrete model deliberately — it is more readable and arguably more realistic (repeated trauma to one spot *should* compound). Pain = Σ active wound contributions, so it falls as wounds heal. Balance lever: severity is a fraction of part max-HP, tunable per part; if limbs are lost too fast, raise thresholds.

**2. Downing = the `consciousness` capacity, not a separate pain number.** A pawn/mob collapses when `consciousness < 0.3` (recovers > 0.45). The capacity's pain term was strengthened (`painMult = 1 − effectivePain`) so ~80 pain ≈ 0.3 consciousness — matching the old behaviour — but blood loss and organ damage now lower it on top, so a wounded pawn faints sooner. Collapse is distinct from a short blunt **knockdown** (separate status). Mobs are defeated on collapse (no capture system yet); pawns go down and recover as wounds heal.

#### Consequences

- Combat outcomes are decided by accumulated trauma → unconsciousness, not a lucky vital-organ roll.
- One source of truth for downing; the magic `80` is gone. Tuning lives in the consciousness formula + `COLLAPSE_CONSCIOUSNESS`.
- Wound merge means a part shows at most one badge per damage type (cut/puncture/crush/burn) with a severity label — readable health panels.

---

### ADR-013 [GAME]: Deferred Combat Depth — Tissue Layers, Nerves & Arteries

- **Date**: 2026-06-11
- **Status**: Deferred (tracked) — **partially superseded by ADR-024** (the reserved `fracture` bone/flesh split was built 2026-06-20; full tissue-layer/nerve/artery sim stays deferred)

#### Context

Dwarf Fortress derives wound *type* from tissue physics — a blow cracks the bone under skin that only bruises; a cut shears skin/fat/muscle and may nick an artery; severed nerves cause specific functional loss. It was raised as a possible richer alternative to our damage-type → wound lookup.

#### Decision

**Defer it.** Bone/organ damage is already represented as **nested parts** (skull, brain, spine, ribs-as-torso-HP): an attacker must roll a hit that reaches the inner part, so "damage pierced to the bone" is already modelled at the granularity this game needs. A full tissue-layer / nerve / artery simulation (DF-style) is intentionally **not** built now: it adds large tuning surface and opacity, and an upcoming magic + skill system will already raise combat complexity — nobody will track both. The damage-type → wound mapping in `wounds.jsonc` stays the source of wound flavour.

#### Consequences

- Wound type is data-driven (`fromDamageType`), not physics-derived; good enough for a legible colony sim.
- Revisit only if a future design needs material-specific outcomes (e.g. armour that shears vs dents, or surgery targeting specific tissues). The `fracture` wound type is reserved in `Injury` for a possible light flesh/bone split if ever wanted.

---

### ADR-014 [GAME]: Hard Tile Occupancy via Central OccupancyService

- **Date**: 2026-06-12
- **Status**: Accepted

#### Context

Movement originally used a "soft" model: pathfinding ran on a terrain-only grid (entities not treated as obstacles), entities could pass **through** each other mid-path, and the only no-stacking gate fired at a path's *final* tile, comparing against a snapshot of positions taken at the **start of the tick**. Two failures fell out of this. (1) **In-sync stagger / yoyo:** when a follower and leader moved at the same speed, the follower arrived on the tile the leader occupied at tick-start but had already vacated — the stale snapshot flagged it occupied, wiped the follower's path, and the FSM re-pathed every tick (a visible back-and-forth during hunts/chases). (2) **Phasing:** enemies walked through pawns and through each other, so they could surround a defender or stack on one tile and deal stacked melee damage — defeating doorway-baiting / chokepoint tactics. Compounding both, **five callsites each hand-rolled their own "is this tile occupied?"** (mob A*, mob movement, pawn movement, pawn job A*, draft orders) with three different definitions, so mob and pawn behaviour silently disagreed.

#### Decision

**One solid body per tile, enforced from a single source of truth.** A new `occupancyService` (`services/OccupancyService.ts`) answers "which tiles hold a living pawn or non-corpse mob" — `blockedTiles(state, excludeId?)` / `isBlocked(...)`. It is a plain per-tick TypeScript scan; it is **not** spatial-WASM (only A\* and nearest-entity stay behind the WASM interface per ADR-008). Both consumers defer to it:

- **Pathfinding** feeds `blockedTiles()` into `buildPathfindingGridsWithBlocked` so A\* routes **around** other bodies — a pawn standing in a doorway is a real wall. The mover's own start tile and its goal are kept walkable.
- **Movement** (both the mob and pawn advance passes) tests the same set before entering a tile, and reserves resting/target tiles so two movers can't converge on one free tile in a tick. A blocked mover **holds** (keeps its path — no re-path, which is what removes the yoyo) and drops the path only after ~1.5 s (`MAX_BLOCKED_TICKS`) so genuine deadlocks (e.g. a corridor swap) re-route.

#### Consequences

- No stacked melee damage (attackers limited to distinct adjacent tiles), no phasing; doorway baiting and chokepoints work as intended.
- Collision policy lives in one service — movement and pathfinding can no longer drift apart.
- Pawn job-pathing now routes around bodies too; a transiently blocked job falls back to the existing unreachable-cooldown (ADR-010 plumbing), so pawns **queue** for single-access workstations instead of stacking — no path-churn.
- Costs: a `blockedTicks` field on `Mob`; the entity-aware A\* clones only the walkable mask per route (the terrain layer stays memoized by `worldMap` reference).
- Trade-off: a follower now trails a leader with a one-tile gap (queue cadence) rather than moving in lockstep. This is intentional and replaces the stagger.

---

### ADR-015 [GAME]: Single Work Model in stats.jsonc

- **Date**: 2026-06-13
- **Status**: Accepted (supersedes ADR-003 for work)

#### Context

Two systems independently computed how good a pawn is at work and disagreed. `ModifierSystem.calculateWorkEfficiency` produced one multiplicative "efficiency" scalar (`stat/10 × …`), while `stats.jsonc` (`pawnStatService.getWorkModifiers`) produced separate `*_speed`/`*_yield`/`*_quality`. Worse, they were wired inconsistently: harvest/craft **speed** silently ran on the efficiency scalar while **yield** ran on the formulas — so the `fishing_speed` a player saw never actually governed fishing. The efficiency system also carried dead branches (buildings/research/equipment work bonuses no content used).

#### Decision

`stats.jsonc` via `pawnStatService.getWorkModifiers(pawn, work, light)` is the **single** work model, returning `{speed, yield, quality}`. It folds in: stat formula × body capacities (sight/manipulation/consciousness — injury & darkness), explicit racial-trait multipliers (`workSpeed`/`workYield`/`workQuality` — renamed from the ambiguous `workEfficiency` map so trait data states its own axis), and transient state (condition-stage + status-effect `workEfficiency` scalars → speed only). The entire `calculateWorkEfficiency` path and its plumbing (`WorkService` efficiency methods, `GameEngine.calculatePawnEfficiency`, dead `PawnEquipment.getWorkEfficiency`) were deleted. `ModifierSystem` keeps only building/item/trait-effect aggregation for display.

#### Consequences

- Job speed and the work-grid tooltip now read the same numbers the pawn panel shows. Tooltip ranks best/worst jobs by throughput (speed × yield).
- Trait/need re-tuning is a one-line data edit (`workSpeed: {fishing: 1.2}`); no interpretation logic.
- Behavior shifts: speed uses the gentle `+0.05/pt` formula curve instead of `stat/10`, and the old double-count of fatigue (status effect **and** a separate needs formula) collapses to just the status effect. Intended corrections, not regressions.

---

### ADR-016 [GAME]: Physical Production — reserve-and-fetch crafting

- **Date**: 2026-06-13
- **Status**: Accepted
- **Spec**: [tasks/archive/PHYSICAL-PRODUCTION-2026-06-13.md](../tasks/archive/PHYSICAL-PRODUCTION-2026-06-13.md) (archived — shipped)

#### Context

Gathering was physical (harvest → drop → haul → `stored` drop on a tile) but **consumption
was an ethereal shared pocket**: crafting/building/eating/butchery deducted from the
aggregate `gameState.stockpile` (or the dead `gameState.item` array) from anywhere, at queue
time, with no pawn carrying anything. Craft jobs targeted `(0,0)` (pawn crafts in place,
never visits the workshop); craft output landed in `gameState.item`, invisible to every
material/cost/fuel consumer (the ceramics tier was uncompletable); butchery consumed a whole
carcass stack for one carcass's yield. The carry-weight budget and ADR-009 tool gating were
meaningless because no pawn ever held inputs.

#### Decision

**Items are always physical objects occupying a location** — a tile (loose or `stored`
`DroppedItem`) or a pawn's inventory. No global item pool. Production is reserve-and-fetch:

1. **Reserve** — a craft order locks matching `stored` drops (`DroppedItem.reservedFor =
   orderId`); reserved stock is present but excluded from "available", so no double-spend.
   Affordability reads `availableFromDrops` (stockpile minus reservations), centralised in
   `ItemService.getAvailableQuantity`.
2. **Fetch** — one `fetch` job per reserved drop: a pawn carries it (haul machinery) to the
   chosen station tile and stages it on the station.
3. **Craft** — once all inputs are staged, the `craft` job (targeted at the station tile)
   spends `recipe.workAmount × quantity` work points.
4. **Produce** — staged inputs are destroyed; outputs spawn as drops **on the station tile**.

`gameState.item` is removed entirely. **Butchery is already recipe-based** (each carcass is a
`butcher_spot` recipe input, one consumed per run), so it flows through this pass's physical
pipeline for free. The old `item.isCarcass`/`yields` multi-yield path (`processButchery`) is
dormant dead code — no item data triggers it — hardened for R3 in case it is ever revived.

#### Consequences

- Crafted items are real stock — usable as materials/fuel/build/research costs (fixes the
  broken intermediate chains). The workshop is now a place a pawn walks to, not just a gate.
- Supersedes the old queue-time-consume model. **Pass 2 added** passive furnaces (`Recipe.passive`
  + `PASSIVE_STATIONS`; `GameEngineImpl.processPassiveProduction` runs supplied, lit furnaces),
  physical **building-material hauling** (reserve at placement → fetch to site → consume on
  completion; the fetch system is now polymorphic over a craft-order OR building owner), and
  **carry-budget enforcement** at pickup (`clampPickupQuantity`). Butchery was already
  recipe-physical (its dead `isCarcass`/`processButchery` path was removed). **Still deferred:**
  ADR-009 tool gating (R4) is blocked on content — no tool-free flint/stone source exists, so
  strict gating would soft-lock a new game's bootstrap.
- Reservation bookkeeping (`reservedFor` on drops) is the new invariant; cancel releases it.

### ADR-017 [GAME]: Data-driven colony jobs (jobs.jsonc registry)

- **Date**: 2026-06-13
- **Status**: Accepted

#### Context

Colony job types (`harvest`/`haul`/`fetch`/`construct`/`deconstruct`/`craft`/`refuel`) were
**hardcoded** across ~6 sites: the `Job['type']` union, a hand-ordered generator sequence in
`generateJobs`, a `switch` in `_completeJob`, the `job → workCategory` map in `_jobTypeToWorkKey`,
**a second copy** of that map in `utils/pawnUtils.getWorkKeyForJob`, and claim-gating special-cases
in `getAvailableJobs`. Every other game concept (items, buildings, recipes, research, conditions…)
is authored in `database/*.jsonc`; jobs were the odd one out, so adding one meant editing code in
several places with a silent UI/sim duplication.

#### Decision

**Jobs become data-driven like everything else.** The *declarative* half of each colony job type —
work-category mapping, UI label, claim-gating — lives in **`database/jobs.jsonc`** (a `JobDef` per
type). The *behavioural* half (how a job is generated into the pool and completed) stays in code,
bound by `id` in a single `JobService.handlers` registry — exactly as `recipes.jsonc` pairs with
`JobService._completeCraft`. `generateJobs` iterates the registry; `_completeJob` dispatches through
it (no `switch`); `_jobTypeToWorkKey` and claim-gating read `JobDef`. The duplicated
`pawnUtils.getWorkKeyForJob` is deleted — it now delegates to `jobService.getJobWorkCategory`, the
one source of truth. (FSM-internal kinds `eat`/`sleep`/`need` are not colony jobs and have no
`JobDef`.)

**Adding a colony job = (1) a `jobs.jsonc` entry, (2) a `JOB_HANDLERS` binding, (3) a `Job['type']`
union member** — down from ~6 scattered edits with a duplicate.

#### Consequences

- Drift is guarded on three fronts: `JobPoolType ⊆ Job['type']` and "`handlers` covers every
  `JobPoolType`" are **compile-time** (a `Record<JobPoolType, JobHandler>` + a subset assertion);
  "`jobs.jsonc` ids === handler ids" is a **vitest** drift test (`jobRegistry.test.ts`).
- Not graph-checkable: this is a *data-coverage* invariant (jsonc ↔ union ↔ registry), not a
  call-edge one, so `graph:check` can't express it — registered `checkable: false` in `ADR_RULES`,
  like the other runtime/data ADRs, with enforcement delegated to the test + compiler above.
- Behaviour-preserving: the generator order, completion side-effects, and work-category results are
  identical (the only change is the dead `light` job's defunct mapping). 153 tests green.
- Onboarding documented in `AGENTS.md` ("Adding a colony job").

---

### ADR-018 [GAME]: Perception via Target Persistence + Push Alerting

- **Date**: 2026-06-14
- **Status**: **Corrected (2026-06-14)** — the premise below ("perception is the #1 sim cost") was
  **FALSIFIED by profiling**: it dominated only one idle capture; under load, pathfinding cost ~13×
  more (see ADR-021). Target-persistence + push-alerting are **demoted to a deferred AI-correctness
  feature** (predators commit, prey react only to perceived, attacked animals fight back) — NOT a
  performance fix. Do not build it for FPS. The actual perf work is ADR-021.
- **Spec**: [tasks/open/ENGINE-PERFORMANCE.md](../tasks/open/ENGINE-PERFORMANCE.md) §5 (deferred)

#### Context

The `--profiler` sandbox (150 pawns + ~140 mobs) measured the sim at **~15 ms/tick**,
single-thread CPU-bound (main thread ~80% busy; not GPU — canvas is 0.8 MP). The dominant
cost is **O(n²) perception**: `findCombatThreat` and `findNearestHuntTarget`
([pawnHelpers.ts](../../src/lib/game/systems/pawn/pawnHelpers.ts)) each linearly scan **all
mobs, for every pawn, every tick** (`#findCombatThreat/tick ≈ 154` → ~21k checks/tick),
re-deriving hostility on neutral animals each pass. It is also twitchy: targets are
re-chosen from scratch 60×/s.

#### Decision

Replace the per-tick global scan with three composing layers:

1. **Stateful hostility** — hostile = `entityClass==='mob'` **OR** `Attacking`/`Alerted`
   **OR** *provoked* (an attacked animal gains an aggressor ref + calm-down timer, then
   reverts). Preserves "prey fight back"; a class-only filter would break it.
2. **Target persistence (memory)** — lock a target; re-acquire only on a trigger (target
   dead/gone, out of perception N ticks, reached, or self-flee). Most entities do **zero**
   perception work most ticks. New per-entity fields: `targetId`, `targetAcquiredTick`,
   `lastSeenX/Y`, `provokedBy`, `provokedUntil`.
3. **Bounded acquisition + push** — when a scan is needed, query the spatial index
   (ADR-008 `SpatialIndexService`) within perception radius, LoS-prune (ADR-019), pick
   nearest visible. Prey are **alerted by moving hostiles** (push: O(hostiles×local)), not
   by every prey polling (pull: O(prey×mobs)).

Cost-vs-frequency-vs-correctness: spatial index = *what's near*, LoS = *what's visible*,
persistence = *how often we ask*. They multiply; none is redundant.

#### Consequences

- Perception drops from O(n²)/tick toward O(n·k) occasionally; expected the bulk of the
  `pawns` phase. **Magnitude is a hypothesis** — the spec's §6 spike must confirm it (and
  on WebKitGTK, the shipped engine) before P1+ build on it. If the tick cost does not move
  when the scan count does, this ADR's framing is wrong and is reworked, not shipped.
- Better game feel: predators commit instead of flip-flopping; prey react only to perceived
  threats. Two open design Qs (provoked targeting scope; LoS-loss drop vs last-known
  memory) are resolved in P1.

---

### ADR-019 [GAME]: Line of Sight via `blocksSight` Occluder + WASM Raycast

- **Date**: 2026-06-14
- **Status**: Accepted (design) — implementation deferred to spec P3 (after ADR-018 lands)
- **Spec**: [tasks/open/ENGINE-PERFORMANCE.md](../tasks/open/ENGINE-PERFORMANCE.md) §4

#### Context

Detection is a fixed radius, so an entity perceives through walls (a wolf chases a goat
through a mountain). Sight-blocking cannot be derived from `walkable` alone: a **window**
is `walkable:false` but must be transparent; an open door is walkable but a closed one
blocks sight.

#### Decision

Add **`blocksSight: boolean`** to `resources.jsonc` and `buildings.jsonc`, **defaulting to
`!walkable`** when omitted (solid blocks sight for free; only exceptions are hand-authored:
windows/transparent roofs `false`, closed doors `true`). Sight is computed in
`spatial-core` (ADR-008's fog-of-war responsibility) over an `opaque` bitmap
(`Uint8Array`, map-sized, **maintained incrementally**, mirrored like `walkable`/`costs`).

Algorithm split: **AI** uses point-to-point line walk (Bresenham/supercover) on the small
candidate set from ADR-018 — **per-pair-per-tick LoS is forbidden** (O(n²×ray-len), worse
than the bug it fixes). **Player fog reveal** uses shadowcast FOV, a separate
lower-frequency consumer, never per entity.

#### Consequences

- LoS is the natural **persistence-invalidation rule** (ADR-018.2): losing sight of a
  target drops it — physically motivated, immediate, better than a timeout.
- **Enables RANGED-COMBAT** (its Living-World LoS dependency) and feeds SEASONS_WEATHER
  fog of war.
- Affordable **only** when gated by persistence; must not be built before ADR-018.

---

### ADR-020 [GAME]: Sim Scaling Strategy — Wrapper-Agnostic Ladder, Wrapper Deferred

- **Date**: 2026-06-14
- **Status**: Accepted — **the ladder's "step 1: kill O(n²) perception" was the wrong target**
  (ADR-018 falsified). The wrapper-agnostic principle and the deferred SAB/Rust decisions
  stand; the concrete ordered plan is **superseded by ADR-021** with the real bottlenecks. The
  **wrapper choice ("Tauri vs Electron: explicitly OPEN" below) has since been resolved to Electron — see ADR-030.**
- **Spec**: [tasks/open/ENGINE-PERFORMANCE.md](../tasks/open/ENGINE-PERFORMANCE.md) §5, §6

#### Context

The sim is single-thread CPU-bound (ADR-018). The platform offers no shared-memory threads
except Web Workers (message-passing) and SharedArrayBuffer (typed arrays only). Our
immutable object-graph `GameState` is single-owner: `postMessage` deep-copies it;
SAB needs an ECS/struct-of-arrays rewrite. The shipped desktop runtime is **not** the dev
browser, and **which wrapper ships is undecided** (Tauri vs Electron — settled later, at
the DISTRIBUTION milestone): Tauri uses the OS WebView (Linux=WebKitGTK/JSC,
Windows=WebView2/V8, macOS=WKWebView/JSC); Electron ships uniform Chromium/V8+Node. Dev is
Firefox (SpiderMonkey). So dev perf numbers don't transfer, Workers are universal but SAB
is fragmented (reliable on V8-based runtimes), and **WASM runs ~identically everywhere** —
the common denominator regardless of wrapper.

#### Decision

The scaling ladder is **wrapper-agnostic** — the same work whichever wrapper wins, so it
proceeds now without blocking the wrapper decision. Do in order, stopping when fast enough
at target scale (measured on the actual ship engine, incl. **WebKitGTK** if Tauri):

1. **Kill the O(n²)** (ADR-018) — wins on every engine and wrapper.
2. **Push hot compute into `spatial-core` WASM** (nearest-entity, LoS/FOV) — most portable
   lever (ADR-008); runs in Tauri's webviews *and* Electron's V8.
3. **Sim → one Web Worker** — portable across all webviews and Electron.
4. **Defer** SAB multicore and a native sim core (Rust sidecar under Tauri / native addon
   or Node worker under Electron) — the *form* depends on the wrapper chosen later.

**Wrapper (Tauri vs Electron): explicitly OPEN**, decided at the DISTRIBUTION
milestone with full information — Electron's uniform-V8 + Node threads vs its
+150–250 MB/RAM, against Tauri's tiny bundle + Rust synergy vs its three-engine spread.
The algorithmic fix (step 1) may remove the perf axis entirely, tilting the choice onto
size/feel. **Only** forking Electron/Chromium (team-years maintenance) and embedding
SpiderMonkey (two engines, no speed win) are rejected outright — distinct from the live
wrapper choice.

#### Consequences

- Engine/wrapper choice is a real but **later and smaller** lever than the algorithm; the
  runtime is not changed before §6 + steps 1–3 prove insufficient.
- The single concrete near-term mandate: re-measure on the real ship engine (WebKitGTK if
  Tauri; V8 if Electron), not just Firefox — and that measurement is itself a key *input*
  to the deferred wrapper decision, since uniform-V8 (Electron) only matters if the
  three-engine spread (Tauri) actually hurts.

---

### ADR-021 [GAME]: Sim/Render Decouple — Soft-Body Pathfinding, Terrain Cache, MAX_STEPS Cap, Sim→Worker

- **Date**: 2026-06-14 (Worker + snapshot protocol landed 2026-06-15)
- **Status**: Accepted (bug-fixes + Worker + W2/W2b snapshot protocol shipped; **worker is the only sim path — `?simworker` flag retired**)
- **Spec**: [tasks/open/ENGINE-PERFORMANCE.md](../tasks/open/ENGINE-PERFORMANCE.md) (§B = the snapshot win) · bugs in [BUGS.md](BUGS.md)

#### Context

A profiling pass on the heavy sandbox (150 pawns + ~140 mobs, 4× speed) found the game at ~2 fps.
ADR-018's premise (O(n²) perception is the #1 cost) was **falsified** — it dominated one *idle*
capture only. Under realistic movement load the real costs were, in order: a lying FPS counter
(hid it), a pathfinding **body-block flood**, the **16-ticks-per-frame** sim multiplier, and
**per-frame terrain re-upload/rebuild**. The sim and render share one thread (the rAF loop runs the
sim then renders), so a heavy sim starves render — the structural root.

#### Decision

Fix the measured bugs, then **decouple the sim from the render thread**:

1. **Soft-body pathfinding** — bodies are **high-cost, not impassable walls**, in the A* grid
   (`buildPathfindingGridsSoftBlocked`). A* never fails on body-blocking (no full-map flood on
   body-walled goals); no-stacking stays enforced at the movement layer (`stepBody`). **Amends
   ADR-014**: bodies are hard at the *movement* layer, soft at the *planning* layer.
2. **Terrain render cache** — terrain gets its own VBO (uploaded only on change), and all
   sim-driven terrain rebuilds coalesce to ~2/sec instead of every frame.
3. **`MAX_STEPS_PER_FRAME` cap (16→4)** — interim decouple: bounds sim ticks per frame so a slow
   frame can't run 16 heavy ticks and starve render. **Tradeoff: reduces TPS at high game-speed.**
4. **Sim → Web Worker** (the endgame) — move `GameEngineImpl` + services + WASM pathfinder into a
   worker; render interpolates from per-tick snapshots. Removes the `MAX_STEPS` tradeoff (sim runs
   full speed off-thread) and gives display-rate FPS regardless of sim cost. Wrapper-agnostic.
5. **Slim worker→main snapshot protocol** (W2/W2b, the decisive win — added 2026-06-15). Once the sim
   was off-thread, function-level profiling showed the **`structured-clone` of the whole `GameState`
   every flush** was the dominant cost (~32%), not the sim. The fix: a **sectional diff** (send only
   top-level fields whose ref changed; the bridge reassembles from a mirror) + **per-entity
   slim/resync** for pawns/mobs (a slim projection of hot fields every flush, heavy/static cold fields
   full-resynced ~every 8th flush; bridge merges onto a per-id mirror). `EntitySync` in `simProtocol.ts`.

Deferred (not perf fixes): perception persistence/LoS (AI features), Rust sim core, SAB multicore,
wrapper choice (ADR-020). The wrapper is **not** a performance lever — single-thread JS either way.

#### Consequences

- FPS 2 → 8–10 from steps 1–3; then the Worker (4) + slim snapshot (5) took the heavy stress case
  to **80–100 TPS @4×, FPS 60–80, no sub-40 dips** — `post` (snapshot clone) 31.6% → 6.5%.
- The `MAX_STEPS`/terrain-throttle tradeoffs are gone (Worker + `_terrainRev`).
- **The custom in-game profiler was RETIRED** (it scaled with entity count and couldn't see the
  worker boundary — the cost that actually mattered). Profiling is now **browser-native** (Firefox
  Profiler → `pq`/`scripts/profile-self.mjs`); `[PROF]`/`profCount`/`?simprof`/`__profileTurns` removed.
- **Two rejected sub-attempts (measured worse, reverted):** a TS uniform-grid for nearest-entity
  queries (per-tick allocation > linear scan at ~290 entities) and `(pawns,mobs)`-memoized occupancy
  (near-zero hit rate). See ENGINE-PERFORMANCE §B.
- ADR-018 corrected (premise falsified); ADR-020's concrete ladder superseded here.

---

### ADR-022 [GAME]: Throttled Job-Board Reconcile (not event-driven)

- **Date**: 2026-06-16
- **Status**: Accepted
- **Spec**: closes D9.7 in [CODEBASE-REVIEW](../CODEBASE-REVIEW-2026-06-10.md)

#### Context

`JobService.generateJobs` runs every tick in `GameEngineImpl.processGameTurn` (before pawn
processing). It reconciles `gameState.jobs` against current world state: 7 generators
(`_syncHarvestJobs`/`_syncHaulJobs`/`_syncConstruct`/`_syncDeconstruct`/`_syncFetchJobs`/
`_syncCraftJobs`/`_syncRefuelJobs`) each re-scan their source domain (designations, droppedItems,
buildings, craftingQueue) and add-or-prune. D9.7 proposed making this **event-driven** to drop the
per-tick O(sources) scan. A long design pass weighed it.

The key realisations: (1) the per-tick reconcile is **already emission-derived and self-healing** —
the board is a projection of who's currently asserting a job; a gone source (cancelled blueprint,
deconstructed building, consumed/destroyed drop) simply stops being asserted and its job is pruned
on the next pass, with **no removal signal needed**. (2) True event-driven would *trade away* that
self-healing for fragile per-mutation-site signalling (dozens of sites touch droppedItems/buildings/
designations/craftingQueue) — one missed signal = a permanently missing or stale job. (3) The hot
part of the scan was already removed (`_syncHarvestJobs` O(designations×jobs) → O(1) `Set` dedup;
the pawn-id `Map` killed the `find()` O(n) lookups — ENGINE-PERFORMANCE §C), so `generateJobs` is no
longer on the hot list. So the *only* axis worth changing is **how often the board is rebuilt** — a
pure CPU-vs-latency trade, no behavioural upside.

#### Decision

**Keep the central emission-derived reconcile; throttle it** — run `generateJobs` every
`JOB_GENERATION_INTERVAL_TICKS = 6` ticks instead of every tick (a `turn % N === 0` gate, mirroring
`DETERIORATION_INTERVAL_TICKS`). Board-appearance latency is then ≤6 ticks (~0.1 in-game-sec) for
**everything**, including player actions — imperceptible, so **no per-event "kick" path is needed**
(a 30s cadence *would* need kicks to stay responsive; 6 ticks does not, and the extra CPU saved past
~6 is negligible). Explicitly **rejected**: the full event-driven rewrite, and the object-as-emitter
(registry / "object owns its job rule") refactor — same runtime, pure code-relocation churn plus a
TTL + claimed-exemption the central reconcile doesn't need.

**Two-clocks invariant (the design's crux):** *board-refresh cadence* (this throttle, slow) is
distinct from *per-pawn job-selection cadence* (every idle tick, unchanged). A pawn reads the
already-standing board every idle tick and selects by priority-then-distance; it never waits on a
re-emit. (This is why an interrupted pawn's job is filled by another pawn instantly — release sets
`claimedBy=null`, visible next tick — with no idle gap.) Needs stay a **per-pawn, per-tick** input,
not board entries: need *accrual* must run every tick for everyone (a downed pawn still starves) and
the need *decision* is already gated to actionable pawns (drafted skip the behavioural FSM, ADR-002
R2; collapsed pawns are in the collapse lifecycle).

#### Consequences

- `generateJobs` scan cost drops to ~1/6; no new machinery (claim/advance/complete already run every
  tick independently of the reconcile, so claimed/in-progress jobs are untouched between rebuilds —
  no TTL, no claim-exemption).
- Behaviour is unchanged except ≤6-tick latency on job board appearance/cleanup; a pawn can briefly
  see a job whose source just vanished (same class as the N-5 ghost-job window) — the FSM already
  bails via the `jobInPool` check and the `_complete*` handlers no-op on a missing source.
- **Self-healing preserved** (each pass is a full reconcile), unlike a push/event model.
- Revisit only if a profile at real scale puts the scan back on the hot list — then lengthen the
  cadence with event kicks for player-intent / completion-chains / source-removal; the object-emitter
  refactor remains a *cohesion* choice, never a perf necessity.

---

### ADR-023 [GAME]: Procedural Race Pool + Pawn `raceId` — pool canonical, `race` = home alias

**Status:** Accepted (2026-06-17)

**Context.** Race was the most deprecated system: `GameState.race` was a single `Race`
generated once at module load, every colony was mono-racial, pawns carried a denormalized
`racialTraits[]` copy with no race identity, and the trait `effects` shape had drifted from
`stats.jsonc` (stale work axes + ~20 effect fields nothing read).

**Decision.**

- A **pool of 15–25 procedural races** (`generateRacePool`) is prerolled per run and stored on
  `GameState.racePool` — the canonical, known-races (pokédex) backing store. Each race gets a
  unique kebab `id`, an `archetype` that biases stat ranges / size / trait selection, and
  procedural `lore` including an immersive `description` (authored trait `flavorLine`s + lore
  clause banks assembled by numeric buckets — the prose is authored, only the scaffolding is
  generated).
- `GameState.race` is **kept as a back-compat alias** for the colony's home race (`racePool[0]`)
  so existing `currentRace` consumers don't churn.
- The starting colony is **fully mixed**: `generateColonyPawns` draws each pawn from a random
  pool race; pawns now carry `raceId`/`raceName`.
- **Race-based conditions reuse existing machinery**: trait resistance effects
  (`coldResistance`…) are added on top of the matching `*_resistance` stat in
  `PawnStatService.evaluateStat`, so they flow into condition onset (cold→hypothermia) with no
  new condition code.
- `GameState.raceRelations` is a **data-only stub** (symmetric procedural dispositions, shown in
  the pokédex) — the seam for the unbuilt SOCIAL-LAYER; no pawn-mood wiring this pass.

**Consequences.** Old single-race saves migrate to a one-entry pool tagged onto existing pawns.
The dead trait effect fields were pruned (only `nightVision` was genuinely consumed and was
kept). New core data (`race-lore.jsonc`, trait `id`/`flavorLine`) follows ADR-006 (definitions,
not logic). Drift on the generator is guarded by `Race.test.ts`. Not graph-checkable — a
data/runtime decision, not a call-edge invariant.

---

### ADR-024 [GAME]: Data-Driven Body Plans + Part-Bound Natural Weapons & Armour

**Status:** Accepted (2026-06-20) — partially supersedes ADR-013 (the reserved `fracture` split is now built).

**Context.** Every entity shared ONE hardcoded humanoid anatomy table, so a wolf carried
"middle ring finger"s and combat rolled humanoid hit locations on beasts. `bodyScale` only
inflated the blood pool (limb HP was a fixed table); natural weapons fired at full effectiveness
regardless of dismemberment; natural armour was a single flat number with a hardcoded
"core = full, limb = ×0.3" split. A combat-depth pass (collapse-from-blood, brutal conditions,
blunt-as-trauma, fractures) needed the anatomy to actually vary per creature.

**Decision.**

- **Anatomy is data** — `database/limbmap.jsonc` holds a `shared.parts` catalog + co-located
  per-plan blocks (`parts` + `limbs`), merged into one global `PART_DEF_MAP` at load. Seven body
  plans (humanoid · quadruped · quadruped_hooved · amphibian · avian · serpentine · arachnid ·
  winged_humanoid · amorphous); a creature picks one via `limbMap` (default `humanoid`), pawns are
  humanoid. `core/BodyParts.ts` builds per-plan hit-roll tables; `rollBodyPart(plan)` and the
  capacity model (`moving`/`manipulation` aggregate the plan's leg/arm limbs) are plan-aware.
  `LimbId`/`BodyPartId` are loosened to `string` (data-driven ids). Parent-limb is resolved from
  the entity's own tree, not a global field (a part's parent limb varies by plan).
- **`bodyScale` scales limb HP** — per-part `maxHp = round(default size × bodyScale)` at spawn
  (combat severity/fracture/heal read the part's SCALED maxHp, threaded through
  `recomputeWound`). The map stores only default sizes; the blood pool stays `health × bodyScale`.
- **Natural weapons bind to parts** — each part lists the `weapons` it can wield (jaw→bite,
  paw→claw…), gated by the creature's `naturalWeapons` list. A weapon is usable only while a
  surviving part enables it; losing every weapon-part falls back to a weak blunt `thrash`; a pawn
  who loses both hands drops its equipped weapon.
- **Natural armour binds to parts** — same shape: the plan sets the **distribution** (`armor`
  share per part: armoured trunk/carapace ~1.0, soft belly ~0.5, exposed eyes ~0.1); the
  creature's `naturalArmor` scalar sets the **magnitude**. Part reduction = `naturalArmor × share`,
  replacing the flat core/peripheral hardcode — so weak spots are data-driven and a destroyed part
  takes its armour with it.
- **Fractures + critical parts** — a `fracture` wound (structural, no bleed, weeks to heal)
  breaks a bone without severing; `boneBroken` cripples the limb's capacity (manipulation/moving ×0.4)
  and drives a single GRADED `fractured` condition (severity = the worst bone's damage ÷ its break
  threshold, hairline→cracked→shattered, maxing when a bone reaches 0 — a fracture never *loses* the
  limb). A part flagged `critical` (skull) is instant death.

**Consequences.** Data, not code, defines anatomy/weapons/armour — new creatures pick a plan and
set scalars (`naturalArmor` magnitude, `naturalWeapons` list). The single `naturalArmor` keeps
species toughness distinct (the plan can't, being shared); a future per-creature part override can
layer on top if the scalar feels coarse. `damage`/`baseDamage` weapon fields were consolidated to
one canonical `damage`. Guarded by `bodyPlans.test.ts` + `fractures.test.ts`. Not graph-checkable —
a data/runtime decision, not a call-edge invariant.

### ADR-025 [GAME]: Graded Wind via `windchilled` + Per-Pawn Upwind Wind-Shadow

**Status:** Accepted (2026-06-20).

**Context.** Wind was flavour: weather types carried a static `windStrength` and a drifting ambient
`wind` scalar that only slanted the visual overlay and biased storm transitions. It had no gameplay
bite on a pawn and no direction, so it could neither expose nor shelter. We wanted five graded degrees
(slightly→extremely windy) driving a real condition, plus walls/mountains casting a downwind "immune
zone".

**Decision.**

- **`windchilled` is a staged condition driven DIRECTLY** (instantaneous, like `encumbered`'s
  `driveEncumbrance`, not an accrued exposure meter): `driveWindchill(conditions, effWind)` snaps
  severity to the tile's felt wind each tick. Five stages in `conditions.jsonc`; a nuisance-only
  debuff (DEX/move/work, fatigue ↑) with no `lifeThreatening` stage — danger comes only via the cold
  it amplifies.
- **Windchill couples to cold** — felt wind multiplies cold exposure in `PawnStateMachine`
  (`WIND_COLD_EXTRA`), the same hook wetness uses, so wind genuinely hastens hypothermia. It never
  adds heat (summer wind is relief, already in the type's `tempDelta`).
- **Wind gets an 8-way direction** (`WeatherState.windDir`) that drifts on day boundaries alongside
  the ambient-wind walk; ships free in the existing whole-object weather snapshot section.
- **Wind-shadow is computed PER-PAWN by ray-marching upwind**, not as a precomputed tile field.
  `windShelterAt` walks `WIND_SHADOW_LEN` (~4) tiles upwind from the pawn; the nearest impassable
  tile (`walkable === false` — mountain/cliff/built wall) gives `1 − (i−1)/len` shelter (full directly
  leeward, fading out). `effectiveWindAt` = `ambientWind` × (1 − roof weatherProtection) × (1 − lee
  shelter).
- **`ambientWind(weather)`** = `max(weatherWindStrength, wind)` is the single source of truth shared by
  the WeatherCanvas slant and gameplay.

**Why per-pawn, not a field.** A precomputed wind-shelter field would be O(impassable tiles) over a
500×500 map dense with mountain walls — large and rebuilt whenever wind direction changes (daily).
Only pawns experience windchill and pawns are few (dozens), so an O(`WIND_SHADOW_LEN`) ray-march per
pawn per tick is far cheaper and needs no invalidation. The thermal field stays precomputed (keyed on
buildings, not the whole terrain). Guarded by `windchill.test.ts`. Not graph-checkable — a
data/runtime decision, not a call-edge invariant.

### ADR-026 [GAME]: Incremental-Only Terrain — No Full-Map Rebuild on a Delta

**Status:** Accepted (2026-06-22). Extends ADR-021 (§4c worldMap deltas) and ENGINE-PERFORMANCE §D/§E.

**Context.** At the 750×750 default map (562k tiles) every whole-map traversal on a terrain change is a
visible FPS crater. The sim already ships the *exact* changed tiles to the main thread as a
`worldMapDelta` (ADR-021 §4c), yet the renderer threw those coords away and re-derived the change set by
brute force: a 562k-tile ref-scan every redraw, a 562k-`setTile` `buildGameGrid` on *any* building change,
and a global `computeHiddenMask` BFS + `collectResourceEmitters` scan on *every* harvest/regrowth tick.
The earlier "incremental terrain" commit (`2539b52`) only persisted the grid — it still scanned and still
full-rebuilt on buildings. The principle was made absolute.

**Decision — a routine per-tick terrain change repaints ONLY the affected cells and their dependent
neighbourhoods; a full O(map) traversal is permitted ONLY on a genuine new-map load (worldgen / game-load
/ size change — the `worldMap` ARRAY ref is replaced).**

- **Single full-build seam.** `GameCanvas._fullRebuildTerrain()` is the *only* caller of `buildGameGrid`
  and `computeHiddenMaskState` (the whole-map builders). It runs on first build / new-map load and seeds
  every incremental baseline (mask state, building diff, blueprint, grove-emitter map). The per-delta path
  physically cannot reach the full builders — enforced structurally (see graph rule below).
- **Changed-tile channel.** A main-thread `mainTileDeltas` singleton mirrors the worker's `tileDeltas`:
  `simWorkerClient` records each `worldMapDelta` coord as it merges it; `redrawOverlayNow` DRAINS the
  coords and repaints just those cells via `applyTileToGrid` — no scan.
- **Buildings + blueprint are diffed,** not full-rebuilt: a placement/removal/deconstruct repaints its
  single footprint cell (`applyBuildingToGrid`); the blueprint preview repaints only the cells it left +
  now covers.
- **Hidden mask is updated locally.** `updateHiddenMaskAt` early-outs when no changed tile's *solid*
  topology flipped (harvest/regrowth/grass — the per-tick common case), and on a mining/terraform flip
  re-floods only the affected connected component (bounded by pocket size, never the whole map). The
  persisted `solid`/`exterior` grids make this possible.
- **Grove glows are incremental** — an emitter `Map<"y,x">` upserts/deletes per changed tile
  (`LightingService.emitterForTile`) instead of re-scanning.
- **GPU invalidation is per-chunk.** `renderer.setGrid(grid, dirtyTiles)` stamps only the §E chunks
  holding a changed cell (`markTerrainChunksDirty`); every other visible chunk keeps its cached VBO. A
  full rebuild (no `dirtyTiles`) bumps the global `cacheVersion` as before.

**Enforcement (graph-checkable).** A `restricted-callee` codegraph rule registered in
`codegraph.config.json` flags any caller of `buildGameGrid` / `computeHiddenMaskState` other than
`_fullRebuildTerrain`, so the per-delta path can never silently reintroduce a full rebuild — it's a
`graph:check` gate like ADR-008. Also guarded at runtime by `hiddenMaskIncremental.test.ts`
(local mask update matches a fresh full BFS) and the building-diff path.

### ADR-027 [GAME]: Dense Glyph Overlays Render via the Cached Chunk Path — No Per-Frame Rebuild

**Status:** Accepted (2026-07-05). Extends ADR-021 (terrain cache) + ADR-026 (incremental terrain) and
ENGINE-PERFORMANCE-II. Fixes the zoom-out pan stutter documented in BUGS.md.

**Context.** The terrain layer is cached in per-chunk VBOs (ADR-026 §E), rebuilt only on a delta — cheap
to redraw while panning. The **resource overlay** (trees/plants — the `resourceOverlay` / `showGroundBelow`
layering added in `02fd05e4`) shipped on the renderer's *dynamic* overlay path (`grid-renderer.renderGrid`
without a `cacheVersion` → `getVisibleTiles` + `generateBatchVertexData` + `uploadAndDraw`). That path was
designed for **sparse** overlays (a handful of pawn/item/building cells) that legitimately change every
frame. The resource overlay is **dense** (every forest/plant tile), so zoomed out — where the viewport
covers the whole map — it re-vertexed ~50–100k tiles **every frame while panning** (`overlay` = 230–290 ms,
`frameMax` up to 465 ms; measured in `perf.log`). Dropping the glyphs past a zoom (an LOD cutoff) fixed the
perf but left the map barren.

**Decision — a DENSE, static-between-edits glyph overlay renders through the SAME cached chunk machinery as
terrain, never the per-frame dynamic path.** The resource short + tall overlays are drawn via
`renderGlyphOverlay(..., chunkLayer)`, which passes a `cacheVersion` (+ `lightVersion`) into `renderGrid`,
routing them to `renderTerrainChunked` under their own chunk maps (`resourceChunks` / `resourceTallChunks`).

- **Shared invalidation signal.** The resource grids are rebuilt from the *same* changed tiles as terrain
  in `redrawOverlayNow` → `setGrid(dirtyTiles)`, so they reuse terrain's `gridVersion` / `lightVersion` /
  per-chunk `chunkDirty` — a stale glyph can never outlive a terrain edit, and a single harvest re-vertexes
  only its chunk, not the whole forest.
- **Safe to cache.** Resource glyphs carry no per-frame `animationOffset` (static geometry); growth-dimming
  and the snow/winter glyph swap ride the terrain rebuild, and fire flicker stays live via the `lightTime`
  shader uniform on the cached buffer. So the vertex buffer only regenerates on a genuine content/light change.
- **No LOD drop.** Because the cached redraw is cheap at any zoom, resource glyphs draw at ALL zoom levels
  (the earlier `RESOURCE_OVERLAY_MIN_PX` cutoff was removed).

**Enforcement (NOT graph-checkable — a perf counter instead).** This is a *runtime argument* property, not
a call edge: `renderGrid` always contains both the cached and dynamic branches, and which runs depends on
whether `chunkLayer`/`cacheVersion` is passed — a regression drops that argument without changing any graph
edge. It is the same class as ADR-021's terrain cache (also `checkable: false`), so codegraph cannot gate
it. Instead it's flagged by the **`resourceRebuilds=` counter in `perf.log`** (`renderer-core` tallies
resource-chunk rebuilds/frame): ~0 on a steady pan when cached, but a nonzero value **every frame** the
moment the overlay reverts to the per-frame rebuild path — the exact stutter, visible within one perf
window. Registered in `codegraph.config.json` as `checkable: false` so `graph:check`'s `adr-coverage` rule
accounts for it.

### ADR-028 [GAME]: Typed Trait Kinds + Condition Relationship Graph (TRAIT-SYSTEM-V2)

**Status:** Accepted (2026-07-06). Extends ADR-023 (condition-backed traits) and ADR-024 (body plans).
Spec: `docs/tasks/archive/TRAITS-2026-07-10.md`.

**Context.** Trait payloads were an untyped `effects` bag, so nothing enforced *what kind* of thing a
trait could do — which produced gamification the design rejects (`iron-skin` stacking +CON/−DEX/+mining%
on top of 18 armor; `one-eyed` as a −PER number instead of a missing eye). And every condition
*interaction* (wet→hypothermia, pain/blood→shock, envenomed secondaries) was hardcoded in
`tickConditions`, so designers couldn't author new ones.

**Decision — every trait declares a `kind` that fixes its payload shape, and condition interactions are
data edges.**

- **`kind` taxonomy** (`stat` / `attribute` / `bodyMod` / `naturalGear` / `passive` / `wound`; reserved:
  `behavioral` / `needs` / `transformation`) with **rarity as a budget** on the full `rarities.jsonc`
  scale: common/uncommon = the mundane pool, rare/epic must carry a real capability, legendary must bundle
  `subCapabilities`. `stat` and `attribute` are **strictly separated** — an `attribute` trait never carries
  a core-stat rider — and a **naming law** forbids a `stat`/`attribute` name from evoking a natural
  weapon/armor or a losable body part (only the body-touching kinds may). Enforced by `traitRegistry.test.ts`
  (`ANATOMY_NAME_RE` + separation + regression-guards the gamification purge).
- **`negative` — a FLAW tier + Gaussian flaw count.** Pure-downside traits carry `rarity:"negative"`,
  are excluded from every positive pool (identity/variety/personal), and a pawn draws a bell-curve COUNT
  of them (`round(|Gaussian(0, σ=1.25)|)`, clamped 0–4) — most pawns carry none/one, a four-flaw wretch
  is ~0.6%. Independent of the ≤5 positive budget; conflict-group-honouring. `σ` is the one tuning knob.
- **`bodyMod` — traits that reshape the body, not a stat.** A dense/brittle skeleton or a thick/thin hide
  is a real limbmap change (`applyTraitBodyMods` scales bone maxHp = the fracture budget, or flesh maxHp =
  wound tolerance; plus a body-weight delta → blood pool + encumbrance), so `heavy-boned` is `hpMult 1.4`
  on the skeleton, NOT a `+CON/blunt_resistance` fudge. This is the realism-first answer to "an armor/bone
  name must be backed by a body mechanic."
- **Natural armor IS gear.** The granting condition carries `grantsNaturalArmor` (defense) + `mode` +
  a **`carryPenalty`** (0–1): `'replace'` occupies its blocked slot and competes best-of like a worn
  layer (thick fur IS the bodyMid layer); `'stack'` ADDS to the worn soak (scaled hide under a cuirass).
  The armor is worn permanently, so it eats a **fraction of carry capacity** (`getCarryBudget` reduced,
  clamped ≥40% of base) — **not** absolute added kg (rev 2026-07-07: a fixed weight could exceed a weak
  pawn's whole budget and encumber it forever while bare). A bare pawn is never encumbered; it just
  hauls less. Rarity is tier-gated so the strong ones are rare (iron skin at **epic**, ~1.1%).
- **Rarity is tier-weighted.** A `mythic` tier sits between epic and legendary, and the per-race gate is
  one cumulative roll (rarest first) so a higher tier is genuinely rarer. The Amphibious bundle is
  mythic (a "dragon-heritage lite"); a plain work-affinity was forked off as the mundane `waterborn`.
- **Uncareable wounds.** A PERMANENT scar or a DESTROYED non-bleeding part (a lost limb) can't heal or be
  dressed; `Wounds.isUncareable` gates tending + infection so a lost limb doesn't spin an infinite
  tend loop or fester endlessly (a still-bleeding stump is still an emergency). `recomputeWound` carries
  `permanent` across merges so a scar can't heal off; the health tab renders it as an "old <type> scar".
- **Physique gate.** A trait's optional `requires` (weight/height/build predicate) is checked per-pawn
  in `drawPawnTraits` against the rolled physique, so a physically-contradictory trait can't land
  (Gaunt never on a 250 kg mass, Stocky never on a wisp).
- **Natural weapons are limb-bound.** A trait's natural weapon lists `hostParts` on its condition
  (claws→hands, horns→head, fangs→jaw); `Combat.pawnNaturalWeaponIds` yields it only while a host part
  survives — a pawn loses its claws with its hands, exactly like a creature's part-gated `weapons`
  (`enabledNaturalWeapons`). Natural armor was already per-part (`armor` share), so it needed no change.
- **Afflictions are real wounds.** A `wound`-kind trait stamps a PERMANENT, healed-over injury at
  generation (`applyTraitWounds`: bleeding 0, fully clotted, `Injury.permanent` — skipped by
  healing/infection/caretaking, and allocation-guarded so an all-permanent limb keeps its array ref).
  Never lethal: vital/critical parts refused; `destroyed` on a container/bone downgrades to critical.
  One-eyed = a destroyed eye → `sight` capacity falls out of the body model, not a −PER fudge.
- **Condition relationship graph** (weather-style): `flags` (taxonomy), `triggers`
  (`{to, when, chance?, severity?/durationHours?, per}` — a **chance-less edge is deterministic**, which
  is how the shock-from-pain/blood certainty is preserved), `activateWhen` (environment gating,
  generalising photosynthesis/light-sensitivity). Pure allocation-free evaluator in `conditionGraph.ts`,
  cheap-gated by `CONDITION_IDS_WITH_TRIGGERS`. Continuous meter-driven severities (shock, infection)
  stay code and are flagged `driver` — forcing them into accruing edges would change behaviour.
- **TRAIT-LIBRARY-EXPANSION (2026-07-07, spec `docs/tasks/archive/TRAITS-2026-07-10.md`)** — the
  methodical build-out of the pool (~300 new traits) plus the mechanics it forced:
  - **`effects.combatMods`** — combat statId → multiplier, applied by `PawnStatService.evaluateStat`
    to combat-category stats only (the combat twin of `workSpeed`). Combos always pair two axes;
    never a lone stat.
  - **Resistances are earned, never abstract** — an `attribute`-kind trait may NOT carry a resistance
    key (registry-enforced); resistance lives only on `naturalGear` coverings (fur/scale/chitin/
    plumage) and `passive` affinities. The old thermal/toxin attribute traits were re-kinded passive.
  - **Bloodletting = a non-clotting wound, not a condition** (renamed 2026-07-08 from `bleedWound`,
    which misleadingly implied "wounds that bleed" — most cut/pierce wounds already do). Item-level
    `bloodletting` (0–1 chance) marks a landed open wound `Injury.bloodletting`: it never advances clot
    stages (skipped by `rollWoundClotting`, `clotRemaining` stays 1) and bleeds at full rate until
    DRESSED — a real injury, not a timed pill. Ordinary wounds are UNTOUCHED (they clot as before); only
    the flagged minority don't. The retired `bloodletting` *condition*'s users (claws/talons/fangs/
    feeding weapons + deep-cutting blades) were repointed to the weapon field. The info-only `bleeding`
    pill (empty modifiers — never a gamey stat hit) already lists the seeping wounds and now flags which
    are bloodletting ("won't clot, needs dressing").
  - **Shock split into `pain_shock` + `hypovolemia`** (2026-07-08) — the old unified `shock` conflated
    "in agony" and "bled white" into one confusing pill. `applyShock` now drives two reflected
    meter-conditions independently: `pain_shock` from pain past onset (dulled by painkillers/drink) and
    `hypovolemia` from blood lost past onset (unaffected by numbing — it's emptiness). Each carries HALF
    the old shock stat debuff (`newMult = (1+old)/2`); when both fire they stack (× in
    `conditionStatMultipliers`) back to ≈ the old crisis, now legible as two distinct causes. Signature
    unchanged, so both the pawn and mob tick callers are untouched; non-lethal (collapse/death still runs
    off consciousness, not these).
  - **Breath weapons are reach procs** — natural weapons may carry `reach` (dragonfire reach 3 =
    spear-like ranged strike; `meleeReach`/`attackerProfile` are reach-aware) + `knockback`, deal FIRE
    (a real burn wound) and proc the `burning` DoT. TODO: upgrade reach-3 to a true AoE cone.
  - **`feasted` shared blood-feast** — any successful `bloodDrain` stamps a strong ~30-min buff on the
    FEEDER (pawn or mob), non-refreshing while active (the anti-perma-keep cooldown).
  - **À-la-carte body composition** — a trait may `grafts` limbs (with parts from the GLOBAL limbmap
    catalog) onto a pawn's humanoid tree (`applyTraitGrafts`): wings/tail are REAL limbs — hittable
    (`rollBodyPartOf` rolls the plan table minus lost parts plus grafted extras), losable, and the
    hosts for the trait's gear. No `*-kin` whole-plan swap — a winged pawn keeps its humanoid feet.
  - **Utility natural gear** — `naturalGear` whose condition grants a host-gated BENEFIT instead of
    armor (wings → `moveSpeed` while a wing survives; `syncTransientConditions` drops the pill when
    every host part is gone) at a slot cost (`blocksSlots`).
  - **Amputation wounds** — a wound spec with `amputate: true` removes the whole (non-vital) limb at
    generation; a destroyed non-vital container (hand/foot) takes its contents. Head/torso stay whole
    (the same non-lethal cap).
  - **Auras (§6a)** — `trait.aura {condition, radius, affects, lingerSeconds}`: a THROTTLED pass
    (`tickAuras`, every ~3 s, early-out without bearers) stamps the condition as a lingering timer on
    pawns/mobs within a FINITE radius. Auras exist only as heritage sub-capabilities, in ONE
    mutual-exclusion conflict group (≤1 aura per pawn).
  - **Eleven heritage trees + the cursed lineage** — Stoneblood/Echoborn/Sporeborn/Shellblood/
    Spiderblood/Stormborn/Shadeborn/Colossus/Wildblooded/Farseer/**Blighted** (the dark mirror,
    housing the all-stats grand curses as sub-capabilities; the grand BLESSINGS are epic/mythic/
    legendary single stat traits). Shared lines across trees (§4.0) — e.g. Adrenal rides
    Ursine/Colossus/Berserker; **creatures can carry the S1 rung** (`CreatureDefinition.traits`,
    resolved at spawn — orc_reaver → Adrenal).
  - **`stage` (1|2|3) + 3-link `evolvesTo` chains** on every gear line — data flags for the future
    age/ritual evolution walk (registry-tested for ordered chains). `evolutionTrigger` itself waits
    on the age system.

**Enforcement (NOT graph-checkable).** A data-schema + payload-shape invariant, not a call-edge one:
guarded by `traitRegistry.test.ts`, `conditionGraph.test.ts`/`conditionGraphData.test.ts`,
`traitWounds.test.ts`, and `traitExpansion.test.ts` (combatMods/grafts/amputation/bleed-wound/aura).
Registered in `codegraph.config.json` as `checkable: false`.

### ADR-029 [GAME]: Anatomy-Bound Natural Gear + Layered Subtractive Armour + Unified On-Hit Procs

**Status:** Accepted (2026-07-08) — supersedes ADR-024's natural-armour model (share × scalar →
per-part additive + layered subtractive) and refactors the natural-gear *condition* indirection of
ADR-023/028 (gear moves onto the trait/anatomy; conditions become trigger-only).

**Context.** An audit of traits/conditions/natural items found four schema smells. (1) Natural weapons
AND armour are granted through an intermediate `selfCondition` (`grantsNaturalWeapon`/
`grantsNaturalArmor`) — a hand-maintained restatement of a binding the anatomy already carries
(`part.weapons`): 33 weapon + 16 armour conditions, whose `hostParts` duplicate the part-gate for the
28 weapon ids not listed on any part. (2) Worn armour was **best-of, body-wide**: `partArmorReduction`
kept the single highest `defense` across ALL worn slots and applied it to any hit — a breastplate
stopped a headshot — with **no slot→part coverage map anywhere**. (3) On-hit procs split across
encodings — structured `onHitEffect` (stamps a condition) vs a bare `bloodletting` field (flips a wound
flag) vs `weaponProperties.knockback` — with `item.onHitEffect`/`TraitOnHitEffect` declared twice.
(4) Natural weapon = a real Item; natural armour = a bare number synthesised into a fake item for
display. `part.armor` was a 0–1 *share* × a scalar magnitude, so realistic belly-softness was an
accidental proportional artefact, un-tunable without restructuring limbs.

**Decision.**

- **Natural weapons bind to anatomy, not conditions.** A trait `grafts` the part (existing
  `applyTraitGrafts`); `part.weapons` (limbmap) is the single source AND host-gate — losing the part
  loses the weapon for free. The parallel `grantsNaturalWeapon`/`hostParts` restatement is retired.
  Natural weapons stay real `natural_weapon` Items (stats + procs); the vestigial `maxDurability`/
  `deteriorationRate`/`weightKg`/`volumeL` boilerplate is stripped.
- **Natural armour is per-part, additive, and unified pawn ↔ creature.** One field on BOTH `Trait`
  and `CreatureDefinition`: `armorMods: [{target, defense}]` (`target` = a part id, a limb group, or
  `all`), with `naturalArmor: n` kept as uniform sugar. `cond.grantsNaturalArmor` is deleted.
  *(As shipped:* the scalar still distributes by the limbmap `part.armor` share — points at a part =
  `naturalArmor × share + Σ armorMods` — so a uniform hide keeps its soft belly for free, and
  `armorMods` is the explicit, intentional per-part override (carapace back 20 / belly 4) that makes
  weak spots authored rather than accidental. A full share→absolute re-author was judged not worth
  re-balancing every plan.)*
- **Layered SUBTRACTIVE mitigation (CDDA-style, deterministic).** `partArmorReduction` is rewritten:
  roll the struck part, then walk the covering layers **outermost → in**; each piece subtracts its
  FULL defense (damage points) from the running damage; the remainder passes to the next layer down,
  then to flesh. **`armorPenetration` is a flat BYPASS fraction**: that share of the weapon's damage
  ignores armour entirely (a 0.25-AP bodkin always lands 25% through any plate); only the remaining
  share is blockable. Wound TYPE comes from the weapon's `damageType`; SEVERITY from the
  leftover damage; then `onHitWound` procs roll. Full-stop is intrinsic (damage − defense ≤ 0 ⇒ no
  wound). No RNG deflect, no sharp→blunt downgrade, no coverage roll. **Skill-biased location** (the
  CDDA crit-zone loop) completes it: at the attacker's full CRIT chance (the `crit_chance` stat +
  weapon critMod — one chance, two payoffs) the attacker rolls two extra candidate locations and
  takes the least-armoured — full negation is beaten by finding the gap (eye/throat/belly) or a
  piercing weapon's bypass, not by grinding raw damage through plate.
- **Coverage is binary and PER-ITEM.** `armorProperties.covers: [partId…]` names the parts a piece
  protects — a mail shirt covers the shoulders, a leather vest (same `bodyMid` slot) does not. The
  **slot** sets the layer order (`Outer → Mid → Base`) + equip-conflict; **`covers`** sets the parts.
  Natural armour's `armorMods.target` is the same coverage notion. No CDDA coverage % / RNG slip.
- **Conditions are trigger-only.** With weapon/armour off conditions, the always-on natural-gear pills
  are gone; a transient condition must carry a dynamic trigger (`activateWhen` / host-gate / meter
  `triggeredCondition` / combat-stamp). Continues the ADR-028 "no always-on condition" invariant.
- **On-hit procs = two structured lists sharing one shape.** `onHitEffect` → **`onHitCondition`**
  (stamps a transient condition: venom/burn/knockdown). NEW **`onHitWound: [{wound, chance}]`**
  (inflicts a wound-flag — `bloodletting`/`infected`/… over the 7 wound types), retiring the bare
  `bloodletting` field and unifying the two hybrid feeders (`proboscis`/`bloodsucking-fangs`).
  `item.onHitCondition`/`TraitOnHitEffect` fold into ONE named type.
- **Exposure.** The gear-tab tooltip gains a **"Covers:"** row + per-part defense (so "def 3" reads
  "def 3 → head, neck"); the health/body view shows each part's TOTAL armour (intrinsic + natural +
  worn), so the layered result is legible.

**Consequences.** A combat rewrite + data migration: `partArmorReduction` (subtractive/layered), every
limbmap `part.armor` (share→absolute intrinsic), `creature.naturalArmor` + the nat-armour conditions →
`armorMods`, a `covers` list on armour items, and a `pnpm threat` re-derive of the creatures.jsonc
annotations. Bigger, but phased (coverage map + soak first). Natural gear finally has ONE model each:
weapon = Item + `part.weapons`; armour = per-part additive layer.

**Enforcement (NOT graph-checkable).** Data-schema + combat-runtime invariants, not call edges —
guarded by `partArmorReduction` unit tests (coverage, layering, full-stop, AP), `traitRegistry.test.ts`
(armorMods/covers shape), and the proc tests. Registered in `codegraph.config.json` as
`checkable: false`.

### ADR-030 [GAME]: Desktop Wrapper — Electron over Tauri

**Status:** Accepted (2026-07-09). Resolves the wrapper question left OPEN by ADR-020; updates the
"via Tauri" framing in ADR-007/008.

**Context.** ADR-020 deferred the desktop wrapper (Tauri vs Electron) to the DISTRIBUTION milestone,
noting the sim is single-thread JS either way so the choice hinges on engine uniformity vs bundle
size. Cross-engine TPS spikes in `desktop-spike/` measured the shipped-engine spread that mattered:
Electron's uniform Chromium/**V8** runs the sim materially faster than Tauri's Linux WebView
(WebKitGTK/**JSC**) — the sim is JS-execution-bound, and V8 wins that by a wide margin. Tauri's tiny
bundle + Rust synergy don't offset a sim that runs slower on the exact platform most players use.

**Decision.** **Ship on Electron.** Dev and the desktop build target Electron (root `package.json`
builds via `electron` + `electron-builder`, `main: electron/main.cjs`); the Tauri spike is kept only
as a cross-engine test canary in `desktop-spike/tauri`. WASM (spatial core, ADR-008) and the Web
Worker sim (ADR-021) are wrapper-agnostic and unaffected — they were designed to run under any
webview, so nothing in the sim/render architecture changes with this choice.

**Consequences.** Uniform V8 across all platforms (no three-engine perf spread to test against),
Node available in the shell, at the cost of a larger bundle / +150–250 MB RAM (accepted — a desktop
colony sim, not a web page). The ADR-020 rejection of *forking* Chromium still holds; using stock
Electron does not. Not graph-checkable — a distribution/runtime decision, not a call-edge invariant.

### ADR-031 [GAME]: Precision-Routed Vitals + Per-Fight Natural-Hide Degradation

**Status:** Accepted (2026-07-10). Extends ADR-029's subtractive armour with its two counters
(CREATURE-COMBAT-OVERHAUL Phase 1).

**Context.** Under ADR-029, a tank's flat per-part soak made armour a binary: a weak weapon did 0
through a bear's hide forever, a strong one went near-full — nothing in between, no way to *earn* a
kill. The locked decision: keep armour subtractive and high; dissolve the binary with counters
(placement, attrition) and soft targets, not by shaving the scalars or going percentage-based.

**Decision.** Three interlocking rules in `systems/Combat.ts` + `database/limbmap.jsonc`:

1. **Soft targets everywhere.** The shared `neck` (armor 0, hard bleed) joins every standard beast
   plan's head limb, and humanoids gain a `groin` (armor 0.1); each holds a non-vital artery organ
   (`carotidArtery`/`femoralArtery`, small + high `bleedRatio`, flagged `artery`) reachable ONLY by
   the organ-penetration roll — nicking one opens an **unclottable** bleed (`bloodletting`: flows
   until a caretaker dresses it, never self-clots), so a slit throat is a slow bleed-out kill rather
   than the instant kill a vital organ (brain/heart) would be. ADR-029's gap-aiming now has a real
   gap on every body.
2. **Precision routes to vitals.** The organ-penetration and fracture chances are each multiplied by
   `(1 + critChance × K)` (`K_PRECISION_ORGAN 6`, `K_PRECISION_FRACTURE 4`), where critChance is the
   attacker's `hit_precision` stat + weapon `critMod` — the same number driving crits and gap-aiming.
   Existing caps still bound the rolls. A deft fighter (or crit-prone stiletto) beats armour by
   placement; armour stays a wall to mooks. Organs weigh heavier than bone by design (a guided blade
   finds a kidney more readily than it cracks a femur).
3. **Hide wears down per fight.** Every landed hit chips the struck part's natural soak by the SAME
   armour-wear number worn gear takes (`weapon.armorDamage × armor_damage stat` — one wear model),
   accumulated in `Mob.hideWear[partId]` (capped at the part's full soak) and subtracted by
   `naturalArmorPoints` while fresh. Wear EXPIRES `HIDE_WEAR_RESET_TICKS` (750, ~an in-game hour,
   mirroring the mob clot cadence) after the last chip — per-fight attrition, not permanent maiming.
   So a long fight against a tank is a durability race: your weapon and armour wear down (ADR-029
   gear wear) while its hide opens up.

**Perf (ENGINE-PERFORMANCE cross-checked).** All new work is event-rate (landed hits only): the chip
routes through `spliceEntity` (copy-on-write combat path), wear reads are a Record lookup inside the
existing per-hit armour math, and a peace tick allocates nothing. `hideWear`/`hideWearAt` are dropped
from the sent snapshot (`entityProjection.ts` ENTITY_DROP) — worker-only scratch.

**Consequences.** Signature tanks got their first `armorMods` (soft bellies on bear/owlbear/croc/
quillback, hardened cephalothorax on the thornwood spider), so aimed attacks have authored weak
points. Not graph-checkable — combat-runtime math + data-schema, not a call-edge invariant; guarded
by the combat suite (`combatSim`, `creatureDurability`, `entityProjection` tests).

### ADR-032 [GAME]: Stealth as a Detection Filter on Existing Mob Vision (not a new subsystem)

**Status:** Accepted (2026-07-14). Implements STEALTH (design locked 2026-07-10; the spec drafted
this as "ADR-031" before that number was taken).

**Context.** A specialised sneak build — small, deft, lightly-armoured, one devastating opening
strike, then break contact and re-approach — needs a "creature notices pawn" gate. The trap to avoid
is a parallel spatial/awareness subsystem with its own per-tick sweep.

**Decision.** Stealth is a **filter inserted at the existing `inVision` gate** in `entityAI.stepOne`:
a pawn inside a mob's (light- and weather-shortened) vision range WITH line of sight must also pass
`isPawnDetected` — a per-mob-pawn roll of the mob's perception/night-vision detection score against
the pawn's stealth value, with a flat proximity term (+25 % adjacent vs the vision border), rolled at
most every ~2 s (jittered) and cached in `Mob.stealthChecks` between rolls. Undetected pawns are also
skipped by `nearestPawn`, so a stealther can't body-block aggro for a visible ally.

- **The stealth value is two-layered, mirroring night vision**: a `stealth` stat in `stats.jsonc`
  (`sizeFactor(weight) × dexGate(hard zero ≤ DEX 8) × moving` — the formula engine gained `clamp()`
  for the hard gate) plus flat additives summed in `core/stealth.ts` (trait `effects.stealth`,
  living-part `grants.stealth`, worn `armorProperties.stealthMod` or a derived −0.03/kg weight drag,
  and −0.04 per point of trait `naturalArmor` — the beast tanky↔stealth fork falls out of the pelt
  itself). `evaluateStat('stealth', pawn)` folds both layers (same stat-specific augmentation
  precedent as `attack_speed`'s weapon mult).
- **The reward routes through the existing `resolveHit` crit**: an attacker the defender has not
  detected multiplies `hit_precision` ×3.5 before the weapon's `critMod` adds — melee and ranged
  share the path, so a blowgun sneak-shot needs no extra plumbing. The landed hit **auto-reveals**
  (self + packmates within 12 tiles sharing a lair/party) — no chain-backstab.
- **Re-stealth reuses the give-up path**: abandoning a hunt clears `stealthChecks` alongside
  `lastSeen*`; elsewhere a detected entry expires after ~30 s unseen.

**Perf (ENGINE-PERFORMANCE cross-checked).** No new spatial sweep — the roll rides the existing
LOS-gated scan; failed rolls are cached on a jittered `Until` timestamp (no per-tick re-rolling); the
common path costs one `nearestPawn` + one LOS exactly as before, with extra iterations only while an
actual stealther is in sight. `stealthChecks` mutates in place (ADR-002 cold field) and is dropped
from the sent snapshot (`entityProjection` ENTITY_DROP).

**Consequences.** The aggro-acquisition contract changed: detection is always-on and probabilistic
for every pawn (a default pawn is ~9 % per check at the vision border, ~34 % adjacent), so mobs no
longer acquire instantly — headless FSM tests stamp their fixtures as pre-detected, and an encounter
balance pass is owed. Sight-only detection makes dull-eyed predators easy to sneak and sharp-eyed
grazers hard; the hearing/smell channel is parked for Phase 2 along with screen-invisible stealthy
creatures. Guarded by `core/stealth.test.ts` (layers, roll math, §9 constraint audit) and
`traitRegistry.test.ts`.

---

### ADR-033 [GAME]: Headless, API-Driven Sim — dev-only in-thread driver over the existing engine + command registry

**Status:** Accepted (2026-07-18) — implemented same day (Phases 0–5; Phase 6 GUI-attach open). Full
plan + outcomes in [HEADLESS-SIM](../tasks/open/HEADLESS-SIM.md). Implementation note: the replay
guarantee hardened into a byte-identical contract — every sim-path id is now turn-derived (no
`Date.now()`), and module counters/cooldowns (`_pawnDebugIdCounter`, mob `idCounter`, social dialog
maps) reset per session.

**Context.** The content past the stone age is large and only reachable after an hour+ of play, so it is
chronically under-tested — the developer always re-tests early game and never fast-forwards into bronze/iron+.
The `~800`-test Vitest suite asserts exact values, so it goes stale on every rebalance and has never caught a
real bug. Golden-screenshot regression (the Prime-video inspiration) is the wrong fit: this game's option
space is combinatorial, not a fixed tower-defense path. Two problems were being conflated — **reachability**
(getting to the state you want to exercise) and **regression detection**.

**Decision.** Add a **dev-only headless mode**: a `HeadlessSession` that owns its own `new GameEngineImpl()`
and drives the sim **in-thread** (bypassing `sim.worker.ts`/`simWorkerClient.ts`), started from a declarative
**Scenario** (or a serialized-`GameState` snapshot), steered by the **existing** `sim/commands.ts` `COMMANDS`
registry via `applySimCommand`, and exposed over **dev-only SvelteKit routes** (`/api/sim/*`) that both a human
(`curl`/GUI) and an agent drive identically. This is deliberately **not** a new engine — it wraps code that
already runs DOM-free (`GameEngineImpl.processGameTurn` is a pure reducer; Vitest already ticks it headless).

- **In-thread, synchronous** — the worker is fire-and-forget; a request/response API needs apply-then-read, so
  the session calls the engine directly and reads `getState()` back.
- **Single active session per process (v1)** — `core/rng.ts` is a module singleton; interleaving sessions
  would clobber the shared RNG stream and break determinism. Multi-session deferred.
- **Reachability** is served by the Scenario builder (generalises `dev/profilerScenario.ts`) + an expanded
  `dev*`/godmode surface (grant stats/skills, spawn gear, unlock research, **per-need on/off toggles** via a
  new `_needsDisabled` GameState flag guarded in `processNeedsTick`). **Regression** is served by
  **invariants, not goldens** — properties asserted over a fast-forwarded scenario (no negative resources,
  item conservation, no frozen pawn, seed-replay determinism) that survive rebalances.
- **Guarded three ways** so it never ships and never auto-runs: dev-only (`import.meta.env.DEV`, 404 in prod —
  absent from `build.sh`), inert until `POST /api/sim/session` (so `./launch.sh` boots nothing extra), and
  behind a `--headless` opt-in flag on `dev.sh`.
- **One blocker (Phase 0):** the WASM pathfinder is gated off under Node (`isClientRuntime === false` →
  `findPath` returns `[]`), so pawns won't navigate headless. Fix by loading a Node-target `spatial-core`
  build — **not** a hand-rolled TS A\*, which would diverge in tie-breaking and desync movement from the real
  client, defeating determinism parity.
- **Optional (Phase 6):** the browser GUI can attach as a thin client (worker sim off, state streamed from the
  server into the existing `onState` seam) so the developer can watch an agent play, with the server as sole
  writer.

**Consequences.** The one scenario-built-`GameState` primitive serves three consumers: the interactive HTTP
driver, the in-game `DebugMenu`, and the invariant suite. Late-game content becomes reachable and testable in
seconds; the regression net stops going stale. Cost: a Node-target WASM path, one new dev-only route surface,
and the discipline that headless stays in-thread and dev-only so it adds **zero** per-tick allocation or
snapshot fields to the shipped browser/worker path (ENGINE-PERFORMANCE cross-check on any hot-path/boundary
touch). Not graph-checkable — it's a dev-tooling/runtime-topology decision, not a call-edge invariant.
