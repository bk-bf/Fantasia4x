// src/lib/stores/gameState.ts
import { browser } from '$app/environment';
import { writable, derived } from 'svelte/store';
import type { GameState } from '$lib/game/core/types';
import { generateRace } from '$lib/game/core/Race';
import { BASIC_RESOURCES } from '$lib/game/core/Resources'; // Add this import
  import {
    AVAILABLE_BUILDINGS,
    canAffordBuilding,
    canBuildWithPopulation
  } from '$lib/game/core/Buildings';
import { calculateKnowledgeGeneration } from '$lib/game/core/Research';

// Game timing configuration
const TURN_INTERVAL = 3000;
let gameInterval: number | null = null;

// Export the initial state for easy access
export const initialGameState: GameState = {
 turn: 0,
  race: generateRace(),
  resources: [...BASIC_RESOURCES],
  heroes: [],
  knowledge: 0,
  worldMap: [],
  discoveredLocations: [],
  buildingCounts: {}, // Replace buildings: []
  buildingQueue: [],
  maxPopulation: 1, 
  availableResearch: [],
  completedResearch: [],
  currentResearch: undefined,
  discoveredLore: [],
  knowledgeGeneration: 1,
   inventory: {}, // itemId -> quantity (unified for all item types)
  equippedItems: {
    weapon: null,
    head: null,
    chest: null,
    legs: null,
    feet: null,
    hands: null
  },
  craftingQueue: [],
  currentToolLevel: 0
 
};


function createGameState() {
  // Remove the duplicate initialResources array entirely

  // Add these functions before the return statement
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

  const savedState = loadFromLocalStorage();


const { subscribe, set, update } = writable(initialGameState);

// Wrap the original update to include auto-save
const updateWithSave = (updater: (state: GameState) => GameState) => {
  update(state => {
    const newState = updater(state);
    saveToLocalStorage(newState);
    return newState;
  });
};

  const isPaused = writable(false);
  const gameSpeed = writable(1);

  // Auto-turn system with resource generation
  function startAutoTurns() {
    // Only run in browser
    if (!browser) return;
    
    if (gameInterval) clearInterval(gameInterval);
    
    gameInterval = setInterval(() => {
      let currentlyPaused = false;
      isPaused.subscribe(paused => {
        currentlyPaused = paused;
      })();
      
      if (!currentlyPaused) {
        advanceTurn();
      }
    }, TURN_INTERVAL);
  }

  function stopAutoTurns() {
    if (browser && gameInterval) {
      clearInterval(gameInterval);
      gameInterval = null;
    }
  }

// Update the advanceTurn function to process building queue
function advanceTurn() {
	updateWithSave(state => {
		let newState = { ...state, turn: state.turn + 1 };

		newState.knowledgeGeneration = calculateKnowledgeGeneration(
			state.race.baseStats,
			state.completedResearch || [],
			state.buildingCounts || {}
		);

		newState.knowledge += newState.knowledgeGeneration;

		newState = processResearch(newState);
		newState = processBuildingQueue(newState);
		newState = generateResources(newState);

		return newState;
	});
}

// --- Helper functions for advanceTurn ---

function processResearch(state: GameState): GameState {
	if (!state.currentResearch) return state;

	const newState = { ...state };
	newState.currentResearch = { ...state.currentResearch };
	newState.currentResearch.currentProgress = (newState.currentResearch.currentProgress || 0) + 1;

	if (newState.currentResearch.currentProgress >= newState.currentResearch.researchTime) {
		newState.completedResearch = [...(newState.completedResearch || []), newState.currentResearch.id];

		if (newState.currentResearch.unlocks.effects) {
			Object.entries(newState.currentResearch.unlocks.effects).forEach(([effect, value]) => {
				if (effect === 'knowledgeMultiplier') {
					newState.knowledgeGeneration = Math.floor(newState.knowledgeGeneration * value);
				}
				// Add more effect types as needed
			});
		}
		newState.currentResearch = undefined;
	}

	return newState;
}

function processBuildingQueue(state: GameState): GameState {
	const completedBuildings: any[] = [];
	const updatedQueue = (state.buildingQueue || []).map(item => {
		const updated = { ...item, turnsRemaining: item.turnsRemaining - 1 };
		if (updated.turnsRemaining <= 0) {
			completedBuildings.push(updated.building);
		}
		return updated;
	}).filter(item => item.turnsRemaining > 0);

	const newBuildingCounts = { ...state.buildingCounts };
	let newMaxPopulation = 1;
	let woodBonus = 0;
	let stoneBonus = 0;

	completedBuildings.forEach(building => {
		newBuildingCounts[building.id] = (newBuildingCounts[building.id] || 0) + 1;
	});

	Object.entries(newBuildingCounts).forEach(([buildingId, count]) => {
		const building = AVAILABLE_BUILDINGS.find(b => b.id === buildingId);
		if (building && count > 0) {
			newMaxPopulation += (building.effects.maxPopulation || 0) * count;
			woodBonus += (building.effects.woodProduction || 0) * count;
			stoneBonus += (building.effects.stoneProduction || 0) * count;
		}
	});

	return {
		...state,
		buildingQueue: updatedQueue,
		buildingCounts: newBuildingCounts,
		maxPopulation: newMaxPopulation,
		_woodBonus: woodBonus, // for resource generation
		_stoneBonus: stoneBonus // for resource generation
	};
}

// TODO: Refactor generateResources to remove hardcoded base production values for food, wood, and stone.
// Instead, fetch base production values from Resources.ts or Buildings.ts, or define them in a central config.
// Consider redesigning resource generation so that it can combine stat-derived production (e.g., knowledge from int + wis)
// with building bonuses (as additive or multiplicative effects), allowing for more flexible and extensible resource logic.
function generateResources(state: GameState): GameState {
	const woodBonus = state._woodBonus || 0;
	const stoneBonus = state._stoneBonus || 0;

	const resources = state.resources.map(resource => {
		let production = 0;
		switch (resource.id) {
			case 'food':
				production = state.race.population * 3;
				break;
			case 'wood':
				production = 2 + woodBonus;
				break;
			case 'stone':
				production = 1 + stoneBonus;
				break;
		}
		return { ...resource, amount: resource.amount + production };
	});

	// Remove temp bonuses from state
	const { _woodBonus, _stoneBonus, ...rest } = state;

	return {
		...rest,
		resources
	};
}

  function pauseGame() {
    isPaused.set(true);
  }

  function unpauseGame() {
    isPaused.set(false);
  }

  function togglePause() {
    isPaused.update(paused => !paused);
  }

  function setGameSpeed(speed: number) {
    gameSpeed.set(speed);
    if (browser && gameInterval) {
      stopAutoTurns();
      // Adjust interval based on speed
      const newInterval = TURN_INTERVAL / speed;
      gameInterval = setInterval(() => {
        let currentlyPaused = false;
        isPaused.subscribe(paused => {
          currentlyPaused = paused;
        })();
        
        if (!currentlyPaused) {
          advanceTurn();
        }
      }, newInterval);
    }
  }

  return {
    subscribe,
    set,
    update: updateWithSave,
    isPaused: { subscribe: isPaused.subscribe },
    gameSpeed: { subscribe: gameSpeed.subscribe },
    
    // Game control methods
    startAutoTurns,
    stopAutoTurns,
    pauseGame,
    unpauseGame,
    togglePause,
    setGameSpeed,
    
    // Game action methods
    advanceTurn,
    addResource: (resourceId: string, amount: number) => 
      update(state => ({
        ...state,
        resources: state.resources.map(r => 
          r.id === resourceId ? { ...r, amount: r.amount + amount } : r
        )
      }))
  };
}

export const gameState = createGameState();

// Derived stores for computed values
export const currentTurn = derived(gameState, $gameState => $gameState.turn);
export const currentKnowledge = derived(gameState, $gameState => $gameState.knowledge);
export const currentResources = derived(gameState, $gameState => $gameState.resources);
export const currentRace = derived(gameState, $gameState => $gameState.race);
