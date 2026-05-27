// src/lib/stores/uiState.ts
import { writable } from 'svelte/store';

type Screen = 'main' | 'pawns' | 'race' | 'building' | 'crafting' | 'research' | 'exploration' | 'work';

interface UIState {
  currentScreen: Screen;
  showNotifications: boolean;
  lastEvent: string | null;
  /** Zone/designation painting mode. null = inactive. */
  designationActive: boolean;
  designationType: string | null;
  /** Screen to return to after zone painting ends. */
  _screenBeforeDesignation: Screen | null;
}

function createUIState() {
  const initialState: UIState = {
    currentScreen: 'main',
    showNotifications: true,
    lastEvent: null,
    designationActive: false,
    designationType: null,
    _screenBeforeDesignation: null
  };

  const { subscribe, set, update } = writable(initialState);

  return {
    subscribe,
    set,
    update,

    setScreen: (screen: Screen) =>
      update((state) => ({ ...state, currentScreen: screen })),

    toggleScreen: (screen: Screen) =>
      update((state) => ({
        ...state,
        currentScreen: state.currentScreen === screen ? 'main' : screen
      })),

    addEvent: (event: string) => update((state) => ({ ...state, lastEvent: event })),

    clearEvent: () => update((state) => ({ ...state, lastEvent: null })),

    activateDesignation: (type: string) =>
      update((state) => ({
        ...state,
        designationActive: true,
        designationType: type,
        _screenBeforeDesignation: state.currentScreen !== 'main' ? state.currentScreen : state._screenBeforeDesignation,
        currentScreen: 'main'
      })),

    deactivateDesignation: () =>
      update((state) => ({
        ...state,
        designationActive: false,
        designationType: null,
        currentScreen: state._screenBeforeDesignation ?? state.currentScreen,
        _screenBeforeDesignation: null
      }))
  };
}

export const uiState = createUIState();
