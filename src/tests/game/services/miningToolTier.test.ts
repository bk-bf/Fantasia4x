import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';

/**
 * TOOL-TIER PARITY audit (§310), headless. A parity sweep found the ore nodes for iron/lead/gold/gems and
 * the magic vents demand mining `minTier: 2–3`, but only `stone_pick` (tier 0, post tin re-tier) existed — so the entire iron
 * age + gems were UN-MINEABLE (the butchery-gate bug class, uncaught because the ore audit stocked ore
 * directly). Fix: added `iron_pick` (tier 2) + `steel_pick` (tier 3). This drives the gate on a real hematite
 * node: a stone pick can't touch it, an iron pick can.
 */
const stk = (s: HeadlessSession) => (s.getState().stockpile ?? {}) as Record<string, number>;

describe('mining tool-tier gate (iron/steel pick)', () => {
  const mineHematiteWith = async (tool: string) => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 130,
        map: { w: 18, h: 18 },
        researchMaxTier: 9,
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        pawns: [{ count: 4, skillLevel: 20 }], // founders default to mining labor level 2
        items: { [tool]: 3, spit_meat: 10 },
        seedEntities: false
      })
    );
    // spawn a hematite ore vein a couple of tiles from the pawn cluster and mark it for harvest.
    const p = s.getState().pawns[0];
    const ox = (p.position?.x ?? 9) + 2;
    const oy = p.position?.y ?? 9;
    s.command({
      type: 'devSpawnResourceAt',
      payload: { resourceId: 'hematite', x: ox, y: oy }
    } as never);
    s.command({ type: 'designate', payload: { x: ox, y: oy, type: 'harvest' } } as never);
    for (let i = 0; i < 30 && (stk(s).hematite ?? 0) === 0; i++) s.tick(200);
    return stk(s).hematite ?? 0;
  };

  it('a STONE pick (tier 0) cannot mine hematite (demands mining tier 2) — the gap that existed', async () => {
    const mined = await mineHematiteWith('stone_pick');
    console.log(`[MINE gate] stone_pick (tier 0) → hematite=${mined}`);
    expect(mined, 'a tier-1 pick cannot work a tier-2 ore vein — the gate holds').toBe(0);
  });

  it('an IRON pick (tier 2) CAN mine hematite — the added tool closes the gap', async () => {
    const mined = await mineHematiteWith('iron_pick');
    console.log(`[MINE gate] iron_pick (tier 2) → hematite=${mined}`);
    expect(mined, 'the new tier-2 pick can work the tier-2 ore vein').toBeGreaterThan(0);
  });
});
