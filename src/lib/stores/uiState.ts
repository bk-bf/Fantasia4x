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
  /** Request the map to pan (and zoom) to a specific tile. Cleared after handling. `selectTile`
   *  means "also select whatever is on that tile" (click-here semantics — used by EXPLORE jumps and
   *  Chronicle event locations). Callers that select a specific entity by id themselves (Pawn/Entity
   *  tabs) pass false so the camera only pans and their id-selection isn't overridden by a tile-pick. */
  mapFocusRequest: { x: number; y: number; selectTile: boolean } | null;
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
  /** Chosen materials for the active blueprint's `category:` cost slots (cost-key → itemId). */
  blueprintMaterials: Record<string, string> | null;
  /** Requests the pawn screen to open a specific tab. Cleared after reading. */
  pawnScreenTab: 'status' | 'attributes' | 'gear' | null;
  /** Debug click-brush (in-game DEBUG tab). null = inactive. `id` is the resource/building id the
   *  spawn brushes paint; unused by `regrow`/`kill`/`resurrect`. Clicking the map applies the brush at
   *  that tile (`kill` insta-kills the pawn/mob there; `resurrect` revives the corpse there). */
  debugBrush: {
    kind: 'regrow' | 'building' | 'resource' | 'kill' | 'resurrect';
    id: string | null;
  } | null;
  /** Custom Map popup (biome-tuning sliders) open? Rendered at the page root, outside the filtered
   *  header, so it stacks above the WebGL canvas (a `filter` on `.game-header` traps fixed children). */
  customMapOpen: boolean;
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
    customMapOpen: false
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

    // Pawn and mob selection are mutually exclusive — selecting one clears the other at the source
    // of truth, so every consumer (map canvas, Pawn/Entity tabs) sees a single live selection no
    // matter which one triggered it.
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

    setPawnTab: (tab: 'status' | 'attributes' | 'gear' | null) =>
      update((state) => ({ ...state, pawnScreenTab: tab })),

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

    /** Arm a debug click-brush and drop to the map so the next clicks apply it. */
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

/** Threat-alert pulse signal: bumped to `Date.now()` when a mob first spots a colonist (the sim-log
 *  bridge's threatAlert handler). The Chronicle overlay watches it to flash its restore/toggle button
 *  while the panel is minimised, so the player notices the (paused) alert. 0 = never fired / acknowledged. */
export const threatPulse = writable(0);

/** Colony-alert pulse signal: bumped to `Date.now()` on a non-combat colony emergency — a colonist's
 *  malnutrition/dehydration worsening a stage, or a pawn death (the sim-log bridge's vitalAlert /
 *  pawnDeath handlers). Drives the same bugle (AudioController) + Chronicle restore-button flash as
 *  {@link threatPulse}, kept separate so threat vs welfare alerts can diverge later. 0 = never fired. */
export const alertPulse = writable(0);
