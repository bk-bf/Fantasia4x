import { describe, it, expect } from 'vitest';
import items from '$lib/game/database/items/items.json';
import type { Item } from '$lib/game/core/types';
import { itemStorage } from '$lib/game/services/storageRules';
import {
  DROP_FOOT,
  DROP_TILE,
  STATIONS_OF_TOOL,
  copyOffset,
  planDrops,
  type DropPlacement,
  type DropStation,
  type DropSurroundings,
  type PlannedDrop
} from '$lib/webgl/painted/dropPlacement';
import buildings from '$lib/game/database/world/buildings.json';

const ITEMS = new Map((items as unknown as Item[]).map((i) => [i.id, i]));
const SEEDS = [1, 7, 23, 99, 2026];
const key = (x: number, y: number) => `${x},${y}`;

interface Yard {
  walls?: [number, number][];
  zone?: [number, number][];
  fields?: [number, number][];
  bare?: [number, number][];
  stations?: DropStation[];
}

function yard(y: Yard = {}): DropSurroundings {
  const set = (cells: [number, number][] = []) => new Set(cells.map(([x, yy]) => key(x, yy)));
  const walls = set(y.walls);
  const zone = set(y.zone);
  const fields = set(y.fields);
  const bare = set(y.bare);
  return {
    wall: (x, yy) => walls.has(key(x, yy)),
    zone: (x, yy) => zone.has(key(x, yy)),
    field: (x, yy) => fields.has(key(x, yy)),
    grass: (x, yy) => !bare.has(key(x, yy)) && !walls.has(key(x, yy)),
    stations: y.stations ?? []
  };
}

function drop(item: string, x: number, y: number, quantity = 1, reach?: PlannedDrop['reach']) {
  return {
    id: `${item}@${x},${y}`,
    item,
    x,
    y,
    quantity,
    storage: itemStorage(ITEMS.get(item)!),
    ...(reach ? { reach } : null)
  };
}

const one = (env: DropSurroundings, d: PlannedDrop, seed = 7): DropPlacement =>
  planDrops(env, [d], seed)[0];

const station = (kind: string, x: number, y: number, low = false): DropStation => ({
  kind,
  x,
  y,
  low
});

describe('placement of a long item', () => {
  it('leans on the wall above it, its foot near the top of its tile', () => {
    for (const seed of SEEDS) {
      const p = one(yard({ walls: [[5, 4]] }), drop('steel_longsword', 5, 5), seed);
      expect([p.pose, p.rule, p.cover]).toEqual(['lean', 'leans on the wall', false]);
      expect(DROP_FOOT.y + p.dy).toBe(7);
      expect(Math.abs(p.dx)).toBeLessThanOrEqual(6);
    }
  });

  it('leans away from a wall beside it, turned to face that wall', () => {
    const west = one(yard({ walls: [[4, 5]] }), drop('steel_longsword', 5, 5));
    const east = one(yard({ walls: [[6, 5]] }), drop('steel_longsword', 5, 5));
    expect([west.pose, west.flip, west.dx]).toEqual(['lean', false, -12]);
    expect([east.pose, east.flip, east.dx]).toEqual(['lean', true, 12]);
  });

  it('rests a tool on its own station, on the side it was dropped', () => {
    const env = yard({ stations: [station('anvil', 5, 5)] });
    const right = one(env, drop('iron_hammer', 6, 5));
    const left = one(env, drop('iron_hammer', 4, 5));
    expect([right.pose, right.rule, right.flip]).toEqual(['lean', 'rests on its station', false]);
    expect(right.dx).toBe(-DROP_TILE + 16);
    expect([left.rule, left.flip, left.dx]).toEqual(['rests on its station', true, DROP_TILE - 16]);
    expect(right.dy).toBe(2);
  });

  it('prefers its own station to a nearer wall', () => {
    const env = yard({ walls: [[6, 4]], stations: [station('anvil', 5, 5)] });
    expect(one(env, drop('iron_tongs', 6, 5)).rule).toBe('rests on its station');
  });

  it('leans a weapon on any station beside it that stands tall enough', () => {
    const tall = yard({ stations: [station('carpenter_bench', 5, 5)] });
    const low = yard({ stations: [station('campfire', 5, 5, true)] });
    expect(one(tall, drop('steel_longsword', 6, 5)).rule).toBe('leans on a station');
    expect(one(low, drop('steel_longsword', 6, 5)).pose).toBe('lie');
  });

  it('ignores a station in the row below, which would draw over it', () => {
    const env = yard({ stations: [station('anvil', 5, 6)] });
    expect(one(env, drop('iron_hammer', 5, 5)).pose).toBe('lie');
  });

  it('rests an axe on the log pile beside it', () => {
    const env = yard();
    const placed = planDrops(env, [drop('oak_log', 5, 5, 20), drop('iron_axe', 6, 5)], 7);
    const logs = placed.find((p) => p.pose === 'pile')!;
    const axe = placed.find((p) => p.pose !== 'pile')!;
    expect([axe.pose, axe.rule, axe.flip]).toEqual(['lean', 'rests on the log pile', false]);
    expect(axe.dx).toBe(-DROP_TILE + logs.dx + 18);
    expect(axe.dy).toBe(logs.dy + 2);
    expect(one(env, drop('iron_axe', 6, 5)).pose).toBe('lie');
  });

  it('lays a hoe at the edge of the field beside it, head towards the crop', () => {
    const east = one(yard({ fields: [[6, 5]] }), drop('iron_hoe', 5, 5, 1, lieOf(20)));
    const west = one(yard({ fields: [[4, 5]] }), drop('iron_hoe', 5, 5, 1, lieOf(20)));
    expect([east.pose, east.rule, east.flip, east.dx]).toEqual([
      'lie',
      'laid at the field edge',
      false,
      5
    ]);
    expect([west.flip, west.dx]).toEqual([true, -5]);
  });

  it('lies in open grass with grass over it, and on bare ground without', () => {
    const grass = one(yard(), drop('steel_longsword', 5, 5));
    const dirt = one(yard({ bare: [[5, 5]] }), drop('steel_longsword', 5, 5));
    expect([grass.pose, grass.rule, grass.cover]).toEqual(['lie', 'lies in the grass', true]);
    expect([dirt.pose, dirt.rule, dirt.cover]).toEqual(['lie', 'lies on the ground', false]);
  });

  it('keeps a lying item shorter than its tile inside the tile', () => {
    for (const width of [9, 16, 24, 30])
      for (const seed of SEEDS)
        for (let x = 0; x < 8; x++) {
          const p = one(yard(), drop('steel_longsword', x, 3, 1, lieOf(width)), seed);
          const left = DROP_FOOT.x + p.dx - width / 2;
          expect(left >= 0 && left + width <= DROP_TILE, `${width} at ${x}`).toBe(true);
        }
  });

  it('centres a lying item longer than its tile, so it reaches no further than its length makes it', () => {
    for (const seed of SEEDS)
      for (let x = 0; x < 8; x++)
        expect(one(yard(), drop('steel_boar_spear', x, 3, 1, lieOf(40)), seed).dx).toBe(0);
  });

  it('stands a leaning item taller than two tiles lower, so its tip stays on the wall tile', () => {
    const short = one(yard({ walls: [[5, 4]] }), drop('steel_boar_spear', 5, 5, 1, leanOf(30)));
    const tall = one(yard({ walls: [[5, 4]] }), drop('steel_boar_spear', 5, 5, 1, leanOf(44)));
    expect(DROP_FOOT.y + short.dy).toBe(7);
    expect(DROP_FOOT.y + tall.dy - 44).toBe(-DROP_TILE);
  });

  it('draws up to three of a stack, each a step along from the last', () => {
    expect(one(yard(), drop('steel_longsword', 5, 5, 1)).copies).toBe(1);
    expect(one(yard(), drop('steel_longsword', 5, 5, 2)).copies).toBe(2);
    expect(one(yard(), drop('steel_longsword', 5, 5, 9)).copies).toBe(3);
    expect([copyOffset(1), copyOffset(2)]).toEqual([
      { dx: 5, dy: 1 },
      { dx: 10, dy: 0 }
    ]);
  });
});

const lieOf = (lieWidth: number) => ({ lieWidth, leanHeight: DROP_TILE });
const leanOf = (leanHeight: number) => ({ leanHeight, lieWidth: DROP_TILE });

describe('placement of a storage pile', () => {
  it('sits low in its tile in the open, at the stage its quantity fills', () => {
    for (const seed of SEEDS) {
      const p = one(yard(), drop('oak_log', 5, 5, 10), seed);
      expect([p.pose, p.rule, p.stage, p.cover, p.copies]).toEqual(['pile', 'pile', 1, true, 1]);
      expect(Math.abs(DROP_FOOT.y + p.dy - 25)).toBeLessThanOrEqual(3);
      expect(Math.abs(p.dx)).toBeLessThanOrEqual(2);
    }
    expect(one(yard(), drop('oak_log', 5, 5, 2)).stage).toBe(0);
    expect(one(yard(), drop('oak_log', 5, 5, 30)).stage).toBe(2);
  });

  it('is pushed up against the wall above it, and towards a wall on its west', () => {
    const above = one(yard({ walls: [[5, 4]] }), drop('oak_log', 5, 5, 10));
    expect(above.rule).toBe('against wall');
    expect(Math.abs(DROP_FOOT.y + above.dy - 11)).toBeLessThanOrEqual(1);
    const open = one(yard(), drop('oak_log', 5, 5, 10));
    const west = one(yard({ walls: [[4, 5]] }), drop('oak_log', 5, 5, 10));
    expect(west.dx).toBe(open.dx - 3);
  });

  it('keeps clear of a wall below it', () => {
    const p = one(yard({ walls: [[5, 6]] }), drop('oak_log', 5, 5, 10));
    expect(DROP_FOOT.y + p.dy).toBeLessThanOrEqual(18);
  });

  it('joins up to three neighbours of the same item in a stockpile into one stack', () => {
    const zone: [number, number][] = [2, 3, 4, 5, 6].map((x) => [x, 5]);
    const row = [2, 3, 4, 5].map((x) => drop('oak_log', x, 5, 5 + x * 5));
    const placed = planDrops(yard({ zone }), [...row, drop('iron_bar', 6, 5, 4)], 7);
    const logs = placed.filter((p) => p.id.startsWith('oak_log'));
    expect(logs.map((p) => p.rule)).toEqual(['joined', 'joined', 'joined', 'pile']);
    expect(new Set(logs.slice(0, 3).map((p) => `${p.dx},${p.dy}`)).size).toBe(1);
    expect(logs.map((p) => p.stage)).toEqual([1, 2, 2, 2]);
    expect(placed.find((p) => p.id.startsWith('iron_bar'))!.rule).toBe('pile');
  });

  it('leaves same-item neighbours apart outside a stockpile', () => {
    const placed = planDrops(yard(), [drop('oak_log', 2, 5, 5), drop('oak_log', 3, 5, 5)], 7);
    expect(placed.map((p) => p.rule)).toEqual(['pile', 'pile']);
  });

  it('never joins across a different item or a gap', () => {
    const zone: [number, number][] = [2, 3, 4, 5].map((x) => [x, 5]);
    const placed = planDrops(
      yard({ zone }),
      [drop('oak_log', 2, 5, 5), drop('pine_log', 3, 5, 5), drop('oak_log', 5, 5, 5)],
      7
    );
    expect(placed.map((p) => p.rule)).toEqual(['pile', 'pile', 'pile']);
  });
});

describe('placement of a loose item', () => {
  it('sits on the ground with grass over its base', () => {
    const p = one(yard(), drop('iron_nasal_helm', 5, 5));
    expect([p.pose, p.rule, p.cover, p.flip]).toEqual([
      'ground',
      'sits on the ground',
      true,
      false
    ]);
    expect(Math.abs(p.dx)).toBeLessThanOrEqual(5);
    expect(Math.abs(p.dy)).toBeLessThanOrEqual(3);
  });

  it('gets no grass when its row in storage.json says none', () => {
    expect(one(yard(), drop('goblin_net', 5, 5)).cover).toBe(false);
  });

  it('shows the stage of an item that has stages of its own', () => {
    const few = one(yard(), drop('flint_arrow', 5, 5, 5));
    const many = one(yard(), drop('flint_arrow', 5, 5, 70));
    expect([few.pose, few.stage]).toEqual(['pile', 0]);
    expect([many.pose, many.stage]).toEqual(['pile', 3]);
  });

  it('stands a shield up against the wall above it or a station beside it', () => {
    const wall = one(yard({ walls: [[5, 4]] }), drop('plank_round_shield', 5, 5));
    expect([wall.pose, wall.rule, wall.cover]).toEqual(['lean', 'leans on the wall', false]);
    expect(DROP_FOOT.y + wall.dy).toBe(8);
    const bench = one(
      yard({ stations: [station('anvil', 5, 5)] }),
      drop('plank_round_shield', 6, 5)
    );
    expect([bench.pose, bench.rule, bench.flip]).toEqual(['lean', 'leans on a station', false]);
    expect(one(yard(), drop('plank_round_shield', 5, 5)).pose).toBe('ground');
  });

  it('is set against the wall above anything else', () => {
    const p = one(yard({ walls: [[5, 4]] }), drop('iron_nasal_helm', 5, 5));
    expect([p.rule, DROP_FOOT.y + p.dy]).toEqual(['against wall', 8]);
  });
});

describe('a planned yard', () => {
  const env = yard({
    walls: [0, 1, 2, 3, 4, 5, 6, 7].map((x) => [x, 0]),
    zone: [1, 2, 3, 4].flatMap((x) => [2, 3].map((y): [number, number] => [x, y])),
    fields: [[7, 4]],
    stations: [station('anvil', 6, 2), station('campfire', 1, 5, true)]
  });
  const all = [...ITEMS.values()].filter((i) => !i.hidden);
  const drops = all.map((item, n) => drop(item.id, n % 8, 1 + Math.floor(n / 8), 1 + (n % 40)));

  it('places every drop once, in rows from the top', () => {
    const placed = planDrops(env, drops, 7);
    expect(placed).toHaveLength(drops.length);
    expect(new Set(placed.map((p) => p.id)).size).toBe(drops.length);
  });

  it('gives the same plan for the same seed and drops', () => {
    expect(planDrops(env, drops, 7)).toEqual(planDrops(env, [...drops].reverse(), 7));
  });

  it('never stands the foot of a drop on a wall tile', () => {
    for (const seed of SEEDS)
      for (const p of planDrops(env, drops, seed)) {
        const tx = p.x + Math.floor((DROP_FOOT.x + p.dx) / DROP_TILE);
        const ty = p.y + Math.floor((DROP_FOOT.y + p.dy) / DROP_TILE);
        expect(env.wall(tx, ty), `${p.id} ${p.rule}`).toBe(false);
      }
  });

  it('draws one drop for a tile that holds several, the last named', () => {
    const placed = planDrops(yard(), [drop('oak_log', 5, 5, 3), drop('iron_bar', 5, 5, 3)], 7);
    expect(placed.map((p) => p.id)).toEqual(['iron_bar@5,5']);
  });
});

describe('stations a tool rests on', () => {
  it('are buildings the database has', () => {
    const known = new Set(buildings.map((b) => b.id));
    for (const ids of Object.values(STATIONS_OF_TOOL))
      for (const id of ids!) expect(known.has(id), id).toBe(true);
  });
});
