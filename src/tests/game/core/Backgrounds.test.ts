import { describe, it, expect, beforeEach } from 'vitest';
import { getBackgroundById, type Background } from '$lib/game/core/defs/backgrounds';
import {
  rollOrigin,
  rollBackgrounds,
  backgroundTraitAffinity,
  applyBackgroundExperience,
  backgroundPrestige,
  backgroundHomeKnowledge,
  backgroundWorldliness,
  ADULT_AGE
} from '$lib/game/core/gen/backgrounds';
import { generateCulturePool, generateCultureRelations } from '$lib/game/core/gen/culture';
import { generateKingdomPool, generateKingdomRelations } from '$lib/game/core/gen/kingdom';
import { generateColonyPawns } from '$lib/game/entities/Pawns';
import { kingdomService } from '$lib/game/services/KingdomService';
import { rng } from '$lib/game/core/util/rng';
import { MAX_WORK_LEVEL } from '$lib/game/core/rules/body/workExperience';
import type { GameState, Kingdom, WealthBand } from '$lib/game/core/types';

function world(seed = 20260713) {
  rng.reseed(seed);
  const cultures = generateCulturePool(14);
  const cultureRelations = generateCultureRelations(cultures);
  const kingdoms = generateKingdomPool(cultures, 12);
  const kingdomRelations = generateKingdomRelations(kingdoms, cultureRelations, cultures[0].id);
  return { cultures, kingdoms, kingdomRelations };
}

describe('BACKGROUNDS — origin & cohesion rules', () => {
  beforeEach(() => rng.reseed(20260713));

  it('rollOrigin picks a homeland whose culture mix actually contains the drawn culture', () => {
    const { cultures, kingdoms } = world();
    let kingdomOrigins = 0;
    for (let i = 0; i < 200; i++) {
      const { homeKingdomId, culture } = rollOrigin(cultures, kingdoms);
      expect(culture).toBeTruthy();
      if (homeKingdomId) {
        kingdomOrigins++;
        const k = kingdoms.find((kk) => kk.id === homeKingdomId)!;
        expect(k.cultureMix.some((m) => m.cultureId === culture.id)).toBe(true);
      }
    }
    expect(kingdomOrigins).toBeGreaterThan(140);
    expect(kingdomOrigins).toBeLessThan(200);
  });

  it('rollOrigin returns a homeless culture pick, with no homeKingdomId, when there are no kingdoms', () => {
    const { cultures } = world();
    const result = rollOrigin(cultures, []);
    expect(result.homeKingdomId).toBeUndefined();
    expect(cultures.some((c) => c.id === result.culture.id)).toBe(true);
  });

  it('rollOrigin draws poorer kingdoms more often than richer ones, and raiders less than a destitute kingdom', () => {
    const { cultures } = world();
    const bandKingdom = (band: WealthBand, id: string, relationBias: Kingdom['relationBias'] = 'derived'): Kingdom => ({
      id,
      name: id,
      cultureMix: [{ cultureId: cultures[0].id, weight: 1 }],
      relationBias,
      lore: {
        epithet: '',
        temperament: '',
        leaderName: '',
        wealthBand: band,
        capitalName: '',
        settlements: { towns: 0, villages: 0 },
        history: [],
        figures: [],
        famedItems: { created: [], held: [] }
      },
      knowledge: 0
    });
    const kingdoms: Kingdom[] = [
      bandKingdom('destitute', 'k_destitute'),
      bandKingdom('modest', 'k_modest'),
      bandKingdom('prosperous', 'k_prosperous'),
      bandKingdom('wealthy', 'k_wealthy'),
      bandKingdom('opulent', 'k_opulent'),
      bandKingdom('modest', 'k_raider', 'always_hostile')
    ];
    const tally: Record<string, number> = {};
    rng.reseed(20260713);
    for (let i = 0; i < 4000; i++) {
      const { homeKingdomId } = rollOrigin(cultures, kingdoms);
      if (homeKingdomId) tally[homeKingdomId] = (tally[homeKingdomId] ?? 0) + 1;
    }
    expect(tally['k_destitute']).toBeGreaterThan(tally['k_modest']);
    expect(tally['k_modest']).toBeGreaterThan(tally['k_prosperous']);
    expect(tally['k_prosperous']).toBeGreaterThan(tally['k_wealthy']);
    expect(tally['k_wealthy']).toBeGreaterThan(tally['k_opulent']);
    expect(tally['k_destitute']).toBeGreaterThan(tally['k_raider']);
    expect(tally['k_raider']).toBeGreaterThan(0);
  });

  it('an adulthood is always reachable from its childhood (a required tag was opened)', () => {
    const { kingdoms } = world();
    for (let i = 0; i < 300; i++) {
      const home = kingdoms[rng.int(0, kingdoms.length - 1)];
      const { childhood, adulthood } = rollBackgrounds(home, 30);
      expect(childhood.slot).toBe('childhood');
      expect(adulthood).toBeTruthy();
      expect(adulthood!.slot).toBe('adulthood');
      const opened = childhood.opens ?? [];
      expect((adulthood!.requires ?? []).some((t) => opened.includes(t))).toBe(true);
    }
  });

  it('under-18 pawns get a childhood only; adults get both', () => {
    const { kingdoms } = world();
    const home = kingdoms.find((k) => k.relationBias === 'derived')!;
    for (let i = 0; i < 40; i++) {
      expect(rollBackgrounds(home, 16).adulthood).toBeUndefined();
      expect(rollBackgrounds(home, 17).adulthood).toBeUndefined();
    }
    for (let i = 0; i < 40; i++) {
      expect(rollBackgrounds(home, ADULT_AGE).adulthood).toBeTruthy();
    }
  });

  it('stateless founders only get the foundling childhood; kingdom-born never do', () => {
    const { kingdoms } = world();
    for (let i = 0; i < 50; i++) {
      expect(rollBackgrounds(undefined, 30).childhood.id).toBe('wildlands_foundling');
    }
    const home = kingdoms.find((k) => k.relationBias === 'derived')!;
    for (let i = 0; i < 100; i++) {
      expect(rollBackgrounds(home, 30).childhood.stateless).not.toBe(true);
    }
  });

  it('raider-kingdom founders draw the warband childhood; settled kingdoms never do', () => {
    const { kingdoms } = world();
    const raider = kingdoms.find((k) => k.relationBias === 'always_hostile');
    if (raider) {
      for (let i = 0; i < 40; i++) {
        expect(rollBackgrounds(raider, 30).childhood.id).toBe('warband_whelp');
      }
    }
    const settled = kingdoms.find((k) => k.relationBias === 'derived')!;
    for (let i = 0; i < 100; i++) {
      expect(rollBackgrounds(settled, 30).childhood.raider).not.toBe(true);
    }
  });
});

describe('BACKGROUNDS — pawn generation & seeded knowledge', () => {
  beforeEach(() => rng.reseed(20260713));

  it('generateColonyPawns with kingdoms stamps origin + backgrounds on every founder', () => {
    const { cultures, kingdoms } = world();
    const pawns = generateColonyPawns(cultures, 8, { kingdoms, founders: true });
    expect(pawns).toHaveLength(8);
    for (const p of pawns) {
      expect(p.childhoodId).toBeTruthy();
      expect(getBackgroundById(p.childhoodId)).toBeTruthy();
      if ((p.age ?? 0) >= ADULT_AGE) expect(p.adulthoodId).toBeTruthy();
      else expect(p.adulthoodId).toBeUndefined();
    }
  });

  it('founders never roll a founder-excluded (founderWeight:0) background like Court Scholar', () => {
    const { cultures, kingdoms } = world();
    const founders = generateColonyPawns(cultures, 300, { kingdoms, founders: true });
    expect(founders.some((p) => p.adulthoodId === 'court_scholar')).toBe(false);
    const migrants = generateColonyPawns(cultures, 400, { kingdoms });
    expect(migrants.some((p) => p.adulthoodId === 'court_scholar')).toBe(true);
  });

  it('founder rarity means a fresh colony knows fewer kingdoms than an un-rarified one', () => {
    const { cultures, kingdoms, kingdomRelations } = world();
    const knownCount = (founders: boolean) => {
      const pawns = generateColonyPawns(cultures, 5, { kingdoms, founders });
      let s = {
        turn: 0,
        culturePool: cultures.map((c) => ({ ...c })),
        kingdoms: kingdoms.map((k) => ({ ...k })),
        kingdomRelations
      } as unknown as GameState;
      s = kingdomService.seedKingdomKnowledgeFromPawns(s, pawns);
      return (s.kingdoms ?? []).filter((k) => k.discovered).length;
    };
    let founderTotal = 0;
    let openTotal = 0;
    for (let seed = 1; seed <= 12; seed++) {
      rng.reseed(3000 + seed);
      founderTotal += knownCount(true);
      rng.reseed(3000 + seed);
      openTotal += knownCount(false);
    }
    expect(founderTotal).toBeLessThan(openTotal);
  });

  it('seeding leaves founders knowing their homelands — stale, tiered, and shared', () => {
    const { cultures, kingdoms, kingdomRelations } = world();
    const pawns = generateColonyPawns(cultures, 6, { kingdoms });
    let state = {
      turn: 0,
      culturePool: cultures,
      kingdoms,
      kingdomRelations
    } as unknown as GameState;
    state = kingdomService.seedKingdomKnowledgeFromPawns(state, pawns);

    const homes = new Set(pawns.map((p) => p.homeKingdomId).filter(Boolean));
    const knownHomes = (state.kingdoms ?? []).filter((k: Kingdom) => k.discovered);
    expect(knownHomes.length).toBeGreaterThan(0);
    for (const k of knownHomes) {
      expect(k.knowledge).toBeGreaterThan(0);
      expect(k.lastContactTurn).toBeUndefined();
      expect(kingdomService.isKnowledgeStale(k, 0)).toBe(true);
    }
    for (const homeId of homes) {
      expect(state.kingdoms!.find((k) => k.id === homeId)?.discovered).toBe(true);
    }
  });
});

describe('getBackgroundById', () => {
  it('returns the background whose id matches, for both a childhood and an adulthood id', () => {
    expect(getBackgroundById('village_child')?.id).toBe('village_child');
    expect(getBackgroundById('field_hand')?.id).toBe('field_hand');
  });

  it('returns undefined for an id that does not exist', () => {
    expect(getBackgroundById('not-a-real-id')).toBeUndefined();
  });

  it('returns undefined when given undefined', () => {
    expect(getBackgroundById(undefined)).toBeUndefined();
  });
});

describe('backgroundTraitAffinity', () => {
  it('unions traitAffinity from both backgrounds and collects traitGuaranteed from both in order', () => {
    const childhood: Background = {
      id: 'c',
      title: '',
      description: '',
      traitAffinity: ['industrious', 'sturdy'],
      traitGuaranteed: ['forager']
    };
    const adulthood: Background = {
      id: 'a',
      title: '',
      description: '',
      traitAffinity: ['scholar', 'sturdy'],
      traitGuaranteed: ['bright']
    };
    const { boost, guaranteed } = backgroundTraitAffinity(childhood, adulthood);
    expect([...boost].sort()).toEqual(['industrious', 'scholar', 'sturdy']);
    expect(guaranteed).toEqual(['forager', 'bright']);
  });

  it('treats a missing childhood or adulthood as contributing nothing', () => {
    const adulthood: Background = { id: 'a', title: '', description: '', traitAffinity: ['x'] };
    expect(backgroundTraitAffinity(undefined, adulthood).boost.has('x')).toBe(true);
    expect(backgroundTraitAffinity(undefined, undefined)).toEqual({
      boost: new Set(),
      guaranteed: []
    });
  });
});

describe('applyBackgroundExperience', () => {
  it('clamps accumulated experience at MAX_WORK_LEVEL even when the unclamped sum would exceed it', () => {
    const childhood: Background = {
      id: 'c',
      title: '',
      description: '',
      experience: { crafting: [45, 45] }
    };
    const adulthood: Background = {
      id: 'a',
      title: '',
      description: '',
      experience: { crafting: [45, 45] }
    };
    const result = applyBackgroundExperience({ crafting: 1 }, childhood, adulthood);
    expect(result.crafting).toBe(MAX_WORK_LEVEL);
  });

  it('accumulates experience from both childhood and adulthood, defaulting an absent category to 1', () => {
    const childhood: Background = {
      id: 'c',
      title: '',
      description: '',
      experience: { foraging: [2, 2] }
    };
    const adulthood: Background = {
      id: 'a',
      title: '',
      description: '',
      experience: { foraging: [3, 3] }
    };
    const result = applyBackgroundExperience({}, childhood, adulthood);
    expect(result.foraging).toBe(6);
  });

  it('does not mutate the input skills object', () => {
    const skills = { crafting: 20 };
    const childhood: Background = {
      id: 'c',
      title: '',
      description: '',
      experience: { crafting: [5, 5] }
    };
    applyBackgroundExperience(skills, childhood, undefined);
    expect(skills).toEqual({ crafting: 20 });
  });
});

describe('backgroundPrestige', () => {
  it('sums independent rolls from both prestige bands rather than taking one', () => {
    const childhood: Background = { id: 'c', title: '', description: '', prestige: [3, 3] };
    const adulthood: Background = { id: 'a', title: '', description: '', prestige: [10, 10] };
    expect(backgroundPrestige(childhood, adulthood)).toBe(13);
  });

  it('is 0 for an undefined background and equal to the other background alone', () => {
    const childhood: Background = { id: 'c', title: '', description: '', prestige: [4, 4] };
    expect(backgroundPrestige(childhood, undefined)).toBe(4);
    expect(backgroundPrestige(undefined, childhood)).toBe(4);
    expect(backgroundPrestige(undefined, undefined)).toBe(0);
  });

  it('each roll stays within its own band', () => {
    const childhood: Background = { id: 'c', title: '', description: '', prestige: [1, 5] };
    const adulthood: Background = { id: 'a', title: '', description: '', prestige: [20, 30] };
    for (let seed = 1; seed <= 20; seed++) {
      rng.reseed(seed);
      const result = backgroundPrestige(childhood, adulthood);
      expect(result).toBeGreaterThanOrEqual(21);
      expect(result).toBeLessThanOrEqual(35);
    }
  });
});

describe('backgroundHomeKnowledge', () => {
  it('sums independent rolls from both home knowledge bands rather than taking one', () => {
    const childhood: Background = { id: 'c', title: '', description: '', homeKnowledge: [5, 5] };
    const adulthood: Background = { id: 'a', title: '', description: '', homeKnowledge: [7, 7] };
    expect(backgroundHomeKnowledge(childhood, adulthood)).toBe(12);
  });

  it('is 0 when neither background declares homeKnowledge', () => {
    const childhood: Background = { id: 'c', title: '', description: '' };
    expect(backgroundHomeKnowledge(childhood, undefined)).toBe(0);
    expect(backgroundHomeKnowledge(undefined, undefined)).toBe(0);
  });

  it('each roll stays within its own band', () => {
    const childhood: Background = { id: 'c', title: '', description: '', homeKnowledge: [1, 3] };
    const adulthood: Background = {
      id: 'a',
      title: '',
      description: '',
      homeKnowledge: [50, 60]
    };
    for (let seed = 1; seed <= 20; seed++) {
      rng.reseed(seed);
      const result = backgroundHomeKnowledge(childhood, adulthood);
      expect(result).toBeGreaterThanOrEqual(51);
      expect(result).toBeLessThanOrEqual(63);
    }
  });
});

describe('backgroundWorldliness', () => {
  it('prefers adulthood worldKnowledge band over childhood when both are present', () => {
    const childhood: Background = {
      id: 'c',
      title: '',
      description: '',
      worldliness: 2,
      worldKnowledge: [1, 2]
    };
    const adulthood: Background = {
      id: 'a',
      title: '',
      description: '',
      worldliness: 5,
      worldKnowledge: [100, 200]
    };
    const { band, count } = backgroundWorldliness(childhood, adulthood);
    expect(band).toEqual([100, 200]);
    expect(count).toBe(7);
  });

  it('falls back to the childhood worldKnowledge band when adulthood declares none', () => {
    const childhood: Background = {
      id: 'c',
      title: '',
      description: '',
      worldKnowledge: [3, 9]
    };
    expect(backgroundWorldliness(childhood, undefined).band).toEqual([3, 9]);
  });

  it('defaults the band to [10, 25] when neither background declares worldKnowledge', () => {
    const childhood: Background = { id: 'c', title: '', description: '' };
    const adulthood: Background = { id: 'a', title: '', description: '' };
    expect(backgroundWorldliness(childhood, adulthood).band).toEqual([10, 25]);
    expect(backgroundWorldliness(undefined, undefined).band).toEqual([10, 25]);
  });

  it('sums the worldliness field from both backgrounds into count', () => {
    const childhood: Background = { id: 'c', title: '', description: '', worldliness: 3 };
    const adulthood: Background = { id: 'a', title: '', description: '' };
    expect(backgroundWorldliness(childhood, adulthood).count).toBe(3);
    expect(backgroundWorldliness(undefined, undefined).count).toBe(0);
  });
});
