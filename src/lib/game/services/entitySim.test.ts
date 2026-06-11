import { describe, it, expect } from 'vitest';
import { entityService } from './EntityService';
import { TICKS_PER_SECOND } from '../core/time';
import type { GameState, Mob } from '../core/types';

/**
 * Headless entity-simulation harness (the answer to "I can't drive the browser"): it runs the
 * REAL per-tick entity pipeline — `stepEntities` (FSM) + `stepHunger` (needs/starvation) +
 * `removeDead` — over a hand-built GameState, with zero SvelteKit/browser runtime. This is how
 * the starvation-rebalance and collapse behaviour are verified without a live game.
 */
const DAY_TICKS = 300 * TICKS_PER_SECOND; // 1 in-game day = 300 in-game sec × 60 ticks

function smallWorld(w = 20, h = 20) {
	return Array.from({ length: h }, (_, y) =>
		Array.from({ length: w }, (_, x) => ({
			x,
			y,
			walkable: true,
			terrainType: 'plains',
			resources: {} as Record<string, number>
		}))
	);
}

function makeGoblin(over: Partial<Mob> = {}): Mob {
	return {
		id: 'g1',
		creatureId: 'goblin',
		entityClass: 'mob',
		state: 'Wander',
		isAlive: true,
		x: 5,
		y: 5,
		health: 35, // goblin con 7 → maxHealth 35
		maxHealth: 35,
		bloodVolume: 100,
		maxBloodVolume: 100,
		limbs: [],
		conditions: [],
		needs: { hunger: 0, fatigue: 0 },
		stateSince: 0,
		...(over as object)
	} as unknown as Mob;
}

function makeState(mobs: Mob[], turn = 0): GameState {
	return {
		turn,
		mobs,
		pawns: [],
		worldMap: smallWorld(),
		stockpile: {},
		droppedItems: [],
		buildings: []
	} as unknown as GameState;
}

describe('entity starvation (headless sim)', () => {
	it('a starving goblin with no food takes ~a week to die, not 1–2 days', () => {
		let state = makeState([makeGoblin()]);
		let diedAtTurn = -1;
		const maxTicks = 12 * DAY_TICKS; // safety bound: 12 in-game days

		for (let t = 0; t < maxTicks; t++) {
			state = { ...state, turn: t };
			state = entityService.stepHunger(state);
			state = entityService.removeDead(state);
			const g = state.mobs!.find((m) => m.id === 'g1')!;
			if (g.state === 'Corpse') {
				diedAtTurn = t;
				break;
			}
		}

		expect(diedAtTurn).toBeGreaterThan(0);
		const daysToDie = diedAtTurn / DAY_TICKS;
		// Before the rebalance this was ~1 day. Target: a multi-day ordeal (~a week).
		expect(daysToDie).toBeGreaterThan(4);
		expect(daysToDie).toBeLessThan(10);
	});

	it('an entity collapses (not flees) once hunger passes the collapse threshold', () => {
		let state = makeState([makeGoblin({ needs: { hunger: 85, fatigue: 0 } as any })]);
		state = entityService.stepEntities(state);
		const g = state.mobs!.find((m) => m.id === 'g1')!;
		expect(g.state).toBe('Collapsed');
	});

	it('a hungry omnivore heads to forage real food (berries) instead of starving', () => {
		// Put a berry bush a few tiles away; goblin is hungry but below the collapse threshold.
		const world = smallWorld();
		world[5][9].resources = { berry_bush: 3 };
		const state = {
			turn: 0,
			mobs: [makeGoblin({ needs: { hunger: 60, fatigue: 0 } as any })],
			pawns: [],
			worldMap: world,
			stockpile: {},
			droppedItems: [],
			buildings: []
		} as unknown as GameState;
		const out = entityService.stepEntities(state);
		const g = out.mobs!.find((m) => m.id === 'g1')!;
		// It should choose to forage (or already be eating/moving toward) the berries — not idle/starve.
		expect(['Foraging', 'Eating']).toContain(g.state);
	});

	it('hunger climbs to the 80 collapse point well before death (long pre-death suffering)', () => {
		let state = makeState([makeGoblin()]);
		let collapseTurn = -1;
		for (let t = 0; t < 12 * DAY_TICKS; t++) {
			state = { ...state, turn: t };
			state = entityService.stepHunger(state);
			if ((state.mobs![0].needs.hunger ?? 0) >= 80) {
				collapseTurn = t;
				break;
			}
		}
		expect(collapseTurn).toBeGreaterThan(0);
		// Reaching the collapse threshold itself should take more than a day.
		expect(collapseTurn / DAY_TICKS).toBeGreaterThan(1);
	});
});
