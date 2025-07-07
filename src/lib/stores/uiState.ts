// src/lib/stores/uiState.ts
import { writable } from 'svelte/store';

interface UIState {
  currentScreen: 'main' | 'pawns' | 'race' |'building' | 'crafting' | 'research' | 'exploration' | 'work';
  showNotifications: boolean;
  lastEvent: string | null;
}

function createUIState() {
  const initialState: UIState = {
    currentScreen: 'main',
    showNotifications: true,
    lastEvent: null
  };

  const { subscribe, set, update } = writable(initialState);

  return {
    subscribe,
    set,
    update,
    
    setScreen: (screen: UIState['currentScreen']) => 
      update(state => ({ ...state, currentScreen: screen })),
    
    addEvent: (event: string) =>
      update(state => ({ ...state, lastEvent: event })),
    
    clearEvent: () =>
      update(state => ({ ...state, lastEvent: null }))
  };
}

export const uiState = createUIState();
