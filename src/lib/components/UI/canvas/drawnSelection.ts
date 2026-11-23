import type { SpriteLayer, WebGLRenderer } from '$lib/webgl/renderer.js';
import { BASE_TILE_PX } from '$lib/webgl/tile-types.js';
import type { ScreenRect } from './selectionMarks';

export type TileLayer =
  | { kind: 'pawn'; id: string }
  | { kind: 'mob'; id: string }
  | { kind: 'building'; id: string }
  | { kind: 'zone'; id: string }
  | { kind: 'item'; id: string }
  | { kind: 'resource'; resourceId: string };

export interface MapView {
  viewX: number;
  viewY: number;
  tileWidth: number;
  tileHeight: number;
}

export const RESOURCE_SPRITES: readonly SpriteLayer[] = ['resourceTall', 'resource'];
export const BUILDING_SPRITES: readonly SpriteLayer[] = ['building'];
const BRACKET_PAD_TILES = 1 / 16;

const LAYER_KINDS: Record<SpriteLayer, readonly TileLayer['kind'][]> = {
  resource: ['resource'],
  resourceTall: ['resource'],
  building: ['building'],
  item: ['item'],
  entity: ['pawn', 'mob']
};

export function drawnTile(
  renderer: WebGLRenderer | null,
  cx: number,
  cy: number,
  v: MapView
): { x: number; y: number; layer?: SpriteLayer } {
  const wx = cx / v.tileWidth + v.viewX;
  const wy = cy / v.tileHeight + v.viewY;
  return (
    renderer?.drawnAt(wx * BASE_TILE_PX, wy * BASE_TILE_PX) ?? {
      x: Math.floor(wx),
      y: Math.floor(wy)
    }
  );
}

export function drawnFirst(layers: TileLayer[], layer: SpriteLayer | undefined): TileLayer[] {
  if (!layer) return layers;
  const drawn = (l: TileLayer) => LAYER_KINDS[layer].includes(l.kind);
  return [...layers.filter(drawn), ...layers.filter((l) => !drawn(l))];
}

export function spriteRect(
  renderer: WebGLRenderer | null,
  layers: readonly SpriteLayer[],
  x: number,
  y: number,
  v: MapView
): ScreenRect | null {
  for (const layer of layers) {
    const q = renderer?.drawnBounds(layer, x, y);
    if (!q) continue;
    const sx = v.tileWidth / BASE_TILE_PX;
    const sy = v.tileHeight / BASE_TILE_PX;
    const pad = v.tileWidth * BRACKET_PAD_TILES;
    return {
      x: (q[0] - v.viewX * BASE_TILE_PX) * sx - pad,
      y: (q[1] - v.viewY * BASE_TILE_PX) * sy - pad,
      w: (q[2] - q[0]) * sx + 2 * pad,
      h: (q[3] - q[1]) * sy + 2 * pad
    };
  }
  return null;
}
