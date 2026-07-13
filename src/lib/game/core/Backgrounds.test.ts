import { describe, it, expect, beforeEach } from 'vitest';
import {
  rollOrigin,
  rollBackgrounds,
  getBackgroundById,
  ADULT_AGE
} from './Backgrounds';
import { generateCulturePool, generateCultureRelations } from './Culture';
import { generateKingdomPool, generateKingdomRelations } from './Kingdom';
import { generateColonyPawns } from '../entities/Pawns';
import { kingdomService } from '../services/KingdomService';
import { rng } from './rng';
import type { GameState, Kingdom } from './types';

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
    // Most founders have a homeland; a minority are stateless (~STATELESS_CHANCE).
    expect(kingdomOrigins).toBeGreaterThan(140);
    expect(kingdomOrigins).toBeLessThan(200);
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
    const pawns = generateColonyPawns(cultures, 8, { kingdoms });
    expect(pawns).toHaveLength(8);
    for (const p of pawns) {
      expect(p.childhoodId).toBeTruthy();
      expect(getBackgroundById(p.childhoodId)).toBeTruthy();
      if (p.age >= ADULT_AGE) expect(p.adulthoodId).toBeTruthy();
      else expect(p.adulthoodId).toBeUndefined();
    }
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
      // Every discovered kingdom carries real knowledge and reads as a stale memory (no contact turn).
      expect(k.knowledge).toBeGreaterThan(0);
      expect(k.lastContactTurn).toBeUndefined();
      expect(kingdomService.isKnowledgeStale(k, 0)).toBe(true);
    }
    // At least the founders' actual homelands are known.
    for (const homeId of homes) {
      expect(state.kingdoms!.find((k) => k.id === homeId)?.discovered).toBe(true);
    }
  });
});
