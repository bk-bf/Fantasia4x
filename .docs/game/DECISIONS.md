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
ADR-012 [GAME]: Combat Wound Model — Merge-and-Escalate + Capacity-Driven Downing (2026-06-11, Accepted)
ADR-013 [GAME]: Deferred Combat Depth — Tissue Layers, Nerves & Arteries (2026-06-11, Deferred)
ADR-014 [GAME]: Hard Tile Occupancy via Central OccupancyService (2026-06-12, Accepted)
ADR-015 [GAME]: Single Work Model in stats.jsonc — supersedes ADR-003 for work (2026-06-13, Accepted)
ADR-016 [GAME]: Physical Production — reserve-and-fetch crafting (2026-06-13, Accepted)

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

---

### ADR-012 [GAME]: Combat Wound Model — Merge-and-Escalate + Capacity-Driven Downing

- **Date**: 2026-06-11
- **Status**: Accepted
- **Spec**: [.tasks/open/COMBAT-SYSTEM.md](../.tasks/open/COMBAT-SYSTEM.md)

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
- **Status**: Deferred (tracked)

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
- **Spec**: [.tasks/archive/PHYSICAL-PRODUCTION-2026-06-13.md](../.tasks/archive/PHYSICAL-PRODUCTION-2026-06-13.md) (archived — shipped)

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
