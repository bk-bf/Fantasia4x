import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { generateWorld } from '$lib/game/world/WorldGenerator';
import { readMapGeneratorFlag, usesLandforms } from '$lib/game/world/mapGenerator';
import { isSpawnableTile } from '$lib/game/core/defs/terrains';
import type { WorldTile } from '$lib/game/core/types';

const SEED = 1337;
const L = 750;
const WATER = new Set(['water', 'shallow_water', 'rapids']);

const digest = (world: WorldTile[][]) =>
  createHash('sha1').update(JSON.stringify(world)).digest('hex');

function share(world: WorldTile[][], pick: (t: WorldTile) => boolean): number {
  let hits = 0;
  for (const row of world) for (const t of row) if (pick(t)) hits++;
  return hits / (world.length * world[0].length);
}

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

describe('map generator switch', () => {
  it('reads the launch option before the stored choice and defaults to landforms', () => {
    expect(readMapGeneratorFlag('', null)).toBe('landforms');
    expect(readMapGeneratorFlag('', 'classic')).toBe('classic');
    expect(readMapGeneratorFlag('?mapgen=landforms', 'classic')).toBe('landforms');
    expect(readMapGeneratorFlag('?mapgen=classic', null)).toBe('classic');
    expect(readMapGeneratorFlag('?mapgen=nonsense', null)).toBe('landforms');
  });

  it('only takes the new generator on maps of L size and larger', () => {
    expect(usesLandforms('landforms', L, L)).toBe(true);
    expect(usesLandforms('landforms', 1000, 1000)).toBe(true);
    expect(usesLandforms('landforms', 500, 500)).toBe(false);
    expect(usesLandforms('classic', L, L)).toBe(false);
  });

  it('leaves smaller maps exactly as the old generator lays them', () => {
    const old = generateWorld(120, 90, SEED, { generator: 'classic' });
    const asked = generateWorld(120, 90, SEED, { generator: 'landforms' });
    expect(digest(asked)).toBe(digest(old));
  });
});

describe('landforms on an L map', () => {
  let classic: WorldTile[][];
  let world: WorldTile[][];

  beforeAll(() => {
    classic = generateWorld(L, L, SEED, { generator: 'classic', skipResources: true });
    world = generateWorld(L, L, SEED, { generator: 'landforms', skipResources: true });
  }, 120_000);

  it('differs from the old map of the same seed', () => {
    let differ = 0;
    for (let y = 0; y < L; y++)
      for (let x = 0; x < L; x++)
        if (world[y][x].terrainType !== classic[y][x].terrainType) differ++;
    expect(differ / (L * L)).toBeGreaterThan(0.2);
  });

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

  it('keeps the old share of mountain and water', () => {
    const mountain = (t: WorldTile) => t.terrainType === 'mountain';
    const water = (t: WorldTile) => WATER.has(t.subType);
    expect(Math.abs(share(world, mountain) - share(classic, mountain))).toBeLessThan(0.03);
    expect(Math.abs(share(world, water) - share(classic, water))).toBeLessThan(0.04);
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
});
