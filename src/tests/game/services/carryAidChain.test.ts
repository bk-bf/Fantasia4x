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
        // Cured hide AND tanned leather: the primitive rung is cut from hide, the bronze rung and up
        // need the tanning chain, which is exactly the gate R4 now enforces.
        items: {
          cured_deer_hide: 30,
          buckskin: 40,
          jackal_leather: 40,
          bronze_nail: 20,
          iron_bar: 20
        },
        seedEntities: false
      })
    );
    const made = await craftAll(session, [
      'hide_knife_sheath',
      'leather_sword_belt',
      'leather_belt',
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
      'leather_belt',
      'ringed_belt',
      'leather_knapsack'
    ])
      expect(stockOf(session)[id] ?? 0, `${id} is craftable in play`).toBeGreaterThan(0);
    expect(worn?.back2?.itemId, 'a pack goes in the LOAD slot, not over the cloak').toBe(
      'leather_knapsack'
    );
    expect(worn?.belt?.itemId, 'a belt goes on the belt').toBe('ringed_belt');
    // 22 kg from the bronze-age knapsack + 9 kg from the iron-ringed belt, on top of the body.
    expect(after.maxWeightKg - before.maxWeightKg).toBeCloseTo(31, 1);
    expect(after.maxVolumeL - before.maxVolumeL).toBeCloseTo(40, 1);
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
        'steel_buckled_belt',
        'steel_riveted_knapsack',
        'plated_war_belt',
        'rune_etched_belt',
        'rune_stitched_knapsack'
      ],
      60
    );

    const pawnId = session.getState().pawns[0].id;
    const before = budget(session.getState(), pawnId);
    for (const itemId of ['rune_stitched_knapsack', 'rune_etched_belt'])
      session.command({ type: 'equipPawnItem', payload: { pawnId, itemId } } as never);
    const after = budget(session.getState(), pawnId);

    console.log(
      `[CARRY-AID] turn=${session.getState().turn} ${made} ` +
        `(buckskin ${stockOf(session).buckskin}/60, steel_rivet ${stockOf(session).steel_rivet}/40) ` +
        `carry ${before.maxWeightKg.toFixed(1)}kg → ${after.maxWeightKg.toFixed(1)}kg`
    );

    for (const id of [
      'mounted_sword_belt',
      'steel_buckled_belt',
      'steel_riveted_knapsack',
      'plated_war_belt',
      'rune_etched_belt',
      'rune_stitched_knapsack'
    ])
      expect(stockOf(session)[id] ?? 0, `${id} is craftable in play`).toBeGreaterThan(0);
    expect(after.maxWeightKg - before.maxWeightKg).toBeCloseTo(60, 1);
  });
});

describe('the pack grid — light / medium / heavy at one age (HeadlessSession, real ticks)', () => {
  it('pawns craft all three iron-age classes, and each one trades bulk for load', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 29,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        workReady: true,
        pawns: [{ count: 6, skillLevel: 18 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'makers_bench' }],
        items: { buckskin: 80, jackal_leather: 40, iron_bar: 20, iron_nail: 20, oak_plank: 20 },
        seedEntities: false
      })
    );
    const ids = ['iron_buckled_satchel', 'iron_buckled_knapsack', 'iron_framed_pack'];
    const made = await craftAll(session, ids, 60);

    const pawnId = session.getState().pawns[0].id;
    const base = budget(session.getState(), pawnId).maxWeightKg;
    const carried: Record<string, number> = {};
    for (const itemId of ids) {
      session.command({ type: 'equipPawnItem', payload: { pawnId, itemId } } as never);
      carried[itemId] = budget(session.getState(), pawnId).maxWeightKg - base;
    }
    console.log(
      `[CARRY-AID] turn=${session.getState().turn} ${made} | base ${base.toFixed(1)}kg → ` +
        ids.map((id) => `${id} +${carried[id].toFixed(1)}kg`).join(', ')
    );

    for (const id of ids)
      expect(stockOf(session)[id] ?? 0, `${id} is craftable`).toBeGreaterThan(0);
    // Each class is worn in turn (back2 swaps), so the delta is that piece alone.
    expect(carried.iron_buckled_satchel).toBeCloseTo(18, 1);
    expect(carried.iron_buckled_knapsack).toBeCloseTo(28, 1);
    expect(carried.iron_framed_pack).toBeCloseTo(42, 1);
  });
});
