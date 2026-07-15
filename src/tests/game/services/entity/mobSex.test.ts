// Sex on spawn: ordinary creatures roll a 50/50 sex; `sex: false` creatures (wraiths/oozes) get none.
import { describe, it, expect, beforeEach } from 'vitest';
import { makeMob } from '$lib/game/services/entity/entitySpawning';
import { getCreatureById } from '$lib/game/core/Creatures';
import { rng } from '$lib/game/core/rng';

beforeEach(() => rng.reseed(20260713));

describe('mob sex on spawn', () => {
  it('a normal creature gets a rolled sex; across many spawns it is a mix', () => {
    const wolf = getCreatureById('wolf')!;
    const sexes = Array.from({ length: 60 }, (_, i) => makeMob(wolf, 0, 0, i).sex);
    expect(sexes.every((s) => s === 'male' || s === 'female')).toBe(true);
    const males = sexes.filter((s) => s === 'male').length;
    expect(males).toBeGreaterThan(0);
    expect(males).toBeLessThan(sexes.length);
  });

  it('a sex:false creature (wraith / ooze) spawns with no sex', () => {
    for (const id of ['shadow_wraith', 'greater_wraith', 'grimeling', 'grime_horror']) {
      const def = getCreatureById(id)!;
      expect(def.sex).toBe(false); // flag loaded from creatures.jsonc
      for (let i = 0; i < 20; i++) expect(makeMob(def, 0, 0, i).sex).toBeUndefined();
    }
  });
});
