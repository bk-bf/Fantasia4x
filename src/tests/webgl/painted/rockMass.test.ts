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

describe('an object in an opening of the mountain shows whole', () => {
  const opening = (resources: Record<string, number>, open: [number, number][]) => {
    const map = world(3, 3, (x, y) => ({ terrainType: 'mountain', ...wall(x + y) }));
    for (const [x, y] of open) map[y][x] = { ...map[y][x], walkable: true, resources: {} };
    map[1][1] = { ...map[1][1], resources };
    return map;
  };
  const drawn = (map: WorldTile[][]) => {
    const short = new GameGrid();
    const tall = new GameGrid();
    applyResourceToGrid(short, tall, map[1][1], [], undefined, map);
    return { short: short.getTile(1, 1), tall: tall.getTile(1, 1) };
  };

  it('draws it after the rock and one row ahead when rock stands in front of it', () => {
    const { short, tall } = drawn(opening({ stone_outcrop: 3 }, [[1, 0]]));
    expect(short?.painted).toBeUndefined();
    expect(tall?.painted).toEqual(paintedTile('resource', 'stone_outcrop', 1, 1));
    expect(tall?.depthRow).toBe(2);
  });

  it('draws it after the rock in its own row when rock stands only beside it', () => {
    const { short, tall } = drawn(opening({ star_geode: 1 }, [[1, 2]]));
    expect(short?.painted).toBeUndefined();
    expect(tall?.painted).toEqual(paintedTile('resource', 'star_geode', 1, 1));
    expect(tall?.depthRow).toBeUndefined();
  });

  it('leaves an object off the mountain in its row, under the rock in front of it', () => {
    const map = opening({ stone_outcrop: 3 }, [[1, 0]]);
    map[1][1] = { ...map[1][1], terrainType: 'forest' };
    const { short, tall } = drawn(map);
    expect(short?.painted).toEqual(paintedTile('resource', 'stone_outcrop', 1, 1));
    expect(short?.depthRow).toBeUndefined();
    expect(tall?.painted).toBeUndefined();
  });

  it('lays cave floor under a hidden tile, so no fill shows where a rock piece is cut in', () => {
    const grid = new GameGrid();
    const tile = { x: 2, y: 3, subType: 'mineral_deposit', resources: { coal: 2 } } as WorldTile;
    applyTileToGrid(grid, tile, [[], [], [], [false, false, true]]);
    expect(grid.getTile(2, 3)?.painted).toEqual(paintedTile('subterrain', 'cave', 2, 3));
  });
});
