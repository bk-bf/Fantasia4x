import { describe, it, expect, beforeAll } from 'vitest';
import { generateWorld } from '$lib/game/world/WorldGenerator';
import { isSpawnableTile } from '$lib/game/core/defs/terrains';
import type { WorldTile } from '$lib/game/core/types';

const SEED = 1337;
const L = 750;
const WATER = new Set(['water', 'shallow_water', 'rapids']);

function reachableFromCentre(world: WorldTile[][], open: (t: WorldTile) => boolean): Uint8Array {
  const h = world.length;
  const w = world[0].length;
  const seen = new Uint8Array(w * h);
  const start = Math.floor(h / 2) * w + Math.floor(w / 2);
  seen[start] = 1;
  const stack = [start];
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (seen[j] || !open(world[ny][nx])) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

describe('landforms on an L map', () => {
  let world: WorldTile[][];

  beforeAll(() => {
    world = generateWorld(L, L, SEED, { skipResources: true });
  }, 120_000);

  it('starts the colony on open ground at the centre', () => {
    expect(isSpawnableTile(world[L / 2][L / 2])).toBe(true);
  });

  it('joins every stretch of open ground to the colony start', () => {
    const open = (t: WorldTile) => t.walkable && t.terrainType !== 'mountain';
    const seen = reachableFromCentre(world, open);
    let cutOff = 0;
    for (const row of world) for (const t of row) if (open(t) && !seen[t.y * L + t.x]) cutOff++;
    expect(cutOff).toBe(0);
  });

  it('puts deep water only well away from the shore', () => {
    let deep = 0;
    let nearShore = 0;
    for (const row of world) {
      for (const t of row) {
        if (t.subType !== 'water') continue;
        deep++;
        for (let dy = -5; dy <= 5; dy++)
          for (let dx = -5; dx <= 5; dx++) {
            const n = world[t.y + dy]?.[t.x + dx];
            if (n && dx * dx + dy * dy <= 25 && !WATER.has(n.subType)) nearShore++;
          }
      }
    }
    expect(deep).toBeGreaterThan(0);
    expect(nearShore).toBe(0);
  });

  it('marks every river tile and gives its centreline a downstream course', () => {
    let river = 0;
    let course = 0;
    for (const row of world)
      for (const t of row) {
        if (t.river) {
          river++;
          expect(WATER.has(t.subType)).toBe(true);
        }
        if (!t.riverCourse) continue;
        course++;
        expect(t.river).toBe(true);
        expect(t.riverCourse.down).not.toBe(4);
        expect(t.riverCourse.discharge).toBeGreaterThanOrEqual(1);
      }
    expect(course).toBeGreaterThan(500);
    expect(river).toBeGreaterThan(course * 2);
  });

  it('follows each course downstream to standing water or the map edge, gathering water as it goes', () => {
    const step = (t: WorldTile) => {
      const code = t.riverCourse!.down;
      return world[t.y + Math.floor(code / 3) - 1]?.[t.x + (code % 3) - 1];
    };
    let ends = 0;
    for (const row of world)
      for (const start of row) {
        if (!start.riverCourse) continue;
        let t: WorldTile | undefined = start;
        let last = start.riverCourse.discharge;
        for (let k = 0; t?.riverCourse && k < L * 4; k++) {
          expect(t.riverCourse.discharge).toBeGreaterThanOrEqual(last);
          last = t.riverCourse.discharge;
          t = step(t);
        }
        expect(t === undefined || WATER.has(t.subType)).toBe(true);
        if (t && !t.river) ends++;
      }
    expect(ends).toBeGreaterThan(0);
  });
});
