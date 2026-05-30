<!-- LOC cap: 200 (created: 2026-05-25) -->

# DECISIONS [GAME]

> **Related:** [ARCHITECTURE](ARCHITECTURE.md) · [DESIGN](DESIGN.md) · [PHILOSOPHY](PHILOSOPHY.md)

ADR-001 [GAME]: Layered Architecture with Singleton Services (2026-05-25, Accepted)
ADR-002 [GAME]: GameStateManager as Only Mutation Surface (2026-05-25, Accepted)
ADR-003 [GAME]: ModifierSystem for All Stat Calculations (2026-05-25, Accepted)
ADR-004 [GAME]: AI Generation Server-Side Only (2026-05-25, Accepted)
ADR-005 [GAME]: LocalStorage Persistence via Store (2026-05-25, Accepted)
ADR-006 [GAME]: Data Files Contain Definitions, Not Logic (2026-05-25, Accepted)
ADR-007 [GAME]: SvelteKit + WebGL2 over Godot for Merged Project (2026-05-26, Accepted)
ADR-008 [GAME]: Rust/WASM Spatial Core via wasm-pack (2026-05-26, Accepted)
ADR-011 [GAME]: Gated Hot-Path Logging + On-Demand Tick Profiler (2026-05-30, Accepted)

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
- **Status**: Accepted

#### Context

Direct field assignment to `GameState` objects produced hard-to-trace bugs and inconsistent derived state.

#### Decision

`GameStateManager` (in `core/GameState.ts`) is the sole mutation point. It uses spread-operator updates (`{ ...state, ...patch }`) to produce new state objects. Services and the engine call its methods; nothing else writes to state.

#### Consequences

State transitions are predictable and traceable. Enables future undo/redo or time-travel debugging.

---

### ADR-003 [GAME]: ModifierSystem for All Stat Calculations

- **Date**: 2026-05-25
- **Status**: Accepted

#### Context

Work efficiency and pawn ability bonuses were being computed ad-hoc in multiple files with no audit trail.

#### Decision

All bonus/penalty calculations go through `ModifierSystem`. Every result includes `sources[]` — an array of `{ description, value }` objects explaining each contribution. UI can display the full breakdown.

#### Consequences

No manual flat-sum arithmetic for stats. Bonus sources are inspectable by the UI. Adding a new bonus source is a one-line change in the modifier method.

---

### ADR-004 [GAME]: AI Generation Server-Side Only

- **Date**: 2026-05-25
- **Status**: Accepted

#### Decision

Gemini API calls (`@google/generative-ai`) live exclusively in `src/routes/api/`. Client-side code calls the SvelteKit API route via `fetch`. This keeps API keys out of the browser bundle and centralises prompt logic.

---

### ADR-005 [GAME]: LocalStorage Persistence via Store

- **Date**: 2026-05-25
- **Status**: Accepted

#### Decision

The Svelte `gameState` store in `src/lib/stores/gameState.ts` handles serialisation/deserialisation to `localStorage['fantasia4x-save']`. No other code reads or writes this key.

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

Stay in SvelteKit + WebGL2, targeting desktop distribution via Tauri. Celestia's game logic (pawn state machine, needs, mood, work priorities) will be ported into TypeScript services. Pure spatial computation (pathfinding, fog of war, spatial queries) will be implemented in Rust and compiled to WASM via wasm-pack, exposed through TypeScript service interfaces (see ADR-008).

#### Rationale

- Fantasia4x has ~17k lines of well-architected TypeScript game logic (modifier system, service layer, state manager, research/crafting trees) that would be discarded in a Godot migration.
- SvelteKit UI development is dramatically faster with AI-assisted coding than constructing Godot UI nodes manually — this was a hard blocker in Celestia's development.
- The existing WebGL2 renderer is already tile-grid based, which is exactly the visual model for DF/CoQ style.
- TypeScript's type system handles complex data modelling (30+ interfaces in `types.ts`) far better than GDScript.
- Tauri bundles to ~3–5 MB (vs Godot's native export overhead) and web deployment stays zero-friction.
- For the planned entity count (see ADR-008), TypeScript A* is sufficient.

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

---

### ADR-008 [GAME]: Rust/WASM Spatial Core via wasm-pack

- **Date**: 2026-05-26
- **Status**: Accepted — implemented starting at Phase 3 of DF-MIGRATION

#### Context

Phase 3 of the DF migration ports the full pawn state machine from Celestia, meaning all entities (50 player pawns + enemies + animals + allies) run concurrent pathfinding requests every turn. Total mobile entities easily reach 200–400. This is at or above the threshold where a TypeScript implementation becomes a measurable bottleneck, and the state machine is being built now — deferring to a later rewrite is costlier than doing it correctly once.

Additionally, the project targets desktop distribution via Tauri, whose backend is Rust. The toolchain overlap makes Rust the natural fit.

#### Decision

Pure spatial computation is implemented in Rust, compiled to WASM via `wasm-pack`, and called from TypeScript through service interfaces. The Rust crate lives at `spatial-core/` in the project root.

**Rust handles exclusively:**
- `PathfinderService` — A* with binary min-heap, octile heuristic, terrain costs, diagonal wall-cut prevention
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
const walkable = new Uint8Array(width * height);   // 0 = blocked, 1 = walkable
const costs    = new Float32Array(width * height);  // movementCost per tile
```

`wasm_bindgen` accepts `&[u8]` / `&[f32]` as zero-copy views into the JS heap — no serialisation overhead. Path results are returned as `Vec<u32>` (interleaved x,y pairs) and decoded on the TS side.

#### Architecture constraint

All callsites depend on the TypeScript interface, never on the Rust implementation directly. This keeps the door open for a future HPA* upgrade or a pure-TS fallback for environments where WASM is unavailable (e.g. unit tests).

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
- **Spec**: [.tasks/open/SIMULATION-PERF.md](../.tasks/open/SIMULATION-PERF.md)

#### Context

`GameEngineImpl.processGameTurn()` runs `TICKS_PER_SECOND` (60) times per second; one tick = one `processGameTurn()` call. The sim could not hold 60 TPS even with a single pawn and almost nothing happening. Per-phase wall-clock profiling proved that hot-path `console.*` calls (many fired every tick, several per pawn) were **~75% of total per-tick cost** — at 1 pawn, TOTAL dropped from **6.7 ms → 1.5 ms** when console output was suppressed; the `pawns` phase alone went 5.0 ms → 0.40 ms. The cost is string interpolation + I/O (extra-expensive under a debugger/CDP) and it scales per-pawn, making it the single biggest blocker both to a steady 60 TPS and to large pawn counts. A reliable, low-overhead way to measure tick cost was also needed: live TPS read from the turn-counter delta is unreliable under CDP/Playwright (timer scheduling + HMR can stack duplicate `setInterval` loops and report >60 TPS).

#### Decision

**1. Gated logger (`core/log.ts`).** A module-level `enabled` flag (default `false`) backs `glog`/`gdebug`/`gwarn` (no-ops unless enabled) and a `gatedConsole` object `{ log, debug, info, warn }` plus an always-live `error`. Hot-path modules silence all per-tick logging with **one line** that shadows the global `console` for the whole file:

```typescript
import { gatedConsole as console } from '../core/log';
```

No call sites change. Applied to the per-tick services: `WorkService`, `PawnService`, `JobService`, `ResearchService`, `LocationServices`. Toggle at runtime from the dev console with `gameDebug(true)` (exposed via `globalThis.gameDebug = setGameDebug`); `isGameDebug()` gates any remaining heavy log-building (e.g. `GameEngineImpl.debugLogPawns()`).

**2. On-demand tick profiler (in `GameEngineImpl`).** `processGameTurn()` wraps each phase in a `t(label, fn)` timer that is a pass-through no-op unless `globalThis.__profileTurns` is set. Enable with `profileTurns()` / disable with `profileTurns(false)` in the dev console. Average phase timings print as `[PROF] {...}` once per in-game second and persist at `globalThis.__profOut`. A nested `[PROF-PAWN]` breakdown inside `processPawns()` is gated by the same flag. **Trust `__profOut` (wall-clock), not the TPS counter, for sim cost.**

**3. `GameEngineImpl` itself does NOT shadow `console`** — its `[PROF]`/`[PROF-PAWN]` output must always print when the profiler is toggled on, independent of `gameDebug`.

#### Consequences

- Steady **60/60 TPS** at current scale (1.2 ms/tick); diagnostics remain one keystroke away (`gameDebug(true)`).
- New hot-path code must add the `gatedConsole as console` import rather than calling the global `console` directly; profiler phases must be wrapped in `t(...)` to stay measurable.
- **Scaling caveat (flagged, out of scope here):** even console-free the tick is ~1.2 ms with a single pawn and per-pawn work scales linearly. Reaching 500+ entities on 1000×1000 maps needs deeper algorithmic work — spread/incremental work scheduling, spatial indices, and a cooldown index so resource regrowth isn't O(map). See the spec. 60 TPS is solid at the current scale.
- The formula is pure and stateless (`shouldInterruptForNeed` has no side effects), making it straightforward to tune constants in isolation.
