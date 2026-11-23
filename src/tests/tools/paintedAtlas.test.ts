import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import manifest from '../../../static/tilesets/painted/manifest.json';
import subterrains from '$lib/game/database/world/subterrains.json';
import resources from '$lib/game/database/world/resources.json';
import buildings from '$lib/game/database/world/buildings.json';
import creatures from '$lib/game/database/pawns/creatures.json';
import items from '$lib/game/database/items/items.json';
import lore from '$lib/game/database/social/culture-lore.json';
import { buildTileset, parseManifest } from '$lib/webgl/painted/manifest';
import { bake } from '../../../tools/tileset/bake.mjs';
import { decodePng } from '../../../tools/tileset/png.mjs';

const committed = (name: string) =>
  readFileSync(new URL(`../../../static/tilesets/painted/${name}`, import.meta.url));
const png = committed('atlas.png');
const decoded = () => ({ pixels: decodePng(png).rgba });
const ids = (rows: { id: string }[]) => new Set(rows.map((r) => r.id));
const database: Record<string, Set<string>> = {
  subterrain: ids(subterrains),
  resource: ids(resources),
  building: ids(buildings),
  creature: ids(creatures),
  pawn: new Set(['*', ...lore.archetypes.map((a) => a.name)]),
  item: ids(items)
};
const catalogued: Record<string, string[]> = {
  subterrain: [...database.subterrain],
  resource: [...database.resource],
  building: buildings.filter((b) => !b.ageTier.startsWith('runed:')).map((b) => b.id),
  creature: [...database.creature],
  pawn: lore.archetypes.map((a) => a.name),
  item: items.filter((i) => !i.hidden).map((i) => i.id)
};
const STATES = new Set(['idle']);
const unstated = (key: string) => {
  const [id, state] = key.split(':');
  return state === undefined || STATES.has(state) ? id : key;
};
type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
  patch?: number;
  cw?: number;
  ch?: number;
};
const sprites: Record<string, Rect> = manifest.sprites;
const map: Record<string, Record<string, string[]>> = manifest.map;

describe('painted atlas manifest', () => {
  it('states the size of the atlas png', () => {
    expect(png.readUInt32BE(16)).toBe(manifest.atlas.w);
    expect(png.readUInt32BE(20)).toBe(manifest.atlas.h);
    expect(manifest.tile).toBe(32);
  });

  it('fits the atlas within 4096 px on each side', () => {
    expect(manifest.atlas.w).toBeLessThanOrEqual(4096);
    expect(manifest.atlas.h).toBeLessThanOrEqual(4096);
  });

  it('paints every ground kind in the database', () => {
    for (const id of database.subterrain) expect(map.subterrain[id], id).toBeDefined();
  });

  it('keeps every sprite rect inside the atlas', () => {
    for (const [id, r] of Object.entries(sprites)) {
      expect(r.w, id).toBeGreaterThan(0);
      expect(r.h, id).toBeGreaterThan(0);
      expect(
        r.x >= 0 && r.y >= 0 && r.x + r.w <= manifest.atlas.w && r.y + r.h <= manifest.atlas.h,
        id
      ).toBe(true);
    }
  });

  it('gives every patch sprite whole tiles, or whole cells larger than a tile', () => {
    for (const [id, r] of Object.entries(sprites)) {
      if (!r.patch) continue;
      if (r.cw === undefined)
        expect([r.w, r.h, r.ox, r.oy], id).toEqual([r.patch * 32, r.patch * 32, 0, 0]);
      else expect([r.w, r.h], id).toEqual([r.patch * r.cw, r.patch * r.ch!]);
    }
  });

  it('keeps the rock top mark out of every sprite but the rock pieces', () => {
    const { pixels } = decoded();
    const mark = (i: number) => pixels[i] === 255 && pixels[i + 2] === 255 && pixels[i + 1] < 13;
    for (const [id, r] of Object.entries(sprites)) {
      if (id.startsWith('rock/mass/')) continue;
      let marked = 0;
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++)
          if (pixels[(y * manifest.atlas.w + x) * 4 + 3] && mark((y * manifest.atlas.w + x) * 4))
            marked++;
      expect(marked, id).toBe(0);
    }
  });

  it('keeps drop shadows out of the colour atlas and in the light atlas', () => {
    const { pixels } = decoded();
    const light = decodePng(committed('atlas-light.png')).rgba;
    const faintest = 233;
    let translucent = 0;
    for (let i = 3; i < pixels.length; i += 4)
      if (pixels[i] > 0 && pixels[i] < faintest) translucent++;
    expect(translucent).toBe(0);
    const covered = (id: string, channel: number) => {
      const r = sprites[id];
      let n = 0;
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++)
          if (light[(y * manifest.atlas.w + x) * 4 + channel]) n++;
      return n;
    };
    expect(covered('tree/oak/0', 1)).toBeGreaterThan(0);
    expect(covered('building/campfire', 0)).toBeGreaterThan(0);
    expect(covered('rock/vent/0', 0)).toBeGreaterThan(0);
    expect(covered('tree/oak/0', 0)).toBe(0);
  });

  it('names a rock piece for every neighbour layout, for walls the database has', () => {
    const rock = manifest.pieces.rock;
    expect(rock.layouts).toHaveLength(256);
    for (const id of rock.layouts) expect(sprites[id], id).toBeDefined();
    for (const id of rock.resources) expect(database.resource.has(id), id).toBe(true);
  });

  it('leaves a gutter between sprites', () => {
    const rects = Object.entries(sprites);
    const touching: string[] = [];
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const [a, ra] = rects[i];
        const [b, rb] = rects[j];
        const apart =
          ra.x + ra.w < rb.x || rb.x + rb.w < ra.x || ra.y + ra.h < rb.y || rb.y + rb.h < ra.y;
        if (!apart) touching.push(`${a} and ${b}`);
      }
    expect(touching).toEqual([]);
  });

  it('maps only database ids, and only to sprites that exist', () => {
    expect(Object.keys(map).sort()).toEqual(Object.keys(database).sort());
    for (const [cat, entries] of Object.entries(map))
      for (const [id, targets] of Object.entries(entries)) {
        expect(database[cat].has(unstated(id)), `${cat} ${id}`).toBe(true);
        expect(targets.length, `${cat} ${id}`).toBeGreaterThan(0);
        for (const t of targets) expect(sprites[t], `${cat} ${id} -> ${t}`).toBeDefined();
      }
  });

  it('maps every catalogue entry the game uses', () => {
    for (const [cat, wanted] of Object.entries(catalogued))
      for (const id of wanted) expect(map[cat][id], `${cat} ${id}`).toBeDefined();
  });

  it('draws every fire the game can let go out unlit as well', () => {
    for (const b of buildings.filter((d) => (d.maxFuel ?? 0) > 0))
      expect(map.building[`${b.id}:idle`], b.id).toBeDefined();
  });

  it('loads through the renderer reader with no problems', () => {
    const { tileset, problems } = buildTileset(parseManifest(manifest));
    expect(problems).toEqual([]);
    expect(tileset.atlasW).toBe(manifest.atlas.w);
  });

  it('bakes the same bytes as the committed atlas, rock top and manifest', () => {
    const out = bake();
    expect(Buffer.compare(out.png, png)).toBe(0);
    expect(Buffer.compare(out.light, committed('atlas-light.png'))).toBe(0);
    expect(Buffer.compare(out.top, committed(manifest.pieces.rock.top.image))).toBe(0);
    expect(Buffer.compare(out.water, committed(manifest.water.image))).toBe(0);
    expect(JSON.stringify(out.manifest, null, 2) + '\n').toBe(
      committed('manifest.json').toString('utf8')
    );
  }, 120_000);
});
