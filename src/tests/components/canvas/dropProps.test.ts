import { describe, it, expect, vi, beforeAll } from 'vitest';
import manifest from '../../../../static/tilesets/painted/manifest.json';
import type { DroppedItem, PlacedBuilding, WorldTile } from '$lib/game/core/types';
import type { TileData } from '$lib/webgl/tile-types';

vi.mock('$lib/webgl/painted/flag', () => ({ PAINTED_TILES: true, GROUND_BLEND: false }));
vi.mock('$lib/webgl/painted/flag.js', () => ({ PAINTED_TILES: true, GROUND_BLEND: false }));

const { buildTileset, parseManifest } = await import('$lib/webgl/painted/manifest');
const { setPaintedTileset } = await import('$lib/webgl/painted/tileset');
const { dropProps, dropSurroundings } = await import('$lib/components/UI/canvas/dropProps');
const { overlayDroppedItems } = await import('$lib/components/UI/canvas/overlay');
const { GameGrid } = await import('$lib/webgl/game-grid');
const { withOverlays } = await import('$lib/webgl/tile-types');

const { tileset } = buildTileset(parseManifest(manifest));
const ART = tileset.tile;
const BASE = 16;
const SIZE = 9;

const ground = (x: number, y: number, over: Partial<WorldTile> = {}): WorldTile =>
  ({
    x,
    y,
    walkable: true,
    type: 'land',
    subType: 'grass',
    resources: { grass_patch: 1 },
    ...over
  }) as WorldTile;

function yard(edit: (map: WorldTile[][]) => void = () => {}) {
  const map = Array.from({ length: SIZE }, (_, y) =>
    Array.from({ length: SIZE }, (_, x) => ground(x, y))
  );
  for (let x = 0; x < SIZE; x++)
    map[0][x] = ground(x, 0, {
      walkable: false,
      type: 'mountain',
      resources: { mountain_wall: 1 }
    });
  map[6][6] = ground(6, 6, { subType: 'dirt', resources: {} });
  map[7][7] = ground(7, 7, { subType: 'tilled', resources: {} });
  edit(map);
  return map;
}

const built = (type: string, x: number, y: number, status = 'complete') =>
  ({ id: `${type}@${x},${y}`, type, x, y, status }) as PlacedBuilding;

const drop = (resourceId: string, x: number, y: number, quantity = 1) =>
  ({ id: `${resourceId}@${x},${y}`, resourceId, x, y, quantity }) as DroppedItem;

const world = (over: Partial<Parameters<typeof dropProps>[1]> = {}) => ({
  map: yard(),
  buildings: [built('anvil', 4, 4), built('stone_block_wall', 2, 5), built('campfire', 1, 7)],
  zoneTiles: { '1,3': ['stockpile' as const], '2,3': ['stockpile' as const] },
  ...over
});

const item = (id: string) => tileset.drops!.items.get(id)!;
const at = (tiles: TileData[], x: number, y: number) =>
  tiles.find((t) => t.position.x === x && t.position.y === y)!;
const artOffset = (t: TileData) => ({
  dx: (t.animationOffset!.x * ART) / BASE,
  dy: (t.animationOffset!.y * ART) / BASE
});

beforeAll(() => setPaintedTileset(tileset));

describe('the surroundings a drop is placed from', () => {
  const env = dropSurroundings(world(), tileset);

  it('reads rock and wall buildings as walls, and nothing else', () => {
    expect([env.wall(3, 0), env.wall(2, 5), env.wall(4, 4), env.wall(3, 3)]).toEqual([
      true,
      true,
      false,
      false
    ]);
    expect(env.wall(-1, 2)).toBe(false);
  });

  it('lists workstations as stations, a fire as too low to lean on, and no wall', () => {
    expect(env.stations).toEqual([
      { kind: 'anvil', x: 4, y: 4, low: false },
      { kind: 'campfire', x: 1, y: 7, low: true }
    ]);
  });

  it('skips a building that is not finished', () => {
    const blueprint = world({ buildings: [built('anvil', 4, 4, 'blueprint')] });
    expect(dropSurroundings(blueprint, tileset).stations).toEqual([]);
  });

  it('reads the stockpile zone, tilled ground and growing grass', () => {
    expect([env.zone(1, 3), env.zone(3, 3)]).toEqual([true, false]);
    expect([env.field(7, 7), env.field(3, 3)]).toEqual([true, false]);
    expect([env.grass(3, 3), env.grass(6, 6), env.grass(3, 0), env.grass(2, 5)]).toEqual([
      true,
      false,
      false,
      false
    ]);
    expect(env.grassColour(3, 3)).toBe(manifest.drops.grass.grass);
  });
});

describe('prop tiles of dropped items', () => {
  it('draws a pile at the stage of its quantity with its grass cover over it', () => {
    const { tiles } = dropProps([drop('oak_log', 5, 5, 10)], world(), tileset);
    const t = at(tiles, 5, 5);
    const prop = item('oak_log').pile![1];
    expect(t.painted).toBe(prop.sprite);
    expect(t.overlays!.map((o) => o.painted)).toEqual([prop.cover![manifest.drops.grass.grass]]);
    expect(t.overlays![0].animationOffset).toEqual(t.animationOffset);
  });

  it('draws no cover on bare ground', () => {
    const { tiles } = dropProps([drop('oak_log', 6, 6, 10)], world(), tileset);
    expect(at(tiles, 6, 6).overlays).toBeUndefined();
  });

  it('leans a sword on the rock above it, drawn a half row behind its own tile', () => {
    const { tiles, placements } = dropProps([drop('steel_longsword', 3, 1)], world(), tileset);
    const t = at(tiles, 3, 1);
    const flip = placements[0].flip ? 1 : 0;
    expect(placements[0].rule).toBe('leans on the wall');
    expect(t.painted).toBe(item('steel_longsword').lean![flip].sprite);
    expect(t.animationOffset!.y).toBe(-8);
    expect(t.overlays).toBeUndefined();
  });

  it('rests a hammer on the anvil beside it', () => {
    const { tiles, placements } = dropProps([drop('iron_hammer', 5, 4)], world(), tileset);
    expect(placements[0].rule).toBe('rests on its station');
    expect(at(tiles, 5, 4).painted).toBe(item('iron_hammer').lean![0].sprite);
    expect(artOffset(at(tiles, 5, 4))).toEqual({ dx: -16, dy: 2 });
  });

  it('lays a sword in the grass, with one more for each of a stack up to three', () => {
    const { tiles } = dropProps([drop('steel_longsword', 5, 6, 2)], world(), tileset);
    const t = at(tiles, 5, 6);
    const lie = item('steel_longsword').lie!;
    const prop = lie.find((p) => p.sprite === t.painted)!;
    const cover = prop.cover![manifest.drops.grass.grass];
    expect(t.overlays).toHaveLength(3);
    const [first, copy, second] = t.overlays!.map((o) => o.painted!);
    expect(first).toBe(cover);
    expect([copy.u1, copy.v1]).toEqual([prop.sprite.u1, prop.sprite.v1]);
    expect(copy.ox).toBeCloseTo(prop.sprite.ox + 5 / ART);
    expect(copy.oy).toBeCloseTo(prop.sprite.oy + 1 / ART);
    expect(second.ox).toBeCloseTo(cover.ox + 5 / ART);
  });

  it('joins logs lying side by side in the stockpile at one offset', () => {
    const { tiles, placements } = dropProps(
      [drop('oak_log', 1, 3, 4), drop('oak_log', 2, 3, 25)],
      world(),
      tileset
    );
    expect(placements.map((p) => p.rule)).toEqual(['joined', 'joined']);
    expect(at(tiles, 1, 3).animationOffset).toEqual(at(tiles, 2, 3).animationOffset);
    expect(at(tiles, 1, 3).painted).toBe(item('oak_log').pile![0].sprite);
    expect(at(tiles, 2, 3).painted).toBe(item('oak_log').pile![2].sprite);
  });

  it('leaves a hide, which has no map sprite yet, to the flat drawing', () => {
    const { tiles, flat } = dropProps(
      [drop('deer_hide', 5, 5), drop('oak_log', 4, 6)],
      world(),
      tileset
    );
    expect(flat.map((d) => d.resourceId)).toEqual(['deer_hide']);
    expect(tiles).toHaveLength(1);
  });

  it('draws nothing on a hidden tile', () => {
    const hidden = (x: number, y: number) => x === 5 && y === 5;
    const { tiles, flat } = dropProps([drop('oak_log', 5, 5)], world(), tileset, hidden);
    expect([tiles.length, flat.length]).toEqual([0, 0]);
  });

  it('gives every item of the database a tile of its own when dropped', () => {
    const ids = [...tileset.drops!.items.keys()];
    const drops = ids.map((id, n) => drop(id, 1 + (n % 7), 1 + (Math.floor(n / 7) % 7), 1 + n));
    const kept = new Map(drops.map((d) => [`${d.x},${d.y}`, d]));
    const { tiles, flat } = dropProps(drops, world({ buildings: [] }), tileset);
    expect(flat).toEqual([]);
    expect(tiles).toHaveLength(kept.size);
  });
});

describe('the item layer under the painted map', () => {
  const drops = [drop('oak_log', 5, 5, 10), drop('deer_hide', 3, 3), drop('iron_hammer', 5, 4)];

  it('holds a prop for each drop and the flat sprite for a hide', () => {
    const grid = new GameGrid();
    overlayDroppedItems(grid, drops, undefined, world());
    expect(grid.getTile(5, 5)!.painted).toBe(item('oak_log').pile![1].sprite);
    expect(grid.getTile(5, 4)!.animationOffset).toBeDefined();
    expect(grid.getTile(3, 3)!.painted).toBeDefined();
    expect(grid.getTile(3, 3)!.animationOffset).toBeUndefined();
  });

  it('is left alone while the drops and their surroundings stay the same', () => {
    const grid = new GameGrid();
    const w = world();
    overlayDroppedItems(grid, drops, undefined, w);
    const clear = vi.spyOn(grid, 'clear');
    overlayDroppedItems(grid, drops, undefined, { ...w });
    overlayDroppedItems(grid, [...drops], undefined, { ...w });
    expect(clear).not.toHaveBeenCalled();
  });

  it('is planned again when a drop, the terrain or a building changes', () => {
    const grid = new GameGrid();
    const w = world();
    overlayDroppedItems(grid, drops, undefined, w);
    const clear = vi.spyOn(grid, 'clear');
    overlayDroppedItems(grid, [{ ...drops[0], quantity: 30 }, ...drops.slice(1)], undefined, w);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(grid.getTile(5, 5)!.painted).toBe(item('oak_log').pile![2].sprite);
    overlayDroppedItems(grid, drops, undefined, { ...w, rev: 2 });
    overlayDroppedItems(grid, drops, undefined, { ...w, rev: 2, buildings: [] });
    expect(clear).toHaveBeenCalledTimes(3);
    expect(grid.getTile(5, 4)!.painted).not.toBe(item('iron_hammer').lean![0].sprite);
  });

  it('is filled again after something else cleared it', () => {
    const grid = new GameGrid();
    const w = world();
    overlayDroppedItems(grid, drops, undefined, w);
    grid.clear();
    overlayDroppedItems(grid, drops, undefined, w);
    expect(grid.getTile(5, 5)).toBeDefined();
  });

  it('empties when the last drop is gone', () => {
    const grid = new GameGrid();
    const w = world();
    overlayDroppedItems(grid, drops, undefined, w);
    overlayDroppedItems(grid, [], undefined, w);
    expect(grid.getAllTiles()).toEqual([]);
  });
});

describe('tiles with overlays', () => {
  const blank = (x: number, overlays?: TileData[]): TileData => ({
    char: ' ',
    foreground: { r: 0, g: 0, b: 0 },
    background: { r: 0, g: 0, b: 0 },
    position: { x, y: 1 },
    ...(overlays ? { overlays } : null)
  });

  it('follow their tile in draw order, and a list without any is passed through', () => {
    const plain = [blank(1), blank(2)];
    expect(withOverlays(plain)).toBe(plain);
    const over = blank(1);
    const tile = blank(1, [over]);
    expect(withOverlays([tile, plain[1]])).toEqual([tile, over, plain[1]]);
  });
});
