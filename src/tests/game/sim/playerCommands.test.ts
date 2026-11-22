import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { applySimCommand } from '$lib/game/sim/commands';
import type { GameState, Pawn } from '$lib/game/core/types';

const scenario = (extra: Parameters<typeof buildScenario>[0]['items'] = {}, count = 1) =>
  buildScenario({
    seed: 9,
    map: { w: 20, h: 20 },
    pawns: [{ count, drafted: true }],
    items: extra,
    buildings: [{ id: 'craft_spot' }],
    seedEntities: false
  });

describe('movePawnsFormation', () => {
  it('gives every pawn in the formation its own tile', () => {
    const s = scenario({}, 3);
    const ids = s.pawns.map((p) => p.id);
    const out = applySimCommand(s, {
      type: 'movePawnsFormation',
      payload: { ids, x: 10, y: 10 }
    } as never);
    const tiles = out.pawns.map((p) => {
      const t = p.draftTarget as { x: number; y: number } | undefined;
      return t ? `${t.x},${t.y}` : 'none';
    });
    expect(tiles).not.toContain('none');
    expect(new Set(tiles).size).toBe(3);
  });
});

describe('craftItem', () => {
  it('a craft queued with too few inputs holds no reservation', () => {
    const s = scenario({ branch: 5, plant_fiber: 1 });
    const out = applySimCommand(s, {
      type: 'craftItem',
      payload: { itemId: 'digging_stick', quantity: 1 }
    } as never);
    const order = (out.craftingQueue ?? []).at(-1)!;
    expect(order.item.id).toBe('digging_stick');
    expect(order.pending).toBe(true);
    expect((out.droppedItems ?? []).filter((d) => d.reservedFor === order.id)).toHaveLength(0);
  });
});

describe('commitMigrants', () => {
  it('never hands a migrant the id of a pawn already in the colony', () => {
    const s0 = scenario({}, 2);
    const pawns = [s0.pawns[0], { ...s0.pawns[1], id: 'pawn-2' }];
    const candidate = { ...s0.pawns[0], id: 'cand-1', name: 'Wren Migrant' } as Pawn;
    const s: GameState = {
      ...s0,
      pawns,
      pendingEvent: { kind: 'migrant-wave', id: 'w1', turn: 0, candidates: [candidate] }
    };
    const out = applySimCommand(s, {
      type: 'commitMigrants',
      payload: { acceptedIds: ['cand-1'] }
    } as never);
    const ids = out.pawns.map((p) => p.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });
});
