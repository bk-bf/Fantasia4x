import { describe, it, expect } from 'vitest';
import { applyConsumable } from '$lib/game/entities/Pawns';
import type { Pawn } from '$lib/game/core/types';

function makePawn(): Pawn {
  return {
    id: 'p1',
    stats: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
      perception: 10
    },
    traits: [],
    conditionTimers: {}
  } as unknown as Pawn;
}

const rand = () => 0.42;

describe('§2h applyConsumable', () => {
  it('drinking a potion stamps its timed condition, leaving traits untouched', () => {
    const pawn = makePawn();
    const next = applyConsumable(pawn, 'bloodrage_draught', rand);
    expect(next).not.toBe(pawn);
    expect(next.conditionTimers?.adrenal).toBe(1200);
    expect(next.traits).toHaveLength(0);
    expect(pawn.conditionTimers?.adrenal).toBeUndefined();
  });

  it('eating a beast-organ RAW punishes — sickness + a flaw, NEVER the good trait', () => {
    const pawn = makePawn();
    const next = applyConsumable(pawn, 'alpha_heart', rand);
    expect(next).not.toBe(pawn);
    expect(next.traits.map((t) => t.id)).not.toContain('feral-adrenaline');
    expect(next.conditionTimers?.nausea ?? 0).toBeGreaterThan(0);
    expect(next.traits.some((t) => t.rarity === 'negative')).toBe(true);
    expect(pawn.traits).toHaveLength(0);
    expect(pawn.stats.dexterity).toBe(10);
  });

  it('drinking a brewed trait draught runs the gamble — grants a pool trait', () => {
    const next = applyConsumable(makePawn(), 'alpha_essence', rand);
    const ids = next.traits.map((t) => t.id ?? '');
    const POOL = ['feral-adrenaline', 'pack-fury', 'bestial-might'];
    expect(ids.some((id) => POOL.includes(id))).toBe(true);
  });

  it('an unknown item id is a no-op', () => {
    const pawn = makePawn();
    expect(applyConsumable(pawn, 'not_a_real_item', rand)).toBe(pawn);
  });
});
