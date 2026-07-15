// SOCIAL-LAYER: off-colony family generation — founders get a wider family web out in the world,
// tied back with rolled warmth, whose standing seeds through the normal relationship path.
import { describe, it, expect, beforeEach } from 'vitest';
import { generateColonyPawns, generateWorldKin } from '$lib/game/entities/Pawns';
import { generateCulturePool, generateCultureRelations } from '$lib/game/core/Culture';
import { generateKingdomPool, generateKingdomRelations } from '$lib/game/core/Kingdom';
import { socialService } from '$lib/game/services/SocialService';
import { findRelationship } from '$lib/game/core/Social';
import { rng } from '$lib/game/core/rng';
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
    const byId = new Map(worldKin.map((w) => [w.id, w]));
    for (const w of worldKin) {
      // each world pawn ties back to exactly one founder, with a warmth on both sides
      expect(w.kin?.length).toBe(1);
      const tie = w.kin![0];
      expect(typeof tie.warmth).toBe('number');
      const founder = founders.find((f) => f.id === tie.pawnId);
      expect(founder).toBeDefined();
      // the founder holds the reciprocal tie with the SAME warmth
      const back = founder!.kin?.find((k) => k.pawnId === w.id);
      expect(back).toBeDefined();
      expect(back!.warmth).toBe(tie.warmth);
      // lives somewhere in the world (a kingdom) and shares the founder's surname
      expect(w.homeKingdomId).toBeTruthy();
      expect(w.name.split(' ').slice(-1)[0]).toBe(founder!.name.split(' ').slice(-1)[0]);
      // sex is rolled so the kin word can gender (Father/Mother…)
      expect(w.sex === 'male' || w.sex === 'female').toBe(true);
    }
    // 50/50 roll produces a mix across the whole web (not all one sex)
    const males = worldKin.filter((w) => w.sex === 'male').length;
    expect(males).toBeGreaterThan(0);
    expect(males).toBeLessThan(worldKin.length);
  });

  it('generates generationally-consistent ages (no child older than a parent, etc.)', () => {
    const { cultures, kingdoms } = world();
    const founders = generateColonyPawns(cultures, 5, { kingdoms, founders: true });
    const worldKin = generateWorldKin(founders, cultures, kingdoms);
    const byId = new Map(founders.map((f) => [f.id, f]));
    // `founder.kin` entry for a world pawn carries what THAT PAWN is TO the founder (plan.kind).
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
          expect(wAge).toBeGreaterThan(fAge); // an elder generation is older than the founder
          break;
        case 'child':
        case 'nibling':
          expect(wAge).toBeLessThan(fAge); // a younger generation is younger
          break;
      }
      expect(wAge).toBeGreaterThanOrEqual(1);
    }
    // within a founder: every grandparent is older than every parent/aunt-uncle
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
    // every world-kin tie has a relationship row whose score reflects its warmth (some negative)
    let checked = 0;
    let sawNegative = false;
    for (const f of founders) {
      for (const tie of f.kin ?? []) {
        if (!worldKin.some((w) => w.id === tie.pawnId)) continue; // world kin only
        const rel = findRelationship(seeded.relationships, f.id, tie.pawnId);
        expect(rel).toBeDefined();
        checked++;
        if (rel!.score < 0) sawNegative = true;
      }
    }
    expect(checked).toBeGreaterThan(0);
    // across a whole colony's extended web, at least one relative is on poor terms
    expect(sawNegative).toBe(true);
  });
});
