import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorldTile } from '$lib/game/core/types';
import manifestJson from '../../../../static/tilesets/painted/manifest.json';
import { decodePng } from '../../../../tools/tileset/png.mjs';

vi.mock('$lib/webgl/painted/flag', () => ({ PAINTED_TILES: true }));
vi.mock('$lib/webgl/painted/flag.js', () => ({ PAINTED_TILES: true }));

const { buildTileset, parseManifest, resolveVariant } = await import('$lib/webgl/painted/manifest');
const { setPaintedTileset } = await import('$lib/webgl/painted/tileset');
const { applyResourceToGrid, buildResourceOverlay } = await import('$lib/webgl/fantasia-world');
const { GameGrid } = await import('$lib/webgl/game-grid');
const { BASE_TILE_PX } = await import('$lib/webgl/tile-types');
const { atlasTexels, drawnAt } = await import('$lib/webgl/drawnSprites');

const manifest = parseManifest(manifestJson);
const SIZE = 40;
const reedSprites = Object.keys(manifest.sprites)
  .filter((id) => id.startsWith('plant/reeds/'))
  .map((id) => resolveVariant(manifest, manifest.sprites[id]).cells[0]);

function world(subType: string, over: Partial<WorldTile> = {}): WorldTile[][] {
  return Array.from({ length: SIZE }, (_, y) =>
    Array.from(
      { length: SIZE },
      (_, x) => ({ x, y, walkable: true, subType, resources: {}, ...over }) as WorldTile
    )
  );
}

const noMask = (map: WorldTile[][]) => map.map((row) => row.map(() => false));

function reeds(map: WorldTile[][]) {
  const { short, tall } = buildResourceOverlay(map, noMask(map));
  return { short, tall, at: short.getAllTiles().filter((t) => t.scenery) };
}

beforeAll(() => setPaintedTileset(buildTileset(manifest).tileset));

describe('reeds along the banks', () => {
  it('stand on about a fifth of the riverbank tiles, the same ones every time', () => {
    const first = reeds(world('riverbank')).at;
    const share = first.length / (SIZE * SIZE);
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.25);
    expect(reeds(world('riverbank')).at.map((t) => t.position)).toEqual(
      first.map((t) => t.position)
    );
  });

  it('draw the reed sprites of the atlas, still', () => {
    const at = reeds(world('riverbank')).at;
    for (const t of at) {
      expect(reedSprites).toContainEqual(t.painted);
      expect(t.painted!.sway).toBeUndefined();
    }
    expect(new Set(at.map((t) => t.painted!.u1)).size).toBe(reedSprites.length);
  });

  it('grow nowhere but the riverbank, and never on a floor', () => {
    for (const ground of ['grass', 'shallow_water', 'water', 'bog'])
      expect(reeds(world(ground)).at, ground).toEqual([]);
    expect(reeds(world('riverbank', { floor: { speed: 1, dryness: 1 } })).at).toEqual([]);
  });

  it('give way to a resource on the same tile', () => {
    const map = world('riverbank');
    const spot = reeds(map).at[0].position;
    map[spot.y][spot.x].resources = { oak_tree: 3 };
    const short = new GameGrid();
    const tall = new GameGrid();
    applyResourceToGrid(short, tall, map[spot.y][spot.x], noMask(map));
    expect(short.getTile(spot.x, spot.y)!.scenery).toBeUndefined();
    expect(short.getTile(spot.x, spot.y)!.painted).toBeDefined();
  });

  it('never take a click', () => {
    const png = decodePng(
      readFileSync(join(__dirname, '../../../../static/tilesets/painted/atlas.png'))
    );
    const frame = {
      basePx: BASE_TILE_PX,
      artPx: manifest.tile,
      lift: manifest.pieces!.rock.top!.lift,
      texels: atlasTexels(png.rgba, png.w, png.h),
      depth: true
    };
    const { short, tall, at } = reeds(world('riverbank'));
    const { x, y } = at[0].position;
    const hits = [];
    for (let py = (y - 1) * BASE_TILE_PX; py < (y + 1) * BASE_TILE_PX; py += 0.5)
      for (let px = x * BASE_TILE_PX; px < (x + 1) * BASE_TILE_PX; px += 0.5)
        hits.push(drawnAt([short, tall], px, py, frame));
    expect(hits.filter((h) => h !== null)).toEqual([]);
  });
});
