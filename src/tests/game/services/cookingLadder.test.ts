import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildingService } from '$lib/game/services/BuildingService';

/**
 * The hearth ladder is a SPEED and FUEL ladder, not a key ring. Every rung cooks the same dishes; a
 * better stove finishes them sooner on less wood. Cooking is its own station family, so a stove never
 * stands in for a forge and a forge never bakes.
 */
const LADDER = ['campfire', 'hearth', 'brick_hearth', 'brick_stove', 'iron_stove', 'steel_stove'];

describe('the cooking ladder', () => {
  it('every rung is a strict improvement on the one below', () => {
    let lastBonus = -1;
    let lastFuel = 99;
    for (const id of LADDER) {
      const def = buildingService.getBuildingById(id)!;
      const tier = buildingService.cookingTier(id)!;
      const bonus = buildingService.craftingBonusOf(id);
      const fuel = def.fuelConsumptionRate ?? 1;
      expect(tier, `${id} declares a cooking tier`).toBe(LADDER.indexOf(id));
      expect(bonus, `${id} cooks faster than the rung below`).toBeGreaterThan(lastBonus);
      expect(fuel, `${id} burns less than the rung below`).toBeLessThanOrEqual(lastFuel);
      lastBonus = bonus;
      lastFuel = fuel;
    }
  });

  it('a higher rung runs a lower rung’s recipes, and nothing is gated away', () => {
    for (const have of LADDER)
      for (const need of LADDER)
        expect(
          buildingService.stationFulfills(have, need),
          `${have} should ${LADDER.indexOf(have) >= LADDER.indexOf(need) ? '' : 'NOT '}fulfil ${need}`
        ).toBe(LADDER.indexOf(have) >= LADDER.indexOf(need));
  });

  it('cooking never crosses into the forge or the butchery families', () => {
    for (const c of LADDER) {
      expect(buildingService.stationFulfills(c, 'anvil'), `${c} is not a forge`).toBe(false);
      expect(buildingService.stationFulfills(c, 'butcher_spot'), `${c} is not a butchery`).toBe(
        false
      );
      expect(buildingService.stationFulfills('anvil', c), `an anvil is not a ${c}`).toBe(false);
    }
  });

  it('a colony with only a steel stove still cooks a campfire stew — headless', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 7,
        map: { w: 16, h: 16 },
        workReady: true,
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        pawns: [{ count: 4, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        buildings: [{ id: 'steel_stove' }], // NO campfire anywhere
        items: { venison: 20, cabbage: 20, turnip: 20 },
        seedEntities: false
      })
    );
    const stk = () =>
      (s.getState() as unknown as { stockpile?: Record<string, number> }).stockpile ?? {};
    s.command({ type: 'craftItem', payload: { itemId: 'small_stew', quantity: 2 } } as never);
    for (let i = 0; i < 25 && (stk().small_stew ?? 0) < 1; i++) s.tick(400);
    console.log(
      `[COOK] steel stove only → small_stew ${stk().small_stew ?? 0} (a campfire recipe)`
    );
    expect(stk().small_stew ?? 0, 'the stove cooked a campfire dish').toBeGreaterThan(0);
  }, 200000);
});
