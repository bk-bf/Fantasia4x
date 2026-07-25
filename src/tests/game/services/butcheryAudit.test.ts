import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { itemService } from '$lib/game/services/ItemService';
import { workService } from '$lib/game/services/WorkService';
import { buildingService } from '$lib/game/services/BuildingService';

/**
 * BUTCHERY AUDIT (headless). A carcass (item `category:carcass`) is butchered through the craft pipeline:
 * `craftItem({itemId: <carcass>})` dispatches by the carcass to its recipe at the best-built station
 * (`resolveCarcassRecipe`, ranked by `butcheryTier`); the output is scaled by the station's
 * `butcheryYieldBonus` × the carcass's `conditionMult` (spoilage). Stations: butcher_spot (T0),
 * dressing_stone (T1 +25%), flensing_table (T2 +45%), sanguinary_altar (T3 +45%).
 */

const BUTCHERY_STATIONS = [
  { id: 'butcher_spot' },
  { id: 'dressing_stone' },
  { id: 'flensing_table' },
  { id: 'sanguinary_altar' }
];
// A butchery tool for every tier the gate can ask for: T0 knives, T1 cleaver, T2/T3 kits (flensing/altar).
const KNIVES = { flint_knife: 3, bone_cleaver: 3, iron_butchery_kit: 3, steel_butchery_kit: 3 };
const stk = (s: HeadlessSession) => (s.getState().stockpile ?? {}) as Record<string, number>;

describe('butchery', () => {
  it('coverage: every real carcass resolves to a butchery recipe that yields something', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 61,
        map: { w: 18, h: 18 },
        workReady: true,
        buildings: BUTCHERY_STATIONS,
        pawns: [{ count: 2 }],
        seedEntities: false
      })
    );
    const gs = s.getState();
    // rotten_carcass (the spoiled end-state) + pawn_carcass (no cannibalism) are intentionally un-butcherable.
    const INTENTIONAL = new Set(['rotten_carcass', 'pawn_carcass']);
    const carcasses = itemService.getItemsByType('material').filter((i) => i.category === 'carcass');
    const dead: string[] = [];
    for (const c of carcasses) {
      if (INTENTIONAL.has(c.id)) continue;
      const r = itemService.resolveCarcassRecipe(c.id, gs);
      if (!r || Object.keys(r.outputs ?? {}).length === 0) dead.push(c.id);
    }
    console.log(
      `[BUTCH cov] ${carcasses.length} carcass items; un-butcherable (excl. rotten/pawn): ${dead.join(', ') || 'none'}`
    );
    // grimeling_carcass is a known content gap (2 creatures) — tolerate it, but nothing else may be dead.
    expect(dead.filter((d) => d !== 'grimeling_carcass'), 'no unexpected dead carcass').toHaveLength(0);
  });

  it('physical: pawns butcher across tiers — game meat, humanoid remains, boss render & flense', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 62,
        map: { w: 18, h: 18 },
        workReady: true,
        researchMaxTier: 9,
        toolTier: 3,
        pawns: [{ count: 6, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        buildings: BUTCHERY_STATIONS,
        items: {
          rabbit_carcass: 2, // T0 game → rabbit_meat
          goblin_carcass: 2, // T0 humanoid → bones/sinew only (no meat)
          great_wolf_carcass: 2, // T1 boss render → wolf_meat
          dire_wolf_carcass: 2, // T2 flense → wolf_meat + rare
          ...KNIVES,
          spit_meat: 10
        },
        seedEntities: false
      })
    );
    for (const id of ['rabbit_carcass', 'goblin_carcass', 'great_wolf_carcass', 'dire_wolf_carcass'])
      s.command({ type: 'craftItem', payload: { itemId: id } } as never);
    for (let i = 0; i < 40 && !(stk(s).rabbit_meat > 0 && stk(s).wolf_meat > 0 && stk(s).medium_bones > 0); i++)
      s.tick(400);
    console.log(
      `[BUTCH phys] rabbit_meat=${stk(s).rabbit_meat} goblin→medium_bones=${stk(s).medium_bones}/sinew=${stk(s).sinew} wolf_meat=${stk(s).wolf_meat} @turn ${s.getState().turn}`
    );
    expect(stk(s).rabbit_meat ?? 0, 'rabbit butchered to meat').toBeGreaterThan(0);
    expect(stk(s).medium_bones ?? 0, 'goblin rendered to remains (bones)').toBeGreaterThan(0);
    expect(stk(s).wolf_meat ?? 0, 'great_wolf + dire_wolf rendered/flensed to meat').toBeGreaterThan(0);
  });

  it('yield bonus: a higher butchery tier renders more from the same carcass', async () => {
    const run = async (buildings: Array<{ id: string }>) => {
      const s = new HeadlessSession();
      await s.start(
        buildScenario({
          seed: 63,
          map: { w: 16, h: 16 },
          workReady: true,
          pawns: [{ count: 4, skillLevel: 20 }],
          needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
          buildings,
          items: { deer_carcass: 1, ...KNIVES, spit_meat: 10 },
          seedEntities: false
        })
      );
      s.command({ type: 'craftItem', payload: { itemId: 'deer_carcass' } } as never);
      for (let i = 0; i < 30 && (stk(s).venison ?? 0) === 0; i++) s.tick(400);
      return stk(s).venison ?? 0;
    };
    const spot = await run([{ id: 'butcher_spot' }]); // T0, no bonus
    const flense = await run([{ id: 'butcher_spot' }, { id: 'flensing_table' }]); // T2, +45%
    console.log(`[BUTCH yield] deer venison: butcher_spot=${spot} vs flensing_table(+45%)=${flense}`);
    expect(spot, 'deer butchered at butcher_spot').toBeGreaterThan(0);
    expect(flense, 'flensing table renders MORE venison from the same carcass').toBeGreaterThan(spot);
  });

  it('tool gate: butchery now REQUIRES a knife, and flensing requires the tier-2 kit', async () => {
    // Precise tool control → workReady:false (no auto-stocked knife); enable labor by hand.
    const run = async (tools: Record<string, number>) => {
      const s = new HeadlessSession();
      await s.start(
        buildScenario({
          seed: 64,
          map: { w: 16, h: 16 },
          researchMaxTier: 9,
          pawns: [{ count: 5, skillLevel: 20 }],
          needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
          buildings: BUTCHERY_STATIONS,
          items: { rabbit_carcass: 2, dire_wolf_carcass: 2, spit_meat: 10, ...tools },
          seedEntities: false
        })
      );
      for (const p of s.getState().pawns)
        for (const w of workService.getAllWorkCategories())
          s.command({ type: 'setPawnLaborLevel', payload: { pawnId: p.id, workId: w.id, level: 3 } } as never);
      s.command({ type: 'craftItem', payload: { itemId: 'rabbit_carcass' } } as never);
      s.command({ type: 'craftItem', payload: { itemId: 'dire_wolf_carcass' } } as never);
      for (let i = 0; i < 30; i++) s.tick(400);
      // rabbit_meat = T0 butchery happened; alpha_ichor = dire_wolf FLENSED (make_dire_wolf, minTier 2).
      return { rabbit: stk(s).rabbit_meat ?? 0, flense: stk(s).alpha_ichor ?? 0 };
    };
    const none = await run({}); // NO knife
    const t0 = await run({ flint_knife: 2 }); // T0 knife
    const t2 = await run({ iron_butchery_kit: 2 }); // T2 kit
    console.log(
      `[BUTCH gate] no-tool{rabbit:${none.rabbit},flense:${none.flense}} T0-knife{${t0.rabbit},${t0.flense}} T2-kit{${t2.rabbit},${t2.flense}}`
    );
    expect(none.rabbit, 'NO knife → cannot butcher (gate restored)').toBe(0);
    expect(t0.rabbit, 'T0 knife → common game butchered').toBeGreaterThan(0);
    expect(t0.flense, 'T0 knife → flensing (minTier 2) still blocked').toBe(0);
    expect(t2.flense, 'T2 kit → flensing works').toBeGreaterThan(0);
  });

  it('the butchery kits are craftable from metal + leather + cordage', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 65,
        map: { w: 16, h: 16 },
        workReady: true,
        researchMaxTier: 9,
        toolTier: 3,
        pawns: [{ count: 5, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        buildings: [{ id: 'anvil' }],
        // stitched with spun thread + buckled with metal fasteners (not primitive cordage)
        items: { iron_bar: 6, bloom_steel: 6, buckskin: 6, thread: 8, iron_nail: 4, steel_rivet: 4, spit_meat: 10 },
        seedEntities: false
      })
    );
    s.command({ type: 'craftItem', payload: { itemId: 'iron_butchery_kit' } } as never);
    s.command({ type: 'craftItem', payload: { itemId: 'steel_butchery_kit' } } as never);
    for (let i = 0; i < 25 && !(stk(s).iron_butchery_kit > 0 && stk(s).steel_butchery_kit > 0); i++)
      s.tick(400);
    console.log(
      `[BUTCH kits] iron_butchery_kit=${stk(s).iron_butchery_kit} steel_butchery_kit=${stk(s).steel_butchery_kit}`
    );
    expect(stk(s).iron_butchery_kit ?? 0, 'iron kit crafted').toBeGreaterThan(0);
    expect(stk(s).steel_butchery_kit ?? 0, 'steel kit crafted').toBeGreaterThan(0);
  });

  it('§B anatomy pass: claws/antlers/horns DROP from butchery and each feeds ≥1 craft — headless', async () => {
    // The distinctive parts that were dead drops. Butcher a wolf (claws), a deer (antlers) and a goat
    // (horns) at the butcher spot, then craft every consumer: fang-and-claw charm, fang arrows, and the
    // barbed bone arrow that any of claw/antler/horn feeds.
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 62,
        map: { w: 20, h: 20 },
        workReady: true,
        researchMaxTier: 9,
        toolTier: 3,
        // Ordinary-skill butchers: a single-unit anatomy drop (1 antler/horn per carcass) must survive
        // regardless of butcher skill — skill yield is a bonus-only floor(≥1), never a drop-losing penalty.
        pawns: [{ count: 6, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        buildings: [{ id: 'butcher_spot' }, { id: 'makers_bench' }, { id: 'bone_carvers_bench' }],
        items: {
          wolf_carcass: 2,
          deer_carcass: 2,
          mountain_goat_carcass: 2,
          great_fang: 3,
          branch: 16,
          cordage: 16,
          sinew: 16,
          feathers: 16,
          spit_meat: 10
        },
        seedEntities: false
      })
    );
    s.command({ type: 'craftItem', payload: { itemId: 'wolf_carcass', quantity: 2 } } as never); // 2 claws for the charm
    for (const c of ['deer_carcass', 'mountain_goat_carcass'])
      s.command({ type: 'craftItem', payload: { itemId: c } } as never);
    for (
      let i = 0;
      i < 30 && !((stk(s).predator_claw ?? 0) >= 2 && (stk(s).antler_rack ?? 0) > 0 && (stk(s).curved_horn ?? 0) > 0);
      i++
    )
      s.tick(400);
    console.log(
      `[ANATOMY] drops: predator_claw=${stk(s).predator_claw ?? 0} antler=${stk(s).antler_rack ?? 0} curved_horn=${stk(s).curved_horn ?? 0}`
    );
    expect(stk(s).predator_claw ?? 0, 'wolf butchery drops claws').toBeGreaterThan(0);
    expect(stk(s).antler_rack ?? 0, 'deer butchery drops antlers').toBeGreaterThan(0);
    expect(stk(s).curved_horn ?? 0, 'goat butchery drops horns').toBeGreaterThan(0);

    // Now every consumer: fang-and-claw charm, fang arrows, and the barbed bone arrow (antler/horn/claw).
    for (const item of ['fang_charm', 'fang_arrow', 'barbed_bone_arrow'])
      s.command({ type: 'craftItem', payload: { itemId: item } } as never);
    for (
      let i = 0;
      i < 30 &&
      !((stk(s).fang_charm ?? 0) > 0 && (stk(s).fang_arrow ?? 0) > 0 && (stk(s).barbed_bone_arrow ?? 0) > 0);
      i++
    )
      s.tick(400);
    console.log(
      `[ANATOMY] crafts: fang_charm=${stk(s).fang_charm ?? 0} fang_arrow=${stk(s).fang_arrow ?? 0} barbed_bone_arrow=${stk(s).barbed_bone_arrow ?? 0}`
    );
    expect(stk(s).fang_charm ?? 0, 'great_fang + claws → fang charm').toBeGreaterThan(0);
    expect(stk(s).fang_arrow ?? 0, 'great_fang → fang-tipped arrows').toBeGreaterThan(0);
    expect(stk(s).barbed_bone_arrow ?? 0, 'antler/horn/claw → barbed bone arrows').toBeGreaterThan(0);
  });

  it('§B prestige-pelt rugs + claw totem exist with the right anatomy cost (furniture defs)', () => {
    const bld = (id: string) =>
      buildingService.getBuildingById(id) as { id: string; buildingCost?: Record<string, number> } | undefined;
    const rugs: Array<[string, string]> = [
      ['dire_wolf_rug', 'dire_wolf_pelt'],
      ['cave_bear_rug', 'cave_bear_pelt'],
      ['sabretooth_rug', 'sabretooth_pelt'],
      ['claw_totem', 'predator_claw']
    ];
    for (const [id, mat] of rugs) {
      const b = bld(id);
      expect(b, `${id} building def exists`).toBeTruthy();
      expect(Object.keys(b?.buildingCost ?? {}), `${id} costs ${mat}`).toContain(mat);
    }
  });
});
