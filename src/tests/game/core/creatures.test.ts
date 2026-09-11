import { describe, it, expect } from 'vitest';
import { getCreatureById } from '$lib/game/core/defs/creatures';

describe('getCreatureById', () => {
  it('returns undefined for an id that does not exist', () => {
    expect(getCreatureById('no-such-creature-id')).toBeUndefined();
  });

  it('returns the definition whose own id matches the id asked for', () => {
    for (const id of ['wolf', 'bear', 'goblin']) {
      expect(getCreatureById(id)!.id).toBe(id);
    }
  });
});
