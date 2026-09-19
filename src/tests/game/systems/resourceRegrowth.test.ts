import { describe, it, expect, beforeEach } from 'vitest';
import { gameEngine } from '$lib/game/systems/GameEngineImpl';
import { drainTileDeltas, clearTileDeltas, markTileDirty } from '$lib/game/core/state/tileDeltas';
import {
  pushRegrowth,
  popRegrowth,
  peekRegrowthTurn,
  clearRegrowthQueue
} from '$lib/game/core/rules/world/regrowthQueue';
import type { GameState, WorldTile } from '$lib/game/core/types';

function tile(over: Partial<WorldTile>): WorldTile {
  return {
    x: 0,
    y: 0,
    walkable: true,
    terrainType: 'plains',
    resources: {} as Record<string, number>,
    ...over
  } as WorldTile;
}

function runRegrowth(worldMap: WorldTile[][], turn: number): void {
  const eng = gameEngine as unknown as {
    gameState: Partial<GameState>;
    processResourceRegrowth: () => void;
  };
  eng.gameState = { turn, worldMap } as Partial<GameState>;
  eng.processResourceRegrowth();
}

describe('processResourceRegrowth (in-place + deltas)', () => {
  beforeEach(() => clearTileDeltas());

  it('restores a simple expired cooldown and clears it, mutating the tile in place', () => {
    const t = tile({
      x: 0,
      y: 0,
      resources: { berry_bush: 0 },
      resourceCooldowns: { berry_bush: 5 }
    });
    const worldMap = [[t]];

    runRegrowth(worldMap, 10);

    expect(t.resources.berry_bush).toBeGreaterThanOrEqual(1);
    expect(t.resourceCooldowns?.berry_bush).toBeUndefined();
    expect(worldMap[0][0]).toBe(t);
  });

  it('emits exactly the changed tiles as deltas (unexpired tiles untouched)', () => {
    const hot = tile({
      x: 1,
      y: 0,
      resources: { berry_bush: 0 },
      resourceCooldowns: { berry_bush: 5 }
    });
    const cold = tile({
      x: 0,
      y: 0,
      resources: { berry_bush: 0 },
      resourceCooldowns: { berry_bush: 999 }
    });
    const worldMap = [[cold, hot]];

    runRegrowth(worldMap, 10);

    const deltas = drainTileDeltas();
    expect(deltas).not.toBeNull();
    expect(deltas).toHaveLength(1);
    expect(deltas![0]).toMatchObject({ y: 0, x: 1 });
    expect(deltas![0].tile).toBe(hot);
    expect(cold.resources.berry_bush).toBe(0);
    expect(cold.resourceCooldowns?.berry_bush).toBe(999);
  });

  it('does nothing (no deltas) when no cooldown has expired', () => {
    const t = tile({ resources: { berry_bush: 0 }, resourceCooldowns: { berry_bush: 999 } });
    runRegrowth([[t]], 10);
    expect(drainTileDeltas()).toBeNull();
    expect(t.resources.berry_bush).toBe(0);
  });

  it('compound keys: partial recovery (count=1) while a sibling yield still cools, then full restore', () => {
    const t = tile({
      x: 0,
      y: 0,
      resources: { oak_tree: 0 },
      resourceCooldowns: { 'oak_tree:wood': 5, 'oak_tree:bark': 999 }
    });
    runRegrowth([[t]], 10);

    expect(t.resourceCooldowns?.['oak_tree:wood']).toBeUndefined();
    expect(t.resourceCooldowns?.['oak_tree:bark']).toBe(999);
    expect(t.resources.oak_tree).toBe(1);

    clearTileDeltas();
    runRegrowth([[t]], 1000);
    expect(t.resourceCooldowns?.['oak_tree:bark']).toBeUndefined();
    expect(t.resources.oak_tree).toBeGreaterThanOrEqual(1);
  });

  it('rebuildRegrowthQueue scans every row: a tile at y>=1 still regrows', () => {
    const t0 = tile({
      x: 0,
      y: 0,
      resources: { berry_bush: 0 },
      resourceCooldowns: { berry_bush: 999 }
    });
    const t1 = tile({
      x: 0,
      y: 1,
      resources: { berry_bush: 0 },
      resourceCooldowns: { berry_bush: 5 }
    });
    const worldMap = [[t0], [t1]];

    runRegrowth(worldMap, 10);

    expect(t1.resources.berry_bush).toBeGreaterThanOrEqual(1);
    expect(t1.resourceCooldowns?.berry_bush).toBeUndefined();
    expect(t0.resourceCooldowns?.berry_bush).toBe(999);
  });
});

describe('regrowthQueue heap (pushRegrowth / peekRegrowthTurn / popRegrowth)', () => {
  beforeEach(() => clearRegrowthQueue());

  it('finds the true minimum turn regardless of push order (heap ordering)', () => {
    pushRegrowth(50, 0, 0);
    pushRegrowth(10, 1, 0);
    pushRegrowth(30, 0, 1);
    pushRegrowth(20, 1, 1);
    expect(peekRegrowthTurn()).toBe(10);
  });

  it('pops entries in ascending turn order across repeated calls', () => {
    pushRegrowth(30, 0, 0);
    pushRegrowth(10, 1, 1);
    pushRegrowth(20, 2, 2);
    expect(popRegrowth()).toEqual({ turn: 10, x: 1, y: 1 });
    expect(popRegrowth()).toEqual({ turn: 20, x: 2, y: 2 });
    expect(popRegrowth()).toEqual({ turn: 30, x: 0, y: 0 });
    expect(popRegrowth()).toBeUndefined();
  });

  it('processResourceRegrowth only regrows a tile once turn reaches its exact expiry', () => {
    const early = tile({
      x: 0,
      y: 0,
      resources: { berry_bush: 0 },
      resourceCooldowns: { berry_bush: 20 }
    });
    const worldMap = [[early]];

    runRegrowth(worldMap, 19);
    expect(early.resourceCooldowns?.berry_bush).toBe(20);
    expect(early.resources.berry_bush).toBe(0);

    runRegrowth(worldMap, 20);
    expect(early.resourceCooldowns?.berry_bush).toBeUndefined();
    expect(early.resources.berry_bush).toBeGreaterThanOrEqual(1);
  });
});

describe('tileDeltas (markTileDirty / drainTileDeltas / clearTileDeltas)', () => {
  beforeEach(() => clearTileDeltas());

  it('a terrain mark evicts a queued snow entry for the same tile', () => {
    const t = tile({ x: 2, y: 3 });
    markTileDirty(3, 2, t, 'snow');
    markTileDirty(3, 2, t, 'terrain');
    const deltas = drainTileDeltas();
    expect(deltas).toHaveLength(1);
    expect(deltas![0].kind).toBe('terrain');
  });

  it('drainTileDeltas drains the buffer: a second call returns null', () => {
    const t = tile({ x: 4, y: 4 });
    markTileDirty(4, 4, t);
    expect(drainTileDeltas()).not.toBeNull();
    expect(drainTileDeltas()).toBeNull();
  });

  it('clearTileDeltas empties a non-empty queue', () => {
    const t = tile({ x: 5, y: 5 });
    markTileDirty(5, 5, t);
    clearTileDeltas();
    expect(drainTileDeltas()).toBeNull();
  });
});
