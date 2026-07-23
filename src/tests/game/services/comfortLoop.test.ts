import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';

// HEADLESS end-to-end: an uncomfortable idle pawn seeks a SEAT, lounges, refills the `comfort` need, and
// gains the tiered `comfortable` condition. Drives the REAL sim (pawn FSM + need decay + condition driver).
describe('comfort loop — headless (pawn lounges on a seat → comfort fills → comfortable condition)', () => {
  it('a pawn with low comfort paths to a seat, lounges, and becomes comfortable', async () => {
    const state = buildScenario({
      seed: 11,
      map: { w: 18, h: 18 },
      researchMaxTier: 9,
      toolTier: 3,
      // start uncomfortable (below seek 35); freeze survival needs so nothing else pulls the pawn away.
      pawns: [{ count: 2, skillLevel: 10, needs: { comfort: 20, hunger: 5, fatigue: 5 } as never }],
      needsDisabled: ['hunger', 'fatigue'],
      buildings: [{ id: 'couch' }], // a real seat (comfort 0.7, buildingProperties.seat)
      seedEntities: false
    });
    const session = new HeadlessSession();
    await session.start(state);
    const p0 = () => session.getState().pawns[0];
    const comfort = () => p0().needs?.comfort ?? -1;
    const hasComfortable = () => (p0().conditions ?? []).some((c) => c.id === 'comfortable');
    const seatBuilt = (session.getState().buildings ?? []).some(
      (b) => (b as { type?: string }).type === 'couch'
    );
    const start = comfort();
    let lounged = false;
    for (let i = 0; i < 16 && !(comfort() > 70 && hasComfortable()); i++) {
      session.tick(200);
      if (p0().currentState === 'Lounging' || p0().currentState === 'MovingToNeed') lounged = true;
    }
    const stage = (p0().conditions ?? []).find((c) => c.id === 'comfortable')?.severity ?? 0;
    console.log(
      `[COMFORT] seatBuilt=${seatBuilt} comfort ${start}→${comfort().toFixed(1)} lounged=${lounged} comfortable=${hasComfortable()} sev=${stage.toFixed(2)} turn=${session.getState().turn}`
    );
    expect(seatBuilt, 'seat exists').toBe(true);
    expect(comfort(), 'comfort refilled by lounging').toBeGreaterThan(70);
    expect(hasComfortable(), 'comfortable condition granted at high comfort').toBe(true);
  });

  // The copper-tier seat (gated by the `copper_tack` fastener) must work as a seat like any other.
  it('the copper-tier tacked_chair is a usable seat (pawn lounges on it)', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 12,
        map: { w: 16, h: 16 },
        researchMaxTier: 9,
        toolTier: 3,
        pawns: [{ count: 2, skillLevel: 10, needs: { comfort: 20, hunger: 5, fatigue: 5 } as never }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'tacked_chair' }], // the ONLY seat — comfort must come from it
        seedEntities: false
      })
    );
    const p0 = () => session.getState().pawns[0];
    const comfort = () => p0().needs?.comfort ?? -1;
    const start = comfort();
    for (let i = 0; i < 16 && comfort() <= 70; i++) session.tick(200);
    console.log(`[COMFORT-COPPER] tacked_chair: comfort ${start}→${comfort().toFixed(1)} turn=${session.getState().turn}`);
    expect(comfort(), 'copper-tier seat refills comfort').toBeGreaterThan(70);
  });
});
