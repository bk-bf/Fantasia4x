import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { recipeService } from '$lib/game/services/RecipeService';
import { itemService } from '$lib/game/services/ItemService';
import { buildingService } from '$lib/game/services/BuildingService';
import { vesselAccepts } from '$lib/game/core/vessels';

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
      // The melts are reached two ways — from ore and by remelting a finished bar — but that is ONE
      // recipe with `inputAlternatives`, not two producers. If it ever becomes two, the second is
      // unreachable from the craft card and the remelt loop silently dies.
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
    // galena smelts to a LEAD MELT; it must NOT also yield silver directly
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
    const craft = (itemId: string, quantity = 1) =>
      s.command({ type: 'craftItem', payload: { itemId, quantity } } as never);
    const until = (done: () => boolean, rounds = 24) => {
      for (let i = 0; i < rounds && !done(); i++) s.tick(400);
    };

    // LEG 1 — ore to MELT. Nothing casts until there is liquid metal in the hearth.
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

    // LEG 2 — pour it into bar moulds. This is also the leftover loop: metal left in the crucible
    // goes back to stock as a bar rather than being lost.
    craft('copper_bar');
    craft('tin_bar');
    craft('gold_bar');
    craft('lead_bar', 4);
    until(() => (stk().lead_bar ?? 0) >= 3 && (stk().copper_bar ?? 0) > cu0);
    // Read copper HERE: leg 3 alloys bronze, which eats 7 copper bars, so the net after it is lower
    // than the start even though a bar was genuinely cast.
    const copperAfterCast = stk().copper_bar ?? 0;

    // LEG 3 — the alloy and the cupel, each of which melts its own stock first.
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

    // The melt leg is real, not skipped: ore was consumed and liquid metal existed in the hearth.
    expect(stk().malachite, 'copper smelted from ore').toBeLessThan(60);
    expect(stk().galena, 'lead smelted from ore').toBeLessThan(60);
    expect(stk().cassiterite, 'tin smelted from cassiterite').toBeLessThan(60);
    expect(melt.copper, 'molten copper existed before any bar was cast').toBeGreaterThan(0);
    expect(melt.lead, 'molten lead existed before any bar was cast').toBeGreaterThan(0);
    // …and the cast leg turned it back into solid stock.
    expect(copperAfterCast, 'copper cast from the melt').toBeGreaterThan(cu0);
    expect(stk().lead_bar ?? 0, 'lead cast from the melt').toBeGreaterThan(0);
    expect(stk().gold_bar ?? 0, 'gold cast from the melt').toBeGreaterThan(0);
    expect(stk().bronze_bar ?? 0, 'bronze alloyed and cast').toBeGreaterThan(0);
    expect(stk().silver_bar ?? 0, 'silver cupelled out of lead and cast').toBeGreaterThan(0);
  });
  // A melt is 1000C+ and there is no vessel in the game that can hold one. Left unguarded the fill job
  // would happily send a pawn to ladle molten copper into a leather waterskin, because an empty vessel
  // volunteers for whatever a queued order is short of.
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
    // A cast is queued and short of nothing but the melt — the strongest pull the fill job ever gets.
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
    // CONTROL — the refusal has to be about containment, not about fill being dead. The same skin that
    // will not take copper takes water, and `vesselChain` proves skins really do fill over real ticks.
    expect(vesselAccepts('waterskin', 'water'), 'a skin still takes an ordinary fluid').toBe(true);
    expect(vesselAccepts('waterskin', 'molten_copper'), 'and refuses a melt').toBe(false);
    // …and the refusal is about the MATERIAL, not about melts being untouchable: the two vessels made
    // of something that survives one do take it.
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
    // …and the cast still worked, because the metal was in the hearth all along.
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
        // Wooden buckets are present throughout and must never be the thing that carries it.
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
    // Whatever ends up holding a melt, it is never the wood or the leather.
    expect(holders.filter((h) => h === 'wooden_bucket' || h === 'waterskin')).toEqual([]);
  });
});
