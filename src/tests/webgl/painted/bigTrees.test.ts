import { describe, it, expect } from 'vitest';
import manifest from '../../../../static/tilesets/painted/manifest.json';
import { buildTileset, parseManifest, TREE_AGES, TREE_SEASONS } from '$lib/webgl/painted/manifest';
import { MATURE_SHARE, treeAge, treeSeason } from '$lib/webgl/painted/treeAge';
import { readFileSync } from 'node:fs';
import { ATLAS_MAX } from '../../../../tools/tileset/bake.mjs';
import { decodePng } from '../../../../tools/tileset/png.mjs';

const parsed = parseManifest(manifest);
const { tileset, problems } = buildTileset(parsed);

describe('big trees in the painted atlas', () => {
  it('keeps the atlas within the size every WebGL2 device here takes', () => {
    expect(parsed.atlas.w).toBeLessThanOrEqual(ATLAS_MAX);
    expect(parsed.atlas.h).toBeLessThanOrEqual(ATLAS_MAX);
  });

  it('draws every tree resource at each age in each season', () => {
    expect(problems).toEqual([]);
    const trees = Object.entries(parsed.map.resource ?? {}).filter(([, ids]) =>
      ids.every((id) => id.startsWith('tree/'))
    );
    expect(trees.length).toBeGreaterThan(10);
    for (const [id] of trees)
      for (const age of TREE_AGES.filter((a) => a !== 'elder'))
        for (const season of TREE_SEASONS)
          expect(
            tileset.trees.get(id)?.[age]?.[season].length,
            `${id} ${age} ${season}`
          ).toBeGreaterThan(0);
  });

  it('marks the parts of tree pixels and of nothing else, so the cutaway takes only trees', () => {
    const light = decodePng(
      readFileSync(new URL('../../../../static/tilesets/painted/atlas-light.png', import.meta.url))
    );
    const parted = (s: { x: number; y: number; w: number; h: number }) => {
      for (let y = 0; y < s.h; y++)
        for (let x = 0; x < s.w; x++)
          if (light.rgba[((s.y + y) * light.w + s.x + x) * 4 + 2]) return true;
      return false;
    };
    const sprites = Object.entries(parsed.sprites);
    expect(sprites.filter(([id, s]) => !/^trees?\//.test(id) && parted(s))).toEqual([]);
    expect(parted(parsed.sprites['trees/oak/mature/summer/0'])).toBe(true);
  });

  it('gives each magical tree an elder, and no other tree', () => {
    const magic = ['heartwood_grove', 'frostheart_pine', 'soulwood_grove', 'bonewood_snag'];
    for (const id of magic) expect(tileset.trees.get(id)?.elder?.winter.length, id).toBe(1);
    expect(tileset.trees.get('oak_tree')?.elder).toBeUndefined();
    const elder = tileset.trees.get('heartwood_grove')!.elder!.summer[0].cells[0];
    const mature = tileset.trees.get('heartwood_grove')!.mature!.summer[0].cells[0];
    expect(elder.w).toBeGreaterThan(mature.w * 1.6);
  });

  it('draws a mature tree wider and taller than a young one', () => {
    const oak = tileset.trees.get('oak_tree')!;
    const young = oak.young!.summer[0].cells[0];
    const mature = oak.mature!.summer[0].cells[0];
    expect(mature.w).toBeGreaterThan(young.w * 1.6);
    expect(mature.h).toBeGreaterThan(young.h * 1.3);
  });

  it('gives a deciduous tree its own autumn and winter, and an evergreen its own winter', () => {
    const oak = tileset.trees.get('oak_tree')!;
    const pine = tileset.trees.get('pine_tree')!;
    for (const age of ['young', 'mature'] as const) {
      const [o, p] = [oak[age]!, pine[age]!];
      expect(o.autumn[0]).not.toBe(o.summer[0]);
      expect(o.winter[0]).not.toBe(o.summer[0]);
      expect(p.autumn[0]).toBe(p.summer[0]);
      expect(p.winter[0]).not.toBe(p.summer[0]);
    }
  });
});

describe('a tree age read from its tile', () => {
  const tiles = Array.from({ length: 4000 }, (_, i) => ({ x: i % 80, y: Math.floor(i / 80) }));

  it('makes about the mature share of never-felled trees mature', () => {
    const mature = tiles.filter((t) => treeAge(t) === 'mature').length / tiles.length;
    expect(mature).toBeGreaterThan(MATURE_SHARE - 0.05);
    expect(mature).toBeLessThan(MATURE_SHARE + 0.05);
  });

  it('draws a tree that has been felled and regrown young', () => {
    for (const t of tiles) expect(treeAge({ ...t, growthTurn: 10 })).toBe('young');
  });

  it('shows spring as summer', () => {
    expect(treeSeason('spring')).toBe('summer');
    expect(treeSeason(undefined)).toBe('summer');
    expect(treeSeason('winter')).toBe('winter');
  });
});
