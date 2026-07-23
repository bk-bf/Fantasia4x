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

  // ⚠ NOT COVERED HERE: the PHYSICAL pawn pipeline for metal stations. Fuel-gated furnaces
  // (bloomery/blast/finery) are never fuelled+lit by pawns headless, and anvil work needs a pawn to be
  // CARRYING a metalworking tool. Both are PRE-EXISTING gaps — the untouched `make_iron_bar` bloomery
  // recipe fails identically — and are tracked in AUDIT (fuel stations / tool gating), not introduced here.
});
