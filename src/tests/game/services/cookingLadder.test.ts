import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildingService } from '$lib/game/services/BuildingService';
import buildingsData from '$lib/game/database/world/buildings.jsonc';

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
        buildings: [{ id: 'steel_stove' }],
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

describe('every station ladder supersedes, not just cooking', () => {
  const LEGACY: Record<string, string> = {
    cookingTier: 'cooking',
    butcheryTier: 'butchery',
    lapidaryTier: 'lapidary',
    tailoringTier: 'tailoring'
  };
  const ladders = new Map<string, { id: string; rung: number; name: string }[]>();
  for (const b of buildingsData as { id: string; name: string; effects?: unknown }[]) {
    const e = (b.effects ?? {}) as Record<string, unknown>;
    const add = (family: string, rung: number) =>
      ladders.set(family, [...(ladders.get(family) ?? []), { id: b.id, rung, name: b.name }]);
    if (typeof e.family === 'string' && typeof e.rung === 'number') add(e.family, e.rung);
    for (const [key, family] of Object.entries(LEGACY))
      if (typeof e[key] === 'number') add(family, e[key] as number);
  }

  it('a higher rung runs everything every lower rung of its family runs', () => {
    const bad: string[] = [];
    for (const [family, rows] of ladders)
      for (const high of rows)
        for (const low of rows) {
          if (low.rung >= high.rung) continue;
          if (!buildingService.stationFulfills(high.id, low.id))
            bad.push(`${family}: "${high.name}" (rung ${high.rung}) cannot run "${low.name}"`);
        }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('no ladder is so short it cannot be checked', () => {
    expect([...ladders.keys()].sort()).toContain('cooking');
    for (const [family, rows] of ladders)
      expect(rows.length, `${family} has only one rung`).toBeGreaterThan(1);
  });
});
