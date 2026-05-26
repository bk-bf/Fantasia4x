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
