import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { soilTierForTile } from '$lib/game/core/defs/terrains';

type Tile = {
  subType: string;
  growth?: Record<string, number>;
  resources?: Record<string, number>;
};
const tileAt = (s: HeadlessSession, x: number, y: number) =>
  (s.getState().worldMap as unknown as Tile[][])[y][x];
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
    console.log(
      `[CROP plant] wheat sown in grow zone = ${sown}; maxGrowth now ${maxGrowth(s, GROW).toFixed(2)}%`
    );
    expect(sown, 'plant job sowed crop_wheat on a grow tile').toBe(true);
  });

  it('growth: climbs with moisture+warmth, STALLS when dry (cropHealth gate)', async () => {
    const wet = await sownColony(40);
    const dry = await sownColony(5);
    for (let i = 0; i < 30; i++) {
      wet.tick(300);
      dry.tick(300);
    }
    const gWet = maxGrowth(wet, GROW);
    const gDry = maxGrowth(dry, GROW);
    console.log(
      `[CROP growth] moist(40) grew to ${gWet.toFixed(2)}% vs dry(5) ${gDry.toFixed(2)}%`
    );
    expect(gWet, 'a well-watered warm bed grows').toBeGreaterThan(2);
    expect(gDry, 'a dry bed does not grow (withers to ~1%)').toBeLessThan(gWet - 1);
  });

  it('full cycle: radish matures to 100%, becomes harvestable, is reaped into stock', async () => {
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
    s.command({ type: 'setSeason', payload: { season: 'spring' } } as never);
    s.command({ type: 'setWeather', payload: { type: 'clear' } } as never);
    s.command({ type: 'devSetMapMoisture', payload: { value: 45 } } as never);
    const zone = [7, 7, 8, 8];
    s.command({
      type: 'designateRect',
      payload: { x1: zone[0], y1: zone[1], x2: zone[2], y2: zone[3], type: 'grow' }
    } as never);
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
    for (let i = 0; i < 200 && !(mat = matureTile()); i++) s.tick(500);
    console.log(
      `[CROP mature] radish matured at ${mat ? `(${mat.x},${mat.y})` : 'NONE'} by turn ${s.getState().turn}; count=${mat ? tileAt(s, mat.x, mat.y).resources?.crop_radish : 0}`
    );
    expect(mat, 'a radish tile reached 100% and set a harvestable count').toBeTruthy();

    const radish0 = (s.getState().stockpile as Record<string, number>).radish ?? 0;
    for (let y = zone[1]; y <= zone[3]; y++)
      for (let x = zone[0]; x <= zone[2]; x++)
        if ((tileAt(s, x, y).resources?.crop_radish ?? 0) > 0)
          s.command({
            type: 'designateRect',
            payload: { x1: x, y1: y, x2: x, y2: y, type: 'harvest' }
          } as never);
    for (
      let i = 0;
      i < 30 && ((s.getState().stockpile as Record<string, number>).radish ?? 0) === radish0;
      i++
    )
      s.tick(300);
    const radishNow = (s.getState().stockpile as Record<string, number>).radish ?? 0;
    console.log(
      `[CROP harvest] radish stock ${radish0} → ${radishNow}; reaped tile growth reset check`
    );
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
        items: { fertiliser: 8, compost: 8, blue_clay: 8, dirt: 16, spit_meat: 10 },
        seedEntities: false
      })
    );
    const tx = 7;
    const ty = 7;
    const before = tileAt(s, tx, ty);
    const beforeSub = before.subType;
    const tier0 = soilTierForTile({ subType: beforeSub });
    expect(beforeSub, 'starts as plain grass (tier 1)').toBe('grass');
    s.command({ type: 'placeBuilding', payload: { bid: 'lay_loam', x: tx, y: ty } } as never);
    for (let i = 0; i < 40 && tileAt(s, tx, ty).subType === 'grass'; i++) s.tick(300);
    const after = tileAt(s, tx, ty);
    const tier1 = soilTierForTile(after);
    console.log(
      `[CROP terraform] tile (${tx},${ty}) subType ${beforeSub}→${after.subType}; soil tier ${tier0}→${tier1}`
    );
    expect(after.subType, 'terraformed to tall_grass').toBe('tall_grass');
    expect(tier1, 'soil tier rose (fertility 25→50)').toBeGreaterThan(tier0);
  });

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
    s.command({ type: 'devSetMapSoil', payload: { subType: 'terra_preta' } } as never);
    s.command({ type: 'devSetMapMoisture', payload: { value: 55 } } as never);
    s.command({ type: 'devCropGrowthScale', payload: { factor: 20 } } as never);
    const zone = [6, 6, 7, 7];
    s.command({
      type: 'designateRect',
      payload: { x1: zone[0], y1: zone[1], x2: zone[2], y2: zone[3], type: 'grow' }
    } as never);
    const mature = () => {
      for (let y = zone[1]; y <= zone[3]; y++)
        for (let x = zone[0]; x <= zone[2]; x++) {
          const t = tileAt(s, x, y);
          if ((t.growth?.[c.id] ?? 0) >= 100 && (t.resources?.[c.id] ?? 0) > 0) return { x, y };
        }
      return null;
    };
    const maxGrowthOf = () => {
      let g = 0;
      for (let y = zone[1]; y <= zone[3]; y++)
        for (let x = zone[0]; x <= zone[2]; x++)
          g = Math.max(g, tileAt(s, x, y).growth?.[c.id] ?? 0);
      return g;
    };
    let mat: { x: number; y: number } | null = null;
    for (let i = 0; i < 120 && !(mat = mature()); i++) s.tick(500);
    const stk = () => (s.getState().stockpile ?? {}) as Record<string, number>;
    const y0 = mat ? (stk()[c.yield] ?? 0) : 0;
    if (mat) {
      s.command({
        type: 'designateRect',
        payload: { x1: mat.x, y1: mat.y, x2: mat.x, y2: mat.y, type: 'harvest' }
      } as never);
      for (let i = 0; i < 25 && (stk()[c.yield] ?? 0) === y0; i++) s.tick(300);
    }
    const yNow = stk()[c.yield] ?? 0;
    console.log(
      `[CROP all] ${c.id.padEnd(13)} (${c.season}) matured=${!!mat} maxGrowth=${maxGrowthOf().toFixed(0)}% reaped ${c.yield} ${y0}→${yNow} @turn ${s.getState().turn}`
    );
    expect(
      mat,
      `${c.id} reached REAL 100% maturity in ${c.season} (window is viable)`
    ).toBeTruthy();
    expect(yNow, `${c.id} reaped into ${c.yield}`).toBeGreaterThan(y0);
  });
});
