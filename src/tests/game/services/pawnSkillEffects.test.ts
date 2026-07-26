import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { craftWorkCategory, craftDiscipline } from '$lib/game/services/jobs/craftDiscipline';
import { scaleWeaponQuality } from '$lib/game/core/itemQuality';
import { itemService } from '$lib/game/services/ItemService';

/**
 * PAWN SKILL EFFECTS audit (headless). Drives the REAL sim to check the skill→work loop:
 *  - skill SPEEDS a craft (getWorkModifiers.speed, work.ts per-tick rate)
 *  - skill RAISES output quality (§Q rollCraftQuality off getWorkModifiers.quality → per-drop tier)
 *  - butchery-craft yield vs skill (finding), + recipe→discipline routing (craftDiscipline)
 *  - zero-skill pawn still completes a T0 craft (no bootstrap deadlock)
 *  - quality flows into combat stats (scaleWeaponQuality — the function resolveHit calls)
 * Skill level is seeded per pawn-group (`skillLevel`/`skills` → devSetPawnSkills). levelBase(1)=0.6 …
 * levelBase(25)=1.0 (neutral) … levelBase(50)=2.0, so 1 vs 50 is a ~3.3× skill span.
 */
const stk = (s: HeadlessSession) => (s.getState().stockpile ?? {}) as Record<string, number>;
type Drop = { resourceId: string; quantity: number; quality?: number };
const drops = (s: HeadlessSession) => ((s.getState() as { droppedItems?: Drop[] }).droppedItems ?? []);
// Mean §Q tier across every crafted stack of `id` (quality-bearing drops never fold; undefined = Standard 1).
const meanQuality = (s: HeadlessSession, id: string) => {
  let q = 0;
  let n = 0;
  for (const d of drops(s))
    if (d.resourceId === id) {
      q += (d.quality ?? 1) * d.quantity;
      n += d.quantity;
    }
  return n ? q / n : NaN;
};

describe('pawn skill effects', () => {
  it('skill SPEEDS a craft: a master reaches the same output in far fewer ticks', async () => {
    const ticksToCordage = async (skillLevel: number, target: number) => {
      const s = new HeadlessSession();
      await s.start(
        buildScenario({
          seed: 90,
          map: { w: 16, h: 16 },
          workReady: true,
          pawns: [{ count: 3, skillLevel }],
          needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
          buildings: [{ id: 'craft_spot' }],
          items: { plant_fiber: 5 * target * 4, spit_meat: 10 },
          seedEntities: false
        })
      );
      s.command({ type: 'craftItem', payload: { itemId: 'cordage', quantity: target * 3 } } as never);
      let ticks = 0;
      while ((stk(s).cordage ?? 0) < target && ticks < 24000) {
        s.tick(100);
        ticks += 100;
      }
      return ticks;
    };
    const slow = await ticksToCordage(1, 6); // unskilled
    const fast = await ticksToCordage(50, 6); // master crafter
    console.log(`[SKILL speed] ticks to 6 cordage: skill1=${slow} vs skill50=${fast}`);
    expect(fast, 'a master crafter reaches the target in fewer ticks').toBeLessThan(slow);
  });

  it('skill RAISES output quality: a master rolls higher §Q tiers on the same tool', async () => {
    const batchQuality = async (skillLevel: number) => {
      const s = new HeadlessSession();
      await s.start(
        buildScenario({
          seed: 91,
          map: { w: 16, h: 16 },
          workReady: true,
          pawns: [{ count: 4, skillLevel }],
          needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
          buildings: [{ id: 'craft_spot' }], // flint tools knap here, tagged `knapping` (§D)
          items: { flint_shard: 60, branch: 60, cordage: 40, spit_meat: 10 },
          seedEntities: false
        })
      );
      const N = 14;
      s.command({ type: 'craftItem', payload: { itemId: 'flint_knife', quantity: N } } as never);
      for (let i = 0; i < 40 && (stk(s).flint_knife ?? 0) < 12; i++) s.tick(300);
      return { made: stk(s).flint_knife ?? 0, mean: meanQuality(s, 'flint_knife') };
    };
    const lo = await batchQuality(1);
    const hi = await batchQuality(50);
    console.log(
      `[SKILL quality] flint_knife mean tier: skill1=${lo.mean.toFixed(2)} (n=${lo.made}) vs skill50=${hi.mean.toFixed(2)} (n=${hi.made})`
    );
    expect(lo.made, 'unskilled colony still produced the batch').toBeGreaterThan(8);
    expect(hi.made, 'skilled colony still produced the batch').toBeGreaterThan(8);
    expect(hi.mean, 'a master rolls a higher average quality tier than an unskilled crafter').toBeGreaterThan(
      lo.mean + 0.5
    );
  });

  it('butchery SKILL is a yield BONUS: master renders more, unskilled still gets the full base', async () => {
    // craft.ts scales butchery output by the STATION bonus × the working pawn's `butchery_yield` axis,
    // FLOORED at ×1 — so a skilled butcher renders more, but an unskilled one still gets the full recipe
    // drop (never a sub-1 penalty that would round a qty-1 signature drop away). Only butchery has a yield
    // axis, so ordinary crafts are untouched.
    const venisonFor = async (butchery: number) => {
      const s = new HeadlessSession();
      await s.start(
        buildScenario({
          seed: 92,
          map: { w: 16, h: 16 },
          workReady: true,
          researchMaxTier: 9,
          toolTier: 3,
          pawns: [{ count: 4, skillLevel: 20, skills: { butchery } }],
          needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
          buildings: [{ id: 'butcher_spot' }],
          items: { deer_carcass: 1, spit_meat: 10 },
          seedEntities: false
        })
      );
      s.command({ type: 'craftItem', payload: { itemId: 'deer_carcass' } } as never);
      for (let i = 0; i < 25 && (stk(s).venison ?? 0) === 0; i++) s.tick(400);
      return stk(s).venison ?? 0;
    };
    const unskilled = await venisonFor(1);
    const master = await venisonFor(50);
    console.log(`[SKILL butchery-yield] venison: butchery1=${unskilled} (base) vs butchery50=${master} (bonus)`);
    // The FLOOR: an unskilled butcher renders AT LEAST the full recipe base (venison 10 at butcher_spot),
    // NOT a reduced amount — so a qty-1 rare drop can never be rounded away by low skill. (It renders a
    // little MORE than 10 here because the workReady butchery KIT's yield boost now applies — a good kit
    // helps regardless of skill; the point is the floor, never a sub-1 penalty.)
    expect(unskilled, 'unskilled butcher gets the full base drop or more (no sub-1 penalty)').toBeGreaterThanOrEqual(10);
    expect(master, 'a skilled butcher renders MORE off the same carcass than an unskilled one').toBeGreaterThan(unskilled);
    // recipe→discipline routing: a butcher-spot carcass order routes to the `butchery` LEAF discipline
    // (its own *_speed/_quality/_yield stats + tools apply), which nests under the Cooking parent category.
    expect(craftDiscipline({ item: { id: 'venison' }, stationType: 'butcher_spot' })).toBe('butchery');
    expect(craftWorkCategory({ item: { id: 'venison' }, stationType: 'butcher_spot' })).toBe('cooking');
    expect(craftWorkCategory({ item: { id: 'copper_bar' }, stationType: 'stone_forge' })).toBe('metalworking');
  });

  it('zero-skill pawn still completes a T0 craft — no bootstrap deadlock', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 93,
        map: { w: 16, h: 16 },
        workReady: true,
        pawns: [{ count: 3, skillLevel: 1 }], // rock-bottom skill
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        buildings: [{ id: 'craft_spot' }],
        items: { plant_fiber: 30, spit_meat: 10 },
        seedEntities: false
      })
    );
    s.command({ type: 'craftItem', payload: { itemId: 'cordage', quantity: 3 } } as never);
    for (let i = 0; i < 30 && (stk(s).cordage ?? 0) === 0; i++) s.tick(300);
    console.log(`[SKILL bootstrap] skill-1 colony cordage=${stk(s).cordage ?? 0} @turn ${s.getState().turn}`);
    expect(stk(s).cordage ?? 0, 'an unskilled colony can still bootstrap a T0 craft (slower, not stuck)').toBeGreaterThan(0);
  });

  it('quality flows DOWNSTREAM: §Q tier scales the weapon stats resolveHit reads', () => {
    // scaleWeaponQuality is the exact function Combat.attackerProfile calls on the equipped weapon's
    // stamped tier (Combat.ts §Q). A Crude blade is strictly weaker, a Masterwork strictly stronger.
    const wp = itemService.getItemById('steel_longsword')?.weaponProperties;
    expect(wp, 'steel_longsword has weapon properties').toBeTruthy();
    const dmg = (tier: 0 | 1 | 4) => scaleWeaponQuality(wp!, tier).damage ?? 0;
    console.log(`[SKILL downstream] steel_longsword damage by tier: crude=${dmg(0)} standard=${dmg(1)} masterwork=${dmg(4)}`);
    expect(dmg(0), 'Crude < Standard').toBeLessThan(dmg(1));
    expect(dmg(4), 'Masterwork > Standard').toBeGreaterThan(dmg(1));
  });
});
