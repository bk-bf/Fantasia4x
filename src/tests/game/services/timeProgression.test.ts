import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';

const warm = (s: HeadlessSession) => {
  s.command({ type: 'setSeason', payload: { season: 'summer' } } as never);
  s.command({ type: 'setWeather', payload: { type: 'clear' } } as never);
};
const drops = (s: HeadlessSession, id: string) =>
  ((s.getState().droppedItems ?? []) as unknown as Array<Record<string, unknown>>).filter(
    (d) => d.resourceId === id
  );
const stk = (s: HeadlessSession) => (s.getState().stockpile ?? {}) as Record<string, number>;

describe('time-based progression', () => {
  it('spoilage: food rots when warm, FREEZES when sub-zero', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 21,
        map: { w: 14, h: 14 },
        pawns: [{ count: 2 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst'],
        items: { common_carp: 6 },
        seedEntities: false
      })
    );
    warm(s);
    for (let i = 0; i < 60 && !((stk(s).rotten_food ?? 0) > 0); i++) s.tick(400);
    console.log(
      `[TIME spoil-warm] carp ${stk(s).common_carp ?? 0}/6 → rotten_food ${stk(s).rotten_food ?? 0} @turn ${s.getState().turn}`
    );
    expect(stk(s).common_carp ?? 0, 'carp partly rotted').toBeLessThan(6);
    expect(stk(s).rotten_food ?? 0, 'produced rotten_food').toBeGreaterThan(0);

    const f = new HeadlessSession();
    await f.start(
      buildScenario({
        seed: 21,
        map: { w: 14, h: 14 },
        pawns: [{ count: 2 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst'],
        items: { common_carp: 6 },
        seedEntities: false
      })
    );
    f.command({ type: 'setSeason', payload: { season: 'winter' } } as never);
    f.command({ type: 'setWeather', payload: { type: 'snow' } } as never);
    const p = f.getState().pawns[0].position!;
    for (let i = 0; i < 60; i++) f.tick(400);
    const gt = f.getState();
    const tile = gt.worldMap[p.y][p.x];
    console.log(
      `[TIME spoil-freeze] winter tileTemp=${tile.temperature} carp=${stk(f).common_carp ?? 0}/6 rotten_food=${stk(f).rotten_food ?? 0} @turn ${gt.turn}`
    );
    expect(tile.temperature ?? 99, 'winter tile is sub-zero').toBeLessThan(0);
    expect(stk(f).common_carp ?? 0, 'frozen food did not rot').toBe(6);
    expect(stk(f).rotten_food ?? 0).toBe(0);
  });

  it('drying: plant_fiber cures when warm, STALLS when cold', async () => {
    const warmS = new HeadlessSession();
    await warmS.start(
      buildScenario({
        seed: 22,
        map: { w: 14, h: 14 },
        pawns: [{ count: 2 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst'],
        items: { plant_fiber: 10 },
        seedEntities: false
      })
    );
    warm(warmS);
    for (let i = 0; i < 12; i++) warmS.tick(400);
    const warmDry = (drops(warmS, 'plant_fiber')[0]?.drying as number) ?? 0;

    const coldS = new HeadlessSession();
    await coldS.start(
      buildScenario({
        seed: 22,
        map: { w: 14, h: 14 },
        pawns: [{ count: 2 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst'],
        items: { plant_fiber: 10 },
        seedEntities: false
      })
    );
    coldS.command({ type: 'setSeason', payload: { season: 'spring' } } as never);
    coldS.command({ type: 'setWeather', payload: { type: 'clear' } } as never);
    for (let i = 0; i < 12; i++) coldS.tick(400);
    const coldDry = (drops(coldS, 'plant_fiber')[0]?.drying as number) ?? 0;

    console.log(
      `[TIME dry] warm(26°C) drying=${warmDry.toFixed(1)}s vs cold(5°C) drying=${coldDry}s`
    );
    expect(warmDry, 'warm tile accrues drying progress').toBeGreaterThan(0);
    expect(coldDry, 'cold tile (<12°C) does not dry').toBe(0);
  });

  it('deterioration: LOOSE stack weathers (storm >> clear), STORED one sheltered', async () => {
    const run = async (weatherType: string): Promise<[number, boolean]> => {
      const s = new HeadlessSession();
      await s.start(
        buildScenario({
          seed: 23,
          map: { w: 14, h: 14 },
          pawns: [],
          items: { branch: 10 },
          seedEntities: false
        })
      );
      s.command({ type: 'setWeather', payload: { type: weatherType } } as never);
      const lx = 3;
      const ly = 3;
      s.command({ type: 'clearDesignation', payload: { x: lx, y: ly } } as never);
      s.command({
        type: 'devSpawnItem',
        payload: { itemId: 'branch', amount: 10, x: lx, y: ly }
      } as never);
      expect(
        drops(s, 'branch').find((d) => !d.stored),
        'loose stack exists'
      ).toBeTruthy();
      for (let i = 0; i < 20; i++) s.tick(400);
      const looseNow = drops(s, 'branch').find((d) => !d.stored) as
        | Record<string, unknown>
        | undefined;
      const storedNow = drops(s, 'branch').find((d) => d.stored) as
        | Record<string, unknown>
        | undefined;
      return [(looseNow?.durability as number) ?? 120, storedNow?.durability !== undefined];
    };
    const [clearDur, clearWornStored] = await run('clear');
    const [stormDur, stormWornStored] = await run('storm');
    console.log(
      `[TIME deteriorate] loose branch durability (max 120): clear=${clearDur.toFixed(2)} storm=${stormDur.toFixed(2)}; stored ever worn? ${clearWornStored || stormWornStored}`
    );
    expect(clearDur, 'loose branch wears even in clear weather').toBeLessThan(120);
    expect(stormDur, 'storm weathers a loose stack faster than clear').toBeLessThan(clearDur);
    expect(clearWornStored || stormWornStored, 'stored branch never weathered').toBe(false);
  });

  it('fuel: pawns load a campfire, it burns down per tick and dies COLD at empty', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 25,
        map: { w: 16, h: 16 },
        workReady: true,
        pawns: [{ count: 4, skillLevel: 15 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst'],
        buildings: [{ id: 'campfire' }],
        items: { dry_firewood: 2, plant_fiber: 4 },
        seedEntities: false
      })
    );
    const fire = () =>
      (s.getState().buildings ?? []).find((b) => (b as { type: string }).type === 'campfire') as {
        fuel?: number;
        lit?: boolean;
        fireHeat?: number;
      };
    let peakFuel = 0;
    let everLit = false;
    let dippedWhileLit = false;
    let prevFuel = 0;
    for (let i = 0; i < 30; i++) {
      s.tick(200);
      const f = fire();
      const fuel = f?.fuel ?? 0;
      if (f?.lit) everLit = true;
      if (f?.lit && fuel < prevFuel) dippedWhileLit = true;
      peakFuel = Math.max(peakFuel, fuel);
      prevFuel = fuel;
      if (everLit && fuel === 0) break;
    }
    const end = fire();
    console.log(
      `[TIME fuel] peakFuel=${peakFuel} everLit=${everLit} depletedWhileLit=${dippedWhileLit} → end fuel=${end?.fuel} lit=${end?.lit} fireHeat=${end?.fireHeat}`
    );
    expect(peakFuel, 'pawns loaded fuel into the campfire').toBeGreaterThan(0);
    expect(everLit, 'campfire auto-lit once fuelled').toBe(true);
    expect(dippedWhileLit, 'fuel depletes while burning').toBe(true);
    expect(end?.fuel ?? -1, 'burned to empty').toBe(0);
    expect(end?.lit ?? true, 'fire died at empty').toBe(false);
    expect(end?.fireHeat ?? -1, 'cold fire (heat cleared)').toBe(0);
  });

  it('building condition: a structure wears under weather, storm >> clear', async () => {
    const build = async (weatherType: string) => {
      const s = new HeadlessSession();
      await s.start(
        buildScenario({
          seed: 24,
          map: { w: 14, h: 14 },
          pawns: [{ count: 2 }],
          needsDisabled: ['hunger', 'fatigue', 'thirst'],
          buildings: [{ id: 'thatch_roof' }],
          seedEntities: false
        })
      );
      s.command({ type: 'setWeather', payload: { type: weatherType } } as never);
      for (let i = 0; i < 4; i++) s.tick(400);
      const b = (s.getState().buildings ?? []).find(
        (x) => (x as { type: string }).type === 'thatch_roof'
      ) as { condition?: number } | undefined;
      return b ? (b.condition ?? 100) : 0;
    };
    const clearCond = await build('clear');
    const stormCond = await build('storm');
    console.log(
      `[TIME building] thatch_roof condition after ~1600 ticks: clear=${clearCond.toFixed(2)} storm=${stormCond.toFixed(2)} (from 100)`
    );
    expect(clearCond, 'wears even in fair weather').toBeLessThan(100);
    expect(stormCond, 'storm wears it faster than clear').toBeLessThan(clearCond);
  });

  it('repair: a construction pawn restores a worn building, consuming stock', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 26,
        map: { w: 16, h: 16 },
        workReady: true,
        pawns: [{ count: 4, skillLevel: 15 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst'],
        buildings: [{ id: 'thatch_roof' }],
        items: { hay: 20, branch: 20 },
        seedEntities: false
      })
    );
    const roof = () =>
      (s.getState().buildings ?? []).find((b) => (b as { type: string }).type === 'thatch_roof') as
        | { condition?: number }
        | undefined;
    s.command({ type: 'setWeather', payload: { type: 'storm' } } as never);
    for (let i = 0; i < 2; i++) s.tick(300);
    const worn = roof()?.condition ?? 100;
    s.command({ type: 'setAllBuildingsRepairThreshold', payload: { pct: 100 } } as never);
    s.command({ type: 'setWeather', payload: { type: 'clear' } } as never);
    const hay0 = (stk(s).hay ?? 0) + (stk(s).branch ?? 0);
    let repairedTo = worn;
    for (let i = 0; i < 30 && repairedTo < 99.5; i++) {
      s.tick(200);
      repairedTo = Math.max(repairedTo, roof()?.condition ?? 0);
    }
    const matNow = (stk(s).hay ?? 0) + (stk(s).branch ?? 0);
    console.log(
      `[TIME repair] thatch_roof worn to ${worn.toFixed(2)} → repaired to ${repairedTo.toFixed(2)}; repair stock ${hay0}→${matNow}`
    );
    expect(worn, 'building actually wore down first').toBeLessThan(100);
    expect(repairedTo, 'pawn repaired it back toward pristine').toBeGreaterThan(worn);
    expect(matNow, 'repair consumed material from stock').toBeLessThan(hay0);
  });
});
