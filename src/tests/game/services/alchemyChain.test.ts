import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';

/**
 * ALCHEMY / MATERIAL-SINK AUDIT (headless). Magical creatures should yield ALCHEMY reagents (not plain
 * meat). Grimeling (Bog Ooze) previously had NO butchery recipe; now render_grimeling → caustic_bile →
 * brew_caustic_coating (a nausea coating). Drives the whole chain with real pawns.
 */
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
        buildings: [{ id: 'butcher_spot' }, { id: 'alchemy_lab' }],
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
    // 1. render the bog ooze → caustic_bile
    s.command({ type: 'craftItem', payload: { itemId: 'grimeling_carcass' } } as never);
    for (let i = 0; i < 20 && (stk(s).caustic_bile ?? 0) === 0; i++) s.tick(400);
    const bile = stk(s).caustic_bile ?? 0;
    // 2. brew the coating from the bile
    s.command({ type: 'craftItem', payload: { itemId: 'caustic_coating' } } as never);
    for (let i = 0; i < 20 && (stk(s).caustic_coating ?? 0) === 0; i++) s.tick(400);
    console.log(
      `[ALCH] grimeling → caustic_bile ${bile} → caustic_coating ${stk(s).caustic_coating ?? 0} @turn ${s.getState().turn}`
    );
    expect(bile, 'grimeling rendered to caustic_bile (was a dead carcass)').toBeGreaterThan(0);
    expect(stk(s).caustic_coating ?? 0, 'bile brewed into caustic_coating').toBeGreaterThan(0);
  });
});
