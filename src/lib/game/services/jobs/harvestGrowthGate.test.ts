import { describe, it, expect } from 'vitest';
import type { GameState, WorldTile } from '../../core/types';
import { isHarvestableTileNow, MIN_FORAGE_GROWTH } from './filters';

// Regression: marking a forage node still below the regrow floor used to paint a harvest marker that
// the job generator silently skipped — a phantom designation no pawn ever worked (pawns idled with an
// empty queue). isHarvestableTileNow is the shared gate the mark command + UI now enforce, so it must
// agree with jobs/harvest.ts `generate`: forage gated below MIN_FORAGE_GROWTH, felling never gated.
function tileWith(resourceId: string, amount: number, growth: number): Pick<GameState, 'worldMap'> {
  const tile = {
    resources: { [resourceId]: amount },
    growth: { [resourceId]: growth }
  } as unknown as WorldTile;
  return { worldMap: [[tile]] };
}

describe('isHarvestableTileNow — harvest-mark growth gate (pine_tree)', () => {
  it('rejects a FORAGE mark on an immature node (growth below the regrow floor)', () => {
    const gs = tileWith('pine_tree', 3, MIN_FORAGE_GROWTH - 15);
    expect(isHarvestableTileNow(gs, 0, 0, 'forage')).toBe(false);
  });

  it('allows a FORAGE mark once the node has regrown past the floor', () => {
    const gs = tileWith('pine_tree', 3, MIN_FORAGE_GROWTH + 10);
    expect(isHarvestableTileNow(gs, 0, 0, 'forage')).toBe(true);
  });

  it('allows a WOODCUT (felling) mark at any growth — depleting harvests are never gated', () => {
    const gs = tileWith('pine_tree', 3, MIN_FORAGE_GROWTH - 30);
    expect(isHarvestableTileNow(gs, 0, 0, 'woodcut')).toBe(true);
  });

  it('rejects any harvest mark on a tile with no matching resource', () => {
    const gs: Pick<GameState, 'worldMap'> = { worldMap: [[{ resources: {} } as unknown as WorldTile]] };
    expect(isHarvestableTileNow(gs, 0, 0, 'forage')).toBe(false);
  });

  it('does not gate non-harvest designations (zones paint regardless of growth)', () => {
    const gs = tileWith('pine_tree', 3, 0);
    expect(isHarvestableTileNow(gs, 0, 0, 'stockpile')).toBe(true);
  });
});
