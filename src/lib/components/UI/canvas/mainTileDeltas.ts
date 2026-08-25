/**
 * Main-thread mirror of the worker's tile-delta accumulator ([[core/tileDeltas]]).
 *
 * ADR-026 (incremental-only terrain): the renderer must repaint ONLY the tiles that changed, never
 * scan or rebuild the whole map on a per-tick delta. The worker already ships the exact changed tiles
 * as `worldMapDelta` (ADR-021 §4c); `simWorkerClient` merges them into the cached `worldMap` — and here
 * it ALSO records their coords so GameCanvas can drain them and re-paint just those cells. Without this
 * the renderer re-derived the change set by scanning all ~562k tiles every redraw (the thing ADR-026
 * forbids). Building-footprint and blueprint-preview repaints feed the same channel.
 *
 * Coords only — the tile DATA already lives in the main-thread `worldMap` (the worker delta merged it);
 * the renderer reads `worldMap[y][x]` when it paints. Keyed "y,x" so repeated changes to one tile within
 * a frame collapse to a single repaint. The main thread is single-threaded, so a module singleton is safe
 * (mirrors the worker-side rationale): producers call {@link markRenderTileDirty}; `redrawOverlayNow`
 * drains once per frame via {@link drainRenderTileDeltas}.
 */

export interface RenderTileCoord {
  y: number;
  x: number;
}

const dirty = new Map<string, RenderTileCoord>();
// Snow/ice-only changes (worker delta `k: 1`) — drained separately so a snow-onset wave repaints ONLY
// the blended snow layer, never the terrain/resource grids (the snow-onset hiccup fix).
const dirtySnow = new Map<string, RenderTileCoord>();

/** Record that `worldMap[y][x]` changed and its grid cell must be re-painted this frame. */
export function markRenderTileDirty(y: number, x: number): void {
  dirty.set(y + ',' + x, { y, x });
}

/** Record that only `worldMap[y][x]`'s snow/ice moved — repaint just its snow-layer cell. */
export function markSnowRenderTileDirty(y: number, x: number): void {
  dirtySnow.set(y + ',' + x, { y, x });
}

/** Drain the accumulated dirty coords for this frame, or `null` if none changed. */
export function drainRenderTileDeltas(): RenderTileCoord[] | null {
  if (dirty.size === 0) return null;
  const out = Array.from(dirty.values());
  dirty.clear();
  return out;
}

/** Drain the accumulated snow-only dirty coords, or `null` if none changed. */
export function drainSnowRenderTileDeltas(): RenderTileCoord[] | null {
  if (dirtySnow.size === 0) return null;
  const out = Array.from(dirtySnow.values());
  dirtySnow.clear();
  return out;
}

/** Discard pending coords (a full terrain rebuild already repaints every tile — snow layer included). */
export function clearRenderTileDeltas(): void {
  dirty.clear();
  dirtySnow.clear();
}
