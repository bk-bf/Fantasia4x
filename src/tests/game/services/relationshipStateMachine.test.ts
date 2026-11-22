import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { socialService } from '$lib/game/services/SocialService';
import { findRelationship } from '$lib/game/core/rules/social/social';
import { rng } from '$lib/game/core/util/rng';
import type { GameState, Pawn, PawnRelationship } from '$lib/game/core/types';

function pawn(id: string, x: number, y: number, extra: Partial<Pawn> = {}): Pawn {
  return {
    id,
    name: `${id.replace('pawn-', 'Pawn')} Test`,
    isAlive: true,
    position: { x, y },
    cultureId: 'c1',
    age: 25,
    stats: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      perception: 10,
      charisma: 10
    },
    traits: [],
    equipment: {},
    inventory: { items: {}, instances: [] },
    state: { mood: 50, isWorking: false, isSleeping: false, isEating: false },
    needs: { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 },
    currentState: 'Idle',
    skills: {},
    ...extra
  } as unknown as Pawn;
}

function stateWith(pawns: Pawn[], extra: Partial<GameState> = {}): GameState {
  return { turn: 18000, pawns, cultureRelations: [], jobs: [], ...extra } as unknown as GameState;
}

function rel(a: string, b: string, extra: Partial<PawnRelationship> = {}): PawnRelationship {
  return {
    pawnA: a,
    pawnB: b,
    score: 50,
    stage: 'friends',
    tags: [],
    points: { history: 0 },
    ...extra
  };
}

const working = { state: { mood: 50, isWorking: true, isSleeping: false, isEating: false } };

type SocialInternals = {
  flirtEligible(
    a: Pawn,
    b: Pawn,
    rel: PawnRelationship,
    working: PawnRelationship[],
    beautyA: number,
    beautyB: number
  ): boolean;
  afterFlirt(
    state: GameState,
    working: PawnRelationship[],
    a: Pawn,
    b: Pawn,
    rel: PawnRelationship,
    positive: boolean,
    turn: number
  ): void;
};
const internals = socialService as unknown as SocialInternals;

beforeEach(() => rng.reseed(20261121));
afterEach(() => vi.restoreAllMocks());

describe('meeting and working together', () => {
  it('pawns exactly 12 tiles apart meet; 13 tiles apart do not', () => {
    const near = socialService.processSocialTurn(
      stateWith([pawn('pawn-1', 0, 0), pawn('pawn-2', 12, 0)])
    );
    expect(findRelationship(near.relationships, 'pawn-1', 'pawn-2')).toBeDefined();
    const far = socialService.processSocialTurn(
      stateWith([pawn('pawn-1', 0, 0), pawn('pawn-2', 13, 0)])
    );
    expect(findRelationship(far.relationships, 'pawn-1', 'pawn-2')).toBeUndefined();
  });

  it('only a pair that is both working grows closer from working side by side', () => {
    const s = socialService.processSocialTurn(
      stateWith([pawn('pawn-1', 5, 5, working), pawn('pawn-2', 6, 5)])
    );
    const r = findRelationship(s.relationships, 'pawn-1', 'pawn-2')!;
    expect(r.score).toBe(15);
    expect((r.log ?? []).some((e) => e.label === 'Time spent together')).toBe(false);
  });
});

describe('standing bands and gloom', () => {
  it('a beauty of exactly 1.25 turns heads', () => {
    vi.spyOn(socialService, 'getBeauty').mockReturnValue(1.25);
    const s = socialService.processSocialTurn(stateWith([pawn('pawn-1', 5, 5)]));
    const band = s.pawns[0].moodModifiers?.find((m) => m.id === 'beauty-band');
    expect(band?.value).toBe(3);
  });

  it('a mood of exactly 2 counts as a gloomy day', () => {
    const p = pawn('pawn-1', 5, 5, {
      state: { mood: 2, isWorking: false, isSleeping: false, isEating: false }
    });
    const s = socialService.processSocialTurn(stateWith([p]));
    expect(s.pawns[0].deeds?.gloomDays).toBe(1);
  });
});

describe('romance', () => {
  it('a courting pair whose score falls below 0 parts ways', () => {
    const a = pawn('pawn-1', 5, 5);
    const b = pawn('pawn-2', 40, 40);
    const r = rel('pawn-1', 'pawn-2', {
      score: -5,
      stage: 'strangers',
      romance: { stage: 'courting', since: 0 }
    });
    const s = socialService.processSocialTurn(stateWith([a, b], { relationships: [r] }));
    const after = findRelationship(s.relationships, 'pawn-1', 'pawn-2')!;
    expect(after.romance?.stage).toBe('ex');
    expect(after.score).toBe(-25);
  });

  it('a pair below a score of 40 is never flirt-eligible; at 40 it is', () => {
    const a = pawn('pawn-1', 5, 5, { sex: 'male' } as Partial<Pawn>);
    const b = pawn('pawn-2', 6, 5, { sex: 'female' } as Partial<Pawn>);
    expect(internals.flirtEligible(a, b, rel('pawn-1', 'pawn-2', { score: 39 }), [], 1, 1)).toBe(
      false
    );
    expect(internals.flirtEligible(a, b, rel('pawn-1', 'pawn-2', { score: 40 }), [], 1, 1)).toBe(
      true
    );
  });

  it('each warm flirt counts once, and interest starts on the third', () => {
    const a = pawn('pawn-1', 5, 5);
    const b = pawn('pawn-2', 6, 5);
    const r = rel('pawn-1', 'pawn-2');
    const s = stateWith([a, b], { relationships: [r] });
    internals.afterFlirt(s, [r], a, b, r, true, 100);
    expect(r.flirts).toBe(1);
    internals.afterFlirt(s, [r], a, b, r, true, 200);
    expect(r.romance).toBeUndefined();
    internals.afterFlirt(s, [r], a, b, r, true, 300);
    expect(r.flirts).toBe(3);
    expect(r.romance?.stage).toBe('interested');
  });
});

describe('relationship log and kin', () => {
  it('the event log keeps at most 12 entries', () => {
    const a = pawn('pawn-1', 5, 5);
    const b = pawn('pawn-2', 6, 5);
    let s = stateWith([a, b]);
    for (let i = 0; i < 20; i++) {
      s = socialService.adjustRelation(s, a, b, 1, { label: `Deed ${i}`, kind: 'rescue' });
    }
    expect(findRelationship(s.relationships, 'pawn-1', 'pawn-2')!.log).toHaveLength(12);
  });

  it('a parent and child get the same kin tie whichever of them is seeded first', () => {
    const make = () => {
      const parent = pawn('pawn-1', 5, 5, { kin: [{ pawnId: 'pawn-2', kind: 'child' }] });
      const child = pawn('pawn-2', 6, 5, { kin: [{ pawnId: 'pawn-1', kind: 'parent' }] });
      return { parent, child };
    };
    const one = make();
    const childFirst = socialService.seedFamilyRelationships(stateWith([one.child, one.parent]));
    const two = make();
    const parentFirst = socialService.seedFamilyRelationships(stateWith([two.parent, two.child]));
    expect(findRelationship(childFirst.relationships, 'pawn-1', 'pawn-2')!.kin).toBe('child');
    expect(findRelationship(parentFirst.relationships, 'pawn-1', 'pawn-2')!.kin).toBe('child');
  });
});

describe('grief', () => {
  it("a friend's death leaves a grief of -12", () => {
    const dead = pawn('pawn-1', 5, 5);
    const friend = pawn('pawn-2', 40, 40);
    const s = socialService.onPawnDeath(
      stateWith([dead, friend], { relationships: [rel('pawn-1', 'pawn-2')] }),
      dead
    );
    const grief = s.pawns[1].moodModifiers?.find((m) => m.id === 'grief:pawn-1');
    expect(grief?.value).toBe(-12);
  });
});
