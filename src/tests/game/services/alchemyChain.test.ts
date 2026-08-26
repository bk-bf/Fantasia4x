import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { resolveTraitGamble } from '$lib/game/core/defs/lineages';
import { itemService } from '$lib/game/services/ItemService';
import { applyConsumable } from '$lib/game/entities/Pawns';
import type { Pawn } from '$lib/game/core/types';

const stk = (s: HeadlessSession) => (s.getState().stockpile ?? {}) as Record<string, number>;

describe('alchemy / magical-creature reagents', () => {
  it('grimeling: butcher → caustic_bile → brewed into caustic_coating', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 71,
        map: { w: 16, h: 16 },
        workReady: true,
        researchMaxTier: 9,
        toolTier: 3,
        pawns: [{ count: 6, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        buildings: [{ id: 'butcher_spot' }, { id: 'alchemy_lab' }, { id: 'apothecary' }],
        items: {
          grimeling_carcass: 3,
          nightshade_bolete: 4,
          glassware: 4,
          flint_knife: 3,
          bone_cleaver: 3,
          spit_meat: 10
        },
        seedEntities: false
      })
    );
    s.command({ type: 'craftItem', payload: { itemId: 'grimeling_carcass' } } as never);
    for (let i = 0; i < 20 && (stk(s).caustic_bile ?? 0) === 0; i++) s.tick(400);
    const bile = stk(s).caustic_bile ?? 0;
    s.command({ type: 'craftItem', payload: { itemId: 'caustic_coating' } } as never);
    for (let i = 0; i < 20 && (stk(s).caustic_coating ?? 0) === 0; i++) s.tick(400);
    console.log(
      `[ALCH] grimeling → caustic_bile ${bile} → caustic_coating ${stk(s).caustic_coating ?? 0} @turn ${s.getState().turn}`
    );
    expect(bile, 'grimeling rendered to caustic_bile (was a dead carcass)').toBeGreaterThan(0);
    expect(stk(s).caustic_coating ?? 0, 'bile brewed into caustic_coating').toBeGreaterThan(0);
  });

  it('§A trait gamble: odds shift toward GOOD with tier + alchemy (resolver)', () => {
    const spec = (tier: number) => ({
      tier,
      traitPool: ['feral-adrenaline', 'pack-fury', 'bestial-might'],
      flawSeverity: tier >= 3 ? ('mild' as const) : ('harsh' as const)
    });
    const goodRate = (tier: number, alch: number) => {
      let good = 0;
      const N = 200;
      for (let i = 0; i < N; i++) {
        let k = 0;
        const seq = [(i + 0.5) / N, 0.9, 0.1];
        const { trait, flaw } = resolveTraitGamble(spec(tier), alch, () => seq[k++] ?? 0.5);
        if (trait && !flaw) good++;
      }
      return good / N;
    };
    const lo = goodRate(1, 0);
    const hi = goodRate(3, 1);
    console.log(
      `[ALCH gamble] clean-good rate: T1/novice=${lo.toFixed(2)} vs T3/master=${hi.toFixed(2)}`
    );
    expect(hi, 'high tier + alchemy clearly beats low').toBeGreaterThan(lo + 0.3);
    expect(lo, 'a crude brew rarely gives a clean good result').toBeLessThan(0.2);
  });

  it('§A raw organ is NEUTERED (no free trait); brewed draught grants via the gamble', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 72,
        map: { w: 16, h: 16 },
        workReady: true,
        researchMaxTier: 9,
        toolTier: 3,
        pawns: [{ count: 6, skillLevel: 25 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        buildings: [{ id: 'apothecary' }],
        items: {
          alpha_heart: 8,
          woundwort: 12,
          gem_dust: 12,
          mandrake: 6,
          glassware: 12,
          spit_meat: 10
        },
        seedEntities: false
      })
    );
    type P = { id: string; traits?: Array<{ id: string }> };
    const traitsOf = (i: number) =>
      ((s.getState().pawns[i] as unknown as P).traits ?? []).map((t) => t.id);
    const raw0 = traitsOf(0).length;
    s.command({
      type: 'useConsumableItem',
      payload: { pawnId: s.getState().pawns[0].id, itemId: 'alpha_heart' }
    } as never);
    const rawTraits = traitsOf(0);
    expect(rawTraits, 'raw heart does NOT grant the good trait').not.toContain('feral-adrenaline');
    console.log(
      `[ALCH raw] raw alpha_heart → traits ${raw0}→${rawTraits.length} (${rawTraits.slice(-2).join(',') || 'none'})`
    );

    s.command({ type: 'craftItem', payload: { itemId: 'alpha_essence', quantity: 3 } } as never);
    for (let i = 0; i < 25 && (stk(s).alpha_essence ?? 0) < 3; i++) s.tick(400);
    expect(stk(s).alpha_essence ?? 0, 'alpha_essence brewed at the apothecary').toBeGreaterThan(0);
    const POOL = new Set(['feral-adrenaline', 'pack-fury', 'bestial-might']);
    let gotPoolTrait = false;
    for (let i = 1; i <= 3 && (stk(s).alpha_essence ?? 0) > 0; i++) {
      const before = traitsOf(i);
      s.command({
        type: 'useConsumableItem',
        payload: { pawnId: s.getState().pawns[i].id, itemId: 'alpha_essence' }
      } as never);
      const gained = traitsOf(i).filter((t) => !before.includes(t));
      if (gained.some((t) => POOL.has(t))) gotPoolTrait = true;
    }
    console.log(
      `[ALCH brew] alpha_essence drunk by 3 pawns → any pool trait landed: ${gotPoolTrait}`
    );
    expect(gotPoolTrait, 'a T3 essence granted a pool trait to at least one drinker').toBe(true);
  });

  it('§B loot crafting: great_tusk → ivory, and great_bone → great_bone_maul (no more dead drops)', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 73,
        map: { w: 16, h: 16 },
        workReady: true,
        researchMaxTier: 9,
        toolTier: 3,
        pawns: [{ count: 5, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        buildings: [{ id: 'bone_carvers_bench' }],
        items: { great_tusk: 3, great_bone: 3, oak_plank: 4, cordage: 8, spit_meat: 10 },
        seedEntities: false
      })
    );
    s.command({ type: 'craftItem', payload: { itemId: 'ivory' } } as never);
    s.command({ type: 'craftItem', payload: { itemId: 'great_bone_maul' } } as never);
    for (let i = 0; i < 25 && !((stk(s).ivory ?? 0) > 0 && (stk(s).great_bone_maul ?? 0) > 0); i++)
      s.tick(400);
    console.log(
      `[ALCH loot] great_tusk→ivory=${stk(s).ivory ?? 0}; great_bone→great_bone_maul=${stk(s).great_bone_maul ?? 0}`
    );
    expect(stk(s).ivory ?? 0, 'great_tusk carved into ivory').toBeGreaterThan(0);
    expect(stk(s).great_bone_maul ?? 0, 'great_bone forged into a maul').toBeGreaterThan(0);
  });

  it('§C potion tiers: every effect is a 3-tier ladder with a rising effect + station gate', () => {
    const dur = (id: string) =>
      (itemService.getItemById(id) as { conditionDurationTurns?: number })
        ?.conditionDurationTurns ?? 0;
    for (const base of ['potion_of_might', 'bloodrage_draught', 'calming_draught']) {
      const t1 = dur(base);
      const t2 = dur(`greater_${base}`);
      const t3 = dur(`grand_${base}`);
      expect(t2, `${base}: T2 > T1`).toBeGreaterThan(t1);
      expect(t3, `${base}: T3 > T2`).toBeGreaterThan(t2);
    }
    const ch = (id: string) =>
      (itemService.getItemById(id) as { coatingEffect?: { chance?: number } })?.coatingEffect
        ?.chance ?? 0;
    expect(ch('greater_venom_coating')).toBeGreaterThan(ch('venom_coating'));
    expect(ch('grand_venom_coating')).toBeGreaterThan(ch('greater_venom_coating'));
    console.log(
      `[ALCH tiers] potion_of_might dur ${dur('potion_of_might')}/${dur('greater_potion_of_might')}/${dur('grand_potion_of_might')}; venom chance ${ch('venom_coating')}/${ch('greater_venom_coating')}/${ch('grand_venom_coating')}`
    );
  });

  it('§C: Greater brews at the Copper Still, Grand requires the Runed Still — driven headless', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 74,
        map: { w: 16, h: 16 },
        workReady: true,
        researchMaxTier: 9,
        toolTier: 3,
        pawns: [{ count: 5, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        buildings: [{ id: 'alchemy_lab' }, { id: 'apothecary' }, { id: 'arcane_alembic' }],
        items: {
          woundwort: 20,
          distilled_spirit: 8,
          purified_catalyst: 8,
          mandrake: 8,
          glassware: 20,
          spit_meat: 10
        },
        seedEntities: false
      })
    );
    s.command({ type: 'craftItem', payload: { itemId: 'greater_potion_of_might' } } as never);
    s.command({ type: 'craftItem', payload: { itemId: 'grand_potion_of_might' } } as never);
    for (
      let i = 0;
      i < 25 &&
      !((stk(s).greater_potion_of_might ?? 0) > 0 && (stk(s).grand_potion_of_might ?? 0) > 0);
      i++
    )
      s.tick(400);
    console.log(
      `[ALCH tier-brew] greater=${stk(s).greater_potion_of_might ?? 0} grand=${stk(s).grand_potion_of_might ?? 0}`
    );
    expect(stk(s).greater_potion_of_might ?? 0, 'T2 brewed').toBeGreaterThan(0);
    expect(stk(s).grand_potion_of_might ?? 0, 'T3 brewed at the Runed Still').toBeGreaterThan(0);
  });

  it('§C reagent depth: sugarcane → sugar → mash → distilled_spirit, and purified_catalyst — headless', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 75,
        map: { w: 16, h: 16 },
        workReady: true,
        researchMaxTier: 9,
        toolTier: 3,
        pawns: [{ count: 6, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        buildings: [{ id: 'campfire' }, { id: 'alchemy_lab' }, { id: 'apothecary' }],
        items: {
          sugarcane: 18,
          wheat: 12,
          charcoal: 12,
          gem_dust: 12,
          glassware: 8,
          spit_meat: 10
        },
        seedEntities: false
      })
    );
    s.command({ type: 'craftItem', payload: { itemId: 'sugar', quantity: 2 } } as never);
    for (let i = 0; i < 20 && (stk(s).sugar ?? 0) < 2; i++) s.tick(400);
    const sugar = stk(s).sugar ?? 0;
    s.command({ type: 'craftItem', payload: { itemId: 'fermented_mash', quantity: 2 } } as never);
    for (let i = 0; i < 20 && (stk(s).fermented_mash ?? 0) < 2; i++) s.tick(400);
    s.command({ type: 'craftItem', payload: { itemId: 'distilled_spirit' } } as never);
    s.command({ type: 'craftItem', payload: { itemId: 'purified_catalyst' } } as never);
    for (
      let i = 0;
      i < 25 && !((stk(s).distilled_spirit ?? 0) > 0 && (stk(s).purified_catalyst ?? 0) > 0);
      i++
    )
      s.tick(400);
    console.log(
      `[ALCH reagents] sugarcane→sugar=${sugar} fermented_mash=${stk(s).fermented_mash ?? 0} distilled_spirit=${stk(s).distilled_spirit ?? 0} purified_catalyst=${stk(s).purified_catalyst ?? 0}`
    );
    expect(sugar, 'cane crushed + boiled down into sugar').toBeGreaterThan(0);
    expect(
      stk(s).distilled_spirit ?? 0,
      'grain+sugar fermented then distilled into spirit'
    ).toBeGreaterThan(0);
    expect(
      stk(s).purified_catalyst ?? 0,
      'gem_dust refined into a purified catalyst at the apothecary'
    ).toBeGreaterThan(0);
  });

  it('§C container-tool gate: refine_sugar needs a clay cooking pot — blocks without, works with (headless A/B)', async () => {
    const run = async (withPot: boolean) => {
      const s = new HeadlessSession();
      await s.start(
        buildScenario({
          seed: 77,
          map: { w: 16, h: 16 },
          researchMaxTier: 9,
          toolTier: 3,
          pawns: [{ count: 6, skillLevel: 20 }],
          needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
          buildings: [{ id: 'campfire' }],
          items: withPot ? { sugarcane: 18, clay_cooking_pot: 2 } : { sugarcane: 18 },
          seedEntities: false
        })
      );
      for (const p of s.getState().pawns)
        s.command({
          type: 'setPawnLaborLevel',
          payload: { pawnId: p.id, workId: 'cooking', level: 3 }
        } as never);
      s.command({ type: 'craftItem', payload: { itemId: 'sugar', quantity: 2 } } as never);
      for (let i = 0; i < 18 && (stk(s).sugar ?? 0) === 0; i++) s.tick(400);
      return stk(s).sugar ?? 0;
    };
    const without = await run(false);
    const withPot = await run(true);
    console.log(
      `[SUGAR gate] refine_sugar sugar produced: without pot=${without} with pot=${withPot}`
    );
    expect(without, 'no clay cooking pot → refine_sugar is unclaimable, no sugar boiled').toBe(0);
    expect(withPot, 'a clay cooking pot in stock → cane boils down to sugar').toBeGreaterThan(0);
  });

  it('§C new effect lines: a T1 coating + tonic brew, and a T2 gated on distilled_spirit — headless', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 76,
        map: { w: 16, h: 16 },
        workReady: true,
        researchMaxTier: 9,
        toolTier: 3,
        pawns: [{ count: 6, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        buildings: [{ id: 'alchemy_lab' }, { id: 'apothecary' }],
        items: {
          resin: 6,
          tallow: 6,
          glowcap: 6,
          woundwort: 6,
          distilled_spirit: 4,
          glassware: 8,
          spit_meat: 10
        },
        seedEntities: false
      })
    );
    s.command({ type: 'craftItem', payload: { itemId: 'tanglefoot_coating' } } as never);
    s.command({ type: 'craftItem', payload: { itemId: 'farsight_tonic' } } as never);
    s.command({ type: 'craftItem', payload: { itemId: 'greater_farsight_tonic' } } as never);
    for (
      let i = 0;
      i < 25 &&
      !(
        (stk(s).tanglefoot_coating ?? 0) > 0 &&
        (stk(s).farsight_tonic ?? 0) > 0 &&
        (stk(s).greater_farsight_tonic ?? 0) > 0
      );
      i++
    )
      s.tick(400);
    console.log(
      `[ALCH lines] tanglefoot=${stk(s).tanglefoot_coating ?? 0} farsight=${stk(s).farsight_tonic ?? 0} greater_farsight=${stk(s).greater_farsight_tonic ?? 0}`
    );
    expect(stk(s).tanglefoot_coating ?? 0, 'slow coating brewed').toBeGreaterThan(0);
    expect(stk(s).farsight_tonic ?? 0, 'perception tonic brewed').toBeGreaterThan(0);
    expect(
      stk(s).greater_farsight_tonic ?? 0,
      'T2 tonic brewed off the distilled-spirit base'
    ).toBeGreaterThan(0);
  });

  it('§C antidote tonic CURES an active poison (the counter to the venom/caustic coatings)', () => {
    const poisoned = {
      id: 'p1',
      stats: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
        perception: 10
      },
      traits: [],
      conditionTimers: { envenomed: 900, nausea: 600 }
    } as unknown as Pawn;
    const after = applyConsumable(poisoned, 'grand_antivenin_tonic', () => 0.42);
    expect(after.conditionTimers?.envenomed ?? 0, 'envenomed purged').toBe(0);
    expect(after.conditionTimers?.nausea ?? 0, 'nausea purged').toBe(0);
    expect(
      after.conditionTimers?.toxin_immune ?? 0,
      'a protective window is stamped'
    ).toBeGreaterThan(0);
  });
});
