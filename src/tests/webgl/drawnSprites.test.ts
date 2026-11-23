import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorldTile } from '$lib/game/core/types';
import manifestJson from '../../../static/tilesets/painted/manifest.json';
import { decodePng } from '../../../tools/tileset/png.mjs';

vi.mock('$lib/webgl/painted/flag', () => ({ PAINTED_TILES: true }));
vi.mock('$lib/webgl/painted/flag.js', () => ({ PAINTED_TILES: true }));

const { buildTileset, parseManifest } = await import('$lib/webgl/painted/manifest');
const { paintedEntity, setPaintedTileset } = await import('$lib/webgl/painted/tileset');
const { buildResourceOverlay } = await import('$lib/webgl/fantasia-world');
const { GameGrid } = await import('$lib/webgl/game-grid');
const { BASE_TILE_PX } = await import('$lib/webgl/tile-types');
const { atlasTexels, drawnAt, drawnBounds, drawnFigure, FACE_ALPHA, FACE_ROWS, OBJECT_FOOT } =
  await import('$lib/webgl/drawnSprites');
const { POSE_RANGE, poseSway } = await import('$lib/webgl/pose');
type DrawnFrame = import('$lib/webgl/drawnSprites').DrawnFrame;

const ROOT = join(__dirname, '../../..');
const manifest = parseManifest(manifestJson);
const B = BASE_TILE_PX;
const WALL = { walkable: false, resources: { mountain_wall: 1 } };
const PINE = { resources: { pine_tree: 1 } };
let frame: DrawnFrame;

beforeAll(() => {
  setPaintedTileset(buildTileset(manifest).tileset);
  const png = decodePng(readFileSync(join(ROOT, 'static/tilesets/painted/atlas.png')));
  frame = {
    basePx: B,
    artPx: manifest.tile,
    lift: manifest.pieces!.rock.top!.lift,
    texels: atlasTexels(png.rgba, png.w, png.h),
    depth: true
  };
});

function world(at: (x: number, y: number) => Partial<WorldTile>): WorldTile[][] {
  return Array.from({ length: 12 }, (_, y) =>
    Array.from(
      { length: 9 },
      (_, x) =>
        ({ x, y, walkable: true, subType: 'grass', resources: {}, ...at(x, y) }) as WorldTile
    )
  );
}

function grids(map: WorldTile[][]) {
  const { short, tall } = buildResourceOverlay(
    map,
    map.map((row) => row.map(() => false))
  );
  return { short, tall, entity: new GameGrid() };
}

function samples(tx: number, ty: number): [number, number][] {
  const step = B / manifest.tile;
  const out: [number, number][] = [];
  for (let y = ty * B + step / 2; y < (ty + 1) * B; y += step)
    for (let x = tx * B + step / 2; x < (tx + 1) * B; x += step) out.push([x, y]);
  return out;
}

const pick = (g: ReturnType<typeof grids>, [x, y]: [number, number]) =>
  drawnAt([g.short, null, null, g.entity, g.tall], x, y, frame);

describe('a click resolves to what is drawn under the cursor', () => {
  it('gives the wall a click on the mountain drawn over the grass tile north of it', () => {
    const g = grids(world((_, y) => (y >= 5 ? WALL : {})));
    const onRock = samples(3, 4).filter((p) => pick(g, p) !== null);
    expect(onRock.length).toBeGreaterThan(samples(3, 4).length / 2);
    for (const p of onRock) expect(pick(g, p)).toEqual({ layer: 0, x: 3, y: 5 });
    const lowerHalf = onRock.filter(([, y]) => y > 4.5 * B);
    expect(lowerHalf.length).toBeGreaterThan(0.9 * (samples(3, 4).length / 2));
  });

  it('gives the wall a click on its front face where the face hangs over the grass below', () => {
    const g = grids(world((_, y) => (y <= 5 ? WALL : {})));
    const onFace = [1, 2, 3, 4, 5, 6, 7].flatMap((x) =>
      samples(x, 6).filter((p) => pick(g, p) !== null)
    );
    expect(onFace.length).toBeGreaterThan(0);
    for (const p of onFace) expect(pick(g, p)).toEqual({ layer: 0, x: Math.floor(p[0] / B), y: 5 });
    expect(pick(g, [3.5 * B, 6.9 * B])).toBeNull();
  });

  it('gives the tree a click on its canopy above its own tile, and not a click beside it', () => {
    const g = grids(world((x, y) => (x === 3 && y === 6 ? PINE : {})));
    const onCanopy = samples(3, 5).filter((p) => pick(g, p) !== null);
    expect(onCanopy.length).toBeGreaterThan(samples(3, 5).length / 4);
    for (const p of onCanopy) expect(pick(g, p)).toEqual({ layer: 0, x: 3, y: 6 });
    const bounds = drawnBounds(g.short.getTile(3, 6)!, frame);
    expect(pick(g, [bounds[0] + 0.1, bounds[1] + 0.1])).toBeNull();
  });

  it('puts a pawn standing in front of a wall ahead of the rock it overlaps', () => {
    const walls = grids(world((_, y) => (y <= 4 ? WALL : {})));
    const pawn = grids(world(() => ({})));
    pawn.entity.setTile(3, 5, {
      char: '@',
      foreground: { r: 1, g: 1, b: 1 },
      background: { r: 0, g: 0, b: 0 },
      position: { x: 3, y: 5 },
      ...paintedEntity('pawn', undefined, 'pawn-1')
    });
    const both = { ...walls, entity: pawn.entity };
    const overlap = [4, 5]
      .flatMap((ty) => samples(3, ty))
      .filter((p) => pick(walls, p) !== null && pick(pawn, p) !== null);
    expect(overlap.length).toBeGreaterThan(0);
    for (const p of overlap) expect(pick(both, p)).toEqual({ layer: 3, x: 3, y: 5 });
  });
});

describe('the brackets frame the sprite as drawn', () => {
  it('spans exactly the pixels a click would give to the tree', () => {
    const g = grids(world((x, y) => (x === 3 && y === 6 ? PINE : {})));
    const half = B / manifest.tile / 2;
    const hits = [3, 4, 5, 6]
      .flatMap((ty) => [2, 3, 4].flatMap((tx) => samples(tx, ty)))
      .filter((p) => pick(g, p) !== null);
    const xs = hits.map(([x]) => x);
    const ys = hits.map(([, y]) => y);
    expect(drawnBounds(g.short.getTile(3, 6)!, frame)).toEqual([
      Math.min(...xs) - half,
      Math.min(...ys) - half,
      Math.max(...xs) + half,
      Math.max(...ys) + half
    ]);
  });

  it('is taller than the tile for a pine', () => {
    const g = grids(world((x, y) => (x === 3 && y === 6 ? PINE : {})));
    const [, top, , bottom] = drawnBounds(g.short.getTile(3, 6)!, frame);
    expect(bottom - top).toBeGreaterThan(1.5 * B);
  });
});

describe('the pick reads the rock depth the way the fragment shader does', () => {
  it('shares its face and foot constants with the shader', () => {
    const glsl = readFileSync(join(ROOT, 'src/lib/webgl/shaders/fragment.glsl'), 'utf8');
    expect(glsl).toContain(`const int FACE_ALPHA = ${FACE_ALPHA};`);
    expect(glsl).toContain(`const int FACE_ROWS = ${FACE_ROWS};`);
    expect(glsl).toContain(`const highp float OBJECT_FOOT = ${OBJECT_FOOT.toFixed(1)};`);
  });
});

describe('a flipped creature is drawn, picked and framed mirrored', () => {
  const wolfAt = (flip: boolean) => {
    const g = grids(world(() => ({})));
    g.entity.setTile(3, 6, {
      char: 'w',
      foreground: { r: 1, g: 1, b: 1 },
      background: { r: 0, g: 0, b: 0 },
      position: { x: 3, y: 6 },
      flip,
      ...paintedEntity('creature', 'wolf', 'wolf-1')
    });
    return g;
  };
  const axis = 3 * B + B / 2;
  const around = [4, 5, 6].flatMap((ty) => [1, 2, 3, 4, 5].flatMap((tx) => samples(tx, ty)));

  it('gives the flipped wolf exactly the clicks the plain wolf gets on the other side', () => {
    const plain = wolfAt(false);
    const flipped = wolfAt(true);
    const hits = around.filter((p) => pick(plain, p) !== null);
    expect(hits.length).toBeGreaterThan(20);
    for (const [x, y] of around)
      expect(pick(flipped, [2 * axis - x, y]) !== null).toBe(pick(plain, [x, y]) !== null);
    expect(hits.some(([x, y]) => pick(flipped, [x, y]) === null)).toBe(true);
  });

  it('mirrors the brackets and marks the figure flipped', () => {
    const [x1, y1, x2, y2] = drawnBounds(wolfAt(false).entity.getTile(3, 6)!, frame);
    expect(drawnBounds(wolfAt(true).entity.getTile(3, 6)!, frame)).toEqual([
      2 * axis - x2,
      y1,
      2 * axis - x1,
      y2
    ]);
    expect(drawnFigure(wolfAt(true).entity.getTile(3, 6)!, frame).flipped).toBe(true);
  });
});

describe('a posed sprite reaches the shader through its sway value', () => {
  const decode = (sway: number) => {
    const code = -sway - 1;
    return [Math.floor(code / 8) - 4, (code % 8) - 4];
  };

  it('round-trips every lean and squash the vertex shader can decode', () => {
    const glsl = readFileSync(join(ROOT, 'src/lib/webgl/shaders/vertex.glsl'), 'utf8');
    expect(glsl).toContain('v_pose = vec3(1.0, floor(code / 8.0) - 4.0, mod(code, 8.0) - 4.0);');
    for (let lean = -POSE_RANGE; lean <= POSE_RANGE; lean++)
      for (let squash = -POSE_RANGE; squash <= POSE_RANGE; squash++) {
        const sway = poseSway(lean, squash);
        expect(sway).toBeLessThan(0);
        expect(decode(sway)).toEqual([lean, squash]);
      }
  });
});
