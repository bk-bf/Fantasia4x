import { describe, it, expect } from 'vitest';
import { effectsOf } from '$lib/dev/itemTree';

describe('effectsOf', () => {
  it('renders every clause, in order, joined by " · ", with the documented unit conversions', () => {
    const item = {
      nutrition: 5,
      hydration: 2,
      medicineQuality: 3,
      curesConditions: ['infection'],
      mendsWounds: ['fracture'],
      grantsConditions: ['blessed'],
      conditionDurationTurns: 12,
      craftValue: 2.5,
      decaySeconds: 900,
      fuelValue: 10,
      armorProperties: {
        equipmentSlot: 'boots',
        movementPenalty: 0.1,
        sightPenalty: 0.2,
        stealthMod: -5,
        fatiguePerTurn: 1,
        coldResistance: 2,
        heatResistance: 3
      },
      coatingEffect: { condition: 'poison', chance: 0.25, durationHours: 4 },
      onHitCondition: { condition: 'bleed', chance: 0.3 }
    };
    expect(effectsOf(item)).toBe(
      'food 5 · drink 2/L · med 3 · cures infection · mends fracture · grants blessed 12t · ' +
        'coats poison 25% 4h · spoils 3d · worth 2.5/unit · fuel 10 · stealth -5 · sight −20% · ' +
        'move +0% · fatigue +1 · cold +2 · heat +3 · on hit bleed 30%'
    );
  });

  it('suppresses the craft-value clause when craftValue is exactly 1', () => {
    expect(effectsOf({ craftValue: 1 })).toBe('');
    expect(effectsOf({ craftValue: 1.01 })).toBe('worth 1.01/unit');
  });

  it('computes boots/socks movement gain relative to BAREFOOT_MOVE_FACTOR, not the raw penalty', () => {
    expect(effectsOf({ armorProperties: { equipmentSlot: 'boots', movementPenalty: 0.1 } })).toBe(
      'move +0%'
    );
    expect(effectsOf({ armorProperties: { equipmentSlot: 'boots', movementPenalty: 0.3 } })).toBe(
      'move −22.2%'
    );
    expect(effectsOf({ armorProperties: { equipmentSlot: 'socks', movementPenalty: 0 } })).toBe(
      'move +11.1%'
    );
  });

  it('renders a plain movementPenalty (non-boots/socks slot) without the barefoot conversion', () => {
    expect(effectsOf({ armorProperties: { movementPenalty: 0.15 } })).toBe('move −15%');
  });
});
