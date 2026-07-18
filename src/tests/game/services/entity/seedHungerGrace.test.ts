import { describe, it, expect } from 'vitest';
import { makeMob } from '$lib/game/services/entity/entitySpawning';
import {
  HUNGER_EAT_THRESHOLD,
  SEED_HUNGER_GRACE,
  willFinishOffDowned
} from '$lib/game/services/entity/entityConstants';
import { CREATURES } from '$lib/game/core/Creatures';

const predator = CREATURES.find((c) => c.predator) ?? CREATURES[0];

describe('seed hunger grace (no turn-0 hunt stampede)', () => {
  it('a normally-spawned mob seeds hungry, in [0, eat threshold)', () => {
    for (let i = 0; i < 50; i++) {
      const h = makeMob(predator, 0, 0, 0).needs.hunger;
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(HUNGER_EAT_THRESHOLD);
    }
  });

  it('a game-start seeded mob is satiated — hunger sits negative (below the eat threshold)', () => {
    for (let i = 0; i < 50; i++) {
      const h = makeMob(predator, 0, 0, 0, SEED_HUNGER_GRACE).needs.hunger;
      expect(h).toBeLessThan(0); // overflowing-full
      expect(h).toBeGreaterThanOrEqual(-HUNGER_EAT_THRESHOLD); // spread width preserved (§S5 desync)
    }
  });

  it('a satiated start-of-game predator will not hunt/finish off prey yet', () => {
    const h = makeMob(predator, 0, 0, 0, SEED_HUNGER_GRACE).needs.hunger;
    expect(willFinishOffDowned(h, predator)).toBe(false);
  });
});
