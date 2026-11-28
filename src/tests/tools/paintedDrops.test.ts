import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import manifest from '../../../static/tilesets/painted/manifest.json';
import items from '$lib/game/database/items/items.json';
import type { Item } from '$lib/game/core/types';
import { itemStorage, stageCount } from '$lib/game/services/storageRules';
import { buildTileset, parseManifest } from '$lib/webgl/painted/manifest';
import { storageJson } from '../../../tools/tileset/storage.mjs';

type Drop = { pile?: string[]; lean?: string[]; lie?: string[]; ground?: string };
const ITEMS = items as unknown as Item[];
const drops: Record<string, Drop> = manifest.drops.items;
const cover: Record<string, string> = manifest.drops.cover;
const sprites: Record<string, { w: number; h: number; ox: number; oy: number }> = manifest.sprites;
const TILE = manifest.tile;
const NOT_REDRAWN = 'hides';
const drawn = ITEMS.filter((i) => !i.hidden);
const isHide = (i: Item) => {
  const s = itemStorage(i);
  return s.kind === 'pile' && s.pile === NOT_REDRAWN;
};
const spritesOf = (d: Drop) => [
  ...(d.pile ?? []),
  ...(d.lean ?? []),
  ...(d.lie ?? []),
  ...(d.ground ? [d.ground] : [])
];

describe('map sprites of dropped items', () => {
  it('bakes map sprites for every item the game shows, except the hide pile', () => {
    const missing = drawn.filter((i) => !isHide(i) && !drops[i.id]).map((i) => i.id);
    expect(missing).toEqual([]);
    expect(drawn.filter((i) => isHide(i) && drops[i.id]).map((i) => i.id)).toEqual([]);
    expect(drawn.filter(isHide).length).toBeGreaterThan(0);
  });

  it('bakes the poses and stages the storage class of each item calls for', () => {
    const wrong: string[] = [];
    for (const item of drawn) {
      const d = drops[item.id];
      if (!d) continue;
      const s = itemStorage(item);
      const staged = s.kind === 'pile' || (s.kind === 'loose' && s.stages !== undefined);
      const fits = staged
        ? d.pile?.length === stageCount(s) && !d.ground && !d.lie
        : s.kind === 'long'
          ? d.lean?.length === 2 && d.lie?.length === 2 && !d.pile && !d.ground
          : d.ground !== undefined &&
            !d.pile &&
            !d.lie &&
            (d.lean?.length ?? 0) === (s.kind === 'loose' && s.family === 'shield' ? 1 : 0);
      if (!fits) wrong.push(item.id);
    }
    expect(wrong).toEqual([]);
  });

  it('names only sprites the atlas has, with a cover in every grass colour', () => {
    const ramps = Math.max(...Object.values(manifest.drops.grass)) + 1;
    expect(ramps).toBeGreaterThan(1);
    for (const [id, d] of Object.entries(drops))
      for (const sid of spritesOf(d)) expect(sprites[sid], `${id} -> ${sid}`).toBeDefined();
    for (const [sid, blades] of Object.entries(cover)) {
      expect(sprites[sid], sid).toBeDefined();
      for (let ramp = 0; ramp < ramps; ramp++)
        expect(sprites[`${blades}/${ramp}`], `${sid} -> ${blades}/${ramp}`).toBeDefined();
    }
  });

  it('covers every pile and lying item with grass, and no leaning or bare-ground one', () => {
    const wrong: string[] = [];
    for (const item of drawn) {
      const d = drops[item.id];
      if (!d) continue;
      const s = itemStorage(item);
      const resting = [...(d.pile ?? []), ...(d.lie ?? []), ...(d.ground ? [d.ground] : [])];
      if (s.kind === 'loose' && s.tuck === 'none')
        wrong.push(...resting.filter((sid) => cover[sid]));
      if (s.kind !== 'loose') wrong.push(...resting.filter((sid) => !cover[sid]));
      wrong.push(...(d.lean ?? []).filter((sid) => cover[sid]));
    }
    expect(wrong).toEqual([]);
  });

  it('bakes each long item leaning and lying both ways round', () => {
    const middle = (sid: string) => sprites[sid].ox + sprites[sid].w / 2;
    const [lean, leanFlipped] = drops.steel_longsword.lean!;
    const [lie, lieFlipped] = drops.steel_longsword.lie!;
    expect(middle(lean)).toBeLessThan(middle(leanFlipped));
    expect(sprites[lie].w).toBe(sprites[lieFlipped].w);
    expect(sprites[lean].h).toBeGreaterThan(sprites[lie].h * 2);
  });

  it('keeps every map sprite within its tile and the eight around it', () => {
    for (const d of Object.values(drops))
      for (const sid of spritesOf(d)) {
        const s = sprites[sid];
        expect(s.ox >= -TILE && s.ox + s.w <= 2 * TILE, sid).toBe(true);
        expect(s.oy >= -TILE && s.oy + s.h <= 2 * TILE, sid).toBe(true);
      }
  });

  it('names a grass colour only for ground kinds the manifest paints', () => {
    for (const kind of Object.keys(manifest.drops.grass))
      expect(manifest.map.subterrain, kind).toHaveProperty(kind);
  });

  it('loads through the renderer reader with every item resolved', () => {
    const { tileset, problems } = buildTileset(parseManifest(manifest));
    expect(problems).toEqual([]);
    expect(tileset.drops!.items.size).toBe(Object.keys(drops).length);
  });

  it('keeps storage.json as the art derives it', () => {
    const committed = readFileSync(
      new URL('../../../src/lib/game/database/items/storage.json', import.meta.url),
      'utf8'
    );
    expect(storageJson()).toBe(committed);
  }, 60_000);
});
