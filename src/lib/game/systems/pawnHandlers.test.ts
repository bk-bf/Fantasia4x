import { describe, it, expect } from 'vitest';
import { pawnStateMachineService } from './PawnStateMachine';
import type { GameState, Pawn } from '../core/types';

/**
 * Per-handler behaviour locks for the PawnStateMachine (hotspot report, step 6 — written BEFORE the
 * handler-split refactor so any accidental behaviour change is caught). They drive the public
 * `tick()` (handlers are module-private) and assert the deterministic, no-pathfinder branches:
 *
 *  - In the test/node env the WASM pathfinder is never initialised, so `pathfinderService.isReady()`
 *    is false and `tryAssignPath` returns null. That makes the "can't path / eat-in-place / stay put"
 *    branches the deterministic ones to pin.
 *
 * Behaviour pinned here: Idle→Hungry / →Hauling / job-pickup guard, Working release/idle paths,
 * Hungry eat-in-place / no-food→Idle.
 */
function makePawn(over: Partial<Pawn> = {}): Pawn {
  return {
    id: 'p1',
    name: 'Wren',
    isAlive: true,
    drafted: false,
    position: { x: 5, y: 5 },
    currentState: 'Idle',
    stats: {
      strength: 14,
      dexterity: 14,
      constitution: 12,
      intelligence: 10,
      perception: 10,
      charisma: 10
    },
    traits: [],
    equipment: {},
    skills: {},
    inventory: { items: {}, instances: [] },
    needs: { hunger: 10, fatigue: 10, thirst: 0, hygiene: 0, sleep: 0, lastSleep: 0, lastMeal: 0 },
    state: { mood: 50, health: 100, isWorking: false, isEating: false, isSleeping: false },
    limbs: [
      { id: 'head', health: 100, bleedRate: 0, parts: [] },
      { id: 'torso', health: 100, bleedRate: 0, parts: [] },
      { id: 'left_arm', health: 100, bleedRate: 0, parts: [] },
      { id: 'right_arm', health: 100, bleedRate: 0, parts: [] },
      { id: 'left_leg', health: 100, bleedRate: 0, parts: [] },
      { id: 'right_leg', health: 100, bleedRate: 0, parts: [] }
    ],
    injuries: [],
    conditions: [],
    pain: 0,
    bloodVolume: 100,
    maxBloodVolume: 100,
    stamina: 50,
    maxStamina: 50,
    ...(over as object)
  } as unknown as Pawn;
}

function makeState(over: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    pawns: [],
    jobs: [],
    mobs: [],
    droppedItems: [],
    buildings: [],
    stockpile: {},
    stockpileZones: [],
    deadPawns: [],
    worldMap: [],
    designations: {},
    ...over
  } as unknown as GameState;
}

const tick1 = (gs: GameState) => pawnStateMachineService.tick(gs);

describe('PawnStateMachine handler behaviour locks', () => {
  describe('Idle', () => {
    it('transitions Idle → Hungry when hunger ≥ threshold and food is in stock', () => {
      const gs = makeState({
        pawns: [makePawn({ currentState: 'Idle', needs: needs({ hunger: 85 }) })],
        stockpile: { wild_oats: 5 }
      });
      expect(tick1(gs).pawns[0].currentState).toBe('Hungry');
    });

    it('does NOT go Hungry when hunger is high but no food exists', () => {
      const gs = makeState({
        pawns: [makePawn({ currentState: 'Idle', needs: needs({ hunger: 85 }) })],
        stockpile: {}
      });
      // No food → stays Idle (and, with the pathfinder unavailable in tests, never picks work).
      expect(tick1(gs).pawns[0].currentState).toBe('Idle');
    });

    it('transitions Idle → Hauling when still carrying items and no urgent need', () => {
      const gs = makeState({
        pawns: [
          makePawn({
            currentState: 'Idle',
            inventory: { items: { branch: 1 }, instances: [] } as unknown as Pawn['inventory']
          })
        ]
      });
      expect(tick1(gs).pawns[0].currentState).toBe('Hauling');
    });

    it('does not claim work while the pathfinder is unavailable (anti-thrash guard)', () => {
      const job = {
        id: 'j1',
        type: 'harvest',
        targetX: 6,
        targetY: 5,
        resourceId: 'tree',
        workRequired: 10,
        workDone: 0,
        claimedBy: null
      };
      const gs = makeState({
        pawns: [makePawn({ currentState: 'Idle' })],
        jobs: [job as unknown as GameState['jobs'][number]]
      });
      const out = tick1(gs);
      expect(out.pawns[0].currentState).toBe('Idle');
      expect(out.pawns[0].activeJob).toBeUndefined();
      expect(out.jobs[0].claimedBy ?? null).toBeNull();
    });
  });

  describe('Working', () => {
    it('goes Idle when it has no active job', () => {
      const gs = makeState({ pawns: [makePawn({ currentState: 'Working', activeJob: undefined })] });
      expect(tick1(gs).pawns[0].currentState).toBe('Idle');
    });

    it('releases the claim and goes Idle when not adjacent to the job target', () => {
      const job = {
        id: 'j1',
        type: 'harvest',
        targetX: 50,
        targetY: 50,
        resourceId: 'tree',
        workRequired: 10,
        workDone: 0,
        claimedBy: 'p1'
      };
      const gs = makeState({
        pawns: [
          makePawn({
            currentState: 'Working',
            position: { x: 5, y: 5 },
            activeJob: {
              type: 'harvest',
              jobId: 'j1',
              targetX: 50,
              targetY: 50,
              progress: 0,
              timeRequired: 10
            } as unknown as Pawn['activeJob']
          })
        ],
        jobs: [job as unknown as GameState['jobs'][number]]
      });
      const out = tick1(gs);
      expect(out.pawns[0].currentState).toBe('Idle');
      expect(out.pawns[0].activeJob).toBeUndefined();
      expect(out.jobs[0].claimedBy ?? null).toBeNull();
    });
  });

  describe('Hungry', () => {
    it('fetches stockpiled food into its pack, then eats it from inventory (no ethereal stockpile)', () => {
      const gs = makeState({
        pawns: [makePawn({ currentState: 'Hungry', needs: needs({ hunger: 85 }) })],
        // Physical food sitting on the pawn's tile (5,5); the aggregate mirrors the stored drop.
        droppedItems: [
          { id: 'd1', resourceId: 'wild_oats', x: 5, y: 5, quantity: 5, stored: true } as never
        ],
        stockpile: { wild_oats: 5 } // nutrition 39 → 2 units cover the 75-point deficit
      });
      // Tick 1: standing on the food → it picks a serving up into its pack, re-evaluating as Hungry.
      const afterPickup = tick1(gs);
      expect(afterPickup.pawns[0].currentState).toBe('Hungry');
      const carried = afterPickup.pawns[0].inventory?.items?.wild_oats ?? 0;
      expect(carried).toBeGreaterThan(0);
      // Tick 2: carrying food, no campfire → eats it in place FROM ITS OWN INVENTORY.
      const out = tick1(afterPickup);
      expect(out.pawns[0].currentState).toBe('Eating');
      expect(out.pawns[0].activeJob?.hungerToRecover ?? 0).toBeGreaterThan(0);
      // The food came out of the pawn's pack, not teleported from the colony aggregate.
      expect(out.pawns[0].inventory?.items?.wild_oats ?? 0).toBeLessThan(carried);
    });

    it('returns to Idle when Hungry but no food is available', () => {
      const gs = makeState({
        pawns: [makePawn({ currentState: 'Hungry', needs: needs({ hunger: 85 }) })],
        stockpile: {}
      });
      expect(tick1(gs).pawns[0].currentState).toBe('Idle');
    });

    it('does NOT eat from the ethereal aggregate when no physical drop is reachable', () => {
      // Aggregate says there's food, but there's no DroppedItem to fetch — the pawn must not consume it
      // out of thin air (the bug). It waits (Idle) and the aggregate is untouched.
      const gs = makeState({
        pawns: [makePawn({ currentState: 'Hungry', needs: needs({ hunger: 85 }) })],
        droppedItems: [],
        stockpile: { wild_oats: 5 }
      });
      const out = tick1(gs);
      expect(out.pawns[0].currentState).toBe('Idle');
      expect(out.pawns[0].currentState).not.toBe('Eating');
      expect(out.stockpile.wild_oats).toBe(5); // nothing consumed from the ethereal pool
    });
  });
});

function needs(over: Record<string, number>): Pawn['needs'] {
  return {
    hunger: 10,
    fatigue: 10,
    thirst: 0,
    hygiene: 0,
    sleep: 0,
    lastSleep: 0,
    lastMeal: 0,
    ...over
  } as unknown as Pawn['needs'];
}
