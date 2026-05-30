import { browser } from '$app/environment';
import { writable, derived, get } from 'svelte/store';
import { GameStateManager, consumeFromStockpiles, addToStockpileZone } from '$lib/game/core/GameState';
import { gameEngine } from '$lib/game/systems/GameEngineImpl';
import type { GameState, Pawn, WorldTile, FilterableZoneType } from '$lib/game/core/types';
import { generatePawns } from '$lib/game/entities/Pawns';
import { pawnService } from '$lib/game/services/PawnService';
import { generateRace } from '$lib/game/core/Race';
import { itemService } from '$lib/game/services/ItemService';
import { locationService } from '$lib/game/services/LocationServices';
import { buildingService } from '$lib/game/services/BuildingService';
import { workService } from '$lib/game/services/WorkService';
import { syncPawnInventoryWithGlobal, syncAllPawnInventories } from '$lib/game/core/PawnEquipment';
import { calculatePawnAbilities } from '$lib/game/entities/Pawns';
import { eventSystem } from '$lib/game/core/Events';
import { triggerEvent } from '$lib/stores/eventStore';
import { generateWorld } from '$lib/game/world/WorldGenerator';
import { resourceGeneratorService } from '$lib/game/services/ResourceGeneratorService';
import { loadSave, scheduleSave, deleteSave } from './saveManager';
import { applyDevWorld } from '$lib/game/dev/devWorld';
import { TICKS_PER_SECOND, ticksFromSeconds } from '$lib/game/core/time';


// ===== CONFIGURATION =====
const TURN_INTERVAL = 3000;

// ===== STATE VARIABLES =====
let gameInterval: ReturnType<typeof setInterval> | null = null;
let autoTurnInterval: ReturnType<typeof setInterval> | null = null;
let gameSpeedValue = 1;

// ===== WORLD GENERATION =====
/** Bump this when the world generation algorithm changes to force a regen. */
const WORLD_VERSION = 11; // fallen_logs → P(209)
const WORLD_VERSION_KEY = 'fantasia4x-world-version';
const WORLD_SEED = Date.now();
const _generatedWorld = generateWorld(240, 160, WORLD_SEED);
resourceGeneratorService.generateResources(_generatedWorld, WORLD_SEED);

// ===== INITIAL STATE =====
export const initialGameState: GameState = {
	turn: ticksFromSeconds(100), // 08:00 — turn counts ticks; 100 in-game s × TICKS_PER_SECOND (TURNS_PER_DAY=300 s)
	race: generateRace(),
	pawns: [],
	// REVERTED: Back to original - no starter food added
	item: [
		...itemService.getItemsByCategory('basic').map((item) => ({ ...item, amount: 0 }))
	].filter(item => item !== undefined),
	worldMap: _generatedWorld,
	discoveredLocations: [],
	buildingCounts: {},
	buildingQueue: [],
	/** Phase 4: placed buildings on the map */
	buildings: [],
	/** Phase 4: colony stockpile from harvesting */
	stockpile: {},
	/** Stockpile zones — each zone owns specific tiles and tracks its own inventory. */
	stockpileZones: [
		{
			id: 'zone-general',
			name: 'Colony Stockpile',
			tiles: [],
			filter: { allowedCategories: [], blockedItems: [] },
			inventory: {}
		}
	],
	/** Phase 4: designated tile actions */
	designations: {},
	/** Phase 5a: active job pool */
	jobs: [],
	maxPopulation: 1,
	availableResearch: [],
	completedResearch: [],
	currentResearch: undefined,
	discoveredLore: [],
	_woodBonus: 0,
	_stoneBonus: 0,
	equippedItems: {
		weapon: null,
		head: null,
		chest: null,
		legs: null,
		feet: null,
		hands: null
	},
	craftingQueue: [],
	currentToolLevel: 0,
	activeExplorationMissions: [],
	workAssignments: {},
	productionTargets: [],
	currentJobIndex: {},
	pawnAbilities: {},
	droppedItems: [],
	deadPawns: []
};

// ===== UTILITY FUNCTIONS =====

/** Apply all legacy field migrations to a loaded save. */
function applyMigrations(state: GameState): GameState {
	// Phase 4 migration: backfill new fields for old saves
	if (!state.buildings) {
		state.buildings = Object.entries(state.buildingCounts ?? {}).flatMap(
			([type, count]) =>
				Array.from({ length: count }, (_, i) => ({
					id: `${type}-legacy-${i}`,
					type,
					x: 0,
					y: 0,
					status: 'complete' as const,
					progress: 1
				}))
		);
	}
	if (!state.stockpile) state.stockpile = {};
	// Migrate to multi-zone stockpile system
	if (!state.stockpileZones || state.stockpileZones.length === 0) {
		const existingTiles = Object.entries(state.designations ?? {})
			.filter(([, t]) => t === 'stockpile')
			.map(([key]) => key);
		state.stockpileZones = [
			{
				id: 'zone-general',
				name: 'Colony Stockpile',
				tiles: existingTiles,
				filter: { allowedCategories: [], blockedItems: [] },
				inventory: { ...(state.stockpile ?? {}) }
			}
		];
	}
	if (!state.designations) state.designations = {};
	if (!state.jobs) state.jobs = [];
	// Phase 5c: migrate old buildingQueue entries to PlacedBuilding (work-point model)
	if (state.buildingQueue && state.buildingQueue.length > 0) {
		const migratedBuildings = state.buildingQueue.map((entry: any, i: number) => {
			const buildTime = entry.building?.buildTime ?? 10;
			const workRequired = buildTime * 10;
			const workDone = Math.round(
				(1 - Math.max(0, entry.turnsRemaining) / buildTime) * workRequired
			);
			return {
				id: `${entry.building.id}-migrated-${i}-${Date.now()}`,
				type: entry.building.id,
				x: 0,
				y: 0,
				status: 'under_construction' as const,
				progress: workDone / workRequired,
				workRequired,
				workDone,
				materialsDelivered: true
			};
		});
		state.buildings = [...(state.buildings ?? []), ...migratedBuildings];
		state.buildingQueue = [];
	}
	// Migrate legacy zoneFilters to zoneInstances
	if ((!state.zoneInstances || state.zoneInstances.length === 0) && state.zoneFilters) {
		const instances: import('$lib/game/core/types').ZoneInstance[] = [];
		const zoneIdMap: Record<string, string> = { ...(state.designationZoneId ?? {}) };
		for (const [typeKey, filter] of Object.entries(state.zoneFilters)) {
			const type = typeKey as FilterableZoneType;
			if (!filter) continue;
			const tilesOfType = Object.entries(state.designations ?? {}).filter(([, t]) => t === type);
			if (tilesOfType.length > 0 || filter.allowedCategories.length > 0) {
				const id = `${type}-migrated`;
				const label = `${type.charAt(0).toUpperCase()}${type.slice(1)} 1`;
				instances.push({ id, type, label, filter });
				for (const [key] of tilesOfType) {
					zoneIdMap[key] = id;
				}
			}
		}
		if (instances.length > 0) {
			state = { ...state, zoneInstances: instances, designationZoneId: zoneIdMap };
		}
	}
	// SURVIVAL-HEALTH migration: backfill new pawn health fields for old saves
	if (!state.deadPawns) state.deadPawns = [];
	state.pawns = state.pawns.map((p) => {
		const needsInit = p.isAlive === undefined || !p.limbs || p.bloodVolume === undefined;
		if (!needsInit) return p;
		return {
			...p,
			isAlive: p.isAlive ?? true,
			bloodVolume: p.bloodVolume ?? 100,
			conditions: p.conditions ?? [],
			limbs: p.limbs ?? [
				{ id: 'head', health: 100, isMissing: false, bleedRate: 0 },
				{ id: 'torso', health: 100, isMissing: false, bleedRate: 0 },
				{ id: 'left_arm', health: 100, isMissing: false, bleedRate: 0 },
				{ id: 'right_arm', health: 100, isMissing: false, bleedRate: 0 },
				{ id: 'left_leg', health: 100, isMissing: false, bleedRate: 0 },
				{ id: 'right_leg', health: 100, isMissing: false, bleedRate: 0 }
			]
		};
	});
	return state;
}

// ===== PAWN SPAWN HELPERS =====
function findNearestWalkable(
	worldMap: WorldTile[][],
	cx: number,
	cy: number,
	occupied: Set<string>
): { x: number; y: number } | null {
	const mapH = worldMap.length;
	const mapW = worldMap[0]?.length ?? 0;
	const maxR = Math.max(mapW, mapH);
	for (let r = 0; r <= maxR; r++) {
		for (let dy = -r; dy <= r; dy++) {
			for (let dx = -r; dx <= r; dx++) {
				if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // border only
				const x = cx + dx;
				const y = cy + dy;
				if (x < 0 || y < 0 || x >= mapW || y >= mapH) continue;
				const tile = worldMap[y]?.[x];
				if (!tile?.walkable) continue;
				const key = `${x},${y}`;
				if (occupied.has(key)) continue;
				return { x, y };
			}
		}
	}
	return null;
}

function spawnPawnsOnMap(pawns: Pawn[], worldMap: WorldTile[][]): Pawn[] {
	const mapW = worldMap[0]?.length ?? 120;
	const mapH = worldMap.length;
	const cx = Math.floor(mapW / 2);
	const cy = Math.floor(mapH / 2);
	const occupied = new Set<string>();
	return pawns.map((p) => {
		if (p.position) {
			occupied.add(`${p.position.x},${p.position.y}`);
			return p;
		}
		const pos = findNearestWalkable(worldMap, cx, cy, occupied) ?? { x: cx, y: cy };
		occupied.add(`${pos.x},${pos.y}`);
		return { ...p, position: pos, path: [], pathIndex: 0, isMoving: false, hasReachedDestination: false };
	});
}

function updatePawnAbilities(state: GameState): GameState {
	const newPawnAbilities: Record<string, Record<string, { value: number; sources: string[] }>> = {};

	state.pawns.forEach((pawn) => {
		newPawnAbilities[pawn.id] = calculatePawnAbilities(pawn);
	});

	return {
		...state,
		pawnAbilities: newPawnAbilities
	};
}

// ===== AUTO-TURN FUNCTIONS =====
function startAutoTurns() {
	if (autoTurnInterval) {
		clearInterval(autoTurnInterval);
	}

	// Uniform fixed-timestep loop: every interval fire IS one tick, and one tick
	// is one full sim step. processGameTurn() runs the entire pipeline (movement,
	// needs, work, research, buildings, events) and advances gameState.turn by 1.
	// At 1× speed this fires TICKS_PER_SECOND times per real second.
	autoTurnInterval = setInterval(() => {
		if (get(isPaused)) return;

		const result = gameEngine.processGameTurn();
		if (!result.success) {
			console.error('[AutoTurn] GameEngine tick processing failed:', result.errors);
		}
	}, 1000 / (TICKS_PER_SECOND * gameSpeedValue));
}

function stopAutoTurns() {
	if (autoTurnInterval) {
		clearInterval(autoTurnInterval);
		autoTurnInterval = null;
	}
}

function pauseGame() {
	isPaused.set(true);
}

function unpauseGame() {
	isPaused.set(false);
}

function togglePause() {
	isPaused.update((paused) => !paused);
}

function setGameSpeed(speed: number) {
	gameSpeed.set(speed);
	if (browser && gameInterval) {
		stopAutoTurns();
		const newInterval = TURN_INTERVAL / speed;
		gameInterval = setInterval(() => {
			let currentlyPaused = false;
			isPaused.subscribe((paused) => {
				currentlyPaused = paused;
			})();

			if (!currentlyPaused) {
				advanceTurn();
			}
		}, newInterval);
	}
}

// ===== DEPRECATED FUNCTION =====
function advanceTurn() {
	console.warn('[GameState] DEPRECATED: advanceTurn() called. Using GameEngine instead.');
	const result = gameEngine.processGameTurn();
	if (!result.success) {
		console.error('[GameState] GameEngine turn processing failed:', result.errors);
	}
}

// ===== WORLD REGEN =====
function regenWorld(seed?: number, dev = false, itemQty = 500) {
	const s = (seed !== undefined ? seed : Date.now()) >>> 0 || 1;
	const newWorld = generateWorld(240, 160, s);
	resourceGeneratorService.generateResources(newWorld, s);
	// Patch the engine's internal state FIRST so the next auto-turn
	// doesn't overwrite the store back to the old worldMap.
	gameEngine.patchWorldMap(newWorld);
	if (dev) {
		updateWithSave((state) => applyDevWorld({ ...state, worldMap: newWorld }, itemQty));
	} else {
		updateWithSave((state) => ({ ...state, worldMap: newWorld }));
	}
	if (browser) localStorage.setItem(WORLD_VERSION_KEY, String(WORLD_VERSION));
}

// ===== ITEM MANAGEMENT =====
function consumeGlobalItem(itemId: string, quantity: number = 1) {
	updateWithSave((state) => {
		const current = (state.stockpile ?? {})[itemId] ?? 0;
		if (current < quantity) return state;
		return consumeFromStockpiles(state, { [itemId]: quantity });
	});
}

function addItem(itemId: string, amount: number) {
	updateWithSave((state) => addToStockpileZone(state, null, { [itemId]: amount }));
}

function resetGame() {
	deleteSave().catch(console.error);
	set(initialGameState);
	console.info('[GameState] Game reset to initial state.');
}

/**
 * Completely nuke all persisted state and reload the page.
 *
 * Stops the auto-turn timer FIRST so no in-flight turn can
 * re-write localStorage after the wipe but before reload.
 * Then removes every fantasia4x-* key so nothing stale survives.
 */
function wipeAndReload() {
	// 1. Kill timers — no more saves can fire after this point.
	stopAutoTurns();

	if (browser) {
		// 2. Delete the IndexedDB save (also clears any lingering localStorage keys).
		deleteSave().finally(() => {
			// 3. Reset in-memory store so Svelte subscribers don't trigger another save.
			set(initialGameState);
			// 4. Reload.
			location.reload();
		});
	}
}

// ===== MAIN STORE SETUP =====
// Initialize locations at game start
locationService.initializeAllLocations();

// Create the main store starting with a fresh game. The actual save is loaded
// asynchronously below.
//
// This is a custom store (not a plain `writable`) so the GameEngine can update
// the held value on EVERY tick — keeping `get(gameState)` fresh so manual edits
// are never lost — while only NOTIFYING subscribers at a throttled rate. Manual
// edits made through `set`/`update`/`updateWithSave` notify subscribers
// immediately, so user actions stay snappy.
function createGameStore(initial: GameState) {
	let value = initial;
	const subscribers = new Set<(v: GameState) => void>();
	return {
		subscribe(run: (v: GameState) => void) {
			subscribers.add(run);
			run(value);
			return () => subscribers.delete(run);
		},
		set(v: GameState) {
			value = v;
			subscribers.forEach((run) => run(value));
		},
		update(updater: (v: GameState) => GameState) {
			value = updater(value);
			subscribers.forEach((run) => run(value));
		},
		/** Update the held value WITHOUT notifying subscribers (engine hot path). */
		setSilent(v: GameState) {
			value = v;
		},
		/** Flush the current value to all subscribers. */
		notify() {
			subscribers.forEach((run) => run(value));
		}
	};
}

const gameStore = createGameStore(initialGameState);
const { subscribe, set, update } = gameStore;

// Create update function — schedules a debounced IndexedDB save on every mutation.
const updateWithSave = (updater: (state: GameState) => GameState) => {
	update((state) => {
		const newState = updater(state);
		scheduleSave(newState);
		return newState;
	});
};

// Engine tick push: refresh the held value every tick (so `get()` stays current
// and manual edits survive the read-modify-write loop) but only notify
// subscribers when `flush` is true. Saves are still scheduled (debounced) each
// tick exactly as before.
const pushFromEngine = (state: GameState, flush: boolean) => {
	gameStore.setSilent(state);
	scheduleSave(state);
	if (flush) gameStore.notify();
};

// ===== INITIALIZE GAMEENGINE =====
const gameStateManager = new GameStateManager(initialGameState);
gameEngine.setGameStateManager(gameStateManager);
console.log('[GameState] GameEngine initialized with GameStateManager');

// ===== ASYNC SAVE LOAD + MIGRATIONS =====
/** Resolves when the persisted save (if any) has been loaded and applied. */
export const savedStateReady: Promise<void> = (async () => {
	if (!browser) return;

	const savedState = await loadSave();
	let baseState = savedState ? applyMigrations(savedState) : initialGameState;

	// World map migrations (same logic as before, now runs after async load)
	if (!baseState.worldMap || baseState.worldMap.length === 0 || !baseState.worldMap[0]?.[0]?.terrainType) {
		const migrateSeed = Date.now();
		const migratedWorld = generateWorld(240, 160, migrateSeed);
		resourceGeneratorService.generateResources(migratedWorld, migrateSeed);
		baseState = { ...baseState, worldMap: migratedWorld };
		localStorage.setItem(WORLD_VERSION_KEY, String(WORLD_VERSION));
	} else if (localStorage.getItem(WORLD_VERSION_KEY) !== String(WORLD_VERSION)) {
		const migrateSeed = Date.now();
		const migratedWorld = generateWorld(240, 160, migrateSeed);
		resourceGeneratorService.generateResources(migratedWorld, migrateSeed);
		baseState = { ...baseState, worldMap: migratedWorld };
		localStorage.setItem(WORLD_VERSION_KEY, String(WORLD_VERSION));
	} else if (!baseState.worldMap[0]?.[1]?.discovered) {
		baseState = {
			...baseState,
			worldMap: baseState.worldMap.map(row =>
				row.map(tile => (tile.discovered ? tile : { ...tile, discovered: true }))
			)
		};
	}

	// Backfill resources if all tiles are empty (migration from pre-resource-gen saves)
	if (
		baseState.worldMap.length > 0 &&
		baseState.worldMap.every(row => row.every(tile => Object.keys(tile.resources ?? {}).length === 0))
	) {
		resourceGeneratorService.generateResources(baseState.worldMap, Date.now());
	}

	// Pawn generation / backfill
	if (!baseState.pawns || baseState.pawns.length === 0) {
		baseState = { ...baseState, pawns: generatePawns(baseState.race, 5) };
	} else if (baseState.pawns.length < 5) {
		const extra = generatePawns(baseState.race, 5 - baseState.pawns.length).map((p, i) => ({
			...p,
			id: `pawn-extra-${i}-${Date.now()}`
		}));
		baseState = { ...baseState, pawns: [...baseState.pawns, ...extra] };
	}

	// Spawn pawns that have no map position yet
	if (baseState.pawns.some(p => !p.position)) {
		baseState = { ...baseState, pawns: spawnPawnsOnMap(baseState.pawns, baseState.worldMap) };
	}

	// Push loaded state into the store and sync GameEngine
	set(baseState);
	gameEngine.setGameStateManager(new GameStateManager(baseState));
})().catch(err => {
	console.error('[GameState] Failed to load save, starting fresh:', err);
});

// Create control stores — seed pause from sessionStorage so HMR doesn't unpause.
const _pausedSeed = typeof sessionStorage !== 'undefined'
	? sessionStorage.getItem('fantasia4x-paused') === 'true'
	: false;
const isPaused = writable(_pausedSeed);
isPaused.subscribe((v) => {
	if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('fantasia4x-paused', String(v));
});
const gameSpeed = writable(1);

// Subscribe to keep track of current speed value
gameSpeed.subscribe(value => {
	gameSpeedValue = value;
});


// ===== EXPORTS =====
export const gameState = {
	subscribe,
	set,
	update,
	updateWithSave,
	pushFromEngine,
	isPaused: { subscribe: isPaused.subscribe },
	gameSpeed: { subscribe: gameSpeed.subscribe },

	// Auto-turn functions
	startAutoTurns,
	stopAutoTurns,
	pauseGame,
	unpauseGame,
	togglePause,
	setGameSpeed,

	// Game functions
	advanceTurn,
	addItem,
	consumeGlobalItem,
	resetGame,
	wipeAndReload,
	regenWorld
};

// Export the updateWithSave function directly for GameEngine
// (Removed duplicate export to fix redeclaration error)

// ===== HMR CLEANUP =====
// When Vite hot-replaces this module during development, stop any running
// interval so the old module's timer doesn't keep firing with a stale
// isPaused reference that can never be updated by the new module.
if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		stopAutoTurns();
	});
}

// Derived stores
export const currentTurn = derived(gameState, ($gameState) => $gameState.turn);
export const currentItem = derived(gameState, ($gameState) => $gameState.item);
export const currentRace = derived(gameState, ($gameState) => $gameState.race);
export const pawnAbilities = derived(gameState, ($gameState) => $gameState.pawnAbilities || {});

/** Items currently in the colony stockpile, enriched from the items database, sorted by name. */
export const currentStockpile = derived(gameState, ($gameState) =>
	Object.entries($gameState.stockpile ?? {})
		.filter(([, amount]) => amount > 0)
		.map(([id, amount]) => {
			const def = itemService.getItemById(id);
			return { id, name: def?.name ?? id, amount, color: def?.color, emoji: def?.emoji };
		})
		.sort((a, b) => a.name.localeCompare(b.name))
);

/** Per-zone inventory view, enriched from the items database. */
export const currentStockpileZones = derived(gameState, ($gameState) =>
	($gameState.stockpileZones ?? []).map((zone) => ({
		...zone,
		displayInventory: Object.entries(zone.inventory)
			.filter(([, amount]) => amount > 0)
			.map(([id, amount]) => {
				const def = itemService.getItemById(id);
				return { id, name: def?.name ?? id, amount, color: def?.color, emoji: def?.emoji };
			})
			.sort((a, b) => a.name.localeCompare(b.name))
	}))
);