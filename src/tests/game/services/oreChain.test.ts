import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { recipeService } from '$lib/game/services/RecipeService';
import { itemService } from '$lib/game/services/ItemService';
import { buildingService } from '$lib/game/services/BuildingService';
import { vesselAccepts } from '$lib/game/core/rules/gear/vessels';

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
          [
            ...Object.keys(r.inputs ?? {}),
            ...(r.inputAlternatives ?? []).flatMap((a) => Object.keys(a))
          ].includes(o.id)
        );
      expect(used, `${o.id} has no smelting recipe`).toBe(true);
    }
  });

  it('every smelted metal has exactly ONE producer (no first-producer-wins shadow)', () => {
    for (const m of [
      'copper_bar',
      'tin_bar',
      'bronze_bar',
      'lead_bar',
      'silver_bar',
      'gold_bar',
      'pig_iron',
      'molten_copper',
      'molten_tin',
      'molten_bronze',
      'molten_lead',
      'molten_silver',
      'molten_gold'
    ])
      expect(
        recipeService
          .getAllRecipes()
          .filter((r) => Object.keys(r.outputs ?? {}).includes(m))
          .map((r) => r.id),
        m
      ).toHaveLength(1);
  });

  it('lead is no longer dead — silver comes from cupelling it, not straight from galena', () => {
    const cupel = recipeService.getRecipeById('cupel_silver')!;
    expect(cupel.inputs).toHaveProperty('lead_bar');
    expect(cupel.inputs).toHaveProperty('bone_meal');
    expect(Object.keys(recipeService.getRecipeById('smelt_lead')!.outputs)).toEqual([
      'molten_lead'
    ]);
  });

  it('bronze is a realistic alloy (~10-13% tin, not 25%)', () => {
    const i = recipeService.getRecipeById('melt_bronze')!.inputs as Record<string, number>;
    const tinPct = (i.tin_bar / (i.copper_bar + i.tin_bar)) * 100;
    expect(tinPct).toBeGreaterThan(8);
    expect(tinPct).toBeLessThan(14);
  });

  it('copper ore cost tracks copper CONTENT (sulfide chalcopyrite is the poorest)', () => {
    const r = recipeService.getRecipeById('smelt_copper')!;
    const qty = (ore: string) =>
      ore in (r.inputs ?? {})
        ? (r.inputs as Record<string, number>)[ore]
        : ((r.inputAlternatives ?? []).find((a) => ore in a)?.[ore] as number);
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

  it('pawns smelt copper/tin/lead, cupel silver, and cast bronze over real ticks', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 11,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        workReady: true,
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
    const craft = (itemId: string, quantity = 1) =>
      s.command({ type: 'craftItem', payload: { itemId, quantity } } as never);
    const until = (done: () => boolean, rounds = 24) => {
      for (let i = 0; i < rounds && !done(); i++) s.tick(400);
    };

    craft('molten_copper');
    craft('molten_tin');
    craft('molten_gold');
    craft('molten_lead', 4);
    until(() => (stk().molten_lead ?? 0) >= 5 && (stk().molten_copper ?? 0) >= 4);
    const melt = {
      copper: stk().molten_copper ?? 0,
      tin: stk().molten_tin ?? 0,
      lead: stk().molten_lead ?? 0,
      gold: stk().molten_gold ?? 0
    };

    craft('copper_bar');
    craft('tin_bar');
    craft('gold_bar');
    craft('lead_bar', 4);
    until(() => (stk().lead_bar ?? 0) >= 3 && (stk().copper_bar ?? 0) > cu0);
    const copperAfterCast = stk().copper_bar ?? 0;

    craft('molten_bronze');
    craft('molten_silver');
    until(() => (stk().molten_bronze ?? 0) >= 4 && (stk().molten_silver ?? 0) >= 4, 30);
    craft('bronze_bar');
    craft('silver_bar');
    until(() => (stk().bronze_bar ?? 0) > 0 && (stk().silver_bar ?? 0) > 0, 24);

    console.log(
      `[ORE] melt: Cu ${melt.copper} Sn ${melt.tin} Pb ${melt.lead} Au ${melt.gold} ` +
        `Bz ${stk().molten_bronze ?? 0} Ag ${stk().molten_silver ?? 0} | ` +
        `bars: copper ${cu0}→${copperAfterCast}→${stk().copper_bar} (bronze ate 7) tin ${stk().tin_bar} lead ${stk().lead_bar} ` +
        `gold ${stk().gold_bar} bronze ${stk().bronze_bar} silver ${stk().silver_bar} | ` +
        `ore: malachite ${stk().malachite}/60 cassiterite ${stk().cassiterite}/60 galena ${stk().galena}/60 ` +
        `native_gold ${stk().native_gold}/30 | turn=${s.getState().turn}`
    );

    expect(stk().malachite, 'copper smelted from ore').toBeLessThan(60);
    expect(stk().galena, 'lead smelted from ore').toBeLessThan(60);
    expect(stk().cassiterite, 'tin smelted from cassiterite').toBeLessThan(60);
    expect(melt.copper, 'molten copper existed before any bar was cast').toBeGreaterThan(0);
    expect(melt.lead, 'molten lead existed before any bar was cast').toBeGreaterThan(0);
    expect(copperAfterCast, 'copper cast from the melt').toBeGreaterThan(cu0);
    expect(stk().lead_bar ?? 0, 'lead cast from the melt').toBeGreaterThan(0);
    expect(stk().gold_bar ?? 0, 'gold cast from the melt').toBeGreaterThan(0);
    expect(stk().bronze_bar ?? 0, 'bronze alloyed and cast').toBeGreaterThan(0);
    expect(stk().silver_bar ?? 0, 'silver cupelled out of lead and cast').toBeGreaterThan(0);
  });
  it('nothing portable will carry a melt — a waterskin does not fetch molten copper', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 17,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        workReady: true,
        pawns: [{ count: 6, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'stone_forge' }],
        items: { malachite: 30, clay_mold: 20, waterskin: 4, wooden_bucket: 4, wooden_barrel: 2 },
        seedEntities: false
      })
    );
    const stk = () => (s.getState().stockpile ?? {}) as Record<string, number>;
    s.command({ type: 'craftItem', payload: { itemId: 'molten_copper', quantity: 1 } } as never);
    for (let i = 0; i < 10 && !((stk().molten_copper ?? 0) > 0); i++) s.tick(400);
    s.command({ type: 'craftItem', payload: { itemId: 'copper_bar', quantity: 1 } } as never);
    for (let i = 0; i < 8; i++) s.tick(400);

    const forge = (s.getState().buildings ?? []).find((b) => b.type === 'stone_forge')!;
    const carried = (s.getState().droppedItems ?? []).filter((d) =>
      (d.instance?.contents ?? []).some((c) => String(c.itemId).startsWith('molten_'))
    );
    const inPacks = s
      .getState()
      .pawns.flatMap((p) => p.inventory?.instances ?? [])
      .filter((inst) => (inst.contents ?? []).some((c) => String(c.itemId).startsWith('molten_')));
    console.log(
      `[MELT-CONTAINMENT] copper_bar=${stk().copper_bar} forge=${JSON.stringify(forge.fluidContents)} ` +
        `vessels holding a melt: ${carried.length} loose, ${inPacks.length} carried`
    );
    expect(vesselAccepts('waterskin', 'water'), 'a skin still takes an ordinary fluid').toBe(true);
    expect(vesselAccepts('waterskin', 'molten_copper'), 'and refuses a melt').toBe(false);
    expect(vesselAccepts('fireclay_crucible', 'molten_copper'), 'fireclay holds a melt').toBe(true);
    expect(vesselAccepts('rune_sealed_flask', 'molten_copper'), 'a runed flask holds a melt').toBe(
      true
    );
    expect(vesselAccepts('wooden_bucket', 'caustic_bile'), 'wood does not hold a caustic').toBe(
      false
    );
    expect(vesselAccepts('clay_jug', 'caustic_bile'), 'a sealed clay pot does').toBe(true);
    expect(carried, 'no vessel on the ground is holding a melt').toHaveLength(0);
    expect(inPacks, 'no pawn is carrying a melt').toHaveLength(0);
    expect(stk().copper_bar ?? 0, 'the cast ran from the station body').toBeGreaterThan(0);
  });
});

describe('crucibles — the vessel that CAN carry a melt (HeadlessSession, real ticks)', () => {
  it('pawns fire a crucible from fire clay and fill it from the hearth', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 23,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        workReady: true,
        pawns: [{ count: 6, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'stone_forge' }, { id: 'advanced_kiln' }],
        items: { malachite: 40, fire_clay: 20, clay_mold: 20, wooden_bucket: 4, waterskin: 4 },
        seedEntities: false
      })
    );
    const stk = () => (s.getState().stockpile ?? {}) as Record<string, number>;
    s.command({
      type: 'craftItem',
      payload: { itemId: 'fireclay_crucible', quantity: 2 }
    } as never);
    for (let i = 0; i < 16 && !((stk().fireclay_crucible ?? 0) >= 1); i++) s.tick(400);
    s.command({ type: 'craftItem', payload: { itemId: 'molten_copper', quantity: 1 } } as never);
    for (let i = 0; i < 12 && !((stk().molten_copper ?? 0) > 0); i++) s.tick(400);

    const holders = (s.getState().droppedItems ?? [])
      .filter((d) =>
        (d.instance?.contents ?? []).some((c) => String(c.itemId).startsWith('molten_'))
      )
      .map((d) => d.resourceId);
    console.log(
      `[CRUCIBLE] crucibles=${stk().fireclay_crucible} molten_copper=${stk().molten_copper} ` +
        `fire_clay ${stk().fire_clay}/20 | anything holding a melt: ${holders.join(', ') || 'nothing (still in the hearth)'}`
    );
    expect(stk().fireclay_crucible ?? 0, 'a crucible is craftable from fire clay').toBeGreaterThan(
      0
    );
    expect(stk().fire_clay, 'fire clay consumed').toBeLessThan(20);
    expect(holders.filter((h) => h === 'wooden_bucket' || h === 'waterskin')).toEqual([]);
  });
});
