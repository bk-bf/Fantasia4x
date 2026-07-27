// §2h consumption runtime: drink a potion → timed condition; eat a beast-organ RAW → sickness + a Faustian
// flaw (NEVER the good trait, ALCHEMY-BUTCHERY-EXPANSION §A); the trait comes only from a brewed traitGamble
// draught. Uses the REAL item/trait databases (the organs/draughts authored in items.jsonc).
import { describe, it, expect } from 'vitest';
import { applyConsumable } from '$lib/game/entities/Pawns';
import type { Pawn } from '$lib/game/core/types';

function makePawn(): Pawn {
  return {
    id: 'p1',
    stats: {
      brawn: 10,
      agility: 10,
      vigour: 10,
      intellect: 10,
      wisdom: 10,
      charisma: 10,
      awareness: 10
    },
    traits: [],
    conditionTimers: {}
  } as unknown as Pawn;
}

const rand = () => 0.42; // deterministic flaw pick

describe('§2h applyConsumable', () => {
  it('drinking a potion stamps its timed condition, leaving traits untouched', () => {
    const pawn = makePawn();
    const next = applyConsumable(pawn, 'bloodrage_draught', rand);
    expect(next).not.toBe(pawn); // new ref → stock will be spent
    expect(next.conditionTimers?.adrenal).toBe(1200);
    expect(next.traits).toHaveLength(0);
    expect(pawn.conditionTimers?.adrenal).toBeUndefined(); // original untouched
  });

  it('eating a beast-organ RAW punishes — sickness + a flaw, NEVER the good trait', () => {
    const pawn = makePawn();
    const next = applyConsumable(pawn, 'alpha_heart', rand);
    expect(next).not.toBe(pawn);
    expect(next.traits.map((t) => t.id)).not.toContain('feral-adrenaline'); // no free trait
    expect(next.conditionTimers?.nausea ?? 0).toBeGreaterThan(0); // it makes you sick
    // rand 0.42 < the 0.5 flawChance → a Faustian flaw lands (pure downside).
    expect(next.traits.some((t) => t.rarity === 'negative')).toBe(true);
    // The original pawn's stats/traits are never mutated by the in-place bake.
    expect(pawn.traits).toHaveLength(0);
    expect(pawn.stats.agility).toBe(10);
  });

  it('drinking a brewed trait draught runs the gamble — grants a pool trait', () => {
    const next = applyConsumable(makePawn(), 'alpha_essence', rand);
    const ids = next.traits.map((t) => t.id ?? '');
    const POOL = ['feral-adrenaline', 'pack-fury', 'bestial-might'];
    expect(ids.some((id) => POOL.includes(id))).toBe(true); // the coveted trait comes from the DRAUGHT
  });

  it('an unknown item id is a no-op', () => {
    const pawn = makePawn();
    expect(applyConsumable(pawn, 'not_a_real_item', rand)).toBe(pawn);
  });
});
