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
        seed: 11,
        map: { w: 18, h: 18 },
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

  // Beds grant comfort while sleeping AND leave `well_rested` on waking (never from bare ground).
  it('a pawn sleeping in a bed gains comfort and wakes well_rested', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 11,
        map: { w: 18, h: 18 },
        researchMaxTier: 9,
        toolTier: 3,
        // fatigue just over the sleep threshold so the pawn beds down AND wakes within the tick budget.
        pawns: [{ count: 2, skillLevel: 10, needs: { comfort: 20, fatigue: 78, hunger: 5 } as never }],
        needsDisabled: ['hunger'],
        buildings: [{ id: 'feather_bed' }], // comfort 0.4 — no seats, so comfort can ONLY come from the bed
        seedEntities: false
      })
    );
    const p0 = () => session.getState().pawns[0];
    const start = p0().needs?.comfort ?? -1;
    let slept = false;
    let woke = false;
    let rested = false;
    for (let i = 0; i < 40 && !rested; i++) {
      session.tick(200);
      if (p0().currentState === 'Sleeping') slept = true;
      else if (slept) woke = true;
      if ((p0().conditionTimers?.well_rested ?? 0) > 0) rested = true;
    }
    const end = p0().needs?.comfort ?? -1;
    console.log(`[COMFORT-BED] slept=${slept} woke=${woke} comfort ${start}→${end.toFixed(1)} well_rested=${rested} turn=${session.getState().turn}`);
    expect(slept, 'pawn used the bed').toBe(true);
    expect(end, 'bed filled the comfort need').toBeGreaterThan(start);
    expect(rested, 'woke well_rested').toBe(true);
  });

  // Pawns are drawn to the HIGHEST gatheringLevel: a hall table (3) out-draws a campfire (1).
  it('a socialising pawn picks the highest-level gathering place (table over campfire)', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 11,
        // Flat map so the explicit tiles below are guaranteed walkable (a generated map rejects them).
        map: { w: 18, h: 18, preset: 'flat' },
        researchMaxTier: 9,
        toolTier: 3,
        pawns: [{ count: 2, skillLevel: 10, needs: { relaxation: 10, hunger: 5, fatigue: 5 } as never }],
        needsDisabled: ['hunger', 'fatigue'],
        // Pawns spawn ~(9,9). The level-1 campfire sits RIGHT NEXT to them, the level-3 table far across
        // the map — so walking to the table proves LEVEL beats proximity, not just "nearest wins".
        buildings: [
          { id: 'campfire', x: 10, y: 10 },
          { id: 'wooden_table', x: 16, y: 16 }
        ],
        seedEntities: false
      })
    );
    const st = () => session.getState();
    const at = (t: string) => (st().buildings ?? []).find((b) => (b as { type?: string }).type === t)!;
    for (let i = 0; i < 12 && st().pawns[0].currentState !== 'Socialising'; i++) session.tick(200);
    const p = st().pawns[0];
    const d = (b: { x: number; y: number }) =>
      Math.max(Math.abs((p.position?.x ?? 0) - b.x), Math.abs((p.position?.y ?? 0) - b.y));
    const dTable = d(at('wooden_table'));
    const dFire = d(at('campfire'));
    console.log(`[GATHER-LEVEL] state=${p.currentState} distToTable=${dTable} distToCampfire=${dFire}`);
    expect(dTable, 'pawn gathered at the level-3 table, not the level-1 fire').toBeLessThan(dFire);
  });
});
