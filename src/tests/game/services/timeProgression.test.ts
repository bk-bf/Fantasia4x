import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';

/**
 * TIME-BASED PROGRESSION AUDIT (headless, real ticks). Drives the four passive clocks the sim runs
 * over droppedItems + buildings and proves each one's REALISM GATE, not just that it ticks:
 *   • spoilage  — food rots to `decaysTo`; a sub-zero tile FREEZES it (no rot).
 *   • drying    — cures where warm+dry (progress accrues); a cold tile (<12°C) stalls it.
 *   • deterioration — a LOOSE stack weathers (durability falls); a STORED one is sheltered.
 *   • building condition — a structure wears under weather; a storm wears it far faster than clear sky.
 *
 * Plains baked temp = 10°C base + season offset: spring −5→5°C (drying stalls), summer +16→26°C
 * (dries + spoils), winter −18→−8°C (freezes spoilage). Scenario `items` land STORED on the all-map
 * stockpile; loose stacks need the stockpile zone removed first (see the deterioration block).
 */

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
    // WARM: common_carp (decaySeconds 300 ≈ 18000 ticks/unit) rots to rotten_food at 26°C.
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

    // FROZEN: same food at winter −8°C does not rot at all.
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
    for (let i = 0; i < 12; i++) warmS.tick(400); // ~4800 ticks
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
    coldS.command({ type: 'setSeason', payload: { season: 'spring' } } as never); // 5°C < 12 floor
    coldS.command({ type: 'setWeather', payload: { type: 'clear' } } as never);
    for (let i = 0; i < 12; i++) coldS.tick(400);
    const coldDry = (drops(coldS, 'plant_fiber')[0]?.drying as number) ?? 0;

    console.log(`[TIME dry] warm(26°C) drying=${warmDry.toFixed(1)}s vs cold(5°C) drying=${coldDry}s`);
    expect(warmDry, 'warm tile accrues drying progress').toBeGreaterThan(0);
    expect(coldDry, 'cold tile (<12°C) does not dry').toBe(0);
  });

  it('deterioration: a LOOSE stack weathers, a STORED one is sheltered', async () => {
    // NO pawns — otherwise they'd HAUL the loose stack onto a stockpile (→ stored → exempt) and there'd
    // be nothing left to weather.
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 23,
        map: { w: 14, h: 14 },
        pawns: [],
        items: { branch: 10 }, // branch: no decaySeconds, no driesTo → ONLY deteriorates
        seedEntities: false
      })
    );
    const stored0 = drops(s, 'branch').find((d) => d.stored) as Record<string, unknown>;
    // Free ONE tile from the map-wide stockpile so a spawned stack stays LOOSE (not auto-absorbed as
    // stored). The whole-map `designateRect('stockpile')` writes no instance id, so clearDesignation on
    // the tile — which deletes its zoneTiles entry — is the way to un-stockpile it.
    const lx = 3;
    const ly = 3;
    s.command({ type: 'clearDesignation', payload: { x: lx, y: ly } } as never);
    s.command({ type: 'devSpawnItem', payload: { itemId: 'branch', amount: 10, x: lx, y: ly } } as never);
    const loose0 = drops(s, 'branch').find((d) => !d.stored) as Record<string, unknown>;
    expect(loose0, 'loose stack exists (stockpile removed)').toBeTruthy();

    for (let i = 0; i < 20; i++) s.tick(400); // 8000 ticks → ~13 deterioration passes
    const looseNow = drops(s, 'branch').find((d) => !d.stored) as Record<string, unknown> | undefined;
    const storedNow = drops(s, 'branch').find((d) => d.stored) as Record<string, unknown> | undefined;
    const looseDur = (looseNow?.durability as number) ?? Infinity;
    console.log(
      `[TIME deteriorate] loose branch durability=${looseDur} (max 120); stored branch durability=${storedNow?.durability ?? 'untouched'}`
    );
    expect(looseDur, 'loose branch lost durability to weather').toBeLessThan(120);
    // A stored stack never gets a durability field written (sheltered — the step skips it entirely).
    expect(storedNow?.durability, 'stored branch untouched').toBeUndefined();
    expect(stored0?.durability, 'stored was never weathered').toBeUndefined();
  });

  it('fuel: pawns load a campfire, it burns down per tick and dies COLD at empty', async () => {
    // Real refuel loop (NOT infiniteFuel): pawns haul firewood → auto-light → burn to empty → go cold.
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 25,
        map: { w: 16, h: 16 },
        workReady: true,
        pawns: [{ count: 4, skillLevel: 15 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst'],
        buildings: [{ id: 'campfire' }],
        // dry_firewood fuelValue 24 → ≤48 fuel, drains at 1/60 per tick; plant_fiber is the tinder to light it.
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
      if (f?.lit && fuel < prevFuel) dippedWhileLit = true; // fuel fell tick-over-tick while burning
      peakFuel = Math.max(peakFuel, fuel);
      prevFuel = fuel;
      if (everLit && fuel === 0) break; // burned out
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
      for (let i = 0; i < 4; i++) s.tick(400); // ~1600 ticks — short enough the storm roof survives
      // A collapsed (0%) roof is REMOVED from the list, so a missing building reads as 0, not 100.
      const b = (s.getState().buildings ?? []).find((x) => (x as { type: string }).type === 'thatch_roof') as
        | { condition?: number }
        | undefined;
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
});
