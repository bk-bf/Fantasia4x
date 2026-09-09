import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';

const stockOf = (s: HeadlessSession) => (s.getState().stockpile ?? {}) as Record<string, number>;

describe('war bow and hunting recurve stave (HeadlessSession, real ticks)', () => {
  it('one war bow and one hunting recurve each consume exactly one stave log', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 41,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        workReady: true,
        pawns: [{ count: 6, skillLevel: 18 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'makers_bench' }],
        items: { ash_log: 20, branch: 20, sinew: 40 },
        seedEntities: false
      })
    );

    const before = { ...stockOf(session) };
    for (const itemId of ['war_bow', 'hunting_recurve'])
      session.command({ type: 'craftItem', payload: { itemId, quantity: 1 } } as never);
    for (let i = 0; i < 80; i++) {
      const s = stockOf(session);
      if ((s.war_bow ?? 0) && (s.hunting_recurve ?? 0)) break;
      session.tick(400);
    }
    const after = stockOf(session);

    console.log(
      `[STAVE] turn=${session.getState().turn} ash_log ${before.ash_log}→${after.ash_log} ` +
        `branch ${before.branch}→${after.branch} sinew ${before.sinew}→${after.sinew} | ` +
        `war_bow ${after.war_bow} hunting_recurve ${after.hunting_recurve}`
    );

    expect(after.war_bow, 'the war bow crafts').toBe(1);
    expect(after.hunting_recurve, 'the recurve crafts').toBe(1);
    expect(
      before.ash_log - after.ash_log,
      'one stave log per bow, no double count against the base recipe'
    ).toBe(2);
  });
});
