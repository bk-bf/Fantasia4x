// src/lib/stores/gameState.ts
import { browser } from '$app/environment';
import { writable, derived } from 'svelte/store';
import type { GameState } from '$lib/game/core/types';
import { generateRace } from '$lib/game/core/Race';
import { BASIC_RESOURCES } from '$lib/game/core/Resources'; // Add this import

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
  buildings: [],
  buildingQueue: [],
  maxPopulation: 1
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
    const newState = { ...state, turn: state.turn + 1 };
    
    // Process building queue
    const completedBuildings: any[] = [];
    const updatedQueue = (newState.buildingQueue || []).map(item => {
      const updated = { ...item, turnsRemaining: item.turnsRemaining - 1 };
      if (updated.turnsRemaining <= 0) {
        completedBuildings.push(updated.building);
      }
      return updated;
    }).filter(item => item.turnsRemaining > 0);
    
    // Apply completed building effects
    let newMaxPopulation = newState.maxPopulation || 5;
    completedBuildings.forEach(building => {
      if (building.effects.maxPopulation) {
        newMaxPopulation += building.effects.maxPopulation;
      }
    });
    
    newState.buildingQueue = updatedQueue;
    newState.buildings = [...(newState.buildings || []), ...completedBuildings];
    newState.maxPopulation = newMaxPopulation;
    
    // Generate knowledge and resources (existing code)
    const knowledgeGain = Math.floor((state.race.baseStats.intelligence + state.race.baseStats.wisdom) / 10);
    newState.knowledge += knowledgeGain;
    
    // Calculate production bonuses from buildings
    let woodBonus = 0;
    let stoneBonus = 0;
    newState.buildings.forEach(building => {
      woodBonus += building.effects.woodProduction || 0;
      stoneBonus += building.effects.stoneProduction || 0;
    });
    
    newState.resources = newState.resources.map(resource => {
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

    return newState;
  });
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
