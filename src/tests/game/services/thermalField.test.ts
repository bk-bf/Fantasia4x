import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeThermalAt,
  rebuildThermalField,
  thermalAt
} from '$lib/game/services/EnvironmentService';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService';
import { clearTileDeltas, markTileDirty } from '$lib/game/core/state/tileDeltas';
import type { PlacedBuilding, WorldTile } from '$lib/game/core/types';

type Grove = [x: number, y: number, id: string];

const W = 24;
const H = 18;

function worldWith(groves: Grove[]): WorldTile[][] {
  const map = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => ({ x, y, walkable: true, resources: {} }))
  ) as unknown as WorldTile[][];
  for (const [x, y, id] of groves) map[y][x].resources = { [id]: 1 };
  return map;
}

function warmthOf(sources: { x: number; y: number; degrees: number; radius: number }[]) {
  return (x: number, y: number, start = 0) => {
    let w = start;
    for (const s of sources) {
      const d = Math.sqrt((x - s.x) ** 2 + (y - s.y) ** 2);
      if (d < s.radius) w += s.degrees * (1 - d / s.radius);
    }
    return w;
  };
}

function groveSources(groves: Grove[]) {
  return [...groves]
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .map(([x, y, id]) => ({ x, y, ...resourceObjectService.getById(id)!.thermal! }));
}

const GROVES: Grove[] = [
  [3, 3, 'emberwood_grove'],
  [6, 4, 'moonwood_grove'],
  [5, 2, 'heartwood_grove'],
  [22, 16, 'frostheart_pine'],
  [0, 17, 'soulwood_grove']
];

describe('thermalAt — grove warmth read from a precomputed field', () => {
  beforeEach(() => clearTileDeltas());

  it('matches the per-source sum exactly on every tile and just off the map', () => {
    rebuildThermalField([], worldWith(GROVES));
    const ref = warmthOf(groveSources(GROVES));
    for (let y = -3; y < H + 3; y++)
      for (let x = -3; x < W + 3; x++) expect(thermalAt(x, y).warmth).toBe(ref(x, y));
    expect(thermalAt(3.5, 2.25).warmth).toBe(ref(3.5, 2.25));
    expect(thermalAt(3, 3).warmth).toBeGreaterThan(0);
    expect(thermalAt(22, 16).warmth).toBeLessThan(0);
  });

  it('follows a new map whose grove is gone', () => {
    rebuildThermalField([], worldWith(GROVES));
    expect(thermalAt(22, 16).warmth).toBeLessThan(0);
    rebuildThermalField([], worldWith(GROVES.slice(0, 3)));
    expect(thermalAt(22, 16).warmth).toBe(0);
    expect(thermalAt(22, 16).roofed).toBe(false);
  });

  it('adds a lit fire on top of the grove warmth', () => {
    const fire = {
      id: 'campfire-4-3',
      type: 'campfire',
      x: 4,
      y: 3,
      status: 'complete',
      progress: 1,
      lit: true
    } as PlacedBuilding;
    rebuildThermalField([fire], worldWith(GROVES));
    const groves = warmthOf(groveSources(GROVES));
    expect(computeThermalAt(4, 3, [fire]).warmth).toBeGreaterThan(0);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        expect(thermalAt(x, y).warmth).toBe(groves(x, y, computeThermalAt(x, y, [fire]).warmth));
    rebuildThermalField([], worldWith(GROVES));
    expect(thermalAt(4, 3).warmth).toBe(groves(4, 3));
  });

  it('follows groves harvested and regrown in place on the same map', () => {
    const map = worldWith(GROVES);
    rebuildThermalField([], map);
    const every = (groves: Grove[]) => {
      const ref = warmthOf(groveSources(groves));
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) expect(thermalAt(x, y).warmth).toBe(ref(x, y));
    };
    every(GROVES);

    map[3][3].resources = { emberwood_grove: 0 };
    markTileDirty(3, 3, map[3][3]);
    rebuildThermalField([], map);
    every(GROVES.slice(1));

    map[3][3].resources = { emberwood_grove: 2 };
    map[10][12].resources = { emberwood_grove: 1 };
    markTileDirty(3, 3, map[3][3]);
    markTileDirty(10, 12, map[10][12]);
    rebuildThermalField([], map);
    every([...GROVES, [12, 10, 'emberwood_grove']]);
  });
});
