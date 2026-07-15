import { describe, it, expect } from 'vitest';
import type { GameState, WorldTile, ZoneInstance } from '$lib/game/core/types';
import { allowedTilesForPawn, nearestAllowedTile } from '$lib/game/systems/pawn/zoneConfine';
import { buildPathfindingGridsConfined } from '$lib/game/services/PathfinderService';

// Minimal GameState slice — allowedTilesForPawn only reads zoneInstances + designationZoneId. New object
// refs each call so the memo doesn't bleed between cases. The `restrictTiles` arg is the flat tile→id
// shorthand; it's wrapped into the layered `{ tile: { restrict: id } }` shape the real state uses.
function stateWith(
  zoneInstances: ZoneInstance[],
  restrictTiles: Record<string, string>
): GameState {
  const designationZoneId: Record<string, { restrict: string }> = {};
  for (const [tile, id] of Object.entries(restrictTiles)) designationZoneId[tile] = { restrict: id };
  return { zoneInstances, designationZoneId } as unknown as GameState;
}
const restrictZone = (id: string, assignedPawnIds: string[]): ZoneInstance => ({
  id,
  type: 'restrict',
  label: id,
  filter: { allowedCategories: [], blockedItems: [] },
  assignedPawnIds
});

describe('zone confinement — allowedTilesForPawn', () => {
  it('returns null (unrestricted) when there are no restrict zones', () => {
    expect(allowedTilesForPawn(stateWith([], {}), 'p1')).toBeNull();
  });

  it('returns null for a pawn assigned to no restrict zone', () => {
    const s = stateWith([restrictZone('z1', ['p2'])], { '1,1': 'z1' });
    expect(allowedTilesForPawn(s, 'p1')).toBeNull();
  });

  it('confines an assigned pawn to its zone tiles', () => {
    const s = stateWith([restrictZone('z1', ['p1'])], { '1,1': 'z1', '1,2': 'z1', '5,5': 'z2' });
    const allowed = allowedTilesForPawn(s, 'p1');
    expect(allowed).not.toBeNull();
    expect([...allowed!].sort()).toEqual(['1,1', '1,2']);
  });

  it('unions the tiles of every zone a pawn is assigned to', () => {
    const s = stateWith([restrictZone('z1', ['p1']), restrictZone('z2', ['p1'])], {
      '1,1': 'z1',
      '8,8': 'z2'
    });
    expect([...allowedTilesForPawn(s, 'p1')!].sort()).toEqual(['1,1', '8,8']);
  });

  it('treats an assigned-but-unpainted zone as no confinement (null), not a frozen empty area', () => {
    const s = stateWith([restrictZone('z1', ['p1'])], {}); // assigned, but zero tiles painted
    expect(allowedTilesForPawn(s, 'p1')).toBeNull();
  });

  it('keeps a restrict tile that also belongs to another zone (overlap no longer steals it)', () => {
    // Tile (1,1) is in restrict zone z1 AND a stockpile — both layers coexist on the same tile, so the
    // restrict confinement still includes it (the bug that stranded confined pawns Idle).
    const s = {
      zoneInstances: [restrictZone('z1', ['p1'])],
      designationZoneId: {
        '1,1': { restrict: 'z1', stockpile: 'sp1' },
        '1,2': { restrict: 'z1' }
      }
    } as unknown as GameState;
    expect([...allowedTilesForPawn(s, 'p1')!].sort()).toEqual(['1,1', '1,2']);
  });
});

describe('zone confinement — nearestAllowedTile (the walk-home target for an out-of-zone pawn)', () => {
  it('returns null for an empty allowed set', () => {
    expect(nearestAllowedTile(new Set(), 0, 0)).toBeNull();
  });

  it('picks the closest allowed tile to the pawn', () => {
    const allowed = new Set(['10,10', '2,1', '40,40']);
    expect(nearestAllowedTile(allowed, 0, 0)).toEqual({ x: 2, y: 1 });
  });

  it('returns the pawn’s own tile when it is already in the zone', () => {
    const allowed = new Set(['5,5', '6,6']);
    expect(nearestAllowedTile(allowed, 5, 5)).toEqual({ x: 5, y: 5 });
  });
});

describe('zone confinement — buildPathfindingGridsConfined', () => {
  // 3×3 all-walkable map.
  const worldMap: WorldTile[][] = Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => ({ walkable: true, movementCost: 1 }) as unknown as WorldTile)
  );

  it('walls off every tile outside the allowed set, keeping the start tile walkable', () => {
    const allowed = new Set(['0,0', '1,0']); // not including the start at (2,2)
    const { walkable, width } = buildPathfindingGridsConfined(
      worldMap,
      new Set(),
      allowed,
      2,
      2 // start
    );
    const at = (x: number, y: number) => walkable[y * width + x];
    expect(at(0, 0)).toBe(1); // allowed → walkable
    expect(at(1, 0)).toBe(1); // allowed → walkable
    expect(at(2, 2)).toBe(1); // start always kept walkable
    expect(at(2, 0)).toBe(0); // outside allowed → walled
    expect(at(1, 1)).toBe(0); // outside allowed → walled
  });
});
