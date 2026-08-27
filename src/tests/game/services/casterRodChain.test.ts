import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';

describe('caster rod chain — physical pawn pipeline (HeadlessSession, real ticks)', () => {
  it('bronze age: pawns craft and equip the Copper Rod', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 21,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        workReady: true,
        pawns: [{ count: 6, skillLevel: 16 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'casting_hearth' }],
        items: { wooden_haft: 10, cut_citrine: 10, copper_bar: 10 },
        seedEntities: false
      })
    );
    const stk = () => (session.getState().stockpile ?? {}) as Record<string, number>;
    session.command({ type: 'craftItem', payload: { itemId: 'copper_rod', quantity: 1 } } as never);
    for (let i = 0; i < 16 && !(stk().copper_rod > 0); i++) session.tick(400);
    const pawn = session.getState().pawns[0];
    session.command({
      type: 'equipPawnItem',
      payload: { pawnId: pawn.id, itemId: 'copper_rod' }
    } as never);
    const worn = session.getState().pawns.find((p) => p.id === pawn.id)?.equipment?.offHand;
    console.log(
      `[CASTER-ROD] turn=${session.getState().turn} copper_rod=${stk().copper_rod} ` +
        `(copper_bar ${stk().copper_bar}/10) worn offHand=${worn?.itemId ?? 'none'}`
    );
    expect(stk().copper_rod ?? 0, 'a bronze-age pawn crafted the rod').toBeGreaterThan(0);
    expect(worn?.itemId, 'it equips into offHand').toBe('copper_rod');
  });

  it('iron age: pawns craft and equip the Iron Rod', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 22,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        workReady: true,
        pawns: [{ count: 6, skillLevel: 16 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'anvil' }],
        items: { sanded_haft: 10, cut_topaz: 10, iron_bar: 10 },
        seedEntities: false
      })
    );
    const stk = () => (session.getState().stockpile ?? {}) as Record<string, number>;
    session.command({ type: 'craftItem', payload: { itemId: 'iron_rod', quantity: 1 } } as never);
    for (let i = 0; i < 16 && !(stk().iron_rod > 0); i++) session.tick(400);
    const pawn = session.getState().pawns[0];
    session.command({
      type: 'equipPawnItem',
      payload: { pawnId: pawn.id, itemId: 'iron_rod' }
    } as never);
    const worn = session.getState().pawns.find((p) => p.id === pawn.id)?.equipment?.offHand;
    console.log(
      `[CASTER-ROD] turn=${session.getState().turn} iron_rod=${stk().iron_rod} ` +
        `(iron_bar ${stk().iron_bar}/10) worn offHand=${worn?.itemId ?? 'none'}`
    );
    expect(stk().iron_rod ?? 0, 'an iron-age pawn crafted the rod').toBeGreaterThan(0);
    expect(worn?.itemId, 'it equips into offHand').toBe('iron_rod');
  });

  it('steel age: pawns craft and equip the Steel Rod', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 23,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        workReady: true,
        pawns: [{ count: 6, skillLevel: 16 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'anvil' }],
        items: { seasoned_haft: 10, cut_sapphire: 10, bloom_steel: 10 },
        seedEntities: false
      })
    );
    const stk = () => (session.getState().stockpile ?? {}) as Record<string, number>;
    session.command({ type: 'craftItem', payload: { itemId: 'steel_rod', quantity: 1 } } as never);
    for (let i = 0; i < 16 && !(stk().steel_rod > 0); i++) session.tick(400);
    const pawn = session.getState().pawns[0];
    session.command({
      type: 'equipPawnItem',
      payload: { pawnId: pawn.id, itemId: 'steel_rod' }
    } as never);
    const worn = session.getState().pawns.find((p) => p.id === pawn.id)?.equipment?.offHand;
    console.log(
      `[CASTER-ROD] turn=${session.getState().turn} steel_rod=${stk().steel_rod} ` +
        `(bloom_steel ${stk().bloom_steel}/10) worn offHand=${worn?.itemId ?? 'none'}`
    );
    expect(stk().steel_rod ?? 0, 'a steel-age pawn crafted the rod').toBeGreaterThan(0);
    expect(worn?.itemId, 'it equips into offHand').toBe('steel_rod');
  });
});
