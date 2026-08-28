import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { itemService } from '$lib/game/services/ItemService';
import type { GameState, Pawn } from '$lib/game/core/types';

const stockOf = (s: HeadlessSession) => (s.getState().stockpile ?? {}) as Record<string, number>;

const load = (state: GameState, pawnId: string) => {
  const pawn = state.pawns.find((p) => p.id === pawnId) as Pawn;
  return itemService.getCurrentCarryLoad(pawn, state);
};

describe('repriced blade and withy recipes (HeadlessSession, real ticks)', () => {
  it('one bar yields a batch of blades, and the stockpile keeps whole units', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 33,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        workReady: true,
        pawns: [{ count: 6, skillLevel: 18 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'stone_forge' }, { id: 'anvil' }],
        items: {
          copper_bar: 4,
          medium_bones: 8,
          crucible_steel: 4,
          boarhide: 4,
          iron_bar: 4,
          sinew: 12
        },
        seedEntities: false
      })
    );

    const before = { ...stockOf(session) };
    for (const itemId of ['copper_dagger', 'steel_stiletto', 'sewing_kit'])
      session.command({ type: 'craftItem', payload: { itemId, quantity: 1 } } as never);
    for (let i = 0; i < 80; i++) {
      const s = stockOf(session);
      if ((s.copper_dagger ?? 0) && (s.steel_stiletto ?? 0) && (s.sewing_kit ?? 0)) break;
      session.tick(400);
    }
    const after = stockOf(session);

    console.log(
      `[BLADES] turn=${session.getState().turn} copper_bar ${before.copper_bar}→${after.copper_bar} ` +
        `crucible_steel ${before.crucible_steel}→${after.crucible_steel} ` +
        `iron_bar ${before.iron_bar}→${after.iron_bar} | ` +
        `copper_dagger ${after.copper_dagger} steel_stiletto ${after.steel_stiletto} sewing_kit ${after.sewing_kit}`
    );

    expect(after.copper_dagger, 'a copper bar draws out to a batch of daggers').toBe(6);
    expect(after.steel_stiletto, 'a steel bar draws out to a batch of stilettos').toBe(10);
    expect(after.sewing_kit, 'an iron bar draws out to a batch of kits').toBe(8);

    expect(before.copper_bar - after.copper_bar, 'one whole copper bar').toBe(1);
    expect(before.crucible_steel - after.crucible_steel, 'one whole steel bar').toBe(1);
    expect(before.iron_bar - after.iron_bar, 'one whole iron bar').toBe(1);

    for (const [id, qty] of Object.entries(after))
      expect(Number.isInteger(qty), `${id} holds ${qty}, not a whole count`).toBe(true);
  });

  it('a woven vest still crafts off its repriced withy cost and carries its own kg', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 34,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        workReady: true,
        pawns: [{ count: 6, skillLevel: 18 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'craft_spot' }],
        items: { branch: 40, cordage: 200 },
        seedEntities: false
      })
    );

    const before = { ...stockOf(session) };
    for (const itemId of ['wicker_vest', 'wattle_buckler'])
      session.command({ type: 'craftItem', payload: { itemId, quantity: 1 } } as never);
    for (let i = 0; i < 80; i++) {
      const s = stockOf(session);
      if ((s.wicker_vest ?? 0) && (s.wattle_buckler ?? 0)) break;
      session.tick(400);
    }
    const after = stockOf(session);

    expect(after.wicker_vest, 'the vest crafts').toBeGreaterThan(0);
    expect(after.wattle_buckler, 'the buckler crafts').toBeGreaterThan(0);
    expect(before.branch - after.branch, 'eight withies for the vest, eleven for the buckler').toBe(
      19
    );
    expect(before.cordage - after.cordage, 'sixty lashings for the vest, twenty for the buckler').toBe(
      80
    );

    const pawnId = session.getState().pawns[0].id;
    const carriedBefore = load(session.getState(), pawnId).weightKg;
    for (const itemId of ['wicker_vest', 'wattle_buckler'])
      session.command({ type: 'equipPawnItem', payload: { pawnId, itemId } } as never);
    const carriedAfter = load(session.getState(), pawnId).weightKg;
    const expectedKg = ['wicker_vest', 'wattle_buckler'].reduce(
      (s, id) => s + (itemService.getItemById(id)?.weightKg ?? 0),
      0
    );
    console.log(
      `[WITHY] turn=${session.getState().turn} branch ${before.branch}→${after.branch} ` +
        `cordage ${before.cordage}→${after.cordage} | carry load ` +
        `${carriedBefore.toFixed(2)}kg → ${carriedAfter.toFixed(2)}kg (+${(carriedAfter - carriedBefore).toFixed(2)}kg)`
    );

    expect(carriedAfter - carriedBefore).toBeCloseTo(expectedKg, 1);
  });
});
