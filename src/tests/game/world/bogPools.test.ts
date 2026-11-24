import { describe, it, expect, beforeAll } from 'vitest';
import { generateWorld } from '$lib/game/world/WorldGenerator';
import { SUBTERRAINS, pickSubterrain } from '$lib/game/core/defs/terrains';
import type { WorldTile } from '$lib/game/core/types';

const LAND_SWAMP = new Set(['mud', 'bog', 'clay', 'moss', 'quicksand']);

function bodies(world: WorldTile[][], subType: string): number[] {
  const h = world.length;
  const w = world[0].length;
  const seen = new Uint8Array(w * h);
  const sizes: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || world[(i / w) | 0][i % w].subType !== subType) continue;
    seen[i] = 1;
    const stack = [i];
    let n = 0;
    while (stack.length) {
      const j = stack.pop() as number;
      n++;
      const x = j % w;
      const y = (j / w) | 0;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1]
      ]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (seen[k] || world[ny][nx].subType !== subType) continue;
        seen[k] = 1;
        stack.push(k);
      }
    }
    sizes.push(n);
  }
  return sizes;
}

describe('bog in the swamp', () => {
  it('forms where the pool noise is high, below the moss band, and nowhere without it', () => {
    expect(pickSubterrain('swamp', 0.1, () => 0.6)).toBe('bog');
    expect(pickSubterrain('swamp', -0.6, () => 0.6)).toBe('bog');
    expect(pickSubterrain('swamp', 0.1, () => -0.5)).toBe('clay');
    expect(pickSubterrain('swamp', -0.3, () => 0.1)).toBe('mud');
    expect(pickSubterrain('swamp', 0.6, () => 0.9)).toBe('moss');
    expect(pickSubterrain('swamp', 0.8, () => 0.9)).toBe('quicksand');
    expect(pickSubterrain('swamp', 0.1)).toBe('clay');
    expect(pickSubterrain('plains', 0, () => 0.9)).toBe('grass');
  });

  it('stays walkable ground at its movement cost', () => {
    expect(SUBTERRAINS.bog.walkable).toBe(true);
    expect(SUBTERRAINS.bog.movementCost).toBe(3.5);
  });

  describe('on a generated map', () => {
    let world: WorldTile[][];
    beforeAll(() => {
      world = generateWorld(750, 750, 42, { skipResources: true });
    }, 120_000);

    it('breaks bog into small pools holding about a quarter of the swamp ground', () => {
      const land = world.flat().filter((t) => LAND_SWAMP.has(t.subType));
      const bog = land.filter((t) => t.subType === 'bog');
      expect(bog.length / land.length).toBeGreaterThan(0.22);
      expect(bog.length / land.length).toBeLessThan(0.33);
      const sizes = bodies(world, 'bog');
      expect(Math.max(...sizes)).toBeLessThan(60);
      expect(sizes.filter((s) => s >= 30).length).toBeLessThan(sizes.length / 20);
    });

    it('generates every bog tile walkable at its movement cost', () => {
      const bog = world.flat().filter((t) => t.subType === 'bog');
      expect(bog.length).toBeGreaterThan(0);
      for (const t of bog) {
        expect(t.walkable).toBe(true);
        expect(t.movementCost).toBe(3.5);
      }
    });
  });
});
