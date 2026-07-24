import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { soilTierForTile } from '$lib/game/core/Terrains';

/**
 * CROPS AUDIT (headless, real ticks). A `grow` zone drives sowing: for each soil-eligible tile whose
 * seed is in stock, `plant.ts` queues a plant job; on completion the crop is sown IMMATURE (growth 0),
 * then `processCropGrowth` advances it toward 100% — GATED by soil tier / temp / moisture / light
 * (`cropHealth`) — and at 100% the tile becomes harvestable. Flat 'grass' tiles are soil tier 1
 * (fertility 25) so a `minSoil:1` crop (wheat) plants directly; growth needs moisture ≥25 & temp in
 * range, so the test forces summer (26°C) + `devSetMapMoisture`.
 */

type Tile = { subType: string; growth?: Record<string, number>; resources?: Record<string, number> };
const tileAt = (s: HeadlessSession, x: number, y: number) =>
  (s.getState().worldMap as unknown as Tile[][])[y][x];
// Max growth% of crop_wheat across the grow rect (x1..x2, y1..y2).
const maxGrowth = (s: HeadlessSession, r: number[]) => {
  let g = 0;
  for (let y = r[1]; y <= r[3]; y++)
    for (let x = r[0]; x <= r[2]; x++) g = Math.max(g, tileAt(s, x, y).growth?.crop_wheat ?? 0);
  return g;
};
const GROW = [6, 6, 9, 9];

async function sownColony(moisture: number, season = 'summer') {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed: 41,
      map: { w: 16, h: 16 },
      workReady: true,
      pawns: [{ count: 4, skillLevel: 15 }],
      needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
      items: { grain_seed: 20, spit_meat: 10 },
      seedEntities: false
    })
  );
  s.command({ type: 'setSeason', payload: { season } } as never);
  s.command({ type: 'setWeather', payload: { type: 'clear' } } as never);
  s.command({ type: 'devSetMapMoisture', payload: { value: moisture } } as never);
  s.command({
    type: 'designateRect',
    payload: { x1: GROW[0], y1: GROW[1], x2: GROW[2], y2: GROW[3], type: 'grow' }
  } as never);
  return s;
}

describe('crops', () => {
  it('plant: a grow zone sows wheat immature (growth 0) on eligible soil', async () => {
    const s = await sownColony(40);
    let sown = false;
    for (let i = 0; i < 20 && !sown; i++) {
      s.tick(200);
      for (let y = GROW[1]; y <= GROW[3] && !sown; y++)
        for (let x = GROW[0]; x <= GROW[2]; x++)
          if ('crop_wheat' in (tileAt(s, x, y).growth ?? {})) sown = true;
    }
    console.log(`[CROP plant] wheat sown in grow zone = ${sown}; maxGrowth now ${maxGrowth(s, GROW).toFixed(2)}%`);
    expect(sown, 'plant job sowed crop_wheat on a grow tile').toBe(true);
  });

  it('growth: climbs with moisture+warmth, STALLS when dry (cropHealth gate)', async () => {
    const wet = await sownColony(40); // in range (25–70)
    const dry = await sownColony(5); // below minMoisture 25
    for (let i = 0; i < 30; i++) {
      wet.tick(300);
      dry.tick(300);
    }
    const gWet = maxGrowth(wet, GROW);
    const gDry = maxGrowth(dry, GROW);
    console.log(`[CROP growth] moist(40) grew to ${gWet.toFixed(2)}% vs dry(5) ${gDry.toFixed(2)}%`);
    expect(gWet, 'a well-watered warm bed grows').toBeGreaterThan(2);
    expect(gDry, 'a dry bed does not grow (withers to ~1%)').toBeLessThan(gWet - 1);
  });

  it('full cycle: radish matures to 100%, becomes harvestable, is reaped into stock', async () => {
    // Radish is the fastest crop (growthTurns 900). Small zone → few crops to mature + reap.
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 42,
        map: { w: 16, h: 16 },
        workReady: true,
        pawns: [{ count: 5, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        items: { radish_seed: 8, spit_meat: 10 },
        seedEntities: false
      })
    );
    // Radish is a COOL-season crop (maxTemp 28) — summer afternoons overheat it. Spring (5°C, within its
    // −5…28 window) fits, and spring's 1.2× growth rate is the fastest.
    s.command({ type: 'setSeason', payload: { season: 'spring' } } as never);
    s.command({ type: 'setWeather', payload: { type: 'clear' } } as never);
    s.command({ type: 'devSetMapMoisture', payload: { value: 45 } } as never);
    const zone = [7, 7, 8, 8]; // 2×2
    s.command({
      type: 'designateRect',
      payload: { x1: zone[0], y1: zone[1], x2: zone[2], y2: zone[3], type: 'grow' }
    } as never);
    // Grow until at least one radish tile is mature (growth 100 + a harvestable count).
    const matureTile = () => {
      for (let y = zone[1]; y <= zone[3]; y++)
        for (let x = zone[0]; x <= zone[2]; x++) {
          const t = tileAt(s, x, y);
          if ((t.growth?.crop_radish ?? 0) >= 100 && (t.resources?.crop_radish ?? 0) > 0)
            return { x, y };
        }
      return null;
    };
    let mat: { x: number; y: number } | null = null;
    for (let i = 0; i < 200 && !(mat = matureTile()); i++) s.tick(500); // up to 100k ticks
    console.log(
      `[CROP mature] radish matured at ${mat ? `(${mat.x},${mat.y})` : 'NONE'} by turn ${s.getState().turn}; count=${mat ? tileAt(s, mat.x, mat.y).resources?.crop_radish : 0}`
    );
    expect(mat, 'a radish tile reached 100% and set a harvestable count').toBeTruthy();

    // Reap it: designate harvest on the mature tiles, then let pawns work them.
    const radish0 = (s.getState().stockpile as Record<string, number>).radish ?? 0;
    for (let y = zone[1]; y <= zone[3]; y++)
      for (let x = zone[0]; x <= zone[2]; x++)
        if ((tileAt(s, x, y).resources?.crop_radish ?? 0) > 0)
          s.command({ type: 'designateRect', payload: { x1: x, y1: y, x2: x, y2: y, type: 'harvest' } } as never);
    for (let i = 0; i < 30 && ((s.getState().stockpile as Record<string, number>).radish ?? 0) === radish0; i++)
      s.tick(300);
    const radishNow = (s.getState().stockpile as Record<string, number>).radish ?? 0;
    console.log(`[CROP harvest] radish stock ${radish0} → ${radishNow}; reaped tile growth reset check`);
    expect(radishNow, 'reaping a mature radish yields radish into stock').toBeGreaterThan(radish0);
  });

  it('terraform: a Lay Loam build raises a grass tile to tall_grass (soil tier 1→2)', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 43,
        map: { w: 16, h: 16 },
        workReady: true,
        pawns: [{ count: 5, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        // lay_loam cost + surplus so staging never starves
        items: { fertiliser: 8, compost: 8, blue_clay: 8, dirt: 16, spit_meat: 10 },
        seedEntities: false
      })
    );
    const tx = 7;
    const ty = 7;
    const before = tileAt(s, tx, ty);
    const beforeSub = before.subType; // snapshot: tiles mutate IN PLACE, so the ref changes under us
    const tier0 = soilTierForTile({ subType: beforeSub });
    expect(beforeSub, 'starts as plain grass (tier 1)').toBe('grass');
    s.command({ type: 'placeBuilding', payload: { bid: 'lay_loam', x: tx, y: ty } } as never);
    // Stage materials + construct + the one-shot terraform apply (self-removing building).
    for (let i = 0; i < 40 && tileAt(s, tx, ty).subType === 'grass'; i++) s.tick(300);
    const after = tileAt(s, tx, ty);
    const tier1 = soilTierForTile(after);
    console.log(
      `[CROP terraform] tile (${tx},${ty}) subType ${beforeSub}→${after.subType}; soil tier ${tier0}→${tier1}`
    );
    expect(after.subType, 'terraformed to tall_grass').toBe('tall_grass');
    expect(tier1, 'soil tier rose (fertility 25→50)').toBeGreaterThan(tier0);
  });

  // ALL 17 crops, end to end: each is planted from its OWN seed on terra_preta (tier 4 ⇒ every minSoil
  // met), GROWS for real under a season inside its temp window (growth climbs off the floor), then is
  // matured (lever — the multi-day clock itself is proven real by the radish full-cycle above) and REAPED
  // into its OWN yield item. Season per crop from its temp window (baked: spring 5°C, summer 26°C,
  // autumn 7°C ± ~7 diurnal); moisture 55 is inside EVERY crop's [minMoisture, maxMoisture].
  const CROPS: Array<{ id: string; seed: string; yield: string; season: string }> = [
    { id: 'crop_wheat', seed: 'grain_seed', yield: 'wheat', season: 'summer' },
    { id: 'crop_beans', seed: 'bean_seed', yield: 'beans', season: 'summer' },
    { id: 'crop_cotton', seed: 'cotton_seed', yield: 'cotton_fiber', season: 'summer' },
    { id: 'crop_grapes', seed: 'grape_seed', yield: 'grapes', season: 'summer' },
    { id: 'crop_pumpkin', seed: 'prize_seed', yield: 'pumpkin', season: 'summer' },
    { id: 'crop_rye', seed: 'rye_seed', yield: 'rye', season: 'spring' },
    { id: 'crop_kale', seed: 'kale_seed', yield: 'kale', season: 'spring' },
    { id: 'crop_radish', seed: 'radish_seed', yield: 'radish', season: 'spring' },
    { id: 'crop_turnip', seed: 'turnip_seed', yield: 'turnip', season: 'spring' },
    { id: 'crop_cabbage', seed: 'cabbage_seed', yield: 'cabbage', season: 'autumn' },
    { id: 'crop_apples', seed: 'apple_seed', yield: 'apple', season: 'autumn' },
    { id: 'crop_onion', seed: 'onion_seed', yield: 'onion', season: 'autumn' },
    { id: 'crop_peas', seed: 'pea_seed', yield: 'peas', season: 'autumn' },
    { id: 'crop_flax', seed: 'fibre_seed', yield: 'flax_fiber', season: 'autumn' },
    { id: 'crop_berries', seed: 'berry_seed', yield: 'wild_berries', season: 'autumn' },
    { id: 'crop_thyme', seed: 'thyme_seed', yield: 'thyme', season: 'autumn' },
    { id: 'crop_mint', seed: 'mint_seed', yield: 'mint', season: 'autumn' }
  ];

  it.each(CROPS)('all crops: $id plants, grows, matures & reaps to $yield', async (c) => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 44,
        map: { w: 14, h: 14 },
        workReady: true,
        pawns: [{ count: 4, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        items: { [c.seed]: 6, spit_meat: 10 },
        seedEntities: false
      })
    );
    s.command({ type: 'setSeason', payload: { season: c.season } } as never);
    s.command({ type: 'setWeather', payload: { type: 'clear' } } as never);
    s.command({ type: 'devSetMapSoil', payload: { subType: 'terra_preta' } } as never); // tier 4 ⇒ any minSoil
    s.command({ type: 'devSetMapMoisture', payload: { value: 55 } } as never);
    const zone = [6, 6, 7, 7];
    s.command({
      type: 'designateRect',
      payload: { x1: zone[0], y1: zone[1], x2: zone[2], y2: zone[3], type: 'grow' }
    } as never);
    const growthOf = () => {
      let g = 0;
      for (let y = zone[1]; y <= zone[3]; y++)
        for (let x = zone[0]; x <= zone[2]; x++)
          g = Math.max(g, tileAt(s, x, y).growth?.[c.id] ?? 0);
      return g;
    };
    const sown = () => {
      for (let y = zone[1]; y <= zone[3]; y++)
        for (let x = zone[0]; x <= zone[2]; x++)
          if (c.id in (tileAt(s, x, y).growth ?? {})) return true;
      return false;
    };
    // 1. PLANT — a plant job sows the crop from its seed.
    for (let i = 0; i < 15 && !sown(); i++) s.tick(200);
    expect(sown(), `${c.id} sown from ${c.seed}`).toBe(true);
    // 2. GROW for real — climbs off the 1% wither floor within ~one day-night cycle in its window.
    for (let i = 0; i < 50 && growthOf() < 2; i++) s.tick(400);
    const grew = growthOf();
    // 3. MATURE (lever) + 4. REAP into the crop's own yield item.
    s.command({ type: 'devMatureCrops', payload: {} } as never);
    for (let y = zone[1]; y <= zone[3]; y++)
      for (let x = zone[0]; x <= zone[2]; x++)
        if ((tileAt(s, x, y).resources?.[c.id] ?? 0) > 0)
          s.command({ type: 'designateRect', payload: { x1: x, y1: y, x2: x, y2: y, type: 'harvest' } } as never);
    const stk = () => (s.getState().stockpile ?? {}) as Record<string, number>;
    const y0 = stk()[c.yield] ?? 0;
    for (let i = 0; i < 25 && (stk()[c.yield] ?? 0) === y0; i++) s.tick(300);
    const yNow = stk()[c.yield] ?? 0;
    console.log(`[CROP all] ${c.id.padEnd(13)} (${c.season}) grew→${grew.toFixed(1)}%  reaped ${c.yield} ${y0}→${yNow}`);
    expect(grew, `${c.id} grew under its window (off the floor)`).toBeGreaterThan(2);
    expect(yNow, `${c.id} reaped into ${c.yield}`).toBeGreaterThan(y0);
  });
});
