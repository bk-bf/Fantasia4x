import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { recipeService } from '$lib/game/services/RecipeService';
import { itemService } from '$lib/game/services/ItemService';
import { buildingService } from '$lib/game/services/BuildingService';
import { completeCraftOrder } from '$lib/game/services/jobs/craft';
import { workService } from '$lib/game/services/WorkService';
import type { GameState } from '$lib/game/core/types';

const CURE = recipeService.getAllRecipes().filter((r) => r.id.startsWith('make_cured_'));
const TAN = recipeService.getAllRecipes().filter((r) => r.id.startsWith('tan_'));
const usesCat =
  (cat: string) => (r: { inputs?: object; inputAlternatives?: object[]; dynamicRecipe?: object }) =>
    Object.keys(r.inputs ?? {}).includes(cat) ||
    (r.inputAlternatives ?? []).some((a) => cat in a) ||
    Object.values(r.dynamicRecipe ?? {}).some(
      (d: { acceptsCategory?: string; acceptsCategories?: string[] }) =>
        d.acceptsCategory === cat.slice(9) || (d.acceptsCategories ?? []).includes(cat.slice(9))
    );
const CONSUMERS = recipeService
  .getAllRecipes()
  .filter(
    (r) =>
      usesCat('category:leather')(r) ||
      usesCat('category:wool')(r) ||
      usesCat('category:cured_hide')(r)
  );

// Provision a colony that can afford everything: every station these recipes need, all research/tools,
// and 999 of every material/food/consumable so only the STATION/research/tool gates are under test.
function provisioned(): GameState {
  const stations = new Set<string>();
  for (const r of [...CURE, ...TAN, ...CONSUMERS]) if (r.station) stations.add(r.station);
  const stock: Record<string, number> = {};
  for (const t of ['material', 'food', 'consumable'])
    for (const i of itemService.getItemsByType(t)) stock[i.id] = 999;
  return buildScenario({
    seed: 42,
    map: { w: 40, h: 40 },
    researchMaxTier: 9,
    toolTier: 3,
    buildings: [...stations].map((id) => ({ id })),
    items: stock,
    seedEntities: false
  });
}

const outputOf = (recipeId: string) =>
  Object.keys(recipeService.getRecipeById(recipeId)!.outputs)[0];
const makeOrder = (recipeId: string, state: GameState) => {
  const r = recipeService.getRecipeById(recipeId)!;
  const bld = (state.buildings ?? []).find((b) => (b as { type?: string }).type === r.station) as {
    id?: string;
  };
  return {
    id: 'o1',
    item: { id: outputOf(recipeId), name: 'x', amount: 0 },
    quantity: 1,
    workRequired: r.workAmount ?? 4,
    workDone: 0,
    inputs: {},
    stationType: r.station,
    stationBuildingId: bld?.id ?? 'b0'
  } as never;
};

describe('leather/wool chain — full end-to-end sweep (provisioned colony)', () => {
  const state = provisioned();

  it('every cure + tan recipe QUEUES (real canQueueCraft gating) AND PRODUCES its output', () => {
    const fail: string[] = [];
    for (const r of [...CURE, ...TAN]) {
      const out = outputOf(r.id);
      if (!itemService.canQueueCraft(out, state)) fail.push(`${r.id}: canQueueCraft(${out})=false`);
      const gs = completeCraftOrder(
        makeOrder(r.id, state),
        { ...state, craftingQueue: [makeOrder(r.id, state)] } as GameState,
        () => 1
      );
      if (!(gs.droppedItems ?? []).some((d) => d.resourceId === out))
        fail.push(`${r.id}: no ${out} produced`);
    }
    console.log(`[E2E] cure+tan: ${CURE.length + TAN.length} targets, ${fail.length} failures`);
    expect(fail, fail.join('\n')).toEqual([]);
  });

  it('every category:leather / wool / cured_hide CONSUMER queues AND produces', () => {
    const fail: string[] = [];
    for (const r of CONSUMERS) {
      const out = outputOf(r.id);
      if (!itemService.canQueueCraft(out, state)) fail.push(`${r.id}: canQueueCraft(${out})=false`);
      const gs = completeCraftOrder(
        makeOrder(r.id, state),
        { ...state, craftingQueue: [makeOrder(r.id, state)] } as GameState,
        () => 1
      );
      if (!(gs.droppedItems ?? []).some((d) => d.resourceId === out))
        fail.push(`${r.id}: no ${out}`);
    }
    console.log(
      `[E2E] consumers: ${CONSUMERS.length} recipes (${CONSUMERS.filter(usesCat('category:leather')).length} leather), ${fail.length} failures`
    );
    expect(fail, fail.join('\n')).toEqual([]);
  });

  it('buildings that cost category:cured_hide / category:leather / category:wool resolve their cost', () => {
    for (const id of ['hide_bed', 'leather_bed', 'stargazer_circlet'])
      expect(buildingService.resolveBuildingCost(id, state), id).not.toBeNull();
  });
});

describe('leather chain — physical pawn pipeline (HeadlessSession, real ticks)', () => {
  it('pawns fetch leather/wool and craft a leather item + a wool item over real ticks', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 7,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        pawns: [{ count: 6, skillLevel: 12 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'makers_bench' }, { id: 'weaving_frame' }, { id: 'spinning_wheel' }],
        items: { buckskin: 20, cordage: 20, goat_wool: 40, cured_deer_hide: 20 },
        seedEntities: false
      })
    );
    // Founders default to no enabled labor in a headless scenario — turn it on so they work the queue.
    for (const p of session.getState().pawns)
      for (const w of workService.getAllWorkCategories())
        session.command({
          type: 'setPawnLaborLevel',
          payload: { pawnId: p.id, workId: w.id, level: 3 }
        } as never);
    const stock = () => (session.getState().stockpile ?? {}) as Record<string, number>;
    session.command({
      type: 'craftItem',
      payload: { itemId: 'brimmed_leather_hood', quantity: 1 }
    } as never); // category:leather
    // Wool now goes fleece -> yarn -> cloth, the same two steps flax has always had.
    session.command({ type: 'craftItem', payload: { itemId: 'wool_yarn', quantity: 3 } } as never);
    for (let i = 0; i < 8 && !((stock().wool_yarn ?? 0) >= 3); i++) session.tick(500);
    session.command({ type: 'craftItem', payload: { itemId: 'woolcloth', quantity: 1 } } as never); // category:wool
    // Reserve → haul → stage → craft is a multi-tick pawn pipeline; give it room for both stations.
    for (let i = 0; i < 16 && !(stock().brimmed_leather_hood > 0 && stock().woolcloth > 0); i++)
      session.tick(500);
    console.log(
      `[E2E-PIPELINE] after ${session.getState().turn} turns: brimmed_leather_hood=${stock().brimmed_leather_hood} (buckskin ${stock().buckskin}/20), woolcloth=${stock().woolcloth} (goat_wool ${stock().goat_wool}/40, yarn ${stock().wool_yarn})`
    );
    expect(
      stock().brimmed_leather_hood ?? 0,
      'pawn crafts a category:leather item'
    ).toBeGreaterThan(0);
    expect(stock().buckskin, 'leather consumed').toBeLessThan(20);
    expect(stock().woolcloth ?? 0, 'pawn crafts a category:wool item').toBeGreaterThan(0);
    expect(stock().goat_wool, 'wool consumed').toBeLessThan(40);
  });

  // The two-step PASSIVE chain, physically: pawns haul hide+ash to the Curing Frame, it cures, then they
  // haul the cured hide + brine to the tanning bucket and it tans. Now provable — the earlier stall was
  // unreachable starting stock on a generated map, not a passive-station defect.
  it('pawns physically cure a hide then tan it into leather (two passive stations, real ticks)', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 11,
        map: { w: 20, h: 20 }, // flat by default → every tile reachable
        researchMaxTier: 9,
        toolTier: 3,
        pawns: [{ count: 6, skillLevel: 12 }],
        needsDisabled: ['hunger', 'fatigue'],
        workReady: true, // stocks a fleshing tool for the ACTIVE flesh step (§A)
        buildings: [{ id: 'hide_rack' }, { id: 'tanning_bucket_station' }],
        items: { deer_hide: 20, ash: 40, tanning_brine: 20 },
        seedEntities: false
      })
    );
    for (const p of session.getState().pawns)
      for (const w of workService.getAllWorkCategories())
        session.command({
          type: 'setPawnLaborLevel',
          payload: { pawnId: p.id, workId: w.id, level: 3 }
        } as never);
    const stk = () => (session.getState().stockpile ?? {}) as Record<string, number>;
    // §A: the ACTIVE flesh step now comes FIRST — a raw hide must be scraped clean before it can cure.
    session.command({
      type: 'craftItem',
      payload: { itemId: 'fleshed_deer_hide', quantity: 1 }
    } as never);
    for (let i = 0; i < 16 && !(stk().fleshed_deer_hide > 0); i++) session.tick(400);
    const fleshed = stk().fleshed_deer_hide ?? 0;
    // …then cure the FLESHED hide at the rack…
    session.command({
      type: 'craftItem',
      payload: { itemId: 'cured_deer_hide', quantity: 1 }
    } as never);
    for (let i = 0; i < 16 && !(stk().cured_deer_hide > 0); i++) session.tick(400);
    const cured = stk().cured_deer_hide ?? 0;
    // …then tan that cured hide into buckskin at the bucket (brine consumed as a real input).
    session.command({ type: 'craftItem', payload: { itemId: 'buckskin', quantity: 1 } } as never);
    for (let i = 0; i < 16 && !(stk().buckskin > 0); i++) session.tick(400);
    console.log(
      `[LEATHER-PIPELINE] deer_hide ${stk().deer_hide}/20, fleshed=${fleshed}, cured=${cured}, buckskin=${stk().buckskin}, brine=${stk().tanning_brine}/20, turn=${session.getState().turn}`
    );
    expect(fleshed, 'a raw hide was fleshed (active step)').toBeGreaterThan(0);
    expect(cured, 'Curing Frame cured the fleshed hide').toBeGreaterThan(0);
    expect(stk().buckskin ?? 0, 'tanning bucket produced leather').toBeGreaterThan(0);
    expect(stk().tanning_brine, 'brine consumed as a real input').toBeLessThan(20);
  });

  it('BEAST chain: wolf hide → flesh → cure → tan → CURRY → prime wolf leather (kit-gated, animal identity kept)', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 13,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        workReady: true, // stocks a leatherworking tool that clears both the flesh (t1) and curry (t2) gates
        pawns: [{ count: 6, skillLevel: 16 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [
          { id: 'hide_rack' },
          { id: 'tanning_bucket_station' },
          { id: 'curriers_bench' }
        ],
        items: { wolf_hide: 20, ash: 60, tanning_brine: 20, tallow: 20 },
        seedEntities: false
      })
    );
    for (const p of session.getState().pawns)
      for (const w of workService.getAllWorkCategories())
        session.command({
          type: 'setPawnLaborLevel',
          payload: { pawnId: p.id, workId: w.id, level: 3 }
        } as never);
    const stk = () => (session.getState().stockpile ?? {}) as Record<string, number>;
    const step = (item: string) => {
      session.command({ type: 'craftItem', payload: { itemId: item, quantity: 1 } } as never);
      for (let i = 0; i < 16 && !(stk()[item] > 0); i++) session.tick(400);
    };
    step('fleshed_wolf_hide'); // active flesh
    step('cured_wolf_hide'); // passive cure (of the FLESHED hide)
    step('wolf_leather'); // passive tan
    step('prime_wolf_leather'); // ACTIVE curry at the currier's bench — the beast-tier gate
    console.log(
      `[BEAST-CHAIN] fleshed_wolf=${stk().fleshed_wolf_hide} cured_wolf=${stk().cured_wolf_hide} wolf_leather=${stk().wolf_leather} prime_wolf_leather=${stk().prime_wolf_leather} fat=${stk().tallow}/20`
    );
    // The whole animal-identity chain survives: a WOLF hide drives a WOLF-named prime leather.
    expect(
      stk().prime_wolf_leather ?? 0,
      'curry produced prime wolf leather (2 active steps for a beast)'
    ).toBeGreaterThan(0);
    expect(
      stk().tallow,
      'the oil/fat consumable was consumed by the curry (organic → quality)'
    ).toBeLessThan(20);
  });
});
