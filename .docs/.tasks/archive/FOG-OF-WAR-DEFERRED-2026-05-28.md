<!-- LOC cap: 300 (created: 2026-05-28) -->

# FOG OF WAR & VISION SYSTEM

> **Related:** [ROADMAP](ROADMAP.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [game/DECISIONS](../../game/DECISIONS.md)

## Origin

Derived from Celestia Phase 4 — Pawn Vision & Exploration System (all items unchecked in Celestia
roadmap). The WebGL renderer (Exiled, `src/lib/webgl/`) and WASM spatial core (`spatial-core/`)
are both in place; this spec connects them via a `VisibilityService` per ADR-008.

## Goal

- Every tile on the world map has one of three visibility states: **unexplored** (black),
  **explored-but-dark** (dimmed, greyscale), **currently visible** (full colour).
- Visibility is computed each turn from all living colony pawns' positions and vision radii.
- Explored tiles persist across turns and saves; current-visibility is transient (recomputed).
- Vision radius is affected by terrain type and time of day (day = full range, night = ½).
- Colony pawns share a single visibility pool — any pawn seeing a tile reveals it for all.

---

## Phase A — Data Layer

### `WorldTile` (`src/lib/game/core/types.ts`)

Add one field (the existing `discovered` field becomes the "explored" flag):

```typescript
visible?: boolean;   // true only during the current turn; not persisted
```

`discovered` already exists and means "ever seen" — keep it as the explored flag.

### `GameState` (`src/lib/game/core/types.ts`)

No new persistent field needed. `WorldTile.discovered` is already serialized via `worldMap`.
`WorldTile.visible` is transient — cleared and recomputed each turn, never saved.

---

## Phase B — WASM Visibility Function (`spatial-core/src/lib.rs`)

Add a second exported function alongside `find_path`. Algorithm: **recursive shadowcasting**
(standard roguelike visibility — O(r²) per pawn, exact tile visibility, no false positives).

```rust
/// Compute visible tiles for one or more observer positions using recursive shadowcasting.
///
/// # Arguments
/// * `walkable`   – flat u8 array (1 = walkable, 0 = blocked), length width*height
/// * `width`, `height` – grid dimensions
/// * `observers`  – interleaved [x0,y0, x1,y1, …] observer positions (u32)
/// * `radii`      – vision radius per observer (u32), same length as observers/2
///
/// Returns a flat u8 array (length width*height):
///   0 = not visible, 1 = visible
#[wasm_bindgen]
pub fn compute_visibility(
    walkable: &[u8],
    width: u32,
    height: u32,
    observers: &[u32],
    radii: &[u32],
) -> Vec<u8>
```

Rebuild WASM after implementing: `pnpm add:wasm`.

---

## Phase C — TypeScript Service Interface

### `VisibilityService` interface (`src/lib/game/services/VisibilityService.ts`)

```typescript
export interface VisibilityService {
    /** Recompute which tiles are visible this turn from the given pawn positions. */
    computeVisibility(
        worldMap: WorldTile[][],
        observers: Array<{ x: number; y: number; visionRadius: number }>
    ): { visibleSet: Set<string> };
}
```

`visibleSet` keys are `"x,y"` strings. The service marks `tile.visible = true` for all keys in
`visibleSet` and `tile.discovered = true` for any tile that was ever in a `visibleSet`.

### `WasmVisibilityService` implementation (`src/lib/game/services/WasmVisibilityService.ts`)

- Wraps the WASM `compute_visibility` export from `$lib/spatial-core-pkg/spatial_core.js`.
- Builds the flat `walkable` and `observers`/`radii` typed arrays from `worldMap` and the pawn list.
- Returns `{ visibleSet }`.

### Vision radius constants

| Condition           | Base radius | Notes                                     |
| ------------------- | ----------- | ----------------------------------------- |
| Default pawn        | 8 tiles     | daylight                                  |
| Night (turn 150–300 within day) | 4 tiles | turn % 300 maps 0=dawn…150=noon…300=dusk |
| Dense terrain (forest, swamp subtype) | −2 | applied per tile traversed, not per-observer |
| Scout trait         | +3          | additive; apply in GameEngineImpl         |

Night threshold: `const isNight = (turn % TURNS_PER_DAY) < 75 || (turn % TURNS_PER_DAY) >= 225`
(roughly 6pm–6am given 300 turns/day = 24h).

---

## Phase D — Integration in GameEngineImpl

In `processGameTurn()`, after pawn movement and before rendering:

```typescript
// Rebuild visibility for this turn
const observers = gameState.pawns
    .filter(p => p.isAlive && p.position)
    .map(p => ({
        x: p.position!.x,
        y: p.position!.y,
        visionRadius: pawnVisionRadius(p, gameState.turn)
    }));
const { visibleSet } = wasmVisibilityService.computeVisibility(gameState.worldMap, observers);

// Apply to worldMap (mutate transient field only — no GameStateManager needed)
for (const row of gameState.worldMap) {
    for (const tile of row) {
        tile.visible = visibleSet.has(`${tile.x},${tile.y}`);
        if (tile.visible) tile.discovered = true;
    }
}
```

`pawnVisionRadius(pawn, turn)` is a pure helper in `src/lib/utils/visionUtils.ts`.

---

## Phase E — WebGL Renderer

Update `grid-renderer.ts` / `game-grid.ts` tile rendering to respect visibility:

| `tile.visible` | `tile.discovered` | Render                                       |
| -------------- | ----------------- | -------------------------------------------- |
| `true`         | `true`            | Normal colours                               |
| `false`        | `true`            | Greyscale + 40% brightness (explored/dark)   |
| `false`        | `false`           | Solid black (`#000000`) — tile not rendered  |

Implementation: pass a `visibility: 0 | 1 | 2` value into `TileData` (new optional field) and
branch in the shader or in the tile-colour calculation before writing to the game grid.

---

## Phase F — UI / ExplorationScreen

- **Map overlay toggle**: a `[FOG]` button in `GameControls.svelte` toggles fog-of-war off for
  debugging (devMode only, hidden in production).
- **ExplorationScreen**: replace the current abstract "discovered locations" list with a minimap
  panel that renders the explored world map at reduced scale (1 canvas pixel per tile), colouring
  by terrain type where `discovered === true` and black otherwise. This replaces the Phase 2
  ExplorationScreen refactor — the new map view is the exploration UI.

---

## Acceptance Criteria

1. Unexplored tiles are black; only the starting area is visible on game start.
2. Moving a pawn reveals tiles within their vision radius.
3. Previously-seen tiles remain dimmed (explored state) after pawns move away.
4. Night vision radius is half of daytime (turn-based, using 300 turns/day cycle).
5. `worldMap` is not re-generated on load; `visible` resets to `false` on each turn start,
   `discovered` persists across save/load.
6. WASM `compute_visibility` is called at most once per turn regardless of pawn count.
7. No FOW logic in components, stores, or `GameStateManager` — all in `WasmVisibilityService`
   and the `GameEngineImpl` integration point.
