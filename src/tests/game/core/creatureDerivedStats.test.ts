import { describe, it, expect } from 'vitest';
import { getCreatureById } from '$lib/game/core/defs/creatures';

describe('creature stats derived from stat ranges', () => {
  it('a worg takes the middle of each range and derives health, speed, sight and flee range from it', () => {
    const worg = getCreatureById('worg')!;
    expect(worg.stats).toMatchObject({
      strength: 18,
      dexterity: 12,
      constitution: 10,
      perception: 12,
      health: 50,
      speed: 5,
      visionRange: 20,
      fleeRange: 29
    });
  });
});

describe('diet defaults for creatures that do not list what they eat', () => {
  it('a carnivore eats meat and carrion, an omnivore anything, a creature with no diet nothing', () => {
    expect(getCreatureById('worg')!.eats).toEqual(['meat', 'organic']);
    expect(getCreatureById('hoarfowl')!.eats).toEqual(['food', 'meat', 'organic']);
    expect(getCreatureById('grimeling')!.eats).toEqual([]);
  });

  it('a carnivore that does not say it grazes does not graze', () => {
    expect(getCreatureById('worg')!.grazes).toBe(false);
  });
});
