import { describe, it, expect } from 'vitest';
import type { WorldTile } from '$lib/game/core/types';
import {
  ELDER_CHANCE,
  ELDER_CLEARING,
  ELDER_EDGE,
  elderAllowed,
  elderSite,
  nearElder
} from '$lib/webgl/painted/elder';
import { treeAgeIn } from '$lib/webgl/painted/treeAge';

const MAGIC = 'heartwood_grove';
const hasElder = (id: string) => id === MAGIC;

function grove(size: number, at: (x: number, y: number) => Record<string, number> | null) {
  return Array.from({ length: size }, (_, y) =>
    Array.from(
      { length: size },
      (_, x) =>
        ({
          x,
          y,
          type: 'land',
          subType: 'grass',
          resources: at(x, y) ?? {},
          walkable: true
        }) as unknown as WorldTile
    )
  );
}

const SIZE = 200;
const GROVE = 40;
const forest = (n: number) => {
  const ox = 16 + ((n * 13) % 40);
  const oy = 16 + ((n * 29) % 40);
  return (x: number, y: number) =>
    (x * 7 + y * 13) % 3 !== 0 && x >= ox && x < ox + GROVE && y >= oy && y < oy + GROVE
      ? { [MAGIC]: 3 }
      : null;
};

function mapWithElder() {
  for (let n = 0; n < 60; n++) {
    const map = grove(SIZE, forest(n));
    const site = elderSite(map, hasElder);
    if (site) return { map, site };
  }
  throw new Error('no map of the sizes tried has an elder');
}

describe('the elder site', () => {
  it('is one tile of a magical tree, deep in its grove and away from the edge and the start', () => {
    const { map, site } = mapWithElder();
    expect(site.id).toBe(MAGIC);
    expect(map[site.y][site.x].resources[MAGIC]).toBeGreaterThan(0);
    expect(site.x).toBeGreaterThanOrEqual(ELDER_EDGE);
    expect(site.x).toBeLessThan(map.length - ELDER_EDGE);
    expect(Math.hypot(site.x - SIZE / 2, site.y - SIZE / 2)).toBeGreaterThanOrEqual(40);
  });

  it('turns up on about the elder share of maps', () => {
    let allowed = 0;
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) if (elderAllowed(x, y)) allowed++;
    expect(allowed / 10000).toBeGreaterThan(ELDER_CHANCE - 0.03);
    expect(allowed / 10000).toBeLessThan(ELDER_CHANCE + 0.03);
  });

  it('stays on the same tile once that tree is felled, so it never comes back', () => {
    const { map, site } = mapWithElder();
    const again = grove(map.length, (x, y) =>
      x === site.x && y === site.y
        ? { [MAGIC]: 0 }
        : (map[y][x].resources as Record<string, number>)
    );
    expect(elderSite(again, hasElder)).toEqual(site);
  });

  it('never stands next to water', () => {
    const { map, site } = mapWithElder();
    const wet = grove(map.length, (x, y) => map[y][x].resources as Record<string, number>);
    wet[site.y + 2][site.x].type = 'water';
    expect(elderSite(wet, hasElder)).not.toEqual(site);
  });

  it('draws the elder at its tile and the trees around it young', () => {
    const { map, site } = mapWithElder();
    expect(treeAgeIn(map[site.y][site.x], map, hasElder)).toBe('elder');
    expect(nearElder(site, site.x + ELDER_CLEARING, site.y)).toBe('clearing');
    expect(treeAgeIn({ x: site.x + 1, y: site.y + 1 }, map, hasElder)).toBe('young');
    expect(nearElder(site, site.x + ELDER_CLEARING + 1, site.y)).toBe(null);
  });
});
