import { it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import type { LimbState } from '$lib/game/core/types';

function bleedingWithoutLimbRate(limbs: LimbState[] | undefined): number {
  let breaks = 0;
  for (const l of limbs ?? []) {
    if ((l.bleedRate ?? 0) > 0) continue;
    for (const p of l.parts ?? []) if (p.injuries.some((w) => w.bleeding > 0)) breaks++;
  }
  return breaks;
}

it('a limb with a bleeding wound always carries a bleed rate, through a fight with wild creatures', async () => {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed: 11,
      map: { w: 64, h: 64, preset: 'generated' },
      researchMaxTier: 9,
      toolTier: 3,
      infiniteFuel: true,
      workReady: true,
      pawns: [{ count: 6, skillLevel: 20 }],
      spawnMobs: [{ count: 40 }],
      seedEntities: true
    })
  );
  let breaks = 0;
  let bleedingLimbs = 0;
  for (let i = 0; i < 24; i++) {
    s.tick(50);
    const st = s.getState();
    for (const e of [...st.pawns, ...(st.mobs ?? [])]) {
      breaks += bleedingWithoutLimbRate(e.limbs);
      bleedingLimbs += (e.limbs ?? []).filter((l) => (l.bleedRate ?? 0) > 0).length;
    }
  }
  expect(bleedingLimbs, 'the fight drew blood, so the check saw bleeding limbs').toBeGreaterThan(0);
  expect(breaks).toBe(0);
});
