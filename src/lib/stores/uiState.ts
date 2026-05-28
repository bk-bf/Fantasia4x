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
  /** Zone instance being painted (null = no instance / legacy). */
  activeZoneInstanceId: string | null;
  /** Screen to return to after zone painting ends. */
  _screenBeforeDesignation: Screen | null;
  /** Request the map to pan (and zoom) to a specific tile. Cleared after handling. */
  mapFocusRequest: { x: number; y: number } | null;
}

function createUIState() {
  const initialState: UIState = {
    currentScreen: 'main',
    showNotifications: true,
    lastEvent: null,
    designationActive: false,
    designationType: null,
    activeZoneInstanceId: null,
    _screenBeforeDesignation: null,
    mapFocusRequest: null
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

    activateDesignation: (type: string, instanceId: string | null = null) =>
      update((state) => ({
        ...state,
        designationActive: true,
        designationType: type,
        activeZoneInstanceId: instanceId,
        _screenBeforeDesignation: state.currentScreen !== 'main' ? state.currentScreen : state._screenBeforeDesignation,
        currentScreen: 'main'
      })),

    deactivateDesignation: () =>
      update((state) => ({
        ...state,
        designationActive: false,
        designationType: null,
        activeZoneInstanceId: null,
        currentScreen: state._screenBeforeDesignation ?? state.currentScreen,
        _screenBeforeDesignation: null
      })),

    focusMapOn: (x: number, y: number) =>
      update((state) => ({ ...state, mapFocusRequest: { x, y } })),

    clearMapFocus: () =>
      update((state) => ({ ...state, mapFocusRequest: null }))
  };
}

export const uiState = createUIState();
