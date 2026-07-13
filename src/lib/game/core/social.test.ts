// SOCIAL-LAYER pure-helper tests: the stage ladder + hysteresis, cultural seeding (the RACE-SYSTEM
// Phase 1 acceptance regression), and effective-mood math.
import { describe, it, expect } from 'vitest';
import {
  effectiveMood,
  rawStageForScore,
  seedScore,
  stageForScore,
  relKey,
  KIN_SEED_BONUS
} from './Social';
import type { CultureRelation, Pawn } from './types';

function pawnOf(id: string, cultureId: string, extra: Partial<Pawn> = {}): Pawn {
  return {
    id,
    name: `${id} Test`,
    cultureId,
    state: { mood: 50, isWorking: false, isSleeping: false, isEating: false },
    ...extra
  } as unknown as Pawn;
}

describe('stage ladder', () => {
  it('bands raw scores onto the six rungs', () => {
    expect(rawStageForScore(-80)).toBe('enemies');
    expect(rawStageForScore(-40)).toBe('rivals');
    expect(rawStageForScore(0)).toBe('strangers');
    expect(rawStageForScore(20)).toBe('acquaintances');
    expect(rawStageForScore(50)).toBe('friends');
    expect(rawStageForScore(80)).toBe('best_friends');
  });

  it('is hysteretic: a pair on the boundary does not flicker', () => {
    // Acquaintances begin at 15. From strangers, 16 is NOT enough (needs 15+3).
    expect(stageForScore(16, 'strangers')).toBe('strangers');
    expect(stageForScore(18, 'strangers')).toBe('acquaintances');
    // And once acquaintances, dipping to 14 does not demote (needs < 15-3).
    expect(stageForScore(14, 'acquaintances')).toBe('acquaintances');
    expect(stageForScore(11, 'acquaintances')).toBe('strangers');
  });

  it('a big event delta can step several rungs at once', () => {
    expect(stageForScore(80, 'strangers')).toBe('best_friends');
    expect(stageForScore(-70, 'friends')).toBe('enemies');
  });
});

describe('cultural seeding (RACE-SYSTEM Phase 1 regression)', () => {
  const relations: CultureRelation[] = [
    { a: 'c-orc', b: 'c-elf', score: -70, disposition: 'hostile' },
    { a: 'c-orc', b: 'c-goblin', score: 65, disposition: 'allied' }
  ];

  it('two pawns of mutually-hostile cultures start disliking each other', () => {
    const seed = seedScore(pawnOf('a', 'c-orc'), pawnOf('b', 'c-elf'), relations);
    expect(seed).toBe(-40);
    expect(rawStageForScore(seed)).toBe('rivals');
  });

  it('allied cultures start on warm footing; unknown pairs at zero', () => {
    expect(seedScore(pawnOf('a', 'c-orc'), pawnOf('b', 'c-goblin'), relations)).toBe(30);
    expect(seedScore(pawnOf('a', 'c-orc'), pawnOf('b', 'c-dwarf'), relations)).toBe(0);
  });

  it('same-culture pawns start friendly; kin start as friends', () => {
    expect(seedScore(pawnOf('a', 'c-orc'), pawnOf('b', 'c-orc'), relations)).toBe(15);
    const sib = pawnOf('a', 'c-orc', {
      kin: [{ pawnId: 'b', kind: 'sibling' }]
    } as Partial<Pawn>);
    expect(seedScore(sib, pawnOf('b', 'c-orc'), relations)).toBe(15 + KIN_SEED_BONUS);
  });
});

describe('effective mood', () => {
  it('layers active modifiers over the drift mood and clamps', () => {
    const p = pawnOf('a', 'c1', {
      moodModifiers: [
        { id: 'grief:x', label: 'Grieving', value: -25, expiresAt: 5000 },
        { id: 'meal', label: 'Ate a hot meal', value: 8, expiresAt: 100 }, // expired at turn 200
        { id: 'band', label: 'Finely arrayed', value: 5, expiresAt: 0 } // standing
      ]
    } as Partial<Pawn>);
    // 50 - 25 + 5 (meal expired)
    expect(effectiveMood(p, 200)).toBe(30);
    // all live before turn 100
    expect(effectiveMood(p, 50)).toBe(38);
  });

  it('clamps to 0..100', () => {
    const p = pawnOf('a', 'c1', {
      moodModifiers: [{ id: 'x', label: 'x', value: -90, expiresAt: 0 }]
    } as Partial<Pawn>);
    expect(effectiveMood(p, 1)).toBe(0);
  });
});

describe('pair keys', () => {
  it('is canonical regardless of order', () => {
    expect(relKey('pawn-2', 'pawn-1')).toBe(relKey('pawn-1', 'pawn-2'));
  });
});
