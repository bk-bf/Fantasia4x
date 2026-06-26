import { describe, it, expect } from 'vitest';
import { wearWorkingPawnTool } from './harvest';
import type { GameState, Pawn } from '../../core/types';

// ADR-009 step 2 — the WORKING pawn's tool wears per tool-gated action, whether it's EQUIPPED or just
// CARRIED in the pack (both pass the tool gate and boost work). A carried stone_axe (maxDurability 30,
// durabilityLossPerAction 2) must dull and eventually break, then leave the pack so a fresh one is
// fetched. Regression: carried tools used to never wear (only the equipment slot was checked).

function stateWith(pawn: Pawn): GameState {
  return { turn: 0, pawns: [pawn] } as unknown as GameState;
}

const carryingAxe = (durability: number): Pawn =>
  ({
    id: 'h',
    equipment: {},
    inventory: {
      items: {},
      instances: [{ instanceId: 'axe-1', itemId: 'stone_axe', durability }]
    }
  }) as unknown as Pawn;

const equippedAxe = (durability: number): Pawn =>
  ({
    id: 'h',
    equipment: { mainHand: { instanceId: 'axe-1', itemId: 'stone_axe', durability } },
    inventory: { items: {}, instances: [] }
  }) as unknown as Pawn;

describe('wearWorkingPawnTool — carried + equipped tools', () => {
  it('wears a CARRIED tool by durabilityLossPerAction', () => {
    const out = wearWorkingPawnTool('h', 'woodcutting', stateWith(carryingAxe(30)));
    expect(out.pawns[0].inventory.instances[0].durability).toBe(28); // 30 − 2
  });

  it('removes the carried tool when it breaks (≤0), so the gate re-fires', () => {
    const out = wearWorkingPawnTool('h', 'woodcutting', stateWith(carryingAxe(2)));
    expect(out.pawns[0].inventory.instances).toHaveLength(0);
  });

  it('still wears an EQUIPPED tool (preferred over the pack)', () => {
    const out = wearWorkingPawnTool('h', 'woodcutting', stateWith(equippedAxe(30)));
    expect(out.pawns[0].equipment.mainHand.durability).toBe(28);
  });

  it('is a no-op with no matching tool (bare hands)', () => {
    const gs = stateWith({
      id: 'h',
      equipment: {},
      inventory: { items: {}, instances: [] }
    } as unknown as Pawn);
    expect(wearWorkingPawnTool('h', 'woodcutting', gs)).toBe(gs);
  });
});
