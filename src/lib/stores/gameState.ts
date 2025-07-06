// src/lib/stores/gameState.ts
import { browser } from '$app/environment';
import { writable, derived } from 'svelte/store';
import type { GameState } from '$lib/game/core/types';
import { generateRace } from '$lib/game/core/Race';
import { getBasicMaterials } from '$lib/game/core/Items';
import { initializeAllLocations } from '$lib/game/core/Locations';
import {
  AVAILABLE_BUILDINGS,
  canAffordBuilding,
  canBuildWithPopulation
} from '$lib/game/core/Buildings';

// Game timing configuration
const TURN_INTERVAL = 3000;
let gameInterval: number | null = null;

// Export the initial state for easy access
export const initialGameState: GameState = {
  turn: 0,
  race: generateRace(),
  item: getBasicMaterials().map(item => ({ ...item, amount: 0 })),
  heroes: [],
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
  inventory: {},
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
  activeExplorationMissions: [], // Added empty array for exploration missions
  
  // Work System additions
  workAssignments: {}, // Empty work assignments initially
  productionTargets: [], // No production targets initially
  pawns: [] // No pawns initially - will be generated based on population
};

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

function createGameState() {

   // Initialize locations at game start
  initializeAllLocations();

  const savedState = loadFromLocalStorage();
  const { subscribe, set, update } = writable(savedState || initialGameState);

  const updateWithSave = (updater: (state: GameState) => GameState) => {
    update(state => {
      const newState = updater(state);
      saveToLocalStorage(newState);
      return newState;
    });
  };

  const isPaused = writable(false);
  const gameSpeed = writable(1);

  function startAutoTurns() {
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

  function advanceTurn() {
    updateWithSave(state => {
      let newState = { ...state, turn: state.turn + 1 };

      newState = processResearch(newState);
      newState = processBuildingQueue(newState);
      newState = processCraftingQueue(newState);
      newState = generateItems(newState);

      return newState;
    });
  }

  function processResearch(state: GameState): GameState {
    if (!state.currentResearch) return state;

    const newState = { ...state };
    newState.currentResearch = { ...state.currentResearch };
    newState.currentResearch.currentProgress = (newState.currentResearch.currentProgress || 0) + 1;

    if (newState.currentResearch.currentProgress >= newState.currentResearch.researchTime) {
      // Research completed - add to completed research
      newState.completedResearch = [...(newState.completedResearch || []), newState.currentResearch.id];

      // Apply research unlocks (buildings, items, tool levels, etc.)
      if (newState.currentResearch.unlocks.toolTierRequired) {
        newState.currentToolLevel = Math.max(
          newState.currentToolLevel, 
          newState.currentResearch.unlocks.toolTierRequired
        );
      }

      // Clear current research
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
        newMaxPopulation += (building.effects.populationCapacity || 0) * count;
        woodBonus += (building.effects.woodProduction || 0) * count;
        stoneBonus += (building.effects.stoneProduction || 0) * count;
      }
    });

    return {
      ...state,
      buildingQueue: updatedQueue,
      buildingCounts: newBuildingCounts,
      maxPopulation: newMaxPopulation,
      _woodBonus: woodBonus,
      _stoneBonus: stoneBonus
    };
  }

  function processCraftingQueue(state: GameState): GameState {
    const completedCrafting: any[] = [];
    const updatedQueue = (state.craftingQueue || []).map(craftingItem => {
      const updated = { ...craftingItem, turnsRemaining: craftingItem.turnsRemaining - 1 };
      if (updated.turnsRemaining <= 0) {
        completedCrafting.push(updated);
      }
      return updated;
    }).filter(craftingItem => craftingItem.turnsRemaining > 0);

    // Add completed items to inventory
    const newInventory = { ...state.inventory };
    completedCrafting.forEach(craftingItem => {
      const itemId = craftingItem.item.id;
      const quantity = craftingItem.quantity || 1;
      newInventory[itemId] = (newInventory[itemId] || 0) + quantity;
    });

    return {
      ...state,
      craftingQueue: updatedQueue,
      inventory: newInventory
    };
  }

  function generateItems(state: GameState): GameState {
    const woodBonus = state._woodBonus || 0;
    const stoneBonus = state._stoneBonus || 0;

    const item = state.item.map(singleItem => {
      let production = 0;
      switch (singleItem.id) {
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
      return { ...singleItem, amount: singleItem.amount + production };
    });

    const { _woodBonus, _stoneBonus, ...rest } = state;

    return {
      ...rest,
      item
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
    update,
    isPaused: { subscribe: isPaused.subscribe },
    gameSpeed: { subscribe: gameSpeed.subscribe },
    
    startAutoTurns,
    stopAutoTurns,
    pauseGame,
    unpauseGame,
    togglePause,
    setGameSpeed,
    
    advanceTurn,
    addItem: (itemId: string, amount: number) => 
     updateWithSave(state => ({  // Use updateWithSave only for internal functions
      ...state,
      item: state.item.map(i =>
        i.id === itemId ? { ...i, amount: i.amount + amount } : i
      )
    }))
  };
}

export const gameState = createGameState();

// Derived stores for computed values
export const currentTurn = derived(gameState, $gameState => $gameState.turn);
export const currentItem = derived(gameState, $gameState => $gameState.item);
export const currentRace = derived(gameState, $gameState => $gameState.race);
export const currentInventory = derived(gameState, $gameState => $gameState.inventory);
