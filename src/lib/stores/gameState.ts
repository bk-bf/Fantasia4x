import { browser } from '$app/environment';
import { writable, derived } from 'svelte/store';
import { GameStateManager } from '$lib/game/core/GameState';
import { gameEngine } from '$lib/game/systems/GameEngineImpl';
import type { GameState, Pawn, WorldTile } from '$lib/game/core/types';
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


// ===== CONFIGURATION =====
const TURN_INTERVAL = 3000;

// ===== STATE VARIABLES =====
let gameInterval: number | null = null;
let autoTurnInterval: number | null = null;
let isPausedValue = false;
let gameSpeedValue = 1;

// ===== WORLD GENERATION =====
/** Bump this when the world generation algorithm changes to force a regen. */
const WORLD_VERSION = 11; // fallen_logs → P(209)
const WORLD_VERSION_KEY = 'fantasia4x-world-version';
const WORLD_SEED = Date.now();
const _generatedWorld = generateWorld(120, 80, WORLD_SEED);
resourceGeneratorService.generateResources(_generatedWorld, WORLD_SEED);

// ===== INITIAL STATE =====
export const initialGameState: GameState = {
	turn: 0,
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
	pawnAbilities: {}
};

// ===== UTILITY FUNCTIONS =====
function saveToLocalStorage(state: GameState) {
	if (browser) {
		localStorage.setItem('fantasia4x-save', JSON.stringify(state));
	}
}

function loadFromLocalStorage(): GameState | null {
	if (browser) {
		const saved = localStorage.getItem('fantasia4x-save');
		if (saved) {
			try {
				return JSON.parse(saved);
			} catch (e) {
				console.warn('Failed to load save data:', e);
			}
		}
	}
	return null;
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

	autoTurnInterval = setInterval(() => {
		if (!isPausedValue) {
			console.log('[AutoTurn] Calling GameEngine.processGameTurn()');
			const result = gameEngine.processGameTurn();

			if (!result.success) {
				console.error('[AutoTurn] GameEngine turn processing failed:', result.errors);
			}
		}
	}, 1000 / gameSpeedValue);
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
function regenWorld(seed?: number) {
	const s = (seed !== undefined ? seed : Date.now()) >>> 0 || 1;
	const newWorld = generateWorld(120, 80, s);
	resourceGeneratorService.generateResources(newWorld, s);
	// Patch the engine's internal state FIRST so the next auto-turn
	// doesn't overwrite the store back to the old worldMap.
	gameEngine.patchWorldMap(newWorld);
	updateWithSave((state) => ({ ...state, worldMap: newWorld }));
	if (browser) localStorage.setItem(WORLD_VERSION_KEY, String(WORLD_VERSION));
}

// ===== ITEM MANAGEMENT =====
function consumeGlobalItem(itemId: string, quantity: number = 1) {
	updateWithSave((state) => {
		const itemIndex = state.item.findIndex((item) => item.id === itemId);
		if (itemIndex !== -1 && state.item[itemIndex].amount >= quantity) {
			const updatedItems = [...state.item];
			updatedItems[itemIndex] = {
				...updatedItems[itemIndex],
				amount: updatedItems[itemIndex].amount - quantity
			};

			if (updatedItems[itemIndex].amount <= 0) {
				updatedItems.splice(itemIndex, 1);
			}

			return {
				...state,
				item: updatedItems
			};
		}
		return state;
	});
}

function addItem(itemId: string, amount: number) {
	updateWithSave((state) => ({
		...state,
		item: state.item.map((i) => (i.id === itemId ? { ...i, amount: i.amount + amount } : i))
	}));
}

// ===== MAIN STORE SETUP =====
// Initialize locations at game start
locationService.initializeAllLocations();

const savedState = loadFromLocalStorage();
let baseState = savedState || initialGameState;

// Migrate old saves that have no world map or are missing terrain data
if (!baseState.worldMap || baseState.worldMap.length === 0 || !baseState.worldMap[0]?.[0]?.terrainType) {
	const migrateSeed = Date.now();
	const migratedWorld = generateWorld(120, 80, migrateSeed);
	resourceGeneratorService.generateResources(migratedWorld, migrateSeed);
	baseState = { ...baseState, worldMap: migratedWorld };
	if (browser) localStorage.setItem(WORLD_VERSION_KEY, String(WORLD_VERSION));
} else if (browser && localStorage.getItem(WORLD_VERSION_KEY) !== String(WORLD_VERSION)) {
	// World generation algorithm changed — regenerate map while keeping all other game state
	const migrateSeed = Date.now();
	const migratedWorld = generateWorld(120, 80, migrateSeed);
	resourceGeneratorService.generateResources(migratedWorld, migrateSeed);
	baseState = { ...baseState, worldMap: migratedWorld };
	localStorage.setItem(WORLD_VERSION_KEY, String(WORLD_VERSION));
} else if (!baseState.worldMap[0]?.[1]?.discovered) {
	// Patch saves where only tile (0,0) was discovered — set all tiles visible (DF-style)
	baseState = {
		...baseState,
		worldMap: baseState.worldMap.map(row => row.map(tile => tile.discovered ? tile : { ...tile, discovered: true }))
	};
}

// If no pawns, generate them from the race
if (!baseState.pawns || baseState.pawns.length === 0) {
	baseState = {
		...baseState,
		pawns: generatePawns(baseState.race)
	};
}

// Spawn any pawns that don't yet have map positions
if (baseState.pawns.some((p) => !p.position)) {
	baseState = { ...baseState, pawns: spawnPawnsOnMap(baseState.pawns, baseState.worldMap) };
}

// Create the main writable store
const { subscribe, set, update } = writable(baseState);

// Create update function with save
const updateWithSave = (updater: (state: GameState) => GameState) => {
	update((state) => {
		const newState = updater(state);
		saveToLocalStorage(newState);
		return newState;
	});
};

// ===== INITIALIZE GAMEENGINE =====
// Create GameStateManager and initialize GameEngine
const gameStateManager = new GameStateManager(baseState);
gameEngine.setGameStateManager(gameStateManager);

console.log('[GameState] GameEngine initialized with GameStateManager');

// Create control stores
const isPaused = writable(false);
const gameSpeed = writable(1);

// Subscribe to keep track of current values
isPaused.subscribe(value => {
	isPausedValue = value;
});

gameSpeed.subscribe(value => {
	gameSpeedValue = value;
});


// ===== EXPORTS =====
export const gameState = {
	subscribe,
	set,
	update,
	updateWithSave,
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
	regenWorld
};

// Export the updateWithSave function directly for GameEngine
// (Removed duplicate export to fix redeclaration error)

// Derived stores
export const currentTurn = derived(gameState, ($gameState) => $gameState.turn);
export const currentItem = derived(gameState, ($gameState) => $gameState.item);
export const currentRace = derived(gameState, ($gameState) => $gameState.race);
export const pawnAbilities = derived(gameState, ($gameState) => $gameState.pawnAbilities || {});