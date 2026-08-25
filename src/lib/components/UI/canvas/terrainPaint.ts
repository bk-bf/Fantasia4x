/**
 * ADR-026 full-map terrain build — the SINGLE seam.
 *
 * This module's {@link fullRebuildTerrain} is the ONLY place allowed to call the whole-map builders
 * `buildGameGrid` (562k setTile) and `computeHiddenMaskState` (whole-map BFS). codegraph's
 * `restricted-callee` rule (ADR-026 in codegraph.config.json) flags any other caller — so the per-delta
 * render path in GameCanvas, which must repaint only the changed cells, can never silently reintroduce a
 * full rebuild. It lives in a plain `.ts` module (not the Svelte component) precisely so codegraph has
 * function-level granularity to enforce that — a `<script>` function would collapse into the component
 * node and be invisible to the rule.
 *
 * It is intentionally pure: takes the world + buildings, returns the freshly built terrain grid and every
 * incremental baseline (mask state, grove-emitter map, building-diff snapshot). The caller assigns them to
 * component state and handles the interactive bits (blueprint preview, emitter refresh).
 */
import type { GameGrid } from '$lib/webgl/game-grid.js';
import {
  buildGameGrid,
  buildResourceOverlay,
  buildSnowOverlay,
  computeHiddenMaskState,
  type HiddenMaskState
} from '$lib/webgl/fantasia-world.js';
import { lightingService, type LightEmitter } from '$lib/game/services/LightingService.js';
import type { WorldTile, PlacedBuilding, Season } from '$lib/game/core/types.js';

export interface FullTerrainBuild {
  terrainGrid: GameGrid;
  /** Short resource layer (grass/bushes/ore/crops) drawn BENEATH entities. */
  resourceGrid: GameGrid;
  /** Tall resource layer (trees) drawn ABOVE entities so pawns behind a tree are occluded. */
  resourceTallGrid: GameGrid;
  /** Blended snow/ice weather layer (per-cell wash + sprites) drawn between terrain and resources. */
  snowGrid: GameGrid;
  maskState: HiddenMaskState;
  /** Grove-glow emitters keyed "y,x" (hidden-tile emitters excluded), for incremental upsert/delete. */
  emitterMap: Map<string, LightEmitter>;
  /** Flat emitter list derived from `emitterMap` (what LightingService bakes). */
  emitters: LightEmitter[];
  /** Last-painted completed buildings keyed by id (pos + visual sig), the building-diff baseline. */
  buildingsById: Map<string, { x: number; y: number; sig: string }>;
}

/** Build the whole terrain grid + every incremental baseline. ADR-026: the only full-map build seam.
 *  `season` drives the resource overlay's seasonVariants (leafless winter trees, autumn recolours). */
export function fullRebuildTerrain(
  worldMap: WorldTile[][],
  buildings: PlacedBuilding[],
  buildingSig: (b: PlacedBuilding) => string,
  season?: Season
): FullTerrainBuild {
  const maskState = computeHiddenMaskState(worldMap);
  const terrainGrid = buildGameGrid(worldMap, buildings, maskState.mask);
  const resources = buildResourceOverlay(worldMap, maskState.mask, season);
  const snowGrid = buildSnowOverlay(worldMap, maskState.mask);

  const buildingsById = new Map<string, { x: number; y: number; sig: string }>();
  for (const b of buildings) {
    if (b.status === 'complete') buildingsById.set(b.id, { x: b.x, y: b.y, sig: buildingSig(b) });
  }

  const emitterMap = new Map<string, LightEmitter>();
  for (const row of worldMap) {
    for (const tile of row) {
      const e = lightingService.emitterForTile(tile);
      // Drop glows on hidden tiles so a buried magic grove doesn't bleed light through the fog.
      if (e && !maskState.mask[e.y]?.[e.x]) emitterMap.set(e.y + ',' + e.x, e);
    }
  }

  return {
    terrainGrid,
    resourceGrid: resources.short,
    resourceTallGrid: resources.tall,
    snowGrid,
    maskState,
    emitterMap,
    emitters: [...emitterMap.values()],
    buildingsById
  };
}
