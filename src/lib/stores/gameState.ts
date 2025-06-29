import { browser } from '$app/environment';
import { writable, derived } from 'svelte/store';
import type { GameState, Resource } from '$lib/game/core/types';
import { generateRace } from '$lib/game/core/Race';

// Game timing configuration
const TURN_INTERVAL = 3000; // 3 seconds per turn for better visibility
let gameInterval: number | null = null;


function createGameState() {
  const initialResources: Resource[] = [
    { id: 'food', name: 'Food', amount: 100, type: 'basic' },
    { id: 'wood', name: 'Wood', amount: 50, type: 'basic' },
    { id: 'stone', name: 'Stone', amount: 30, type: 'basic' }
  ];

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

// Update the initial state creation:
const savedState = loadFromLocalStorage();
const initialState: GameState = savedState || {
  turn: 0,
  race: generateRace(),
  resources: initialResources,
  heroes: [],
  knowledge: 0,
  worldMap: [],
  discoveredLocations: []
};

const { subscribe, set, update } = writable(initialState);

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

  function advanceTurn() {
    update(state => {
      const newState = { ...state, turn: state.turn + 1 };
      
      // Generate knowledge based on race intelligence
      const knowledgeGain = Math.floor((state.race.baseStats.intelligence + state.race.baseStats.wisdom) / 10);
      newState.knowledge += knowledgeGain;
      
      // Resource generation per turn (static wood/stone, food scales with population)
      newState.resources = newState.resources.map(resource => {
        let production = 0;
        
        switch (resource.id) {
          case 'food':
            production = state.race.population * 3; // 3 food per population
            break;
          case 'wood':
            production = 2; // Static production
            break;
          case 'stone':
            production = 1; // Static production
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
