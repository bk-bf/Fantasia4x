import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateKingdomPool,
  generateKingdomRelations,
  generateKingdom,
  generateLeaderName,
  generateFamedItemName,
  dispositionForScore,
  knowledgeTier,
  KNOWLEDGE_TIER_THRESHOLDS,
  stepWealthBand,
  WEALTH_BANDS,
  findKingdomRelation
} from '$lib/game/core/gen/kingdom';
import { generateCulturePool, generateCultureRelations } from '$lib/game/core/gen/culture';
import { COLONY_RELATION_ID } from '$lib/game/core/types';
import type { Kingdom, KingdomRelation, CultureRelation } from '$lib/game/core/types';
import { rng } from '$lib/game/core/util/rng';
import loreData from '$lib/game/database/social/kingdom-lore.json';

const LORE = loreData as unknown as {
  raiderLeaderTitles: string[];
  leaderTitlesByTier: string[][];
  famedItemMaterials: string[];
  famedItemTypes: string[];
  famedItemEpithets: string[];
};

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
    const idx = (k: (typeof pool)[number]) => WEALTH_BANDS.indexOf(k.lore.wealthBand);
    const grand = pool.filter((k) => idx(k) >= 3);
    const small = pool.filter((k) => idx(k) <= 1);
    for (const k of grand) {
      expect(k.lore.history.length + k.lore.figures.length).toBeGreaterThanOrEqual(3);
      expect(
        k.lore.famedItems.created.length + k.lore.famedItems.held.length
      ).toBeGreaterThanOrEqual(1);
    }
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

    const raider = pool.find((k) => k.relationBias === 'always_hostile');
    const nonRaider = pool.find((k) => k.relationBias !== 'always_hostile');
    if (raider && nonRaider) {
      const rel = findKingdomRelation(relations, raider.id, nonRaider.id);
      expect(rel?.score, 'raider-vs-kingdom pair, not just the colony row').toBe(-100);
      expect(rel?.disposition).toBe('hostile');
    }
  });

  it('lore.settlements (towns + villages) rises with wealth tier', () => {
    const cultures = generateCulturePool(6);
    const byBand = new Map<string, number[]>();
    for (let i = 0; i < 500; i++) {
      const k = generateKingdom(cultures, false);
      const total = k.lore.settlements.towns + k.lore.settlements.villages;
      const arr = byBand.get(k.lore.wealthBand) ?? [];
      arr.push(total);
      byBand.set(k.lore.wealthBand, arr);
    }
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const destitute = byBand.get('destitute') ?? [];
    const opulent = byBand.get('opulent') ?? [];
    expect(destitute.length, 'need destitute samples').toBeGreaterThan(3);
    expect(opulent.length, 'need opulent samples').toBeGreaterThan(3);
    expect(avg(destitute)).toBeLessThan(avg(opulent));
  });

  it('generateKingdomRelations score responds to culture-relation affinity between kingdoms', () => {
    const lore = {
      epithet: 'e',
      temperament: 't',
      leaderName: 'l',
      wealthBand: 'modest' as const,
      capitalName: 'cap',
      settlements: { towns: 1, villages: 1 },
      history: [] as string[],
      figures: [] as string[],
      famedItems: { created: [] as string[], held: [] as string[] }
    };
    const a: Kingdom = {
      id: 'ka',
      name: 'A',
      cultureMix: [{ cultureId: 'c1', weight: 1 }],
      relationBias: 'derived',
      lore,
      knowledge: 0
    };
    const b: Kingdom = {
      id: 'kb',
      name: 'B',
      cultureMix: [{ cultureId: 'c2', weight: 1 }],
      relationBias: 'derived',
      lore,
      knowledge: 0
    };
    const highRel: CultureRelation[] = [{ a: 'c1', b: 'c2', score: 90, disposition: 'allied' }];
    const lowRel: CultureRelation[] = [{ a: 'c1', b: 'c2', score: -90, disposition: 'hostile' }];

    const avgScore = (rel: CultureRelation[]) => {
      let total = 0;
      const N = 200;
      for (let i = 0; i < N; i++) {
        const relations = generateKingdomRelations([a, b], rel, 'c1');
        const pair = relations.find((r) => r.a === 'ka' && r.b === 'kb')!;
        total += pair.score;
      }
      return total / N;
    };

    expect(avgScore(highRel)).toBeGreaterThan(avgScore(lowRel));
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

  it('dispositionForScore maps all four thresholds, not just the extremes', () => {
    expect(dispositionForScore(60)).toBe('allied');
    expect(dispositionForScore(59)).toBe('friendly');
    expect(dispositionForScore(20)).toBe('friendly');
    expect(dispositionForScore(19)).toBe('neutral');
    expect(dispositionForScore(-19)).toBe('neutral');
    expect(dispositionForScore(-20)).toBe('wary');
    expect(dispositionForScore(-59)).toBe('wary');
    expect(dispositionForScore(-60)).toBe('hostile');
    expect(dispositionForScore(-100)).toBe('hostile');
  });
});

describe('KINGDOMS-TRADE — leader names, famed items & relation lookup', () => {
  it('generateLeaderName draws its title from the raider pool for raiders, the tiered pool otherwise', () => {
    for (let i = 0; i < 150; i++) {
      const name = generateLeaderName(true);
      const title = LORE.raiderLeaderTitles.find((t) => name.startsWith(`${t} `));
      expect(title, name).toBeTruthy();
    }
    const wealthIdx = 3;
    for (let i = 0; i < 150; i++) {
      const name = generateLeaderName(false, wealthIdx);
      const title = LORE.leaderTitlesByTier[wealthIdx].find((t) => name.startsWith(`${t} `));
      expect(title, name).toBeTruthy();
    }
  });

  it('generateFamedItemName combines a real material and item type from LORE', () => {
    const combos = new Set<string>();
    for (const m of LORE.famedItemMaterials)
      for (const t of LORE.famedItemTypes) combos.add(`The ${m} ${t}`);

    for (let i = 0; i < 200; i++) {
      const name = generateFamedItemName();
      expect(name).toMatch(/^The \S+ \S+/);
      const matchedCombo = [...combos].find((c) => name === c || name.startsWith(`${c} `));
      expect(matchedCombo, name).toBeTruthy();
      if (name !== matchedCombo) {
        const epithet = name.slice(matchedCombo!.length + 1);
        expect(LORE.famedItemEpithets, name).toContain(epithet);
      }
    }
  });

  it('findKingdomRelation is symmetric and returns undefined for an unrelated pair', () => {
    const relations: KingdomRelation[] = [{ a: 'x', b: 'y', score: 10, disposition: 'friendly' }];
    expect(findKingdomRelation(relations, 'x', 'y')).toEqual(relations[0]);
    expect(findKingdomRelation(relations, 'y', 'x')).toEqual(relations[0]);
    expect(findKingdomRelation(relations, 'x', 'z')).toBeUndefined();
  });
});
