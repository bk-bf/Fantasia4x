import { describe, it, expect } from 'vitest';
import { jobService } from './JobService';
import { itemService } from './ItemService';
import { recipeService } from './RecipeService';
import type { GameState, Pawn } from '../core/types';

function makeState(partial: Partial<GameState> = {}): GameState {
  return {
    seed: 1,
    turn: 0,
    jobs: [],
    craftingQueue: [],
    designations: {},
    buildings: [],
    droppedItems: [],
    worldMap: [],
    pawns: [],
    stockpile: {},
    stockpileZones: [],
    workAssignments: {},
    ...partial
  } as unknown as GameState;
}

// ─────────────────────────────────────────────────────────────────────────────
// R5 — carry-budget enforcement
// ─────────────────────────────────────────────────────────────────────────────
describe('R5 carry-budget pickup clamp', () => {
  const pawn = (size: string, str: number): Pawn =>
    ({
      id: 'p',
      stats: { strength: str },
      physicalTraits: { size },
      equipment: {},
      inventory: { items: {}, instances: [] }
    }) as unknown as Pawn;

  it('clamps a stack to what fits the weight/volume budget', () => {
    // medium/str10 budget ≈ 5 kg / 8 L; rabbit_carcass is 1.5 kg / 3 L → volume caps at 2.
    const can = itemService.clampPickupQuantity(pawn('medium', 10), 'rabbit_carcass', 10, makeState());
    expect(can).toBeGreaterThan(0);
    expect(can).toBeLessThan(10);
  });

  it('floors at 1 when an empty pawn faces a single over-budget unit (no deadlock)', () => {
    // tiny/str1 budget clamps to the 1 kg / 1 L floor; a 1.5 kg carcass would compute 0.
    const can = itemService.clampPickupQuantity(pawn('tiny', 1), 'rabbit_carcass', 1, makeState());
    expect(can).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Building-material hauling
// ─────────────────────────────────────────────────────────────────────────────
describe('building-material hauling (ADR-016)', () => {
  const building = () =>
    ({ id: 'b1', type: 'test_wall', x: 3, y: 3, status: 'planned', workRequired: 5, workDone: 0 }) as any;

  it('emits a fetch job (not a construct job) while build materials are still in the stockpile', () => {
    const reserved = {
      id: 'd-wood',
      resourceId: 'wood',
      x: 0,
      y: 0,
      quantity: 4,
      stored: true,
      reservedFor: 'b1'
    } as any;
    const out = jobService.generateJobs(
      makeState({ buildings: [building()], droppedItems: [reserved] })
    );
    const fetch = out.jobs.find((j) => j.type === 'fetch');
    expect(fetch).toBeDefined();
    expect(fetch!.buildingId).toBe('b1');
    expect(fetch!.stationX).toBe(3);
    expect(out.jobs.find((j) => j.type === 'construct')).toBeUndefined();
  });

  it('opens the construct job once materials are staged on the site, and completion consumes them', () => {
    const staged = {
      id: 'd-wood',
      resourceId: 'wood',
      x: 3,
      y: 3,
      quantity: 4,
      stored: true,
      reservedFor: 'b1'
    } as any;
    let gs = jobService.generateJobs(makeState({ buildings: [building()], droppedItems: [staged] }));
    const construct = gs.jobs.find((j) => j.type === 'construct');
    expect(construct).toBeDefined();
    expect(gs.jobs.find((j) => j.type === 'fetch')).toBeUndefined();

    gs = jobService.advanceJob(construct!.id, 5, gs);
    expect(gs.buildings.find((b) => b.id === 'b1')?.status).toBe('complete');
    // Staged materials consumed by completing construction.
    expect((gs.droppedItems ?? []).some((d) => d.reservedFor === 'b1')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Passive furnaces
// ─────────────────────────────────────────────────────────────────────────────
describe('passive furnaces (ADR-016)', () => {
  it('classifies furnace stations as passive, workshops as active', () => {
    expect(recipeService.isPassiveStation('bloomery')).toBe(true);
    expect(recipeService.isPassiveStation('charcoal_pit')).toBe(true);
    expect(recipeService.isPassiveStation('makers_bench')).toBe(false);
    expect(recipeService.isPassiveStation('craft_spot')).toBe(false);
  });

  it('a supplied passive order gets NO craft job (the furnace produces it over time)', () => {
    const bloomery = { id: 'bl', type: 'bloomery', x: 5, y: 5, status: 'complete', lit: true } as any;
    const staged = {
      id: 'd-ore',
      resourceId: 'iron_ore',
      x: 5,
      y: 5,
      quantity: 1,
      stored: true,
      reservedFor: 'o1'
    } as any;
    const order = {
      id: 'o1',
      item: { id: 'test_bloom', name: 'Bloom', amount: 0 },
      quantity: 1,
      workRequired: 4,
      workDone: 0,
      inputs: { iron_ore: 1 },
      stationType: 'bloomery',
      stationBuildingId: 'bl'
    } as any;
    const out = jobService.generateJobs(
      makeState({ buildings: [bloomery], craftingQueue: [order], droppedItems: [staged] })
    );
    expect(out.jobs.find((j) => j.type === 'craft')).toBeUndefined();
  });

  it('completeCraftOrder destroys staged inputs and drops the output on the furnace', () => {
    const bloomery = { id: 'bl', type: 'bloomery', x: 5, y: 5, status: 'complete', lit: true } as any;
    const staged = {
      id: 'd-ore',
      resourceId: 'iron_ore',
      x: 5,
      y: 5,
      quantity: 1,
      stored: true,
      reservedFor: 'o1'
    } as any;
    const order = {
      id: 'o1',
      item: { id: 'test_bloom', name: 'Bloom', amount: 0 },
      quantity: 1,
      workRequired: 4,
      workDone: 0,
      inputs: { iron_ore: 1 },
      stationType: 'bloomery',
      stationBuildingId: 'bl'
    } as any;
    const gs = jobService.completeCraftOrder(
      order,
      makeState({ buildings: [bloomery], craftingQueue: [order], droppedItems: [staged] })
    );
    expect(gs.craftingQueue).toHaveLength(0);
    expect((gs.droppedItems ?? []).some((d) => d.reservedFor === 'o1')).toBe(false);
    const produced = (gs.droppedItems ?? []).find(
      (d) => d.resourceId === 'test_bloom' && d.x === 5 && d.y === 5
    );
    expect(produced?.quantity).toBe(1);
  });
});
