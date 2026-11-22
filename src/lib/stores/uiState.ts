import { writable } from 'svelte/store';

export type WindowId =
  | 'pawns'
  | 'culture'
  | 'kingdoms'
  | 'building'
  | 'crafting'
  | 'research'
  | 'exploration'
  | 'work'
  | 'entities'
  | 'debug'
  | 'pause'
  | 'health'
  | 'fuel'
  | 'mood'
  | 'food';

interface UIState {
  windows: WindowId[];
  showNotifications: boolean;
  lastEvent: string | null;
  designationActive: boolean;
  designationType: string | null;
  activeZoneInstanceId: string | null;
  _windowsBeforeDesignation: WindowId[] | null;
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

const raise = (list: WindowId[], id: WindowId): WindowId[] => [...list.filter((w) => w !== id), id];

const stashWindows = (state: UIState) => ({
  _windowsBeforeDesignation: state.windows.length ? state.windows : state._windowsBeforeDesignation,
  windows: [] as WindowId[]
});

const restoreWindows = (state: UIState) => ({
  windows: state._windowsBeforeDesignation ?? state.windows,
  _windowsBeforeDesignation: null
});

function createUIState() {
  const initialState: UIState = {
    windows: [],
    showNotifications: true,
    lastEvent: null,
    designationActive: false,
    designationType: null,
    activeZoneInstanceId: null,
    _windowsBeforeDesignation: null,
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

    openWindow: (id: WindowId) =>
      update((state) => ({ ...state, windows: raise(state.windows, id) })),

    closeWindow: (id: WindowId) =>
      update((state) => ({ ...state, windows: state.windows.filter((w) => w !== id) })),

    toggleWindow: (id: WindowId) =>
      update((state) => ({
        ...state,
        windows: state.windows.includes(id)
          ? state.windows.filter((w) => w !== id)
          : raise(state.windows, id)
      })),

    raiseWindow: (id: WindowId) =>
      update((state) =>
        state.windows.at(-1) === id || !state.windows.includes(id)
          ? state
          : { ...state, windows: raise(state.windows, id) }
      ),

    closeAllWindows: () => update((state) => ({ ...state, windows: [] })),

    closeTopWindow: () => update((state) => ({ ...state, windows: state.windows.slice(0, -1) })),

    toggleCustomMap: () => update((state) => ({ ...state, customMapOpen: !state.customMapOpen })),
    setCustomMap: (open: boolean) => update((state) => ({ ...state, customMapOpen: open })),

    addEvent: (event: string) => update((state) => ({ ...state, lastEvent: event })),

    clearEvent: () => update((state) => ({ ...state, lastEvent: null })),

    activateDesignation: (type: string, instanceId: string | null = null) =>
      update((state) => ({
        ...state,
        designationActive: true,
        designationType: type,
        activeZoneInstanceId: instanceId,
        ...stashWindows(state)
      })),

    deactivateDesignation: () =>
      update((state) => ({
        ...state,
        designationActive: false,
        designationType: null,
        activeZoneInstanceId: null,
        ...restoreWindows(state)
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
        ...stashWindows(state)
      })),

    deactivateBlueprint: () =>
      update((state) => ({
        ...state,
        blueprintBuildingId: null,
        blueprintMaterials: null,
        ...restoreWindows(state)
      })),

    activateDebugBrush: (
      kind: 'regrow' | 'building' | 'resource' | 'kill' | 'resurrect',
      id: string | null = null
    ) =>
      update((state) => ({
        ...state,
        debugBrush: { kind, id },
        ...stashWindows(state)
      })),

    deactivateDebugBrush: () =>
      update((state) => ({
        ...state,
        debugBrush: null,
        ...restoreWindows(state)
      }))
  };
}

export const uiState = createUIState();

export const threatPulse = writable(0);

export const alertPulse = writable(0);
