// src/lib/stores/uiState.ts
import { writable } from 'svelte/store';

interface UIState {
  currentScreen:
  | 'main'
  | 'pawns'
  | 'race'
  | 'building'
  | 'crafting'
  | 'research'
  | 'exploration'
  | 'work';
  showNotifications: boolean;
  lastEvent: string | null;
  /** Zone/designation painting mode. null = inactive. */
  designationActive: boolean;
  designationType: string | null;
}

function createUIState() {
  const initialState: UIState = {
    currentScreen: 'main',
    showNotifications: true,
    lastEvent: null,
    designationActive: false,
    designationType: null
  };

  const { subscribe, set, update } = writable(initialState);

  return {
    subscribe,
    set,
    update,

    setScreen: (screen: UIState['currentScreen']) =>
      update((state) => ({ ...state, currentScreen: screen })),

    toggleScreen: (screen: UIState['currentScreen']) =>
      update((state) => ({
        ...state,
        currentScreen: state.currentScreen === screen ? 'main' : screen
      })),

    addEvent: (event: string) => update((state) => ({ ...state, lastEvent: event })),

    clearEvent: () => update((state) => ({ ...state, lastEvent: null })),

    activateDesignation: (type: string) =>
      update((state) => ({ ...state, designationActive: true, designationType: type })),

    deactivateDesignation: () =>
      update((state) => ({ ...state, designationActive: false, designationType: null }))
  };
}

export const uiState = createUIState();
