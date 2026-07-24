import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { recipeService } from '$lib/game/services/RecipeService';
import { itemService } from '$lib/game/services/ItemService';
import { completeCraftOrder } from '$lib/game/services/jobs/craft';
import { workService } from '$lib/game/services/WorkService';
import type { GameState } from '$lib/game/core/types';

const CHAIN = ['smelt_pig_iron','refine_wrought_iron','make_bloom_steel','bake_blister_steel',
  'forge_shear_steel','make_crucible_steel','forge_pattern_welded','puddle_mild_steel'];
const IRONS = ['iron_bar','wrought_iron'];

describe('steel chain', () => {
  const stations = new Set<string>();
  for (const id of CHAIN) { const r = recipeService.getRecipeById(id); if (r?.station) stations.add(r.station); }
  const stock: Record<string, number> = {};
  for (const t of ['material','food','consumable']) for (const i of itemService.getItemsByType(t)) stock[i.id] = 999;
  const state = buildScenario({ seed: 5, map: { w: 40, h: 40 }, researchMaxTier: 9, toolTier: 3,
    buildings: [...stations].map((id) => ({ id })), items: stock, seedEntities: false });

  it('every step of the chain QUEUES and PRODUCES', () => {
    const fail: string[] = [];
    for (const id of CHAIN) {
      const r = recipeService.getRecipeById(id)!;
      const out = Object.keys(r.outputs)[0];
      const bld = (state.buildings ?? []).find((b) => (b as {type?:string}).type === r.station) as {id?:string};
      const order = { id: 'o1', item: { id: out, name: 'x', amount: 0 }, quantity: 1, workRequired: r.workAmount ?? 4,
        workDone: 0, inputs: {}, stationType: r.station, stationBuildingId: bld?.id ?? 'b0' } as never;
      const gs = completeCraftOrder(order, { ...state, craftingQueue: [order] } as GameState, () => 1);
      if (!(gs.droppedItems ?? []).some((d) => d.resourceId === out)) fail.push(`${id}: no ${out}`);
      if (!bld?.id) fail.push(`${id}: station ${r.station} not built`);
    }
    console.log(`[STEEL] ${CHAIN.length} chain steps, ${fail.length} failures`);
    expect(fail, fail.join('\n')).toEqual([]);
  });

  it('both irons share category:iron and each has exactly ONE producer (no shadow)', () => {
    expect(itemService.getItemsByCategory('iron').map((i) => i.id).sort()).toEqual([...IRONS].sort());
    for (const [item, recipe] of [['iron_bar','make_iron_bar'],['wrought_iron','refine_wrought_iron']] as const)
      expect(recipeService.getRecipeForItem(item)?.id, item).toBe(recipe);
  });

  it('the 6 steels all satisfy a category:steel consumer (any steel crafts a steel item)', () => {
    const steels = itemService.getItemsByCategory('steel').map((i) => i.id);
    expect(steels.length).toBe(6);
    const fail: string[] = [];
    for (const s of steels) {
      const order = { id: 'o1', item: { id: 'steel_longsword', name: 'x', amount: 0 }, quantity: 1, workRequired: 8,
        workDone: 0, inputs: {}, stationType: 'anvil', stationBuildingId: 'b0' } as never;
      const gs = completeCraftOrder(order, { droppedItems: [{ id: 'd1', resourceId: s, reservedFor: 'o1', quantity: 2, x: 0, y: 0, stored: false }],
        craftingQueue: [order], buildings: [{ id: 'b0', type: 'anvil', x: 0, y: 0, status: 'complete' }], zoneTiles: {} } as unknown as GameState, () => 1);
      const d = (gs.droppedItems ?? []).find((x) => x.resourceId === 'steel_longsword');
      if (!d) fail.push(`${s}: no sword`);
      else console.log(`  [STEEL-MAT] ${s.padEnd(22)} → sword matDur=${d.matDur ?? 1}`);
    }
    expect(fail, fail.join('\n')).toEqual([]);
  });

  // HEADLESS: pawns actually smelt + bake the chain over real ticks (fuel handled by `infiniteFuel`,
  // which deliberately takes the haul-fuel-and-light loop out of scope — that has its own audit).
  it('pawns physically smelt iron at the bloomery and bake blister steel at the cementation furnace', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 11,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        pawns: [{ count: 6, skillLevel: 12 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'bloomery' }, { id: 'cementation_furnace' }],
        items: { hematite: 60, limestone: 40, charcoal: 60, iron_bar: 20 },
        seedEntities: false
      })
    );
    for (const p of s.getState().pawns)
      for (const w of workService.getAllWorkCategories())
        s.command({ type: 'setPawnLaborLevel', payload: { pawnId: p.id, workId: w.id, level: 3 } } as never);
    const stk = () => (s.getState().stockpile ?? {}) as Record<string, number>;
    const ore0 = stk().hematite ?? 0;
    s.command({ type: 'craftItem', payload: { itemId: 'iron_bar', quantity: 1 } } as never);
    s.command({ type: 'craftItem', payload: { itemId: 'blister_steel', quantity: 1 } } as never);
    // NB: the cementation order EATS iron_bar (2) while the bloomery makes 1, so net iron_bar can dip —
    // assert on the ore actually consumed by the smelt, not on the shared iron_bar balance.
    for (let i = 0; i < 16 && !(stk().blister_steel > 0 && (stk().hematite ?? 0) < ore0); i++) s.tick(400);
    console.log(`[STEEL-PIPELINE] hematite ${ore0}→${stk().hematite}, iron_bar=${stk().iron_bar}, blister_steel=${stk().blister_steel}, turn=${s.getState().turn}`);
    expect(stk().hematite ?? 0, 'bloomery smelted ore into iron').toBeLessThan(ore0);
    expect(stk().blister_steel ?? 0, 'cementation baked blister steel').toBeGreaterThan(0);
  });

  // Anvil-side steps, physically. The craftTool gate passes when the pawn holds a metalworking tool OR
  // the colony has one in stock (auto-grabbed en route) — so stock the hammer/tongs and let them work.
  it('pawns physically forge shear steel and pattern-welded steel at the anvil', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 11,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        pawns: [{ count: 6, skillLevel: 20, equip: ['iron_hammer'] }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'anvil' }],
        items: { blister_steel: 40, iron_bar: 40, iron_hammer: 4, iron_tongs: 4 },
        seedEntities: false
      })
    );
    for (const p of s.getState().pawns)
      for (const w of workService.getAllWorkCategories())
        s.command({ type: 'setPawnLaborLevel', payload: { pawnId: p.id, workId: w.id, level: 3 } } as never);
    const stk = () => (s.getState().stockpile ?? {}) as Record<string, number>;
    s.command({ type: 'craftItem', payload: { itemId: 'shear_steel', quantity: 1 } } as never);
    for (let i = 0; i < 16 && !(stk().shear_steel > 0); i++) s.tick(400);
    const shear = stk().shear_steel ?? 0;
    s.command({ type: 'craftItem', payload: { itemId: 'pattern_welded_steel', quantity: 1 } } as never);
    for (let i = 0; i < 16 && !(stk().pattern_welded_steel > 0); i++) s.tick(400);
    console.log(
      `[STEEL-ANVIL] blister ${stk().blister_steel}/40 → shear_steel=${shear}, pattern_welded=${stk().pattern_welded_steel}, iron_bar=${stk().iron_bar}/40, turn=${s.getState().turn}`
    );
    expect(shear, 'anvil forged shear steel').toBeGreaterThan(0);
    expect(stk().pattern_welded_steel ?? 0, 'anvil forge-welded pattern steel').toBeGreaterThan(0);
  });
});
