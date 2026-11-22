import { describe, it, expect } from 'vitest';
import type { GameState, WorldTile } from '$lib/game/core/types';
import { zoneTileKeys } from '$lib/game/core/state/zoneTiles';
import { designationService } from '$lib/game/services/DesignationService';

function field(w: number, h: number): GameState {
  const worldMap: WorldTile[][] = [];
  for (let y = 0; y < h; y++) {
    const row: WorldTile[] = [];
    for (let x = 0; x < w; x++)
      row.push({ x, y, walkable: true, subType: 'grass', resources: {} } as unknown as WorldTile);
    worldMap.push(row);
  }
  return { worldMap, designations: {}, zoneTiles: {}, buildings: [], droppedItems: [] } as unknown as GameState;
}

describe('zoneTileKeys', () => {
  it('follows every repaint of the zone layer', () => {
    let gs = field(4, 4);
    expect(zoneTileKeys(gs, 'grow')).toEqual([]);
    gs = designationService.designate(1, 1, 'grow', gs);
    gs = designationService.designate(2, 1, 'grow', gs);
    expect(zoneTileKeys(gs, 'grow')).toEqual(['1,1', '2,1']);
    gs = designationService.designate(3, 3, 'stockpile', gs);
    expect(zoneTileKeys(gs, 'grow')).toEqual(['1,1', '2,1']);
    expect(zoneTileKeys(gs, 'stockpile')).toEqual(['3,3']);
    gs = designationService.clearDesignation(1, 1, gs);
    expect(zoneTileKeys(gs, 'grow')).toEqual(['2,1']);
  });

  it('answers the same zone layer with the same keys without rescanning', () => {
    const gs = designationService.designate(0, 0, 'grow', field(2, 2));
    expect(zoneTileKeys(gs, 'grow')).toBe(zoneTileKeys(gs, 'grow'));
    expect(zoneTileKeys({ ...gs, zoneTiles: { ...gs.zoneTiles } }, 'grow')).not.toBe(
      zoneTileKeys(gs, 'grow')
    );
  });
});
