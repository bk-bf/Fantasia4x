import { describe, it, expect, beforeEach } from 'vitest';
import { pawnGrowthService } from '$lib/game/services/PawnGrowthService';
import { DAYS_PER_SEASON } from '$lib/game/services/EnvironmentService';
import { rng } from '$lib/game/core/util/rng';
import type { GameState, Pawn } from '$lib/game/core/types';

const stats = () => ({
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  perception: 10,
  charisma: 10
});

function pawn(extra: Partial<Pawn> = {}): Pawn {
  return {
    id: 'pawn-1',
    name: 'Vale Test',
    isAlive: true,
    age: 20,
    stats: stats(),
    traits: [],
    ...extra
  } as unknown as Pawn;
}

beforeEach(() => rng.reseed(20261121));

describe('birthdays', () => {
  it('a pawn ages one year on its birthday', () => {
    const p = pawn({ birthDayOfYear: 3, lastGrowthSeason: 0 });
    pawnGrowthService.processDay({ pawns: [p] } as unknown as GameState, DAYS_PER_SEASON * 4 + 3);
    expect(p.age).toBe(21);
  });
});

describe('applyGrowthChoice', () => {
  it('takes at most two picks from the offer', () => {
    const p = pawn({
      pendingGrowth: [{ kind: 'season', rolls: { strength: 2, dexterity: 2, constitution: 2 } }]
    });
    const out = pawnGrowthService.applyGrowthChoice(p, ['strength', 'dexterity', 'constitution']);
    expect(out.stats).toMatchObject({ strength: 12, dexterity: 12, constitution: 10 });
    expect(out.pendingGrowth).toHaveLength(0);
  });

  it('never raises a stat past its cap', () => {
    const p = pawn({
      maxStats: { ...stats(), strength: 11 },
      pendingGrowth: [{ kind: 'birthday', rolls: { strength: 4 } }]
    });
    expect(pawnGrowthService.applyGrowthChoice(p, ['strength']).stats.strength).toBe(11);
  });
});
