import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import type { Pawn } from '$lib/game/core/types';

async function run(soap: number) {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed: 44,
      map: { w: 16, h: 16 },
      workReady: true,
      researchMaxTier: 9,
      toolTier: 3,
      pawns: [{ count: 3, skillLevel: 15 }],
      needsDisabled: ['hunger', 'fatigue', 'thirst'],
      buildings: [{ id: 'craft_spot' }, { id: 'well' }],
      items: soap ? { soap } : {},
      seedEntities: false
    })
  );
  const ps = () => s.getState().pawns as Pawn[];
  let area = 0;
  let cleanTicks = 0;
  for (let i = 0; i < 60; i++) {
    s.tick(300);
    const p = ps();
    area += p.reduce((n, x) => n + (x.needs?.hygiene ?? 0), 0) / p.length;
    cleanTicks += p.filter((x) => (x.conditionTimers?.clean ?? 0) > 0).length;
  }
  const stk = (s.getState() as unknown as { stockpile?: Record<string, number> }).stockpile ?? {};
  return { mean: area / 60, cleanTicks, soapLeft: stk.soap ?? 0 };
}

describe('soap', () => {
  it('a wash with soap holds the grime off; without it the meter climbs straight back', async () => {
    const withSoap = await run(20);
    const without = await run(0);
    console.log(
      `[SOAP] with soap: mean grime ${withSoap.mean.toFixed(1)}, clean pawn-ticks ${withSoap.cleanTicks}, soap 20→${withSoap.soapLeft}\n` +
        `[SOAP] no soap:   mean grime ${without.mean.toFixed(1)}, clean pawn-ticks ${without.cleanTicks}`
    );
    expect(withSoap.soapLeft, 'washing actually spent soap').toBeLessThan(20);
    expect(withSoap.cleanTicks, 'pawns carried the Clean condition').toBeGreaterThan(0);
    expect(without.cleanTicks, 'and never do without soap').toBe(0);
    const s2 = new HeadlessSession();
    await s2.start(
      buildScenario({
        seed: 44,
        map: { w: 12, h: 12 },
        workReady: true,
        researchMaxTier: 9,
        toolTier: 3,
        pawns: [{ count: 2, skillLevel: 15 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst'],
        buildings: [{ id: 'craft_spot' }],
        items: {},
        seedEntities: false
      })
    );
    s2.tick(50);
    const [a, b] = s2.getState().pawns as Pawn[];
    a.conditionTimers = { ...(a.conditionTimers ?? {}), clean: 18000 };
    const a0 = a.needs?.hygiene ?? 0;
    const b0 = b.needs?.hygiene ?? 0;
    for (let i = 0; i < 20; i++) s2.tick(300);
    const [a1, b1] = s2.getState().pawns as Pawn[];
    const aDelta = (a1.needs?.hygiene ?? 0) - a0;
    const bDelta = (b1.needs?.hygiene ?? 0) - b0;
    console.log(
      `[SOAP] over 6000 ticks — clean pawn grime +${aDelta.toFixed(1)}, untreated pawn +${bDelta.toFixed(1)}`
    );
    expect(aDelta, 'a clean pawn accrues no grime').toBeCloseTo(0, 1);
    expect(bDelta, 'an untreated one does').toBeGreaterThan(5);
  }, 300000);
});
