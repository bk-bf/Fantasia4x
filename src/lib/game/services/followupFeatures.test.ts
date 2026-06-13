import { describe, it, expect } from 'vitest';
import { jobService } from './JobService';
import { itemService } from './ItemService';
import { recipeService } from './RecipeService';
import { buildingService } from './BuildingService';
import { workService } from './WorkService';
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

  it('always allows ≥1 — a single over-budget item (carcass) is carried in the hands', () => {
    // tiny/str1 budget clamps to the 1 kg / 1 L floor; a 1.5 kg carcass would compute 0, but a
    // pawn must still be able to hand-carry one.
    expect(itemService.clampPickupQuantity(pawn('tiny', 1), 'rabbit_carcass', 1, makeState())).toBe(
      1
    );
    // Unconditional: even a pawn already near capacity can still take 1 of an over-budget item.
    const loaded = {
      id: 'p',
      stats: { strength: 1 },
      physicalTraits: { size: 'tiny' },
      equipment: {},
      inventory: { items: { rabbit_carcass: 5 }, instances: [] }
    } as unknown as Pawn;
    expect(itemService.clampPickupQuantity(loaded, 'rabbit_carcass', 3, makeState())).toBe(1);
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

// ─────────────────────────────────────────────────────────────────────────────
// Station tiers (craft_spot → Crude Workbench) + bootstrap closure
// ─────────────────────────────────────────────────────────────────────────────
describe('station tiers + bootstrap (ADR-016 / ADR-009)', () => {
  it('a higher-tier generic station supersedes a lower one; specialised stations need exact match', () => {
    expect(buildingService.stationFulfills('makers_bench', 'craft_spot')).toBe(true); // tier 1 ≥ 0
    expect(buildingService.stationFulfills('craft_spot', 'makers_bench')).toBe(false); // tier 0 < 1
    expect(buildingService.stationFulfills('craft_spot', 'craft_spot')).toBe(true); // exact
    expect(buildingService.stationFulfills('sawtable', 'craft_spot')).toBe(false); // specialised
  });

  it('craftingBonus: the Crude Workbench is faster than the craft_spot', () => {
    expect(buildingService.craftingBonusOf('craft_spot')).toBe(0);
    expect(buildingService.craftingBonusOf('makers_bench')).toBeGreaterThan(0);
  });

  it('bestCraftStation prefers the highest-tier eligible workshop', () => {
    const gs = {
      buildings: [
        { id: 'cs', type: 'craft_spot', x: 0, y: 0, status: 'complete' },
        { id: 'mb', type: 'makers_bench', x: 1, y: 0, status: 'complete' }
      ]
    } as unknown as GameState;
    expect(buildingService.bestCraftStation('craft_spot', gs)?.id).toBe('mb');
  });

  it('bootstrap: stone_axe/stone_hammer are now craft_spot-tier, so the Crude Workbench is buildable', () => {
    // The axe/hammer moved to craft_spot (tier 0) — no longer crafted only at the bench whose
    // build cost lists them, so the circular dependency is broken.
    expect(recipeService.getRecipeForItem('stone_axe')?.station).toBe('craft_spot');
    expect(recipeService.getRecipeForItem('stone_hammer')?.station).toBe('craft_spot');
    // And a craft_spot recipe is satisfiable when only the higher-tier bench is built.
    const gs = {
      buildings: [{ id: 'mb', type: 'makers_bench', x: 0, y: 0, status: 'complete' }]
    } as unknown as GameState;
    expect(itemService.hasRequiredBuilding('stone_axe', gs)).toBe(true);
  });
})

// ─────────────────────────────────────────────────────────────────────────────
// R4 — ADR-009 tool gating (colony-stock, step 1)
// ─────────────────────────────────────────────────────────────────────────────
describe('R4 tool gating (ADR-009)', () => {
  const makePawn = () => ({ id: 'p', position: { x: 0, y: 0 } }) as unknown as Pawn;
  const woodcutJob = {
    id: 'wc',
    type: 'harvest',
    resourceId: 'pine_tree',
    targetX: 5,
    targetY: 5,
    workRequired: 5,
    workDone: 0,
    claimedBy: null
  } as any;
  const scavengeJob = {
    id: 'sc',
    type: 'harvest',
    resourceId: 'stone_outcrop',
    targetX: 6,
    targetY: 6,
    workRequired: 6,
    workDone: 0,
    claimedBy: null
  } as any;
  const designations = { '5,5': 'woodcut', '6,6': 'harvest' } as unknown as GameState['designations'];

  it('a tool-gated harvest (woodcut) is NOT claimable without an axe in the colony', () => {
    const gs = makeState({ jobs: [woodcutJob], designations, stockpile: {} });
    expect(jobService.getAvailableJobs(makePawn(), gs).map((j) => j.id)).not.toContain('wc');
  });

  it('it becomes claimable once a stone_axe is in stock', () => {
    const gs = makeState({ jobs: [woodcutJob], designations, stockpile: { stone_axe: 1 } });
    expect(jobService.getAvailableJobs(makePawn(), gs).map((j) => j.id)).toContain('wc');
  });

  it('a tool-free scavenge (surface stone) is always claimable', () => {
    const gs = makeState({ jobs: [scavengeJob], designations, stockpile: {} });
    expect(jobService.getAvailableJobs(makePawn(), gs).map((j) => j.id)).toContain('sc');
  });
})

// ─────────────────────────────────────────────────────────────────────────────
// R7 — isWorking / currentWork derived from the FSM + job, not the dead priority sort
// ─────────────────────────────────────────────────────────────────────────────
describe('R7 working-state derivation', () => {
  const mkPawn = (over: Record<string, any> = {}) =>
    ({
      id: 'p',
      currentState: 'Idle',
      state: { isWorking: false, isEating: false, isSleeping: false },
      ...over
    }) as unknown as Pawn;

  it('isWorking is true in a work-loop state, false when idle or eating', () => {
    const sync = (p: Pawn) =>
      workService.syncPawnWorkingStates({ pawns: [p], workAssignments: {} } as unknown as GameState)
        .pawns[0].state.isWorking;
    expect(sync(mkPawn({ currentState: 'Working' }))).toBe(true);
    expect(sync(mkPawn({ currentState: 'Hauling' }))).toBe(true);
    expect(sync(mkPawn({ currentState: 'Idle' }))).toBe(false);
    expect(
      sync(
        mkPawn({
          currentState: 'Working',
          state: { isWorking: false, isEating: true, isSleeping: false }
        })
      )
    ).toBe(false);
  });

  it('currentWork is the active job’s real category (woodcutting), not the old ‘foraging’ fiction', () => {
    const pawn = mkPawn({
      currentState: 'Working',
      activeJob: { type: 'harvest', resourceId: 'pine_tree', targetX: 5, targetY: 5 }
    });
    const gs = {
      pawns: [pawn],
      workAssignments: { p: { pawnId: 'p', workPriorities: {}, laborSettings: {} } },
      designations: { '5,5': 'woodcut' }
    } as unknown as GameState;
    const out = workService.syncPawnWorkingStates(gs);
    expect(out.workAssignments.p.currentWork).toBe('woodcutting');
  });
})
