import { describe, it, expect } from 'vitest';
import type { WorldTile } from '$lib/game/core/types';
import { chamferDistance } from '$lib/game/world/chamfer';
import { beachStretch, isWet, shapeShores } from '$lib/game/world/shores';

const SIZE = 90;

function lakeWorld(radius: number, ox = 0, oy = 0): WorldTile[][] {
  const c = SIZE / 2;
  const world = Array.from({ length: SIZE }, (_, y) =>
    Array.from({ length: SIZE }, (_, x) => {
      const d = Math.hypot(x + ox - c, y + oy - c);
      return {
        x,
        y,
        terrainType: 'plains',
        subType: d < radius ? 'shallow_water' : 'grass',
        resources: { oak_tree: 1 }
      } as unknown as WorldTile;
    })
  );
  const w = SIZE;
  const fromShore = chamferDistance(w, w, (i) => !isWet(world[(i / w) | 0][i % w]));
  for (const row of world)
    for (const t of row) if (fromShore[t.y * w + t.x] >= 6) t.subType = 'water';
  return world;
}

const setGround = (t: WorldTile, subType: string) => {
  t.subType = subType;
};

const shoreDistance = (world: WorldTile[][]) =>
  chamferDistance(SIZE, SIZE, (i) => !isWet(world[(i / SIZE) | 0][i % SIZE]));

const tiles = (world: WorldTile[][]) => world.flat();

describe('shores on a landforms map', () => {
  it('widen the shallows of a big lake to eight tiles or more', () => {
    const world = lakeWorld(40);
    const before = shoreDistance(world);
    shapeShores(world, setGround);
    for (const t of tiles(world))
      if (t.subType === 'water') expect(before[t.y * SIZE + t.x]).toBeGreaterThanOrEqual(8);
    expect(tiles(world).some((t) => t.subType === 'water')).toBe(true);
  });

  it('keep three tiles of deep water in the middle of a small lake', () => {
    const world = lakeWorld(10);
    const before = shoreDistance(world);
    const widest = Math.max(...tiles(world).map((t) => before[t.y * SIZE + t.x]));
    shapeShores(world, setGround);
    const deep = tiles(world).filter((t) => t.subType === 'water');
    expect(deep.length).toBeGreaterThan(0);
    for (const t of tiles(world))
      if (before[t.y * SIZE + t.x] >= widest - 3 && before[t.y * SIZE + t.x] >= 6)
        expect(t.subType).toBe('water');
  });

  it('widen a stream where it runs into a lake, and only there', () => {
    const world = lakeWorld(25);
    const c = SIZE / 2;
    for (let y = 0; y < c; y++) {
      const t = world[y][c];
      if (isWet(t)) break;
      Object.assign(t, { subType: 'shallow_water', river: true });
    }
    const wasStream = new Set(
      tiles(world)
        .filter((t) => t.river)
        .map((t) => t)
    );
    shapeShores(world, setGround);
    const widened = tiles(world).filter((t) => t.river && !wasStream.has(t));
    expect(widened.length).toBeGreaterThan(0);
    const lakeEdge = c - 25;
    for (const t of widened) {
      expect(Math.abs(t.x - c)).toBeLessThanOrEqual(3);
      expect(lakeEdge - t.y).toBeLessThanOrEqual(12);
      expect(t.resources).toEqual({});
    }
    expect(world[2][c + 2].subType).toBe('grass');
  });

  it('lay a beach of bank only where the beach noise allows, clearing what grew there', () => {
    const world = lakeWorld(40);
    const before = shoreDistance(world);
    shapeShores(world, setGround);
    const toWater = chamferDistance(SIZE, SIZE, (i) => isWet(world[(i / SIZE) | 0][i % SIZE]));
    const beach = tiles(world).filter(
      (t) => t.subType === 'riverbank' && toWater[t.y * SIZE + t.x] >= 1.5
    );
    expect(beach.length).toBeGreaterThan(0);
    for (const t of beach) {
      expect(beachStretch(t.x, t.y)).toBeGreaterThan(0);
      expect(t.resources).toEqual({});
      expect(before[t.y * SIZE + t.x]).toBe(0);
    }
  });

  it('ring every shore with bank and leave the mountains alone', () => {
    const world = lakeWorld(30);
    for (const row of world) row[0].terrainType = 'mountain';
    shapeShores(world, setGround);
    const toWater = chamferDistance(SIZE, SIZE, (i) => isWet(world[(i / SIZE) | 0][i % SIZE]));
    for (const t of tiles(world)) {
      if (isWet(t) || t.terrainType === 'mountain') continue;
      if (toWater[t.y * SIZE + t.x] < 1.5) expect(t.subType).toBe('riverbank');
    }
    for (const row of world) expect(row[0].subType).toBe('grass');
  });
});
