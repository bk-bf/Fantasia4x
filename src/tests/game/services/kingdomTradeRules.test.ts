import { describe, it, expect, beforeEach } from 'vitest';
import { spawnKingdomParty } from '$lib/game/services/entity/kingdomParties';
import { kingdomService } from '$lib/game/services/KingdomService';
import { generateCulturePool, generateCultureRelations } from '$lib/game/core/gen/culture';
import { generateKingdomPool, generateKingdomRelations } from '$lib/game/core/gen/kingdom';
import { itemDefById } from '$lib/game/core/defs/items';
import { SEED_KNOWLEDGE_CAP } from '$lib/game/core/defs/backgrounds';
import { rng } from '$lib/game/core/util/rng';
import type { GameState, Item, Kingdom } from '$lib/game/core/types';

function plainsState(): GameState {
  const worldMap = Array.from({ length: 80 }, (_, y) =>
    Array.from({ length: 80 }, (_, x) => ({
      x,
      y,
      terrainType: 'plains',
      subType: 'grass',
      walkable: true,
      resources: {} as Record<string, number>
    }))
  );
  return {
    turn: 0,
    worldMap,
    pawns: [{ id: 'p1', name: 'Vale', isAlive: true, position: { x: 40, y: 40 } }],
    mobs: [],
    droppedItems: [],
    stockpile: {},
    stockpileZones: []
  } as unknown as GameState;
}

function withKingdoms(colonyScore: number): { state: GameState; kingdom: Kingdom } {
  const cultures = generateCulturePool(10);
  const cultureRelations = generateCultureRelations(cultures);
  const kingdoms = generateKingdomPool(cultures, 8);
  const kingdomRelations = generateKingdomRelations(kingdoms, cultureRelations, cultures[0].id);
  for (const r of kingdomRelations) if (r.a === 'colony' || r.b === 'colony') r.score = colonyScore;
  const friendly = kingdoms.find((k) => k.relationBias === 'derived')!;
  return {
    state: { ...plainsState(), culturePool: cultures, kingdoms, kingdomRelations } as GameState,
    kingdom: friendly
  };
}

beforeEach(() => rng.reseed(20261121));

describe('visiting parties', () => {
  it('no kingdom the colony is at odds with sends a party', () => {
    const { state } = withKingdoms(-30);
    const s = kingdomService.processKingdomsDaily({ ...state, nextKingdomVisitTurn: 0 });
    expect(s.kingdomParties ?? []).toHaveLength(0);
    expect(s.pendingEvent).toBeUndefined();
  });

  it('a party with living members leaves on its departure turn', () => {
    const { state, kingdom } = withKingdoms(50);
    const { state: s1, party } = spawnKingdomParty(state, kingdom, 'visitor', [], 0)!;
    const departed = kingdomService.processKingdomsDaily({
      ...s1,
      turn: party.departTurn,
      nextKingdomVisitTurn: party.departTurn + 1_000_000
    });
    expect(departed.kingdomParties ?? []).toHaveLength(0);
    expect((departed.mobs ?? []).some((m) => m.partyId === party.id)).toBe(false);
  });
});

describe('trade', () => {
  it('a better negotiator pays less for what the caravan sells', () => {
    const { state, kingdom } = withKingdoms(50);
    const good = { itemId: 'copper_bar', qty: 1 };
    const plain = kingdomService.effectiveTradePrice(state, kingdom.id, good, 'receive', 1);
    const skilled = kingdomService.effectiveTradePrice(state, kingdom.id, good, 'receive', 1.5);
    expect(skilled).toBeLessThan(plain);
  });

  it('a caravan stocks nothing above its tier cap', () => {
    const def = { ...(itemDefById('copper_bar') as Item), tier: 3 };
    expect(kingdomService.isTradeableDef(def, 2)).toBe(false);
    expect(kingdomService.isTradeableDef(def, 3)).toBe(true);
  });
});

describe('knowing a kingdom', () => {
  it('a familiar kingdom reveals every culture in its mix', () => {
    const { state, kingdom } = withKingdoms(50);
    const mixed = state.kingdoms!.find((k) => k.cultureMix.length >= 2) ?? kingdom;
    expect(mixed.cultureMix.length).toBeGreaterThanOrEqual(2);
    const s = kingdomService.recordContact(state, mixed.id, 60 - mixed.knowledge);
    for (const { cultureId } of mixed.cultureMix)
      expect(s.culturePool!.find((c) => c.id === cultureId)?.discovered).toBe(true);
  });

  it('knowledge seeded from backgrounds never passes the seed cap', () => {
    const { state, kingdom } = withKingdoms(50);
    const s = kingdomService.seedKnowledge(state, kingdom.id, SEED_KNOWLEDGE_CAP * 3);
    expect(s.kingdoms!.find((k) => k.id === kingdom.id)!.knowledge).toBe(SEED_KNOWLEDGE_CAP);
  });
});
