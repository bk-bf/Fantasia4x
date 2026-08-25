import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';

type S = { stockpile?: Record<string, number> };

describe('the new stations actually run', () => {
  it('pawns smoke meat on the rack, press cheese in the basin, and fire a jug', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 31,
        map: { w: 20, h: 20 },
        workReady: true,
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        pawns: [{ count: 6, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        buildings: [
          { id: 'smoking_rack' },
          { id: 'cheese_basin' },
          { id: 'potters_wheel' },
          { id: 'pottery_kiln' }
        ],
        items: { venison: 30, salt: 20, milk: 40, blue_clay: 20, tallow: 10 },
        seedEntities: false
      })
    );
    const stk = () => (s.getState() as unknown as S).stockpile ?? {};
    const craft = (itemId: string, quantity = 1) =>
      s.command({ type: 'craftItem', payload: { itemId, quantity } } as never);

    craft('smoked_meat');
    craft('hard_cheese');
    for (let i = 0; i < 25 && !((stk().smoked_meat ?? 0) > 0 && (stk().hard_cheese ?? 0) > 0); i++)
      s.tick(400);
    console.log(
      `[NEW] venison ${stk().venison} · smoked_meat ${stk().smoked_meat ?? 0} | milk ${stk().milk} · hard_cheese ${stk().hard_cheese ?? 0}`
    );

    craft('unfired_jug');
    for (let i = 0; i < 20 && (stk().unfired_jug ?? 0) < 1; i++) s.tick(400);
    const green = stk().unfired_jug ?? 0;
    craft('clay_jug');
    for (let i = 0; i < 20 && (stk().clay_jug ?? 0) < 1; i++) s.tick(400);
    console.log(
      `[NEW] clay ${stk().blue_clay} → unfired_jug ${green} → clay_jug ${stk().clay_jug ?? 0}`
    );

    expect(stk().smoked_meat ?? 0, 'meat smoked on the rack').toBeGreaterThan(0);
    expect(stk().hard_cheese ?? 0, 'cheese pressed in the basin').toBeGreaterThan(0);
    expect(green, 'the wheel threw greenware').toBeGreaterThan(0);
    expect(stk().clay_jug ?? 0, 'and the kiln fired it into a jug').toBeGreaterThan(0);
  }, 200000);

  it('the new dishes are cookable', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 32,
        map: { w: 20, h: 20 },
        workReady: true,
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        pawns: [{ count: 6, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        buildings: [{ id: 'oven' }, { id: 'craft_spot' }, { id: 'smoking_rack' }],
        items: { bread: 10, venison: 20, flour: 30, honey: 20, apple: 20, salt: 10, cabbage: 10 },
        seedEntities: false
      })
    );
    const stk = () => (s.getState() as unknown as S).stockpile ?? {};
    const craft = (itemId: string, quantity = 1) =>
      s.command({ type: 'craftItem', payload: { itemId, quantity } } as never);
    craft('simple_sandwich');
    craft('honey_tart');
    for (
      let i = 0;
      i < 30 && !((stk().simple_sandwich ?? 0) > 0 && (stk().honey_tart ?? 0) > 0);
      i++
    )
      s.tick(400);
    console.log(
      `[NEW] bread ${stk().bread} → sandwich ${stk().simple_sandwich ?? 0} | honey ${stk().honey} apple ${stk().apple} → tart ${stk().honey_tart ?? 0}`
    );
    expect(stk().simple_sandwich ?? 0, 'a sandwich was assembled').toBeGreaterThan(0);
    expect(stk().honey_tart ?? 0, 'a tart was baked').toBeGreaterThan(0);
  }, 200000);
});
