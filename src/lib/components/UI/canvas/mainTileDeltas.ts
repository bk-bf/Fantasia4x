export interface RenderTileCoord {
  y: number;
  x: number;
}

export const SNOW_RENDER_CHUNK = 32;

const dirty = new Map<string, RenderTileCoord>();

class ChunkQueue {
  private ring = new Int32Array(0);
  private queued = new Uint8Array(0);
  private head = 0;
  size = 0;

  reset(chunks: number): void {
    this.ring = new Int32Array(chunks);
    this.queued = new Uint8Array(chunks);
    this.head = 0;
    this.size = 0;
  }

  push(chunk: number): void {
    if (this.queued[chunk]) return;
    this.queued[chunk] = 1;
    this.ring[(this.head + this.size) % this.ring.length] = chunk;
    this.size++;
  }

  shift(): number {
    const chunk = this.ring[this.head];
    this.head = (this.head + 1) % this.ring.length;
    this.size--;
    this.queued[chunk] = 0;
    return chunk;
  }

  clear(): void {
    this.queued.fill(0);
    this.head = 0;
    this.size = 0;
  }
}

let snowWidth = 0;
let snowHeight = 0;
let snowChunksX = 0;
let snowTiles = new Uint8Array(0);
const snowStaged = new ChunkQueue();
const snowPending = new ChunkQueue();

function sizeSnowTiles(width: number, height: number): void {
  snowWidth = width;
  snowHeight = height;
  snowChunksX = Math.ceil(width / SNOW_RENDER_CHUNK);
  const chunks = snowChunksX * Math.ceil(height / SNOW_RENDER_CHUNK);
  snowTiles = new Uint8Array(width * height);
  snowStaged.reset(chunks);
  snowPending.reset(chunks);
}

export function markRenderTileDirty(y: number, x: number): void {
  dirty.set(y + ',' + x, { y, x });
}

export function markSnowRenderTileDirty(y: number, x: number, width: number, height: number): void {
  if (width !== snowWidth || height !== snowHeight) sizeSnowTiles(width, height);
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  snowTiles[y * width + x] = 1;
  snowStaged.push(
    Math.floor(y / SNOW_RENDER_CHUNK) * snowChunksX + Math.floor(x / SNOW_RENDER_CHUNK)
  );
}

export function queueSnowRenderTiles(): void {
  while (snowStaged.size > 0) snowPending.push(snowStaged.shift());
}

export function pendingSnowRenderChunks(): number {
  return snowPending.size;
}

export function takeSnowRenderChunk(visit: (x: number, y: number) => void): void {
  if (snowPending.size === 0) return;
  const chunk = snowPending.shift();
  const x0 = (chunk % snowChunksX) * SNOW_RENDER_CHUNK;
  const y0 = Math.floor(chunk / snowChunksX) * SNOW_RENDER_CHUNK;
  const x1 = Math.min(x0 + SNOW_RENDER_CHUNK, snowWidth);
  const y1 = Math.min(y0 + SNOW_RENDER_CHUNK, snowHeight);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * snowWidth + x;
      if (snowTiles[i] === 0) continue;
      snowTiles[i] = 0;
      visit(x, y);
    }
  }
}

export function drainRenderTileDeltas(): RenderTileCoord[] | null {
  if (dirty.size === 0) return null;
  const out = Array.from(dirty.values());
  dirty.clear();
  return out;
}

export function clearRenderTileDeltas(): void {
  dirty.clear();
  snowTiles.fill(0);
  snowStaged.clear();
  snowPending.clear();
}
