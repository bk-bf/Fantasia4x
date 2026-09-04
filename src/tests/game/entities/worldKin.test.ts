import { describe, it, expect, beforeEach } from 'vitest';
import { generateColonyPawns, generateWorldKin } from '$lib/game/entities/Pawns';
import { generateCulturePool, generateCultureRelations } from '$lib/game/core/gen/culture';
import { generateKingdomPool, generateKingdomRelations } from '$lib/game/core/gen/kingdom';
import { socialService } from '$lib/game/services/SocialService';
import { findRelationship } from '$lib/game/core/rules/social/social';
import { rng } from '$lib/game/core/util/rng';
import type { GameState } from '$lib/game/core/types';

function world() {
  const cultures = generateCulturePool(8);
  const cultureRelations = generateCultureRelations(cultures);
  const kingdoms = generateKingdomPool(cultures, 8);
  const kingdomRelations = generateKingdomRelations(kingdoms, cultureRelations, cultures[0].id);
  return { cultures, cultureRelations, kingdoms, kingdomRelations };
}

beforeEach(() => rng.reseed(20260713));

describe('generateWorldKin', () => {
  it('gives founders off-colony relatives with reciprocal warmth-bearing ties', () => {
    const { cultures, kingdoms } = world();
    const founders = generateColonyPawns(cultures, 5, { kingdoms, founders: true });
    const worldKin = generateWorldKin(founders, cultures, kingdoms);

    expect(worldKin.length).toBeGreaterThan(0);
    for (const w of worldKin) {
      expect(w.kin?.length).toBe(1);
      const tie = w.kin![0];
      expect(typeof tie.warmth).toBe('number');
      const founder = founders.find((f) => f.id === tie.pawnId);
      expect(founder).toBeDefined();
      const back = founder!.kin?.find((k) => k.pawnId === w.id);
      expect(back).toBeDefined();
      expect(back!.warmth).toBe(tie.warmth);
      expect(w.homeKingdomId).toBeTruthy();
      expect(w.name.split(' ').slice(-1)[0]).toBe(founder!.name.split(' ').slice(-1)[0]);
      expect(w.sex === 'male' || w.sex === 'female').toBe(true);
    }
    const males = worldKin.filter((w) => w.sex === 'male').length;
    expect(males).toBeGreaterThan(0);
    expect(males).toBeLessThan(worldKin.length);
  });

  it('generates generationally-consistent ages (no child older than a parent, etc.)', () => {
    const { cultures, kingdoms } = world();
    const founders = generateColonyPawns(cultures, 5, { kingdoms, founders: true });
    const worldKin = generateWorldKin(founders, cultures, kingdoms);
    const byId = new Map(founders.map((f) => [f.id, f]));
    const kindToFounder = (founder: (typeof founders)[number], wId: string) =>
      founder.kin!.find((k) => k.pawnId === wId)!.kind;
    for (const w of worldKin) {
      const founder = byId.get(w.kin![0].pawnId)!;
      const fAge = founder.age ?? 30;
      const wAge = w.age ?? 30;
      switch (kindToFounder(founder, w.id)) {
        case 'grandparent':
        case 'parent':
        case 'auntuncle':
          expect(wAge).toBeGreaterThan(fAge);
          break;
        case 'child':
        case 'nibling':
          expect(wAge).toBeLessThan(fAge);
          break;
      }
      expect(wAge).toBeGreaterThanOrEqual(1);
    }
    for (const founder of founders) {
      const kin = worldKin.filter((w) => w.kin![0].pawnId === founder.id);
      const grand = kin
        .filter((w) => kindToFounder(founder, w.id) === 'grandparent')
        .map((w) => w.age ?? 0);
      const parentGen = kin
        .filter((w) => ['parent', 'auntuncle'].includes(kindToFounder(founder, w.id)))
        .map((w) => w.age ?? 0);
      for (const g of grand) for (const p of parentGen) expect(g).toBeGreaterThan(p);
    }
  });

  it('seedFamilyRelationships stands up a warmth-driven row per family tie (incl. hated kin)', () => {
    const { cultures, cultureRelations, kingdoms } = world();
    const founders = generateColonyPawns(cultures, 5, { kingdoms, founders: true });
    const worldKin = generateWorldKin(founders, cultures, kingdoms);
    const state = {
      turn: 0,
      pawns: founders,
      worldPawns: worldKin,
      cultureRelations,
      relationships: []
    } as unknown as GameState;

    const seeded = socialService.seedFamilyRelationships(state);
    let checked = 0;
    let sawNegative = false;
    for (const f of founders) {
      for (const tie of f.kin ?? []) {
        if (!worldKin.some((w) => w.id === tie.pawnId)) continue;
        const rel = findRelationship(seeded.relationships, f.id, tie.pawnId);
        expect(rel).toBeDefined();
        checked++;
        if (rel!.score < 0) sawNegative = true;
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNegative).toBe(true);
  });
});
