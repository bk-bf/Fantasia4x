import { browser } from '$app/environment';
import { writable, derived } from 'svelte/store';
import { GameStateManager } from '$lib/game/core/GameState';
import { gameEngine } from '$lib/game/systems/GameEngineImpl';
import type { GameState, Pawn } from '$lib/game/core/types';
import { generatePawns, processPawnTurn } from '$lib/game/entities/Pawns';
import { generateRace } from '$lib/game/core/Race';
import { itemService } from '$lib/game/services/ItemService';
import { locationService } from '$lib/game/services/LocationServices';
import { buildingService } from '$lib/game/services/BuildingService';
import { workService } from '$lib/game/services/WorkService';
import { syncPawnInventoryWithGlobal, syncAllPawnInventories } from '$lib/game/core/PawnEquipment';
import { calculatePawnAbilities } from '$lib/game/entities/Pawns';
import { eventSystem } from '$lib/game/core/Events';
import { triggerEvent } from '$lib/stores/eventStore';


// ===== CONFIGURATION =====
const TURN_INTERVAL = 3000;

// ===== STATE VARIABLES =====
let gameInterval: number | null = null;
let autoTurnInterval: number | null = null;
let isPausedValue = false;
let gameSpeedValue = 1;

// ===== INITIAL STATE =====
export const initialGameState: GameState = {
	turn: 0,
	race: generateRace(),
	pawns: [],
	item: itemService.getItemsByCategory('basic').map((item) => ({ ...item, amount: 0 })),
	worldMap: [],
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

// If no pawns, generate them from the race
if (!baseState.pawns || baseState.pawns.length === 0) {
	baseState = {
		...baseState,
		pawns: generatePawns(baseState.race)
	};
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
	consumeGlobalItem
};

// Export the updateWithSave function directly for GameEngine
// (Removed duplicate export to fix redeclaration error)

// Derived stores
export const currentTurn = derived(gameState, ($gameState) => $gameState.turn);
export const currentItem = derived(gameState, ($gameState) => $gameState.item);
export const currentRace = derived(gameState, ($gameState) => $gameState.race);
export const pawnAbilities = derived(gameState, ($gameState) => $gameState.pawnAbilities || {});