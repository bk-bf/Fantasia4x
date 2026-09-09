import { describe, it, expect } from 'vitest';
import { buildStatContext, computeStatView } from '$lib/components/util/statView';
import { CORE_STAT_KEYS } from '$lib/game/core/types';
import type { Pawn, Trait } from '$lib/game/core/types';

function pawnWithTrait(effects: Trait['effects']): Pawn {
  return {
    id: 'test-pawn',
    stats: Object.fromEntries(CORE_STAT_KEYS.map((k) => [k, 10])),
    physicalTraits: { weight: 70, height: 170, size: 'medium' },
    traits: [{ name: 'Test Trait', description: '', effects }]
  } as unknown as Pawn;
}

describe('statView.traitMods', () => {
  it('attributes a stealth-granting trait to the stealth stat', () => {
    const pawn = pawnWithTrait({ stealth: 0.4 });
    const ctx = buildStatContext(pawn);
    const view = computeStatView('stealth', pawn, ctx);
    expect(view?.traitMods.map((m) => m.name)).toContain('Test Trait');
    expect(view?.traitMods[0].pos).toBe(true);
  });
});
