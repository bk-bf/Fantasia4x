import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateKingdomPool,
  generateKingdomRelations,
  knowledgeTier,
  KNOWLEDGE_TIER_THRESHOLDS,
  stepWealthBand,
  WEALTH_BANDS,
  findKingdomRelation
} from '$lib/game/core/Kingdom';
import { generateCulturePool, generateCultureRelations } from '$lib/game/core/Culture';
import { COLONY_RELATION_ID } from '$lib/game/core/types';
import { rng } from '$lib/game/core/rng';

describe('KINGDOMS-TRADE — kingdom pool generation', () => {
  beforeEach(() => rng.reseed(20260712));

  it('generateKingdomPool yields ~20 kingdoms with unique ids; lore depth scales with wealth', () => {
    const cultures = generateCulturePool(18);
    const pool = generateKingdomPool(cultures, 20);
    expect(pool).toHaveLength(20);
    expect(new Set(pool.map((k) => k.id)).size).toBe(20);
    for (const k of pool) {
      expect(k.name).toBeTruthy();
      expect(k.lore.epithet).toBeTruthy();
      expect(k.lore.temperament).toBeTruthy();
      expect(k.lore.leaderName).toBeTruthy();
      expect(WEALTH_BANDS).toContain(k.lore.wealthBand);
      expect(k.lore.capitalName).toBeTruthy();
      expect(k.knowledge).toBe(0);
      expect(k.discovered).toBeFalsy();
    }
    // Scale = wealth: a grand kingdom has deep lore, a small poor one is sparse.
    const idx = (k: (typeof pool)[number]) => WEALTH_BANDS.indexOf(k.lore.wealthBand);
    const grand = pool.filter((k) => idx(k) >= 3);
    const small = pool.filter((k) => idx(k) <= 1);
    for (const k of grand) {
      expect(k.lore.history.length + k.lore.figures.length).toBeGreaterThanOrEqual(3);
      expect(
        k.lore.famedItems.created.length + k.lore.famedItems.held.length
      ).toBeGreaterThanOrEqual(1);
    }
    // Small places are meant to be unremarkable: at least one carries no famed works at all.
    expect(
      small.some((k) => k.lore.famedItems.created.length + k.lore.famedItems.held.length === 0)
    ).toBe(true);
  });

  it('kingdoms are downstream from the culture pool — no new cultures minted', () => {
    const cultures = generateCulturePool(12);
    const cultureIds = new Set(cultures.map((c) => c.id));
    const pool = generateKingdomPool(cultures, 20);
    for (const k of pool) {
      expect(k.cultureMix.length).toBeGreaterThanOrEqual(1);
      const total = k.cultureMix.reduce((s, m) => s + m.weight, 0);
      expect(total).toBeCloseTo(1, 5);
      for (const share of k.cultureMix) expect(cultureIds.has(share.cultureId)).toBe(true);
    }
  });

  it('a handful of kingdoms are always-hostile raiders', () => {
    const cultures = generateCulturePool(12);
    const pool = generateKingdomPool(cultures, 20);
    const raiders = pool.filter((k) => k.relationBias === 'always_hostile');
    expect(raiders.length).toBeGreaterThanOrEqual(2);
    expect(raiders.length).toBeLessThanOrEqual(4);
  });

  it('relations cover every kingdom pair plus a colony row per kingdom; raiders pin hostile', () => {
    const cultures = generateCulturePool(10);
    const cultureRelations = generateCultureRelations(cultures);
    const pool = generateKingdomPool(cultures, 12);
    const relations = generateKingdomRelations(pool, cultureRelations, cultures[0].id);
    expect(relations).toHaveLength((12 * 11) / 2 + 12);
    for (const r of relations) {
      expect(r.score).toBeGreaterThanOrEqual(-100);
      expect(r.score).toBeLessThanOrEqual(100);
    }
    for (const raider of pool.filter((k) => k.relationBias === 'always_hostile')) {
      const rel = findKingdomRelation(relations, COLONY_RELATION_ID, raider.id);
      expect(rel?.score).toBe(-100);
      expect(rel?.disposition).toBe('hostile');
    }
  });
});

describe('KINGDOMS-TRADE — knowledge tiers & wealth bands', () => {
  it('knowledgeTier walks the thresholds 0→4', () => {
    expect(knowledgeTier(0)).toBe(0);
    expect(knowledgeTier(KNOWLEDGE_TIER_THRESHOLDS[1])).toBe(1);
    expect(knowledgeTier(KNOWLEDGE_TIER_THRESHOLDS[2])).toBe(2);
    expect(knowledgeTier(KNOWLEDGE_TIER_THRESHOLDS[3])).toBe(3);
    expect(knowledgeTier(KNOWLEDGE_TIER_THRESHOLDS[4])).toBe(4);
    expect(knowledgeTier(99999)).toBe(4);
  });

  it('stepWealthBand clamps at both ends of the scale', () => {
    expect(stepWealthBand('destitute', -1)).toBe('destitute');
    expect(stepWealthBand('destitute', 1)).toBe('modest');
    expect(stepWealthBand('opulent', 1)).toBe('opulent');
    expect(stepWealthBand('opulent', -1)).toBe('wealthy');
  });
});
