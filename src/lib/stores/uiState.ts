// src/lib/stores/uiState.ts
import { writable } from 'svelte/store';

type Screen =
  | 'main'
  | 'pawns'
  | 'race'
  | 'building'
  | 'crafting'
  | 'research'
  | 'exploration'
  | 'work'
  | 'entities'
  | 'debug';

interface UIState {
  currentScreen: Screen;
  showNotifications: boolean;
  lastEvent: string | null;
  /** Zone/designation painting mode. null = inactive. */
  designationActive: boolean;
  designationType: string | null;
  /** Zone instance being painted (null = no instance / legacy). */
  activeZoneInstanceId: string | null;
  /** Screen to return to after zone painting or blueprint placement ends. */
  _screenBeforeDesignation: Screen | null;
  /** Request the map to pan (and zoom) to a specific tile. Cleared after handling. */
  mapFocusRequest: { x: number; y: number } | null;
  /** Currently selected pawn id — shared between Pawn Tab and the map canvas. */
  selectedPawnId: string | null;
  /** Currently selected mob id — shared between Entity Tab and the map canvas. */
  selectedMobId: string | null;
  /** Pawn id the camera should continuously follow. null = free camera. */
  cameraFollowPawnId: string | null;
  /** Mob id the camera should continuously follow. null = free camera. */
  cameraFollowMobId: string | null;
  /** Blueprint placement mode: id of the building being placed, null = inactive. */
  blueprintBuildingId: string | null;
  /** Requests the pawn screen to open a specific tab. Cleared after reading. */
  pawnScreenTab: 'status' | 'attributes' | 'gear' | null;
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
    mapFocusRequest: null,
    selectedPawnId: null,
    cameraFollowPawnId: null,
    selectedMobId: null,
    cameraFollowMobId: null,
    blueprintBuildingId: null,
    pawnScreenTab: null
  };

  const { subscribe, set, update } = writable(initialState);

  return {
    subscribe,
    set,
    update,

    setScreen: (screen: Screen) => update((state) => ({ ...state, currentScreen: screen })),

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
        _screenBeforeDesignation:
          state.currentScreen !== 'main' ? state.currentScreen : state._screenBeforeDesignation,
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

    clearMapFocus: () => update((state) => ({ ...state, mapFocusRequest: null })),

    selectPawn: (id: string | null) => update((state) => ({ ...state, selectedPawnId: id })),

    selectMob: (id: string | null) => update((state) => ({ ...state, selectedMobId: id })),

    setFollowPawn: (id: string | null) =>
      update((state) => ({ ...state, cameraFollowPawnId: id, cameraFollowMobId: null })),

    setFollowMob: (id: string | null) =>
      update((state) => ({ ...state, cameraFollowMobId: id, cameraFollowPawnId: null })),

    setPawnTab: (tab: 'status' | 'attributes' | 'gear' | null) =>
      update((state) => ({ ...state, pawnScreenTab: tab })),

    activateBlueprint: (buildingId: string) =>
      update((state) => ({
        ...state,
        blueprintBuildingId: buildingId,
        _screenBeforeDesignation:
          state.currentScreen !== 'main' ? state.currentScreen : state._screenBeforeDesignation,
        currentScreen: 'main'
      })),

    deactivateBlueprint: () =>
      update((state) => ({
        ...state,
        blueprintBuildingId: null,
        currentScreen: state._screenBeforeDesignation ?? state.currentScreen,
        _screenBeforeDesignation: null
      }))
  };
}

export const uiState = createUIState();
