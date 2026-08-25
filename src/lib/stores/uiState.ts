import { writable } from 'svelte/store';

type Screen =
  | 'main'
  | 'pawns'
  | 'culture'
  | 'kingdoms'
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
  designationActive: boolean;
  designationType: string | null;
  activeZoneInstanceId: string | null;
  _screenBeforeDesignation: Screen | null;
  mapFocusRequest: { x: number; y: number; selectTile: boolean } | null;
  selectedPawnId: string | null;
  selectedMobId: string | null;
  cameraFollowPawnId: string | null;
  cameraFollowMobId: string | null;
  blueprintBuildingId: string | null;
  blueprintMaterials: Record<string, string> | null;
  pawnScreenTab: 'status' | 'attributes' | 'relations' | 'gear' | null;
  debugBrush: {
    kind: 'regrow' | 'building' | 'resource' | 'kill' | 'resurrect';
    id: string | null;
  } | null;
  customMapOpen: boolean;
  tradeSession: { partyId: string; pawnId: string } | null;
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
    blueprintMaterials: null,
    pawnScreenTab: null,
    debugBrush: null,
    customMapOpen: false,
    tradeSession: null
  };

  const { subscribe, set, update } = writable(initialState);

  return {
    subscribe,
    set,
    update,

    setScreen: (screen: Screen) => update((state) => ({ ...state, currentScreen: screen })),

    toggleCustomMap: () => update((state) => ({ ...state, customMapOpen: !state.customMapOpen })),
    setCustomMap: (open: boolean) => update((state) => ({ ...state, customMapOpen: open })),

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

    focusMapOn: (x: number, y: number, selectTile = true) =>
      update((state) => ({ ...state, mapFocusRequest: { x, y, selectTile } })),

    clearMapFocus: () => update((state) => ({ ...state, mapFocusRequest: null })),

    selectPawn: (id: string | null) =>
      update((state) => ({
        ...state,
        selectedPawnId: id,
        selectedMobId: id ? null : state.selectedMobId
      })),

    selectMob: (id: string | null) =>
      update((state) => ({
        ...state,
        selectedMobId: id,
        selectedPawnId: id ? null : state.selectedPawnId
      })),

    setFollowPawn: (id: string | null) =>
      update((state) => ({ ...state, cameraFollowPawnId: id, cameraFollowMobId: null })),

    setFollowMob: (id: string | null) =>
      update((state) => ({ ...state, cameraFollowMobId: id, cameraFollowPawnId: null })),

    setPawnTab: (tab: 'status' | 'attributes' | 'relations' | 'gear' | null) =>
      update((state) => ({ ...state, pawnScreenTab: tab })),

    openTrade: (partyId: string, pawnId: string) =>
      update((state) => ({ ...state, tradeSession: { partyId, pawnId } })),

    closeTrade: () => update((state) => ({ ...state, tradeSession: null })),

    activateBlueprint: (buildingId: string, materials: Record<string, string> | null = null) =>
      update((state) => ({
        ...state,
        blueprintBuildingId: buildingId,
        blueprintMaterials: materials,
        _screenBeforeDesignation:
          state.currentScreen !== 'main' ? state.currentScreen : state._screenBeforeDesignation,
        currentScreen: 'main'
      })),

    deactivateBlueprint: () =>
      update((state) => ({
        ...state,
        blueprintBuildingId: null,
        blueprintMaterials: null,
        currentScreen: state._screenBeforeDesignation ?? state.currentScreen,
        _screenBeforeDesignation: null
      })),

    activateDebugBrush: (
      kind: 'regrow' | 'building' | 'resource' | 'kill' | 'resurrect',
      id: string | null = null
    ) =>
      update((state) => ({
        ...state,
        debugBrush: { kind, id },
        _screenBeforeDesignation:
          state.currentScreen !== 'main' ? state.currentScreen : state._screenBeforeDesignation,
        currentScreen: 'main'
      })),

    deactivateDebugBrush: () =>
      update((state) => ({
        ...state,
        debugBrush: null,
        currentScreen: state._screenBeforeDesignation ?? state.currentScreen,
        _screenBeforeDesignation: null
      }))
  };
}

export const uiState = createUIState();

export const threatPulse = writable(0);

export const alertPulse = writable(0);
