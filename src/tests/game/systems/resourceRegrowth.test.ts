import { describe, it, expect, beforeEach } from 'vitest';
import { gameEngine } from '$lib/game/systems/GameEngineImpl';
import { drainTileDeltas, clearTileDeltas } from '$lib/game/core/tileDeltas';
import type { GameState, WorldTile } from '$lib/game/core/types';

// processResourceRegrowth must mutate only expired tiles in place and ship them as worldMap deltas — never replace the worldMap ref.
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

// Drive the private per-tick phase against a hand-built state (no browser/worker needed).
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

    expect(t.resources.berry_bush).toBeGreaterThanOrEqual(1); // regrew
    expect(t.resourceCooldowns?.berry_bush).toBeUndefined(); // cooldown removed
    expect(worldMap[0][0]).toBe(t); // same tile object — mutated in place, not replaced
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
    // the still-cooling tile was left alone
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
    // Two per-yield cooldowns for the same resource: one expired, one not → partial recovery.
    const t = tile({
      x: 0,
      y: 0,
      resources: { oak_tree: 0 },
      resourceCooldowns: { 'oak_tree:wood': 5, 'oak_tree:bark': 999 }
    });
    runRegrowth([[t]], 10);

    expect(t.resourceCooldowns?.['oak_tree:wood']).toBeUndefined(); // expired yield cleared
    expect(t.resourceCooldowns?.['oak_tree:bark']).toBe(999); // sibling still cooling
    expect(t.resources.oak_tree).toBe(1); // partial — node available, count pinned to 1

    // Now expire the sibling too → full restore, all cooldowns gone.
    clearTileDeltas();
    runRegrowth([[t]], 1000);
    expect(t.resourceCooldowns?.['oak_tree:bark']).toBeUndefined();
    expect(t.resources.oak_tree).toBeGreaterThanOrEqual(1);
  });
});
