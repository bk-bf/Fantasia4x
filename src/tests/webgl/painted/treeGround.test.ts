import { describe, it, expect } from 'vitest';
import manifest from '../../../../static/tilesets/painted/manifest.json';
import { buildTileset, parseManifest } from '$lib/webgl/painted/manifest';
import { BED, TreeField, type Probe } from '$lib/webgl/painted/treeGround';
import { TreeGroundLayer } from '$lib/webgl/painted/treeGroundLayer';
import { GameGrid } from '$lib/webgl/game-grid';
import type { GpuDevice } from '$lib/gpu/device';
import {
  KIND_ROWS,
  TABLE_W,
  tableRows,
  treeGroundTable,
  treeSoils
} from '$lib/webgl/painted/treeGroundTable';

const { tileset, problems } = buildTileset(parseManifest(manifest));
const look = tileset.treeGround!;
const ART = 32;
const grass = look.soils.get('grass')!;

const standFor = (
  resource: string,
  age: 'young' | 'mature' | 'elder',
  season = 'summer' as const
) => {
  const sprite = tileset.trees.get(resource)?.[age]?.[season][0]?.cells[0];
  return sprite ? look.stands.get(sprite) : undefined;
};

const field = (soil = grass) => new TreeField(24, 24, ART, look, () => soil);

describe('tree ground patches', () => {
  it('resolves a stand for every big tree sprite with no unknown sprite named', () => {
    expect(problems).toEqual([]);
    expect(look.kinds.length).toBeGreaterThan(5);
    expect(standFor('oak_tree', 'mature')).toMatchObject({ age: 'mature', season: 'summer' });
    for (const [resource, ages] of tileset.trees)
      for (const [age, seasons] of Object.entries(ages))
        if (look.stands.has(seasons.summer[0].cells[0]))
          expect(look.stands.get(seasons.summer[0].cells[0])?.age, `${resource} ${age}`).toBe(age);
  });

  it('lays a bed around a mature tree that fades out within its reach', () => {
    const f = field();
    expect(f.plant(12, 12, standFor('oak_tree', 'mature'))).toBe(true);
    f.restamp(0, 0, 23, 23);
    const at = (tx: number, ty: number) => f.str[ty * f.w + tx];
    expect(at(12, 12)).toBeGreaterThan(BED);
    expect(at(12, 12)).toBeGreaterThan(at(14, 12));
    expect(at(0, 0)).toBe(0);
    expect(f.own[12 * f.w + 12]).toBe(12 * f.w + 12);
    const out: Probe = { level: -1, tree: -1, soil: grass };
    f.probe(12 * ART + 16, 12 * ART + 23, out);
    expect(out.tree).toBe(12 * f.w + 12);
    expect(out.level).toBeGreaterThan(0);
  });

  it('gives an elder a wider patch than a young tree of its kind', () => {
    const span = (age: 'young' | 'elder') => {
      const f = field();
      f.plant(12, 12, standFor('heartwood_grove', age));
      f.restamp(0, 0, 23, 23);
      return f.str.filter((s) => s > 0).length;
    };
    expect(span('elder')).toBeGreaterThan(span('young'));
  });

  it('dresses mature trees with props and leaves young ones bare, the same way each time', () => {
    const f = field();
    f.plant(12, 12, standFor('oak_tree', 'mature'));
    f.plant(4, 4, standFor('oak_tree', 'young'));
    f.restamp(0, 0, 23, 23);
    const mature = f.trees.get(12 * f.w + 12)!;
    expect(f.dress(f.trees.get(4 * f.w + 4)!)).toEqual([]);
    const once = f.dress(mature);
    expect(once.length).toBeGreaterThan(0);
    expect(f.dress(mature)).toEqual(once);
  });

  it('grows nothing on open water', () => {
    const f = field({ gain: 0 });
    f.plant(12, 12, standFor('oak_tree', 'mature'));
    f.restamp(0, 0, 23, 23);
    const out: Probe = { level: -1, tree: -1, soil: grass };
    expect(f.probe(12 * ART + 16, 12 * ART + 23, out).level).toBe(-1);
  });

  it('packs every kind and soil into a table the shader reads at a fixed width', () => {
    const soils = treeSoils(look, ['grass', 'clay', 'water'], (id) => id === 'water');
    expect(soils).toHaveLength(4);
    const table = treeGroundTable(look, soils);
    expect(table.length).toBe(TABLE_W * tableRows(look.kinds.length) * 4);
    const soilRow = look.kinds.length * KIND_ROWS + 2;
    const gainAt = (i: number) => table[(soilRow * TABLE_W + i) * 4];
    expect(gainAt(1)).toBeGreaterThan(gainAt(2));
    expect(gainAt(3)).toBe(0);
  });

  it('rebuilds and uploads nothing on a frame where the tree grids did not change', () => {
    let uploads = 0;
    const gpu = {
      createTexture: () => ({}),
      destroyTexture: () => {},
      setTextureSlot: () => {},
      bindTexture: () => {},
      setSampler: () => {},
      setUnpackAlignment: () => {},
      writeTexture: () => {},
      writeSubTexture: () => uploads++
    } as unknown as GpuDevice;
    const layer = new TreeGroundLayer(gpu, look, ART);
    const trees = new GameGrid();
    const oak = tileset.trees.get('oak_tree')!.mature!.summer[0].cells[0];
    const at = (x: number, y: number) => ({
      char: ' ',
      foreground: { r: 0, g: 0, b: 0 },
      background: { r: 0, g: 0, b: 0 },
      position: { x, y },
      painted: oak
    });
    trees.setTile(6, 6, at(6, 6));
    const kinds = new Uint8Array(24 * 24).fill(1);
    const soils = [{ gain: 0 }, grass];
    layer.setTrees([trees, null]);
    layer.sync(kinds, 24, 24, soils);
    expect(uploads).toBeGreaterThan(0);
    const view = { x: 0, y: 0, w: 24, h: 24 };
    expect(layer.dressAround(view, 1000).length).toBeGreaterThan(0);
    uploads = 0;
    for (let frame = 0; frame < 3; frame++) {
      layer.setTrees([trees, null]);
      layer.sync(kinds, 24, 24, soils);
      expect(layer.dressAround(view, 1000)).toEqual([]);
    }
    expect(uploads).toBe(0);
    trees.setTile(16, 16, at(16, 16));
    layer.setTrees([trees, null], [{ x: 16, y: 16 }]);
    layer.sync(kinds, 24, 24, soils);
    expect(uploads).toBe(1);
    expect(layer.dressAround(view, 1000)).toContainEqual({ x: 16, y: 16 });
  });

  it('drops the props of the old map when a map of another size arrives', () => {
    const gpu = {
      createTexture: () => ({}),
      destroyTexture: () => {},
      setTextureSlot: () => {},
      bindTexture: () => {},
      setSampler: () => {},
      setUnpackAlignment: () => {},
      writeTexture: () => {},
      writeSubTexture: () => {}
    } as unknown as GpuDevice;
    const layer = new TreeGroundLayer(gpu, look, ART);
    const oak = tileset.trees.get('oak_tree')!.mature!.summer[0].cells[0];
    const old = new GameGrid();
    old.setTile(6, 6, {
      char: ' ',
      foreground: { r: 0, g: 0, b: 0 },
      background: { r: 0, g: 0, b: 0 },
      position: { x: 6, y: 6 },
      painted: oak
    });
    const soils = [{ gain: 0 }, grass];
    layer.setTrees([old, null]);
    layer.sync(new Uint8Array(24 * 24).fill(1), 24, 24, soils);
    layer.dressAround({ x: 0, y: 0, w: 24, h: 24 }, 1000);
    expect(layer.decor.getTile(6, 6)).toBeDefined();
    layer.setTrees([new GameGrid(), null]);
    layer.sync(new Uint8Array(30 * 30).fill(1), 30, 30, soils);
    expect(layer.dressAround({ x: 0, y: 0, w: 30, h: 30 }, 1000)).toContainEqual({ x: 6, y: 6 });
    expect([...layer.decor.getAllTiles()]).toEqual([]);
  });
});
