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

async function craftAll(session: HeadlessSession, ids: string[], rounds = 40) {
  for (const itemId of ids)
    session.command({ type: 'craftItem', payload: { itemId, quantity: 1 } } as never);
  const done = () => ids.every((id) => (stockOf(session)[id] ?? 0) > 0);
  for (let i = 0; i < rounds && !done(); i++) session.tick(400);
  return ids.map((id) => `${id}=${stockOf(session)[id] ?? 0}`).join(' ');
}

describe('repriced recipes still craft and carry a sane weight (HeadlessSession, real ticks)', () => {
  it('a colony crafts the fixed copper dagger, ruby amulet and wicker vest, and wearing them costs their own honest kg', async () => {
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
        buildings: [
          { id: 'stone_forge' },
          { id: 'attunement_bench' },
          { id: 'craft_spot' }
        ],
        items: {
          copper_bar: 5,
          medium_bones: 5,
          attuned_ruby: 5,
          gold_bar: 5,
          branch: 20,
          cordage: 100
        },
        seedEntities: false
      })
    );

    const ids = ['copper_dagger', 'ruby_amulet', 'wicker_vest'];
    const made = await craftAll(session, ids, 60);

    const pawnId = session.getState().pawns[0].id;
    const before = load(session.getState(), pawnId);
    for (const itemId of ids)
      session.command({ type: 'equipPawnItem', payload: { pawnId, itemId } } as never);
    const after = load(session.getState(), pawnId);
    const delta = after.weightKg - before.weightKg;

    console.log(
      `[RECIPE-WEIGHT-FIX] turn=${session.getState().turn} ${made} ` +
        `(copper_bar ${stockOf(session).copper_bar}/5, gold_bar ${stockOf(session).gold_bar}/5) ` +
        `carry load ${before.weightKg.toFixed(2)}kg → ${after.weightKg.toFixed(2)}kg (+${delta.toFixed(2)}kg)`
    );

    for (const id of ids)
      expect(stockOf(session)[id] ?? 0, `${id} is craftable off the repriced recipe`).toBeGreaterThan(0);

    const expectedKg = ids.reduce((s, id) => s + (itemService.getItemById(id)?.weightKg ?? 0), 0);
    expect(delta).toBeCloseTo(expectedKg, 1);
    expect(delta, 'no longer the old bar-and-a-half of dead weight').toBeLessThan(4);
  });
});
