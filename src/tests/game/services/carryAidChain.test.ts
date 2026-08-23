import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { itemService } from '$lib/game/services/ItemService';
import type { GameState, Pawn } from '$lib/game/core/types';

// Carry aids are worn gear whose only job is to raise what a pawn can shoulder, so a recipe that
// exists is not the claim — a pawn wearing the thing and carrying more is. Two runs: the leather
// half of the ladder at a workbench, and the metal/runed half at the smithy and the runecarver.

const stockOf = (s: HeadlessSession) => (s.getState().stockpile ?? {}) as Record<string, number>;

const budget = (state: GameState, pawnId: string) => {
  const pawn = state.pawns.find((p) => p.id === pawnId) as Pawn;
  return itemService.getCarryBudget(pawn, state);
};

async function craftAll(session: HeadlessSession, ids: string[], rounds = 40) {
  for (const itemId of ids)
    session.command({ type: 'craftItem', payload: { itemId, quantity: 1 } } as never);
  const done = () => ids.every((id) => (stockOf(session)[id] ?? 0) > 0);
  for (let i = 0; i < rounds && !done(); i++) session.tick(400);
  return ids.map((id) => `${id}=${stockOf(session)[id] ?? 0}`).join(' ');
}

describe('carry aid chain — packs, belts and sheaths (HeadlessSession, real ticks)', () => {
  it('pawns craft the leather belt and pack ladder, and wearing it raises the carry budget', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 21,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        workReady: true,
        pawns: [{ count: 6, skillLevel: 16 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'makers_bench' }],
        items: { buckskin: 40, jackal_leather: 40, bronze_nail: 20, iron_bar: 20 },
        seedEntities: false
      })
    );
    const made = await craftAll(session, [
      'hide_knife_sheath',
      'leather_sword_belt',
      'leather_girdle',
      'ringed_belt',
      'leather_knapsack'
    ]);

    const pawnId = session.getState().pawns[0].id;
    const before = budget(session.getState(), pawnId);
    for (const itemId of ['leather_knapsack', 'ringed_belt'])
      session.command({ type: 'equipPawnItem', payload: { pawnId, itemId } } as never);
    const after = budget(session.getState(), pawnId);
    const worn = session.getState().pawns.find((p) => p.id === pawnId)?.equipment;

    console.log(
      `[CARRY-AID] turn=${session.getState().turn} ${made} ` +
        `(buckskin ${stockOf(session).buckskin}/40, iron_bar ${stockOf(session).iron_bar}/20) ` +
        `back2=${worn?.back2?.itemId ?? 'none'} belt=${worn?.belt?.itemId ?? 'none'} ` +
        `carry ${before.maxWeightKg.toFixed(1)}kg/${before.maxVolumeL.toFixed(1)}L → ` +
        `${after.maxWeightKg.toFixed(1)}kg/${after.maxVolumeL.toFixed(1)}L`
    );

    for (const id of [
      'hide_knife_sheath',
      'leather_sword_belt',
      'leather_girdle',
      'ringed_belt',
      'leather_knapsack'
    ])
      expect(stockOf(session)[id] ?? 0, `${id} is craftable in play`).toBeGreaterThan(0);
    expect(worn?.back2?.itemId, 'a pack goes in the LOAD slot, not over the cloak').toBe(
      'leather_knapsack'
    );
    expect(worn?.belt?.itemId, 'a belt goes on the belt').toBe('ringed_belt');
    // 32 kg from the knapsack + 18 kg from the belt, on top of whatever the body affords.
    expect(after.maxWeightKg - before.maxWeightKg).toBeCloseTo(50, 1);
    expect(after.maxVolumeL - before.maxVolumeL).toBeCloseTo(58, 1);
  });

  it('pawns craft the steel and runed rungs at the smithy and the runecarver', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 23,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        workReady: true,
        pawns: [{ count: 6, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'makers_bench' }, { id: 'anvil' }, { id: 'runecarver_bench' }],
        items: {
          buckskin: 60,
          iron_bar: 20,
          oak_plank: 20,
          steel_rivet: 40,
          bloom_steel: 20,
          magic_alloy_bar: 10,
          gem_dust: 20,
          enchant_thread: 20
        },
        seedEntities: false
      })
    );
    const made = await craftAll(
      session,
      [
        'mounted_sword_belt',
        'riveted_tool_belt',
        'porters_rucksack',
        'plated_war_belt',
        'rune_etched_girdle',
        'rune_stitched_rucksack'
      ],
      60
    );

    const pawnId = session.getState().pawns[0].id;
    const before = budget(session.getState(), pawnId);
    for (const itemId of ['rune_stitched_rucksack', 'rune_etched_girdle'])
      session.command({ type: 'equipPawnItem', payload: { pawnId, itemId } } as never);
    const after = budget(session.getState(), pawnId);

    console.log(
      `[CARRY-AID] turn=${session.getState().turn} ${made} ` +
        `(buckskin ${stockOf(session).buckskin}/60, steel_rivet ${stockOf(session).steel_rivet}/40) ` +
        `carry ${before.maxWeightKg.toFixed(1)}kg → ${after.maxWeightKg.toFixed(1)}kg`
    );

    for (const id of [
      'mounted_sword_belt',
      'riveted_tool_belt',
      'porters_rucksack',
      'plated_war_belt',
      'rune_etched_girdle',
      'rune_stitched_rucksack'
    ])
      expect(stockOf(session)[id] ?? 0, `${id} is craftable in play`).toBeGreaterThan(0);
    expect(after.maxWeightKg - before.maxWeightKg).toBeCloseTo(114, 1);
  });
});
