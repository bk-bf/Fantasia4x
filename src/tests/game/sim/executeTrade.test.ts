import { describe, it, expect } from 'vitest';
import { COMMANDS } from '$lib/game/sim/commands';
import type { GameState, Kingdom, KingdomParty, Pawn } from '$lib/game/core/types';

// KINGDOMS-TRADE §4: the barter commit. Locks the caravan-side acceptance rule (received value must
// be covered by given value, priced by the pawn's `trade` stat with gold anchoring), the physical
// item movement (stored drops in, stored drops out), and the contact side-effects (knowledge +
// goodwill on a completed deal).

const kingdom = (): Kingdom => ({
  id: 'k1',
  name: 'Test Kingdom',
  cultureMix: [],
  relationBias: 'derived',
  knowledge: 0,
  lore: {
    epithet: 'e',
    temperament: 't',
    leaderName: 'King Test',
    wealthBand: 'modest',
    capitalName: 'Testholm',
    settlements: { towns: 1, villages: 2 },
    history: [],
    figures: [],
    famedItems: { created: [], held: [] }
  }
});

const party = (stock: { itemId: string; qty: number }[]): KingdomParty => ({
  id: 'party-k1-1',
  kingdomId: 'k1',
  kind: 'caravan',
  mobIds: [],
  arrivedTurn: 0,
  departTurn: 999999,
  stock,
  gold: 0
});

const negotiator = (): Pawn =>
  ({
    id: 'p1',
    name: 'Vale',
    isAlive: true,
    position: { x: 1, y: 1 },
    stats: { strength: 10, dexterity: 10, constitution: 10, perception: 10, intelligence: 10, charisma: 10 }
  }) as unknown as Pawn;

function stateWith(colonyGold: number, stock: { itemId: string; qty: number }[]): GameState {
  return {
    turn: 100,
    pawns: [negotiator()],
    droppedItems: [
      { id: 'd1', resourceId: 'gold_bar', x: 2, y: 2, quantity: colonyGold, stored: true }
    ],
    stockpile: { gold_bar: colonyGold },
    stockpileZones: [],
    kingdoms: [kingdom()],
    kingdomRelations: [{ a: 'colony', b: 'k1', score: 0, disposition: 'neutral' }],
    kingdomParties: [party(stock)]
  } as unknown as GameState;
}

describe('executeTrade — barter commit', () => {
  it('a covered deal moves goods both ways and deepens contact', () => {
    const s = stateWith(3, [{ itemId: 'copper_bar', qty: 10 }]);
    const out = COMMANDS.executeTrade(s, {
      partyId: 'party-k1-1',
      pawnId: 'p1',
      give: [{ itemId: 'gold_bar', qty: 1 }],
      receive: [{ itemId: 'copper_bar', qty: 2 }]
    });
    // Colony: one gold bar left the stored pile, two copper bars materialised as stored stock.
    expect(out.stockpile.gold_bar).toBe(2);
    expect(out.stockpile.copper_bar).toBe(2);
    // Caravan: copper down, the given gold absorbed into its manifest.
    const pt = out.kingdomParties![0];
    expect(pt.stock.find((g) => g.itemId === 'copper_bar')?.qty).toBe(8);
    expect(pt.stock.find((g) => g.itemId === 'gold_bar')?.qty).toBe(1);
    // Contact: discovered + knowledge xp + a goodwill bump.
    const k = out.kingdoms![0];
    expect(k.discovered).toBe(true);
    expect(k.knowledge).toBeGreaterThan(0);
    expect(k.lastContactTurn).toBe(100);
    expect(out.kingdomRelations![0].score).toBeGreaterThan(0);
  });

  it('the caravan refuses a deal the given value does not cover', () => {
    const s = stateWith(3, [{ itemId: 'copper_bar', qty: 10 }]);
    const out = COMMANDS.executeTrade(s, {
      partyId: 'party-k1-1',
      pawnId: 'p1',
      give: [],
      receive: [{ itemId: 'copper_bar', qty: 2 }]
    });
    expect(out).toBe(s); // rejected — nothing moved
  });

  it('offers beyond actual stock are rejected outright', () => {
    const s = stateWith(1, [{ itemId: 'copper_bar', qty: 1 }]);
    const out = COMMANDS.executeTrade(s, {
      partyId: 'party-k1-1',
      pawnId: 'p1',
      give: [{ itemId: 'gold_bar', qty: 5 }],
      receive: [{ itemId: 'copper_bar', qty: 1 }]
    });
    expect(out).toBe(s);
  });

  it('gold anchors: its price is identical in both directions, regardless of relations', () => {
    const s = stateWith(3, [{ itemId: 'gold_bar', qty: 3 }]);
    // Swapping a gold bar for a gold bar is always exactly balanced — the deal is acceptable.
    const out = COMMANDS.executeTrade(s, {
      partyId: 'party-k1-1',
      pawnId: 'p1',
      give: [{ itemId: 'gold_bar', qty: 1 }],
      receive: [{ itemId: 'gold_bar', qty: 1 }]
    });
    expect(out).not.toBe(s); // accepted
    expect(out.stockpile.gold_bar).toBe(3); // net zero
  });
});
