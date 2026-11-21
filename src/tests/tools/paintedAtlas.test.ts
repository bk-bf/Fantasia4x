import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import manifest from '../../../static/tilesets/painted/manifest.json';
import subterrains from '$lib/game/database/world/subterrains.json';
import resources from '$lib/game/database/world/resources.json';
import buildings from '$lib/game/database/world/buildings.json';
import creatures from '$lib/game/database/pawns/creatures.json';
import { buildTileset, parseManifest } from '$lib/webgl/painted/manifest';
import { bake } from '../../../tools/tileset/bake.mjs';

const committed = (name: string) =>
  readFileSync(new URL(`../../../static/tilesets/painted/${name}`, import.meta.url));
const png = committed('atlas.png');
const ids = (rows: { id: string }[]) => new Set(rows.map((r) => r.id));
const database: Record<string, Set<string>> = {
  subterrain: ids(subterrains),
  resource: ids(resources),
  building: ids(buildings),
  creature: ids(creatures),
  pawn: new Set(['*'])
};
type Rect = { x: number; y: number; w: number; h: number; ox: number; oy: number; patch?: number };
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

  it('gives every patch sprite whole tiles', () => {
    for (const [id, r] of Object.entries(sprites))
      if (r.patch) expect([r.w, r.h, r.ox, r.oy], id).toEqual([r.patch * 32, r.patch * 32, 0, 0]);
  });

  it('leaves a gutter between sprites', () => {
    const rects = Object.entries(sprites);
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const [a, ra] = rects[i];
        const [b, rb] = rects[j];
        const apart =
          ra.x + ra.w < rb.x || rb.x + rb.w < ra.x || ra.y + ra.h < rb.y || rb.y + rb.h < ra.y;
        expect(apart, `${a} and ${b}`).toBe(true);
      }
  });

  it('maps only database ids, and only to sprites that exist', () => {
    expect(Object.keys(map).sort()).toEqual(Object.keys(database).sort());
    for (const [cat, entries] of Object.entries(map))
      for (const [id, targets] of Object.entries(entries)) {
        expect(database[cat].has(id), `${cat} ${id}`).toBe(true);
        expect(targets.length, `${cat} ${id}`).toBeGreaterThan(0);
        for (const t of targets) expect(sprites[t], `${cat} ${id} -> ${t}`).toBeDefined();
      }
  });

  it('loads through the renderer reader with no problems', () => {
    const { tileset, problems } = buildTileset(parseManifest(manifest));
    expect(problems).toEqual([]);
    expect(tileset.atlasW).toBe(manifest.atlas.w);
  });

  it('bakes the same bytes as the committed atlas and manifest', () => {
    const out = bake();
    expect(Buffer.compare(out.png, png)).toBe(0);
    expect(JSON.stringify(out.manifest, null, 2) + '\n').toBe(
      committed('manifest.json').toString('utf8')
    );
  });
});
