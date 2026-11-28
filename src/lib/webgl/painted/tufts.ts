import { hash } from '../../pixelArt/noise.js';
import type { WorldTile } from '$lib/game/core/types';
import type { TileData } from '../tile-types.js';
import type { PaintedGround, PaintedSprite } from './manifest.js';

const COUNT_SALT = 201;
const X_SALT = 300;
const Y_SALT = 400;
const PICK_SALT = 500;
const NONE = { r: 0, g: 0, b: 0 };
const STEP_SPAN = 4096;
const placed = new WeakMap<PaintedSprite, Map<number, PaintedSprite>>();

export function placedTuft(s: PaintedSprite, dx: number, dy: number, tileArt: number): PaintedSprite {
  let at = placed.get(s);
  if (!at) placed.set(s, (at = new Map()));
  const key = (tileArt * STEP_SPAN + dx) * STEP_SPAN + dy;
  let tuft = at.get(key);
  if (!tuft) at.set(key, (tuft = { ...s, ox: s.ox + dx / tileArt, oy: s.oy + dy / tileArt }));
  return tuft;
}

const growsGrass = (tile: WorldTile, grass: ReadonlySet<string>): boolean =>
  Object.entries(tile.resources ?? {}).some(([id, amount]) => amount > 0 && grass.has(id));

export function groundTufts(
  ground: PaintedGround | undefined,
  tile: WorldTile,
  tileArt: number
): PaintedSprite[] | undefined {
  if (!ground || tile.floor || !tile.walkable || tile.type === 'water') return undefined;
  const tufts = ground.kinds.get(tile.subType)?.tufts;
  if (!tufts || !growsGrass(tile, ground.grass)) return undefined;
  const { x, y } = tile;
  const count = Math.floor(tufts.density + hash(x, y, COUNT_SALT));
  const out: PaintedSprite[] = [];
  for (let k = 1; k <= count; k++) {
    const s = tufts.sprites[Math.floor(hash(x, y, PICK_SALT + k) * tufts.sprites.length)];
    out.push(
      placedTuft(
        s,
        Math.floor(hash(x, y, X_SALT + k) * tileArt),
        Math.floor(hash(x, y, Y_SALT + k) * tileArt),
        tileArt
      )
    );
  }
  return out.length > 0 ? out : undefined;
}

export function tuftTiles(tile: TileData): TileData[] {
  return (tile.tufts ?? []).map((painted) => ({
    char: ' ',
    foreground: NONE,
    background: NONE,
    backgroundAlpha: 0,
    position: tile.position,
    painted
  }));
}
