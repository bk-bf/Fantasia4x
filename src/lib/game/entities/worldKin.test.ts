// SOCIAL-LAYER: off-colony family generation — founders get a wider family web out in the world,
// tied back with rolled warmth, whose standing seeds through the normal relationship path.
import { describe, it, expect, beforeEach } from 'vitest';
import { generateColonyPawns, generateWorldKin } from './Pawns';
import { generateCulturePool, generateCultureRelations } from '../core/Culture';
import { generateKingdomPool, generateKingdomRelations } from '../core/Kingdom';
import { socialService } from '../services/SocialService';
import { findRelationship } from '../core/Social';
import { rng } from '../core/rng';
import type { GameState } from '../core/types';

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
    // world kin are NOT colony pawns (kept out of state.pawns)
    expect(founders.some((f) => byId.has(f.id))).toBe(false);
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
