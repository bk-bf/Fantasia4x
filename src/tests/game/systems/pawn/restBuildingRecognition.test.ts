import { describe, it, expect } from 'vitest';
import { isRestBuildingType, findNearestRestBuilding } from '$lib/game/systems/pawn/pawnHelpers';
import { PAWN_STATE } from '$lib/game/systems/pawn/pawnStates';
import type { GameState, Pawn } from '$lib/game/core/types';

/**
 * Regression: every bed in buildings.jsonc must count as a rest building, so a tired pawn routes to
 * an available bed instead of collapsing on the bare ground beside it. The old hardcoded REST_TYPES
 * list drifted — hide_bed / leather_bed / feather_bed were missing — so pawns slept on the ground next
 * to a finished bed. Rest-capability is now derived from the def's sleep effect.
 */
describe('rest-building recognition (data-driven)', () => {
  it('recognises EVERY bed type, not just the two the old list named', () => {
    for (const id of ['sleeping_spot', 'hay_bed', 'hide_bed', 'leather_bed', 'feather_bed']) {
      expect(isRestBuildingType(id), `${id} should be a rest building`).toBe(true);
    }
  });

  it('does not treat a non-bed (campfire) as a rest building', () => {
    expect(isRestBuildingType('campfire')).toBe(false);
  });

  function tiredPawn(): Pawn {
    return {
      id: 'p1',
      name: 'Tired',
      currentState: PAWN_STATE.TIRED,
      position: { x: 0, y: 0 },
      isMoving: false,
      path: [],
      restPolicy: 'always',
      needs: { hunger: 0, thirst: 0, fatigue: 80, sleep: 80 }
    } as unknown as Pawn;
  }

  // A finished leather_bed a few tiles away — one of the types the old list ignored.
  function stateWithBed(p: Pawn, bedType: string): GameState {
    const tiles = Array.from({ length: 6 }, (_, y) =>
      Array.from({ length: 6 }, (_, x) => ({ x, y, type: 'land', walkable: true }))
    );
    return {
      turn: 1,
      pawns: [p],
      buildings: [{ id: 'b1', type: bedType, status: 'complete', x: 3, y: 0 }],
      designations: {},
      droppedItems: [],
      worldMap: tiles,
      tiles
    } as unknown as GameState;
  }

  // findNearestRestBuilding is the bed-selection chokepoint handleTired routes through; it returning
  // the bed (rather than null → ground sleep) is exactly what the REST_TYPES drift broke. Every
  // formerly-missing bed type must now be selected.
  it.each(['hide_bed', 'leather_bed', 'feather_bed'])(
    'selects a %s as the nearest rest building (was ignored before)',
    (bedType) => {
      const p = tiredPawn();
      const found = findNearestRestBuilding(p, stateWithBed(p, bedType));
      expect(found).toMatchObject({ x: 3, y: 0 });
    }
  );
});
