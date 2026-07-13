// SOCIAL-LAYER pure-helper tests: the stage ladder + hysteresis, cultural seeding (the RACE-SYSTEM
// Phase 1 acceptance regression), and effective-mood math.
import { describe, it, expect } from 'vitest';
import {
  effectiveMood,
  moodModifierValue,
  rawStageForScore,
  seedScore,
  stageForScore,
  relKey,
  isKinStale,
  kinLabel,
  kinRelationPhrase,
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

  it('same-culture pawns start friendly; a kin tie without warmth uses the flat bonus', () => {
    expect(seedScore(pawnOf('a', 'c-orc'), pawnOf('b', 'c-orc'), relations)).toBe(15);
    const sib = pawnOf('a', 'c-orc', {
      kin: [{ pawnId: 'b', kind: 'sibling' }]
    } as Partial<Pawn>);
    expect(seedScore(sib, pawnOf('b', 'c-orc'), relations)).toBe(15 + KIN_SEED_BONUS);
  });

  it('kinship warmth is a bias, not a guarantee: a hated brother starts as a rival', () => {
    const warm = pawnOf('a', 'c-orc', {
      kin: [{ pawnId: 'b', kind: 'sibling', warmth: 60 }]
    } as Partial<Pawn>);
    expect(seedScore(warm, pawnOf('b', 'c-orc'), relations)).toBe(15 + 60); // close kin
    const estranged = pawnOf('a', 'c-orc', {
      kin: [{ pawnId: 'b', kind: 'sibling', warmth: -55 }]
    } as Partial<Pawn>);
    const seed = seedScore(estranged, pawnOf('b', 'c-orc'), relations);
    expect(seed).toBe(15 - 55); // same people +15, but the bond is poison
    expect(rawStageForScore(seed)).toBe('rivals');
  });
});

describe('kin labels are gendered by the relative’s sex', () => {
  it('resolves the right word per kind + sex, falling back to neutral', () => {
    expect(kinLabel('parent', 'male')).toBe('Father');
    expect(kinLabel('parent', 'female')).toBe('Mother');
    expect(kinLabel('sibling', 'female')).toBe('Sister');
    expect(kinLabel('auntuncle', 'male')).toBe('Uncle');
    expect(kinLabel('auntuncle', 'female')).toBe('Aunt');
    expect(kinLabel('nibling', 'male')).toBe('Nephew');
    expect(kinLabel('grandparent', 'female')).toBe('Grandmother');
    expect(kinLabel('cousin', 'male')).toBe('Cousin'); // no gendered form
    expect(kinLabel('parent')).toBe('Parent'); // unknown sex → neutral
  });

  it('phrases the possessive with the relative’s gendered word', () => {
    expect(kinRelationPhrase('sibling', 'Kael', 'female')).toBe("Kael's sister");
    expect(kinRelationPhrase('parent', 'Kael', 'male')).toBe("Kael's father");
  });
});

describe('off-colony kin staleness', () => {
  it('is stale when never seen or a month has passed', () => {
    expect(isKinStale(null)).toBe(true); // never seen since the founder emigrated
    expect(isKinStale(5)).toBe(false);
    expect(isKinStale(30)).toBe(false);
    expect(isKinStale(31)).toBe(true);
  });
});

describe('effective mood', () => {
  // MOOD-REWORK: effectiveMood is now just the pawn's eased state.mood, clamped. Modifiers no longer
  // layer on at read time — they feed the TARGET the mood eases toward (PawnService.computeMoodTarget).
  it('returns the eased state.mood, ignoring modifiers (they feed the target, not the read)', () => {
    const p = pawnOf('a', 'c1', {
      state: { mood: 42, isWorking: false, isSleeping: false, isEating: false },
      moodModifiers: [{ id: 'grief:x', label: 'Grieving', value: -25, expiresAt: 5000, startedAt: 0 }]
    } as unknown as Partial<Pawn>);
    expect(effectiveMood(p, 200)).toBe(42);
  });

  it('clamps to 0..100 and defaults to 50 when state.mood is absent', () => {
    const low = pawnOf('a', 'c1', {
      state: { mood: -30, isWorking: false, isSleeping: false, isEating: false }
    } as unknown as Partial<Pawn>);
    expect(effectiveMood(low, 1)).toBe(0);
    const none = pawnOf('b', 'c1', {} as Partial<Pawn>);
    expect(effectiveMood(none, 1)).toBe(50);
  });
});

describe('moodModifierValue (fade-to-zero)', () => {
  it('standing bands hold full value; expiring thoughts fade linearly to zero', () => {
    expect(moodModifierValue({ id: 's', label: 's', value: 5, expiresAt: 0 }, 999)).toBe(5);
    const thought = { id: 't', label: 't', value: -10, expiresAt: 100, startedAt: 0 };
    expect(moodModifierValue(thought, 0)).toBe(-10); // full at start
    expect(moodModifierValue(thought, 50)).toBeCloseTo(-5, 5); // half faded
    expect(moodModifierValue(thought, 100)).toBe(0); // expired
    expect(moodModifierValue(thought, 200)).toBe(0);
  });
});

describe('pair keys', () => {
  it('is canonical regardless of order', () => {
    expect(relKey('pawn-2', 'pawn-1')).toBe(relKey('pawn-1', 'pawn-2'));
  });
});
