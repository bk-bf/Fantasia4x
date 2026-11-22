import { describe, it, expect, beforeAll } from 'vitest';
import { pathfinderService } from '$lib/game/services/PathfinderService';
import { fleeToSafety } from '$lib/game/services/entity/entityHelpers';
import { clearConnectivity } from '$lib/game/services/entity/connectivity';
import { chebyshev } from '$lib/game/core/util/distance';
import type { GameState, Mob } from '$lib/game/core/types';

function world(w = 80, h = 80) {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({
      x,
      y,
      walkable: true,
      terrainType: 'plains',
      movementCost: 1,
      resources: {}
    }))
  );
}

function deer(over: Partial<Mob> = {}): Mob {
  return {
    id: 'd1',
    creatureId: 'deer',
    x: 40,
    y: 40,
    path: [],
    pathIndex: 0,
    state: 'Fleeing',
    ...(over as object)
  } as unknown as Mob;
}

const stateWith = (mob: Mob) =>
  ({ turn: 1, mobs: [mob], pawns: [], worldMap: world() }) as unknown as GameState;

describe('fleeToSafety', () => {
  beforeAll(async () => {
    await pathfinderService.init();
    clearConnectivity();
  });

  it('plans a path that ends well away from the threat, on the far side', () => {
    const mob = deer();
    const threat = { x: 37, y: 40 };
    const out = fleeToSafety(mob, [threat], stateWith(mob));
    expect(out.path?.length).toBeGreaterThan(0);
    const end = out.path![out.path!.length - 1];
    const before = chebyshev(mob.x, mob.y, threat.x, threat.y);
    expect(chebyshev(end.x, end.y, threat.x, threat.y)).toBeGreaterThan(before + 5);
    expect(end.x).toBeGreaterThan(mob.x);
  });

  it('keeps heading for its flee destination while that stays far from the threat', () => {
    const dest = { x: 55, y: 47 };
    const mob = deer({ fleeDest: dest });
    const out = fleeToSafety(mob, [{ x: 37, y: 40 }], stateWith(mob));
    expect(out.fleeDest).toEqual(dest);
    expect(out.path?.at(-1)).toEqual(dest);
  });
});
