import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { workService } from '$lib/game/services/WorkService';

/**
 * HANDLE CHAIN (carpentry) — a metal tool wants a real handle, not a green stick. Drive the REAL sim:
 * pawns carve+sand a batch of hafts at the sawtable (active woodworking), then the passive soaking
 * trough seasons the batch (the iron-age reward: load many, walk away). No soak → no seasoned haft →
 * no robust iron tool. Verifies the whole active→passive handle pipeline over real ticks.
 */
describe('tool/weapon handle chain (woodworking → soak)', () => {
  it('pawns carve+sand hafts, then the trough seasons a batch (active + passive, real ticks)', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 11,
        map: { w: 20, h: 20 }, // flat → every tile reachable
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        pawns: [{ count: 6, skillLevel: 14 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'sawtable' }, { id: 'soaking_trough' }],
        items: { branch: 60, water: 20 },
        seedEntities: false
      })
    );
    for (const p of session.getState().pawns)
      for (const w of workService.getAllWorkCategories())
        session.command({
          type: 'setPawnLaborLevel',
          payload: { pawnId: p.id, workId: w.id, level: 3 }
        } as never);
    const stk = () => (session.getState().stockpile ?? {}) as Record<string, number>;

    // Copper/bronze tier: a single carved haft.
    session.command({
      type: 'craftItem',
      payload: { itemId: 'wooden_haft', quantity: 1 }
    } as never);
    for (let i = 0; i < 8 && !(stk().wooden_haft > 0); i++) session.tick(400);

    // Iron tier: carve+sand a BATCH (one active job → 6 sanded hafts)…
    session.command({
      type: 'craftItem',
      payload: { itemId: 'sanded_haft', quantity: 1 }
    } as never);
    for (let i = 0; i < 10 && !(stk().sanded_haft > 0); i++) session.tick(400);
    const sandedMade = stk().sanded_haft ?? 0; // capture BEFORE the soak consumes them

    // …then SEASON the batch at the passive trough (soak six at once, walk away).
    session.command({
      type: 'craftItem',
      payload: { itemId: 'seasoned_haft', quantity: 1 }
    } as never);
    for (let i = 0; i < 14 && !(stk().seasoned_haft > 0); i++) session.tick(400);

    console.log(
      `[HANDLE-CHAIN] branch=${stk().branch}/60 wooden_haft=${stk().wooden_haft} sanded_made=${sandedMade} seasoned_haft=${stk().seasoned_haft} water=${stk().water}/20 turn=${session.getState().turn}`
    );
    expect(stk().wooden_haft ?? 0, 'a wooden haft was carved (bronze tier)').toBeGreaterThan(0);
    expect(
      sandedMade,
      'the sanded-haft batch was carved (one active job → 6)'
    ).toBeGreaterThanOrEqual(6);
    expect(
      stk().seasoned_haft ?? 0,
      'the trough seasoned a batch of hafts (passive)'
    ).toBeGreaterThanOrEqual(6);
    expect(stk().water, 'the soak consumed water as a real input').toBeLessThan(20);
  });

  it('an iron tool now REQUIRES a seasoned haft — forge one end-to-end', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 7,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        workReady: true, // stocks the anvil's forging tool
        pawns: [{ count: 6, skillLevel: 16 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'anvil' }],
        // seasoned hafts + iron + a leather grip on hand → the axe should forge; no branch stocked, so
        // it can ONLY succeed by consuming the crafted handle (a green stick is no longer accepted).
        items: { iron_bar: 8, buckskin: 8, seasoned_haft: 4 },
        seedEntities: false
      })
    );
    for (const p of session.getState().pawns)
      for (const w of workService.getAllWorkCategories())
        session.command({
          type: 'setPawnLaborLevel',
          payload: { pawnId: p.id, workId: w.id, level: 3 }
        } as never);
    const stk = () => (session.getState().stockpile ?? {}) as Record<string, number>;
    session.command({ type: 'craftItem', payload: { itemId: 'iron_axe', quantity: 1 } } as never);
    for (let i = 0; i < 12 && !(stk().iron_axe > 0); i++) session.tick(400);
    console.log(
      `[IRON-AXE] iron_axe=${stk().iron_axe} seasoned_haft=${stk().seasoned_haft}/4 turn=${session.getState().turn}`
    );
    expect(stk().iron_axe ?? 0, 'the axe forged from a seasoned haft').toBeGreaterThan(0);
    expect(stk().seasoned_haft ?? 4, 'the seasoned haft was consumed as the handle').toBeLessThan(
      4
    );
  });
});
