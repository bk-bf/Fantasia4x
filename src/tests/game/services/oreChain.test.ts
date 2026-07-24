import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { recipeService } from '$lib/game/services/RecipeService';
import { itemService } from '$lib/game/services/ItemService';
import { buildingService } from '$lib/game/services/BuildingService';

/**
 * ORE AUDIT — the non-ferrous chains (copper/tin/bronze, lead→silver by cupellation, gold) plus the
 * cross-cutting invariants the steel rework established: no dead metal, no shadowed producer, and every
 * smelter actually gated on fuel + heat.
 */
const SMELTERS = [
  'stone_forge',
  'casting_hearth',
  'bloomery',
  'finery_forge',
  'blast_furnace',
  'crucible_steelworks',
  'puddling_furnace',
  'cementation_furnace'
];

describe('ore chains — audit', () => {
  it('every ore has a smelting consumer (no dead ore)', () => {
    const ores = itemService.getItemsByType('material').filter((i) => i.category === 'ore');
    expect(ores.length).toBeGreaterThan(0);
    for (const o of ores) {
      const used = recipeService
        .getAllRecipes()
        .some((r) =>
          [...Object.keys(r.inputs ?? {}), ...(r.inputAlternatives ?? []).flatMap((a) => Object.keys(a))].includes(o.id)
        );
      expect(used, `${o.id} has no smelting recipe`).toBe(true);
    }
  });

  it('every smelted metal has exactly ONE producer (no first-producer-wins shadow)', () => {
    for (const m of ['copper_bar', 'tin_bar', 'bronze_bar', 'lead_bar', 'silver_bar', 'gold_bar', 'pig_iron'])
      expect(recipeService.getAllRecipes().filter((r) => Object.keys(r.outputs ?? {}).includes(m)).map((r) => r.id), m)
        .toHaveLength(1);
  });

  it('lead is no longer dead — silver comes from cupelling it, not straight from galena', () => {
    const cupel = recipeService.getRecipeById('cupel_silver')!;
    expect(cupel.inputs).toHaveProperty('lead_bar');
    expect(cupel.inputs).toHaveProperty('bone_meal');
    // galena smelts to LEAD; it must NOT also yield silver directly
    expect(Object.keys(recipeService.getRecipeById('make_lead_bar')!.outputs)).toEqual(['lead_bar']);
  });

  it('bronze is a realistic alloy (~10-13% tin, not 25%)', () => {
    const i = recipeService.getRecipeById('make_bronze_bar')!.inputs as Record<string, number>;
    const tinPct = (i.tin_bar / (i.copper_bar + i.tin_bar)) * 100;
    expect(tinPct).toBeGreaterThan(8);
    expect(tinPct).toBeLessThan(14);
  });

  it('copper ore cost tracks copper CONTENT (sulfide chalcopyrite is the poorest)', () => {
    const r = recipeService.getRecipeById('make_copper_bar')!;
    const qty = (ore: string) =>
      ore in (r.inputs ?? {})
        ? (r.inputs as Record<string, number>)[ore]
        : ((r.inputAlternatives ?? []).find((a) => ore in a)?.[ore] as number);
    // malachite ~57% Cu, azurite ~55% — comparable; chalcopyrite ~35% and needs roasting → costs more.
    expect(qty('chalcopyrite')).toBeGreaterThan(qty('malachite'));
    expect(qty('chalcopyrite')).toBeGreaterThan(qty('azurite'));
  });

  it('EVERY smelter is gated on fuel + heat (none smelts for free)', () => {
    for (const id of SMELTERS) {
      const d = buildingService.getBuildingById(id) as unknown as {
        maxFuel?: number;
        minFuelHeat?: number;
      };
      expect(d?.maxFuel ?? 0, `${id} has no fuel tank`).toBeGreaterThan(0);
      expect(d?.minFuelHeat ?? 0, `${id} has no heat gate`).toBeGreaterThan(0);
    }
  });

  // HEADLESS: pawns actually run the non-ferrous chains end to end.
  it('pawns smelt copper/tin/lead, cupel silver, and cast bronze over real ticks', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 11,
        map: { w: 20, h: 20 }, // flat default → every tile reachable
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        workReady: true, // all labor on + a tool for every ADR-009 gate
        pawns: [{ count: 6, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'stone_forge' }, { id: 'casting_hearth' }],
        items: {
          malachite: 60,
          cassiterite: 60,
          galena: 60,
          native_gold: 30,
          clay_mold: 80,
          bone_meal: 40,
          copper_bar: 40,
          tin_bar: 20
        },
        seedEntities: false
      })
    );
    const stk = () => (s.getState().stockpile ?? {}) as Record<string, number>;
    const cu0 = stk().copper_bar ?? 0;
    s.command({ type: 'craftItem', payload: { itemId: 'copper_bar', quantity: 1 } } as never);
    s.command({ type: 'craftItem', payload: { itemId: 'tin_bar', quantity: 1 } } as never);
    s.command({ type: 'craftItem', payload: { itemId: 'gold_bar', quantity: 1 } } as never);
    s.command({ type: 'craftItem', payload: { itemId: 'bronze_bar', quantity: 1 } } as never);
    // cupellation eats 3 lead bars, so smelt a batch of them
    s.command({ type: 'craftItem', payload: { itemId: 'lead_bar', quantity: 4 } } as never);
    for (let i = 0; i < 24 && !((stk().lead_bar ?? 0) >= 3 && stk().bronze_bar > 0); i++) s.tick(400);
    // Lead exists → now cupel it into silver (the chain that made lead worth smelting).
    s.command({ type: 'craftItem', payload: { itemId: 'silver_bar', quantity: 1 } } as never);
    for (let i = 0; i < 18 && !(stk().silver_bar > 0 && stk().gold_bar > 0); i++) s.tick(400);
    console.log(
      `[ORE] malachite ${stk().malachite}/60→copper ${cu0}→${stk().copper_bar}; cassiterite ${stk().cassiterite}/60→tin ${stk().tin_bar}/20; ` +
        `galena ${stk().galena}/60→lead ${stk().lead_bar}; native_gold ${stk().native_gold}/30→gold ${stk().gold_bar}; ` +
        `bronze=${stk().bronze_bar}; silver=${stk().silver_bar}; turn=${s.getState().turn}`
    );
    expect(stk().malachite, 'copper smelted from ore').toBeLessThan(60);
    expect(stk().galena, 'lead smelted from ore').toBeLessThan(60);
    expect(stk().bronze_bar ?? 0, 'bronze cast').toBeGreaterThan(0);
    expect(stk().silver_bar ?? 0, 'silver cupelled out of lead').toBeGreaterThan(0);
    expect(stk().cassiterite, 'tin smelted from cassiterite').toBeLessThan(60);
    expect(stk().gold_bar ?? 0, 'gold smelted from native gold').toBeGreaterThan(0);
  });
});
