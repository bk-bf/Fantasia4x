import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildTileset,
  idHash,
  paintedQuad,
  parseManifest,
  patchCell,
  pickVariant,
  positionHash,
  spriteAt
} from '$lib/webgl/painted/manifest';
import { readPaintedFlag } from '$lib/webgl/painted/flag';

const FIXTURE = join(__dirname, 'fixture');
const raw = JSON.parse(readFileSync(join(FIXTURE, 'manifest.json'), 'utf8'));
const manifest = parseManifest(raw);
const { tileset, problems } = buildTileset(manifest);

function pngSize(path: string): { w: number; h: number } {
  const b = readFileSync(path);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe('painted manifest parsing', () => {
  it('reads the fixture, whose atlas matches the size it declares', () => {
    expect(problems).toEqual([]);
    expect(pngSize(join(FIXTURE, 'atlas.png'))).toEqual(manifest.atlas);
  });

  it('refuses a sprite outside the atlas', () => {
    const bad = structuredClone(raw);
    bad.sprites.tree_oak.x = manifest.atlas.w;
    expect(() => parseManifest(bad)).toThrow(/outside the atlas/);
  });

  it('refuses a patch whose size is not n by n tiles', () => {
    const bad = structuredClone(raw);
    bad.sprites.ground_grass.patch = 3;
    expect(() => parseManifest(bad)).toThrow(/not 3 by 3 tiles/);
  });

  it('drops a map entry that names a missing sprite and reports it', () => {
    const odd = structuredClone(raw);
    odd.map.resource.pine_tree = ['tree_pine_a', 'no_such_sprite'];
    const built = buildTileset(parseManifest(odd));
    expect(built.problems).toEqual(['map.resource.pine_tree names unknown sprite no_such_sprite']);
    expect(built.tileset.lookup.get('resource')!.get('pine_tree')).toHaveLength(1);
  });
});

describe('painted manifest lookup', () => {
  it('finds a database id under its kind and nothing under another kind', () => {
    expect(tileset.lookup.get('resource')!.get('oak_tree')).toHaveLength(1);
    expect(tileset.lookup.get('creature')!.get('oak_tree')).toBeUndefined();
    expect(tileset.lookup.get('resource')!.get('maple_tree')).toBeUndefined();
  });

  it('shares one resolved variant between ids that name the same sprite', () => {
    const creatures = tileset.lookup.get('creature')!;
    expect(creatures.get('deer')![0]).toBe(creatures.get('elk')![0]);
  });

  it('converts the atlas rectangle to uv and the offset and size to tiles', () => {
    const s = tileset.lookup.get('resource')!.get('oak_tree')![0].cells[0];
    const r = manifest.sprites.tree_oak;
    expect(s.u1).toBeCloseTo(r.x / manifest.atlas.w);
    expect(s.v2).toBeCloseTo((r.y + r.h) / manifest.atlas.h);
    expect([s.ox, s.oy, s.w, s.h]).toEqual([-0.5, -1.5, 2, 2.5]);
  });
});

describe('painted variant choice', () => {
  const pines = tileset.lookup.get('resource')!.get('pine_tree')!;

  it('gives the same variant for the same tile every time', () => {
    const a = pickVariant(pines, positionHash(12, 40));
    for (let i = 0; i < 5; i++) expect(pickVariant(pines, positionHash(12, 40))).toBe(a);
  });

  it('uses every variant across a field of tiles', () => {
    const seen = new Set();
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) seen.add(pickVariant(pines, positionHash(x, y)));
    expect(seen.size).toBe(2);
  });

  it('picks by entity id, independent of where the entity stands', () => {
    const pawns = tileset.lookup.get('pawn')!.get('syleth')!;
    const ids = ['pawn-1', 'pawn-2', 'pawn-3', 'pawn-4', 'pawn-5', 'pawn-6'];
    const picked = ids.map((id) => pickVariant(pawns, idHash(id)));
    expect(ids.map((id) => pickVariant(pawns, idHash(id)))).toEqual(picked);
    expect(new Set(picked).size).toBe(2);
  });
});

describe('painted patch cells', () => {
  it('wraps tile coordinates into the n by n patch, negatives included', () => {
    expect(patchCell(0, 0, 4)).toBe(0);
    expect(patchCell(5, 0, 4)).toBe(1);
    expect(patchCell(3, 2, 4)).toBe(11);
    expect(patchCell(-1, -1, 4)).toBe(15);
    expect(patchCell(-4, 8, 4)).toBe(0);
    expect(patchCell(7, 7, 1)).toBe(0);
  });

  it('draws the 32 px cell at (x mod n, y mod n) of the patch', () => {
    const grass = tileset.lookup.get('subterrain')!.get('grass')![0];
    const r = manifest.sprites.ground_grass;
    const cell = spriteAt(grass, 6, 401);
    expect(cell.u1).toBeCloseTo((r.x + 2 * 32) / manifest.atlas.w);
    expect(cell.v1).toBeCloseTo((r.y + 1 * 32) / manifest.atlas.h);
    expect(cell.u2 - cell.u1).toBeCloseTo(32 / manifest.atlas.w);
    expect([cell.ox, cell.oy, cell.w, cell.h]).toEqual([0, 0, 1, 1]);
    expect(spriteAt(grass, 2, 1)).toBe(cell);
  });
});

describe('painted quad geometry', () => {
  const tree = { u1: 0, v1: 0, u2: 1, v2: 1, ox: -8 / 32, oy: -48 / 32, w: 48 / 32, h: 80 / 32 };
  const out = [0, 0, 0, 0];

  it('places a 48x80 tree at ox -8, oy -48 on a 16 px base tile', () => {
    paintedQuad(tree, 3, 5, 16, 0, 0, 1, false, out);
    expect(out).toEqual([44, 56, 68, 96]);
  });

  it('stands a one-tile sprite exactly on its cell', () => {
    paintedQuad({ ...tree, ox: 0, oy: 0, w: 1, h: 1 }, 3, 5, 16, 0, 0, 1, false, out);
    expect(out).toEqual([48, 80, 64, 96]);
  });

  it('carries the animation offset in base pixels', () => {
    paintedQuad(tree, 3, 5, 16, 4, -2, 1, false, out);
    expect(out).toEqual([48, 54, 72, 94]);
  });

  it('lays a sleeper on its side, feet on the cell and centred across it', () => {
    paintedQuad({ ...tree, ox: 0, oy: -0.5, w: 1, h: 1.5 }, 0, 0, 16, 0, 0, 1, true, out);
    expect(out).toEqual([-4, 0, 20, 16]);
  });

  it('shrinks a growing sprite about the foot of its cell', () => {
    paintedQuad({ ...tree, ox: 0, oy: -1, w: 1, h: 2 }, 0, 0, 16, 0, 0, 0.5, false, out);
    expect(out).toEqual([4, 0, 12, 16]);
  });
});

describe('painted flag', () => {
  it('is on for ?painted=1 or the stored switch, and off otherwise', () => {
    expect(readPaintedFlag('?painted=1', null)).toBe(true);
    expect(readPaintedFlag('?x=2&painted=1', null)).toBe(true);
    expect(readPaintedFlag('', '1')).toBe(true);
    expect(readPaintedFlag('?painted=0', null)).toBe(false);
    expect(readPaintedFlag('', '0')).toBe(false);
    expect(readPaintedFlag('', null)).toBe(false);
  });
});
