import { describe, it, expect, beforeEach } from 'vitest';
import { spawnKingdomParty, despawnKingdomParty } from '$lib/game/services/entity/kingdomParties';
import { kingdomService } from '$lib/game/services/KingdomService';
import { generateCulturePool, generateCultureRelations } from '$lib/game/core/Culture';
import { generateKingdomPool, generateKingdomRelations } from '$lib/game/core/Kingdom';
import { rng } from '$lib/game/core/rng';
import type { GameState, Kingdom } from '$lib/game/core/types';

// KINGDOMS-TRADE §3: party spawn/despawn + the daily arrival scheduler. Exercises the new
// kingdom_* creature defs (body plans, natural weapons) and the guard_* lootpools end-to-end.

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

function withKingdoms(state: GameState): { state: GameState; kingdom: Kingdom } {
  const cultures = generateCulturePool(10);
  const cultureRelations = generateCultureRelations(cultures);
  const kingdoms = generateKingdomPool(cultures, 8);
  const kingdomRelations = generateKingdomRelations(kingdoms, cultureRelations, cultures[0].id);
  // Warm every colony relation so an eligible sender always exists.
  for (const r of kingdomRelations) if (r.a === 'colony' || r.b === 'colony') r.score = 50;
  const friendly = kingdoms.find((k) => k.relationBias === 'derived')!;
  return {
    state: { ...state, culturePool: cultures, kingdoms, kingdomRelations } as GameState,
    kingdom: friendly
  };
}

describe('spawnKingdomParty', () => {
  beforeEach(() => rng.reseed(20260712));

  it('a caravan spawns a trader + guards + pack beasts, flagged and marching to the colony', () => {
    const { state, kingdom } = withKingdoms(plainsState());
    const out = spawnKingdomParty(state, kingdom, 'caravan', [{ itemId: 'copper_bar', qty: 5 }], 0);
    expect(out).toBeTruthy();
    const { state: s2, party } = out!;
    expect(party.traderMobId).toBeTruthy();
    const members = (s2.mobs ?? []).filter((m) => m.partyId === party.id);
    expect(members.length).toBe(party.mobIds.length);
    expect(members.some((m) => m.partyRole === 'trader')).toBe(true);
    expect(members.some((m) => m.partyRole === 'guard')).toBe(true);
    for (const m of members) {
      expect(m.kingdomId).toBe(kingdom.id);
      // Goal-directed march toward the colony (no leash).
      expect(m.state).toBe('Traveling');
      expect(m.travelGoalX).toBeDefined();
      expect(m.travelGoalY).toBeDefined();
      expect(m.lairId).toBeUndefined();
    }
    // Guards drew a wealth-rung loadout from the guard_* pools.
    const guards = members.filter((m) => m.partyRole === 'guard');
    expect(guards.some((g) => g.equipment && Object.keys(g.equipment).length > 0)).toBe(true);
    expect(party.stock).toEqual([{ itemId: 'copper_bar', qty: 5 }]);
  });

  it('despawnKingdomParty removes live members and the party record', () => {
    const { state, kingdom } = withKingdoms(plainsState());
    const { state: s2, party } = spawnKingdomParty(state, kingdom, 'visitor', [], 0)!;
    const s3 = despawnKingdomParty(s2, party.id);
    expect((s3.mobs ?? []).some((m) => m.partyId === party.id)).toBe(false);
    expect(s3.kingdomParties ?? []).toHaveLength(0);
  });
});

describe('kingdomService.processKingdomsDaily — arrival scheduling', () => {
  beforeEach(() => rng.reseed(20260712));

  it('initialises the cadence clock, then raises a kingdom-arrival with a live party when due', () => {
    let { state } = withKingdoms(plainsState());
    state = kingdomService.processKingdomsDaily(state);
    expect(state.nextKingdomVisitTurn).toBeGreaterThan(0);

    // Fast-forward to the due date and run the daily pass again.
    state = { ...state, turn: state.nextKingdomVisitTurn! };
    state = kingdomService.processKingdomsDaily(state);
    expect(state.pendingEvent?.kind).toBe('kingdom-arrival');
    expect(state.kingdomParties).toHaveLength(1);
    const party = state.kingdomParties![0];
    expect((state.mobs ?? []).filter((m) => m.partyId === party.id).length).toBeGreaterThan(0);
    // The sender is discovered with first-contact knowledge, and the clock is rearmed.
    const sender = state.kingdoms!.find((k) => k.id === party.kingdomId)!;
    expect(sender.discovered).toBe(true);
    expect(sender.knowledge).toBeGreaterThan(0);
    // RACE-SYSTEM Phase 2: first contact introduces the sender's dominant culture to the pokédex.
    const dominant = sender.cultureMix[0]?.cultureId;
    expect(state.culturePool!.find((c) => c.id === dominant)?.discovered).toBe(true);
    expect(state.nextKingdomVisitTurn).toBeGreaterThan(state.turn);
    // A caravan always leads its manifest with gold bars (the barter anchor).
    if (party.kind === 'caravan') {
      expect(party.stock[0]?.itemId).toBe('gold_bar');
    }
  });
});
