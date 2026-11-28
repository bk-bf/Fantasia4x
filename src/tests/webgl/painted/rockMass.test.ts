import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { WorldTile } from '$lib/game/core/types';
import manifestJson from '../../../../static/tilesets/painted/manifest.json';

vi.mock('$lib/webgl/painted/flag', () => ({ PAINTED_TILES: true }));
vi.mock('$lib/webgl/painted/flag.js', () => ({ PAINTED_TILES: true }));

const { buildTileset, parseManifest, resolveVariant, spriteAt } =
  await import('$lib/webgl/painted/manifest');
const { paintedTile, setPaintedTileset } = await import('$lib/webgl/painted/tileset');
const { applyResourceToGrid, applyTileToGrid, buildResourceOverlay } =
  await import('$lib/webgl/fantasia-world');
const { GameGrid } = await import('$lib/webgl/game-grid');

const manifest = parseManifest(manifestJson);
const rock = manifest.pieces!.rock;
const NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const OFFSET: Record<string, [number, number]> = {
  N: [0, -1],
  NE: [1, -1],
  E: [1, 0],
  SE: [1, 1],
  S: [0, 1],
  SW: [-1, 1],
  W: [-1, 0],
  NW: [-1, -1]
};
const DIAGONALS: [string, string, string][] = [
  ['NE', 'N', 'E'],
  ['SE', 'S', 'E'],
  ['SW', 'S', 'W'],
  ['NW', 'N', 'W']
];

const bitOf = (name: string) =>
  rock.neighbours.findIndex(([dx, dy]) => dx === OFFSET[name][0] && dy === OFFSET[name][1]);

function blobName(walls: Set<string>): string {
  const kept = new Set([...walls].filter((n) => n.length === 1));
  for (const [d, a, b] of DIAGONALS) if (walls.has(d) && walls.has(a) && walls.has(b)) kept.add(d);
  return `rock/mass/${[...kept].reduce((m, n) => m | (1 << bitOf(n)), 0)}`;
}

function world(
  w: number,
  h: number,
  at: (x: number, y: number) => Partial<WorldTile>
): WorldTile[][] {
  return Array.from({ length: h }, (_, y) =>
    Array.from(
      { length: w },
      (_, x) => ({ x, y, walkable: true, subType: 'cave', resources: {}, ...at(x, y) }) as WorldTile
    )
  );
}

const wall = (i: number) => ({
  walkable: false,
  resources: { [i % 2 ? 'cliff_wall' : 'mountain_wall']: 1 }
});

function expected(id: string, x: number, y: number) {
  return spriteAt(resolveVariant(manifest, manifest.sprites[id]), x, y);
}

function painted(map: WorldTile[][], x: number, y: number, hidden: boolean[][] = []) {
  const short = new GameGrid();
  const tall = new GameGrid();
  applyResourceToGrid(short, tall, map[y][x], hidden, undefined, map);
  return short.getTile(x, y)?.painted;
}

beforeAll(() => setPaintedTileset(buildTileset(manifest).tileset));

describe('a wall tile takes the rock piece of its eight neighbours', () => {
  it('names a piece for each of the 256 layouts, by the blob rule, at every patch cell', () => {
    for (let layout = 0; layout < 256; layout++) {
      const walls = new Set(NAMES.filter((_, i) => layout & (1 << i)));
      const cx = 2 + (layout % 4),
        cy = 2 + ((layout >> 2) % 4);
      const map = world(9, 9, (x, y) => {
        const name = NAMES.find((n) => cx + OFFSET[n][0] === x && cy + OFFSET[n][1] === y);
        if (x === cx && y === cy) return wall(layout);
        if (name && walls.has(name)) return wall(x + y);
        if (name && (x + y) % 3 === 0) return { resources: { hematite: 2 } };
        return {};
      });
      expect(painted(map, cx, cy), `layout ${[...walls].join(' ')}`).toEqual(
        expected(blobName(walls), cx, cy)
      );
    }
  });

  it('counts hidden tiles and the map edge as rock, whatever lies there', () => {
    const map = world(3, 3, (x, y) => (x === 1 && y === 1 ? wall(0) : {}));
    const hidden = [
      [false, true, false],
      [false, false, false],
      [false, false, false]
    ];
    expect(painted(map, 1, 1, hidden)).toEqual(expected(blobName(new Set(['N'])), 1, 1));
    const corner = world(2, 2, (x, y) => (x === 0 && y === 0 ? wall(0) : {}));
    expect(painted(corner, 0, 0)).toEqual(
      expected(blobName(new Set(['N', 'NE', 'W', 'SW', 'NW'])), 0, 0)
    );
  });

  it('draws a hidden tile as rock whether it holds a wall, ore or nothing', () => {
    const empty: Partial<WorldTile> = { resources: {} };
    const ore: Partial<WorldTile> = { resources: { hematite: 2 } };
    const map = world(5, 5, (x, y) =>
      x === 2 && y === 2 ? empty : x === 1 && y === 2 ? ore : wall(x)
    );
    const hidden = map.map((row) => row.map(() => true));
    const { short } = buildResourceOverlay(map, hidden);
    const all = new Set(NAMES);
    for (const [x, y] of [
      [2, 2],
      [1, 2],
      [3, 3]
    ])
      expect(short.getTile(x, y)?.painted, `${x},${y}`).toEqual(expected(blobName(all), x, y));
  });

  it('leaves the map sprite on everything that is not part of the mass', () => {
    const map = world(3, 3, () => wall(0));
    map[1][1] = { ...map[1][1], resources: { hematite: 2 } };
    expect(painted(map, 1, 1)).toEqual(expected(manifest.map.resource!.hematite[0], 1, 1));
  });
});

describe('an object in an opening of the mountain stays in its own row', () => {
  it('draws it on the short layer of its tile, with no rock under it', () => {
    const map = world(3, 3, (x, y) => ({ terrainType: 'mountain', ...wall(x + y) }));
    map[0][1] = { ...map[0][1], walkable: true, resources: {} };
    map[1][1] = { ...map[1][1], resources: { stone_outcrop: 3 } };
    const short = new GameGrid();
    const tall = new GameGrid();
    applyResourceToGrid(short, tall, map[1][1], [], undefined, map);
    expect(short.getTile(1, 1)?.painted).toEqual(paintedTile('resource', 'stone_outcrop', 1, 1));
    expect(tall.getTile(1, 1)?.painted).toBeUndefined();
  });

  it('lays cave floor under a hidden tile, so no fill shows where a rock piece is cut in', () => {
    const grid = new GameGrid();
    const tile = world(3, 4, () => ({ subType: 'mineral_deposit', resources: { coal: 2 } }))[3][2];
    applyTileToGrid(grid, tile, [[], [], [], [false, false, true]]);
    expect(grid.getTile(2, 3)?.painted).toEqual(paintedTile('subterrain', 'cave', 2, 3));
  });
});

describe('ore carried by a wall shows in its rock top; ore with no wall draws no rock', () => {
  const all = new Set(NAMES);
  const centre = (resources: Record<string, number>) =>
    world(3, 3, (x, y) => (x === 1 && y === 1 ? { walkable: false, resources } : wall(x)));
  const tallAt = (map: WorldTile[][], hidden: boolean[][] = []) => {
    const tall = new GameGrid();
    applyResourceToGrid(new GameGrid(), tall, map[1][1], hidden, undefined, map);
    return tall.getTile(1, 1)?.painted;
  };

  it.each([
    ['hematite', 'mountain_wall', 'vein/hematite'],
    ['native_gold', 'cliff_wall', 'vein/gold'],
    ['rock_salt', 'mountain_wall', 'vein/salt']
  ])('draws %s on %s as the wall piece coloured from %s', (ore, host, vein) => {
    const map = centre({ [ore]: 3, [host]: 5 });
    const { x, y } = manifest.sprites[vein];
    expect(painted(map, 1, 1)).toEqual({
      ...expected(blobName(all), 1, 1),
      vein: { x, y, near: 0 }
    });
    expect(tallAt(map)).toBeUndefined();
  });

  it('marks the neighbours that carry the same ore on a visible wall, so the vein runs into them', () => {
    const map = centre({ coal: 3, mountain_wall: 5 });
    map[1][2] = { ...map[1][2], resources: { coal: 2, cliff_wall: 5 } };
    map[0][1] = { ...map[0][1], resources: { coal: 2, mountain_wall: 5 } };
    map[2][1] = { ...map[2][1], resources: { hematite: 2, mountain_wall: 5 } };
    map[0][0] = { ...map[0][0], resources: { coal: 2 } };
    const hidden = map.map((row) => row.map((t) => t.x === 1 && t.y === 0));
    const bit = (dx: number, dy: number) =>
      1 << rock.neighbours.findIndex(([a, b]) => a === dx && b === dy);
    expect(painted(map, 1, 1)?.vein?.near).toBe(bit(1, 0) | bit(0, -1));
    expect(painted(map, 1, 1, hidden)?.vein?.near).toBe(bit(1, 0));
  });

  it('counts a wall carrying ore as rock for the walls around it', () => {
    const map = centre({ coal: 3, mountain_wall: 5 });
    for (const [x, y] of [
      [1, 0],
      [0, 1],
      [2, 2]
    ])
      expect(painted(map, x, y), `${x},${y}`).toEqual(expected(blobName(all), x, y));
  });

  it('draws a fogged wall carrying ore as plain rock', () => {
    const map = centre({ coal: 3, mountain_wall: 5 });
    const hidden = map.map((row) => row.map(() => true));
    expect(painted(map, 1, 1, hidden)).toEqual(expected(blobName(all), 1, 1));
  });

  it('draws ore with no wall as its own sprite and leaves its tile open to the walls around', () => {
    const map = centre({ coal: 3 });
    expect(painted(map, 1, 1)).toEqual(expected(manifest.map.resource!.coal[0], 1, 1));
    expect(painted(map, 1, 0)).toEqual(
      expected(blobName(new Set(NAMES.filter((n) => n !== 'S'))), 1, 0)
    );
  });
});
