export interface RenderTileCoord {
  y: number;
  x: number;
}

const dirty = new Map<string, RenderTileCoord>();
const dirtySnow = new Map<string, RenderTileCoord>();

export function markRenderTileDirty(y: number, x: number): void {
  dirty.set(y + ',' + x, { y, x });
}

export function markSnowRenderTileDirty(y: number, x: number): void {
  dirtySnow.set(y + ',' + x, { y, x });
}

export function drainRenderTileDeltas(): RenderTileCoord[] | null {
  if (dirty.size === 0) return null;
  const out = Array.from(dirty.values());
  dirty.clear();
  return out;
}

export function drainSnowRenderTileDeltas(): RenderTileCoord[] | null {
  if (dirtySnow.size === 0) return null;
  const out = Array.from(dirtySnow.values());
  dirtySnow.clear();
  return out;
}

export function clearRenderTileDeltas(): void {
  dirty.clear();
  dirtySnow.clear();
}
