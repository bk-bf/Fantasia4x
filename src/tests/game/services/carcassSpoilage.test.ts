import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';

/**
 * SPOILED-CARCASS YIELD audit (headless, §233). A carcass carries a per-unit FRESHNESS meter
 * (`unitConditions` 0–100) that erodes over time (decayAll, ItemService); butchery output is scaled by
 * `conditionMult = unitConditions[0]/100` (craft.ts) — so a stale carcass renders less meat. At full rot
 * a carcass decays to `rotten_carcass`, which now butchers into rotten meat/hide (compost feedstock).
 * Scenario carcasses spawn fresh, so `devSetDropCondition` stamps the meter a real kill would carry.
 */
const stk = (s: HeadlessSession) => (s.getState().stockpile ?? {}) as Record<string, number>;

describe('carcass spoilage → butchery yield', () => {
  it('a stale carcass renders proportionally LESS than a fresh one (same skill, same station)', async () => {
    const venisonAt = async (condition: number) => {
      const s = new HeadlessSession();
      await s.start(
        buildScenario({
          seed: 80,
          map: { w: 16, h: 16 },
          workReady: true,
          researchMaxTier: 9,
          toolTier: 3,
          pawns: [{ count: 4, skillLevel: 25 }], // fixed skill so butchery_yield is constant across runs
          needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
          buildings: [{ id: 'butcher_spot' }],
          items: { deer_carcass: 1, spit_meat: 10 },
          seedEntities: false
        })
      );
      s.command({
        type: 'devSetDropCondition',
        payload: { resourceId: 'deer_carcass', condition }
      } as never);
      s.command({ type: 'craftItem', payload: { itemId: 'deer_carcass' } } as never);
      for (let i = 0; i < 25 && (stk(s).venison ?? 0) === 0; i++) s.tick(400);
      return stk(s).venison ?? 0;
    };
    const fresh = await venisonAt(100); // full freshness
    const stale = await venisonAt(40); // 60% spoiled
    console.log(`[SPOIL yield] venison: fresh(100%)=${fresh} vs stale(40%)=${stale}`);
    expect(fresh, 'a fresh carcass renders meat').toBeGreaterThan(0);
    expect(
      stale,
      'a 40%-fresh carcass renders clearly less — spoilage scales the yield'
    ).toBeLessThan(fresh);
    // roughly proportional: 40% freshness should land near 40% of the fresh yield (allow rng-carry slack).
    expect(stale).toBeGreaterThanOrEqual(Math.floor(fresh * 0.25));
    expect(stale).toBeLessThanOrEqual(Math.ceil(fresh * 0.6));
  });

  it('the spoilage clock actually erodes a carcass in the warm (freshness falls over time)', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 81,
        map: { w: 16, h: 16 },
        workReady: true,
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        pawns: [{ count: 2 }],
        buildings: [{ id: 'butcher_spot' }],
        items: { deer_carcass: 1 },
        seedEntities: false
      })
    );
    s.command({ type: 'setSeason', payload: { season: 'summer' } } as never); // warm → carcasses rot
    s.command({
      type: 'devSetDropCondition',
      payload: { resourceId: 'deer_carcass', condition: 100 }
    } as never);
    const cond = () => {
      const d = (
        (
          s.getState() as {
            droppedItems?: Array<{ resourceId: string; unitConditions?: number[] }>;
          }
        ).droppedItems ?? []
      ).find((x) => x.resourceId === 'deer_carcass');
      return d?.unitConditions?.[0] ?? -1;
    };
    const before = cond();
    for (let i = 0; i < 30; i++) s.tick(400); // ~12000 ticks of warm rot
    const after = cond();
    console.log(`[SPOIL clock] deer_carcass freshness ${before} → ${after} over ~12000 warm ticks`);
    expect(before, 'started fresh').toBe(100);
    expect(after, 'the freshness meter erodes over time in the warm').toBeLessThan(before);
  });

  it('a fully-rotted carcass butchers into ROTTEN meat/hide (compost feedstock), not good meat', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 82,
        map: { w: 16, h: 16 },
        workReady: true,
        researchMaxTier: 9,
        toolTier: 3,
        pawns: [{ count: 4, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        buildings: [{ id: 'butcher_spot' }],
        items: { rotten_carcass: 2, spit_meat: 10 },
        seedEntities: false
      })
    );
    s.command({ type: 'craftItem', payload: { itemId: 'rotten_carcass' } } as never);
    for (let i = 0; i < 25 && (stk(s).rotten_meat ?? 0) === 0; i++) s.tick(400);
    console.log(
      `[SPOIL rotten] rotten_carcass → rotten_meat=${stk(s).rotten_meat ?? 0} rotten_hide=${stk(s).rotten_hide ?? 0}; good venison=${stk(s).venison ?? 0}`
    );
    expect(
      stk(s).rotten_meat ?? 0,
      'a rotten carcass renders rotten meat for compost'
    ).toBeGreaterThan(0);
    expect(stk(s).venison ?? 0, 'and NO good meat').toBe(0);
  });
});
