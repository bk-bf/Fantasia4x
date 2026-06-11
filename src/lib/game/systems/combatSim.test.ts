import { describe, it, expect } from 'vitest';
import { combatService } from './Combat';
import { CREATURES } from '../core/Creatures';
import { itemService } from '../services/ItemService';
import type { GameState, Mob, Pawn } from '../core/types';

/**
 * Headless combat-sim: drives the REAL combatService.tickCombat over a hand-built
 * state to lock in the COMBAT-SYSTEM behaviours — an undrafted Fighting pawn swings
 * back at an adjacent hostile, and a mob in Attacking state damages an adjacent pawn.
 */
const stats = { strength: 14, dexterity: 16, constitution: 12, intelligence: 10, perception: 10, charisma: 10 };

function makePawn(over: Partial<Pawn> = {}): Pawn {
	return {
		id: 'p1',
		name: 'Wren',
		isAlive: true,
		position: { x: 5, y: 5 },
		currentState: 'Fighting',
		stats: { ...stats, dexterity: 20 },
		racialTraits: [],
		equipment: {},
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

function makeGoblin(over: Partial<Mob> = {}): Mob {
	return {
		id: 'g1',
		creatureId: 'goblin',
		entityClass: 'mob',
		state: 'Attacking',
		stateSince: 0,
		isAlive: true,
		x: 5,
		y: 6, // adjacent to the pawn at (5,5)
		health: 35,
		maxHealth: 35,
		stats: { ...stats, dexterity: 4 },
		racialTraits: [],
		bloodVolume: 100,
		maxBloodVolume: 100,
		stamina: 50,
		maxStamina: 50,
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
		needs: { hunger: 0, fatigue: 0 },
		...(over as object)
	} as unknown as Mob;
}

function makeState(pawns: Pawn[], mobs: Mob[]): GameState {
	return { turn: 0, pawns, mobs, worldMap: [] } as unknown as GameState;
}

describe('combat sim (headless tickCombat)', () => {
	it('an undrafted Fighting pawn swings back at an adjacent hostile', () => {
		let state = makeState([makePawn()], [makeGoblin({ state: 'Wander' })]); // mob passive so only the pawn attacks
		let mobInjured = false;
		for (let t = 0; t < 600 && !mobInjured; t++) {
			state = { ...state, turn: t };
			state = combatService.tickCombat(state, 16);
			if ((state.mobs![0].injuries?.length ?? 0) > 0) mobInjured = true;
		}
		expect(mobInjured).toBe(true);
	});

	it('an Attacking mob damages the adjacent pawn', () => {
		// Accurate mob vs low-dodge pawn so hits land reliably regardless of rng sequence.
		const target = makePawn({ currentState: 'Idle', stats: { ...stats, dexterity: 3 } });
		let state = makeState([target], [makeGoblin({ stats: { ...stats, dexterity: 16 } })]);
		let pawnInjured = false;
		for (let t = 0; t < 600 && !pawnInjured; t++) {
			state = { ...state, turn: t };
			state = combatService.tickCombat(state, 16);
			if ((state.pawns[0].injuries?.length ?? 0) > 0) pawnInjured = true;
		}
		expect(pawnInjured).toBe(true);
	});

	it('rolls between a pawn’s natural weapons (fists/kick) with per-weapon stamina', () => {
		const attacker = makePawn();
		const defender = makeGoblin({ stats: { ...stats, dexterity: 2 } }); // low dodge → lots of hits
		const empty = makeState([], []);
		const seen = new Set<string>();
		const staminaByWeapon = new Map<string, number>();
		for (let i = 0; i < 400; i++) {
			const r = combatService.resolveHit(attacker, defender, empty);
			seen.add(r.weaponId);
			staminaByWeapon.set(r.weaponId, r.staminaCost);
		}
		// Both bare-handed attacks should turn up across 400 swings.
		expect(seen.has('fists')).toBe(true);
		expect(seen.has('kick')).toBe(true);
		// Kicks cost more stamina than jabs (per-weapon staminaCost surfaced).
		expect(staminaByWeapon.get('kick')!).toBeGreaterThan(staminaByWeapon.get('fists')!);
	});

	it('lands critical hits for a high-crit attacker (stat + weapon critMod)', () => {
		// High DEX/PER pawn → high base crit_chance; low-dodge target → mostly hits.
		const attacker = makePawn({ stats: { ...stats, dexterity: 22, perception: 22 } });
		const defender = makeGoblin({ stats: { ...stats, dexterity: 1 } });
		const empty = makeState([], []);
		let crits = 0;
		let hits = 0;
		for (let i = 0; i < 500; i++) {
			const r = combatService.resolveHit(attacker, defender, empty);
			if (r.hit) hits++;
			if (r.crit) crits++;
		}
		expect(hits).toBeGreaterThan(0);
		expect(crits).toBeGreaterThan(0);
	});
});

describe('natural-weapon data contract', () => {
	it('every creature natural-weapon id resolves to a natural_weapon item', () => {
		for (const creature of CREATURES) {
			for (const id of creature.naturalWeapons) {
				const item = itemService.getItemById(id);
				expect(item, `${creature.id} references missing weapon '${id}'`).toBeDefined();
				expect(item!.category, `'${id}' should be a natural_weapon`).toBe('natural_weapon');
				expect(item!.weaponProperties, `'${id}' needs weaponProperties`).toBeDefined();
			}
		}
	});

	it('pawn default attacks (fists/kick) exist as natural_weapon items', () => {
		for (const id of ['fists', 'kick']) {
			const item = itemService.getItemById(id);
			expect(item?.category).toBe('natural_weapon');
			expect(item?.weaponProperties?.damageType).toBeDefined();
		}
	});
});
