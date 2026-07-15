// §2h consumption runtime: drink a potion → timed condition; eat a beast-organ → permanent trait + a
// Faustian flaw. Uses the REAL item/trait databases (the organs/potions authored in items.jsonc).
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

  it('eating a beast-organ grants its trait AND rolls a Faustian flaw', () => {
    const pawn = makePawn();
    const next = applyConsumable(pawn, 'alpha_heart', rand);
    expect(next).not.toBe(pawn);
    expect(next.traits.map((t) => t.id)).toContain('feral-adrenaline');
    expect(next.traits).toHaveLength(2); // the gift + one flaw
    const flaw = next.traits.find((t) => t.id !== 'feral-adrenaline');
    expect(flaw?.rarity).toBe('negative');
    // The original pawn's stats/traits are never mutated by the in-place trait bake.
    expect(pawn.traits).toHaveLength(0);
    expect(pawn.stats.dexterity).toBe(10);
  });

  it('eating a duplicate organ is a no-op (returns the same ref → stock not spent)', () => {
    const pawn = applyConsumable(makePawn(), 'alpha_heart', rand);
    const again = applyConsumable(pawn, 'alpha_heart', rand);
    expect(again).toBe(pawn);
  });

  it('an unknown item id is a no-op', () => {
    const pawn = makePawn();
    expect(applyConsumable(pawn, 'not_a_real_item', rand)).toBe(pawn);
  });
});
