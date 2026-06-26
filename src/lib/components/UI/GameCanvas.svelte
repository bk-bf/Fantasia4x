<!-- WebGL tile renderer canvas for Fantasia4x world map -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { browser } from '$app/environment';
  import { wasdPan, debugMode } from '$lib/stores/uiPrefs';
  import { WebGLRenderer } from '$lib/webgl/renderer.js';
  import {
    applyTileToGrid,
    applyBuildingToGrid,
    isRoofBuilding,
    generatePlaceholderGrid,
    updateHiddenMaskAt,
    type HiddenMaskState,
    type TileCoord
  } from '$lib/webgl/fantasia-world.js';
  import {
    drainRenderTileDeltas,
    clearRenderTileDeltas
  } from '$lib/components/UI/gameCanvas/mainTileDeltas';
  import { fullRebuildTerrain } from '$lib/components/UI/gameCanvas/terrainPaint';
  import {
    gameState,
    rendererReady,
    menuPreviewRendered,
    currentSeason,
    currentWeather,
    worldGenRev
  } from '$lib/stores/gameState.js';
  import { cameraTileSize, cameraZoomRange, cameraViewport } from '$lib/stores/cameraView.js';
  import type {
    WorldTile,
    Pawn,
    PlacedBuilding,
    DesignationType,
    DroppedItem,
    FuelSettings,
    Item,
    Mob,
    ZoneInstance,
    EquipmentSlot
  } from '$lib/game/core/types.js';
  import type { GameGrid } from '$lib/webgl/game-grid.js';
  import { GameGrid as GameGridClass } from '$lib/webgl/game-grid.js';
  import { BASE_TILE_PX } from '$lib/webgl/tile-types.js';
  import { wasmPathfinderService } from '$lib/game/services/WasmPathfinderService.js';
  import { pawnService } from '$lib/game/services/PawnService.js';
  import { buildPathfindingGrids } from '$lib/game/services/PathfinderService.js';
  import { designationService } from '$lib/game/services/DesignationService.js';
  import {
    environmentService,
    computeTileLightLevel,
    tileTemperature,
    tileWetness,
    computeThermalAt,
    effectiveWindAt,
    windDegreeWord
  } from '$lib/game/services/EnvironmentService.js';
  import { lightingService } from '$lib/game/services/LightingService.js';
  import { glyph, SHEET } from '$lib/webgl/tilesets.js';
  import { uiState } from '$lib/stores/uiState.js';
  import { worldEffects } from '$lib/stores/worldEffects.js';
  import type { GlyphFloat, GlyphFloatKind } from '$lib/stores/worldEffects.js';
  import {
    combatFeedback,
    FLOAT_TTL_MS,
    type CombatTextEvent
  } from '$lib/stores/combatFeedback.js';
  import { attackLunges, LUNGE_TTL_MS, type AttackLungeEvent } from '$lib/stores/attackLunges.js';
  import { projectiles, type ProjectileEvent } from '$lib/stores/projectiles.js';
  import { renderFps } from '$lib/stores/perfStats.js';
  import { buildingService } from '$lib/game/services/BuildingService.js';
  import {
    resolveCharSpans,
    BIOMES,
    SUBTERRAINS,
    soilFertilityPct,
    soilTierForTile,
    SOIL_TIER_NAME
  } from '$lib/game/core/Terrains.js';
  import {
    resourceObjectService,
    isGrowableResource
  } from '$lib/game/services/ResourceObjectService.js';
  import { RESOURCE_VISIBLE_GROWTH } from '$lib/game/core/wildGrowth.js';
  import { itemService } from '$lib/game/services/ItemService.js';
  import {
    getRefuelRequirements,
    getRefuelThresholdRatio,
    planRefuel
  } from '$lib/game/services/fuelRules.js';
  import { getEquipmentSlot } from '$lib/game/core/PawnEquipment.js';
  import { getRangedWeapon } from '$lib/game/systems/rangedCombat.js';
  import { needsRecovery } from '$lib/game/systems/pawn/pawnHelpers';
  import { hasUntendedWound } from '$lib/game/services/jobs/caretake';
  import { conditionPriority } from '$lib/game/core/needs';
  import { getCreatureById } from '$lib/game/core/Creatures.js';
  import { TICKS_PER_SECOND } from '$lib/game/core/time.js';
  import { simTarget } from '$lib/game/systems/MovementSystem.js';
  import SelectedEntityCard from '$lib/components/UI/SelectedEntityCard.svelte';
  import type {
    SelectedEntityModel,
    EntityBar,
    EntityButton
  } from '$lib/components/UI/SelectedEntityCard.svelte';
  import {
    SHEET_CELL_W,
    SHEET_CELL_H,
    getSheet,
    loadSheet,
    onSheetLoaded,
    type SheetName
  } from '$lib/components/UI/gameCanvas/spriteSheets';
  import { redrawHudSpriteIcons } from '$lib/components/UI/gameCanvas/hudSpriteIcon';
  import BuildingFuelPanel from '$lib/components/UI/gameCanvas/BuildingFuelPanel.svelte';
  import FoodFilterPanel from '$lib/components/UI/gameCanvas/FoodFilterPanel.svelte';
  import StockpileZonePanel from '$lib/components/UI/gameCanvas/StockpileZonePanel.svelte';
  import {
    buildPawnCard,
    buildMobCard,
    jobProgressBar,
    PROGRESS_BAR_STATES
  } from '$lib/components/UI/gameCanvas/selectionCard';
  import { overlayDroppedItems } from '$lib/components/UI/gameCanvas/overlay';
  import { buildingsVisualSig } from '$lib/game/core/buildingSig';
  // Shared with the `movePawnsLine` command so the live drag preview's dots land exactly where the
  // pawns will (same Achtung-style spacing + nearest-free-tile snap).
  import { lineFormationTargets } from '$lib/game/sim/commands';
  import type { ItemPillView } from '$lib/components/UI/ItemPills.svelte';
  import itemsData from '$lib/game/database/items.jsonc';

  const ITEMS_DATABASE = itemsData as unknown as Item[];

  // Main-menu backdrop mode (rendered behind MainMenu). A live but non-interactive atmospheric view:
  // no hover/click/pan/zoom/keys, no HUD, a static centred framing, and it does NOT drive the
  // boot-reveal sequence or the player's saved camera. Entities still animate (never frozen).
  export let menuPreview = false;
  /** Backdrop zoom multiplier over the cover-fit floor — a closer, more detailed title-screen shot. */
  const MENU_PREVIEW_ZOOM = 2;
  /** One-shot guard so the backdrop's first painted frame flips `menuPreviewRendered` exactly once. */
  let _previewPainted = false;
  // Per-building refuel settings UI now lives in gameCanvas/BuildingFuelPanel.svelte (fuel items,
  // filters, threshold). Sprite-sheet cache + HUD-icon action live in gameCanvas/{spriteSheets,
  // hudSpriteIcon}.

  // Tile size range for zoom (square cells for CoQ sprite-mode)
  // MAP_W / MAP_H must match the generateWorld() call in gameState.ts
  const MAP_W = 240;
  const MAP_H = 160;
  const MAX_TILE_W = 40;
  const ZOOM_STEP = 2;
  const SCROLL_STEP = 4; // tiles per arrow key press
  const CAMERA_STORAGE_KEY = 'fantasia4x-camera';
  let saveCameraTimer: ReturnType<typeof setTimeout> | null = null;

  // fitTileSize: exact float that makes the whole map fill the canvas edge-to-edge.
  // Used as the initial tile size and the zoom-out limit.
  let fitTileSize = 8;
  let tileWidth = 8;
  let tileHeight = 8;
  // Publish the zoom (tile px size) so the out-of-canvas weather overlay can scale particle density.
  $: cameraTileSize.set(tileWidth);
  // Publish the zoom RANGE too: the floor (fitTileSize) shrinks as the map grows, so the weather
  // overlay scales density/size against the REAL per-map range rather than a hardcoded tile span.
  $: cameraZoomRange.set({ min: fitTileSize, max: MAX_TILE_W });
  // Publish the visible tile rectangle (top-left tile + tiles across) for the spatial creature-SFX
  // layer. Re-runs on pan (viewX/viewY) and zoom (tileWidth/tileHeight); read on a throttled tick.
  $: cameraViewport.set({
    x: viewX,
    y: viewY,
    w: (container?.clientWidth ?? 0) / tileWidth,
    h: (container?.clientHeight ?? 0) / tileHeight
  });

  function computeFitTileSize(canvasW: number, canvasH: number): number {
    const mapW = worldMap.length > 0 ? worldMap[0].length : MAP_W;
    const mapH = worldMap.length > 0 ? worldMap.length : MAP_H;
    // COVER fit (Math.max): the zoom-out floor FILLS the canvas — the map's binding axis (width, for a
    // square map on a wide screen) maps edge-to-edge so no empty out-of-map area ("aether") ever shows.
    // The other axis overflows the viewport, so you can pan along it; the bound axis is pinned (no pan
    // needed there). CONTAIN (Math.min) was tried but left letterbox bars, which the user dislikes.
    return Math.max(canvasW / mapW, canvasH / mapH);
  }

  let canvas: HTMLCanvasElement;
  let designCanvas: HTMLCanvasElement;
  // HUD sprite icons + their shared-cache painting live in gameCanvas/{hudSpriteIcon,spriteSheets}.
  // Current day/night ambient, mirrored from the WebGL renderer so the Canvas2D
  // designation overlay can be darkened/tinted to match the lit scene beneath it.
  let _ambientLight = 1;
  let _ambientTint: [number, number, number] = [1, 1, 1];
  let container: HTMLDivElement;
  let renderer: WebGLRenderer | null = null;
  let animationId = 0;
  let ready = false;
  let errorMsg = '';
  let worldMap: WorldTile[][] = [];

  // Interior-mountain "fog" mask: tiles buried inside a massif / sealed in a pocket render blank in the
  // terrain pass, and must NOT leak through the other render paths either — glow emitters on them are
  // dropped, hovering them shows no info panel, and an explore-tab jump can't drop a highlight on them.
  // ADR-026: the mask STATE (mask + the solid/exterior grids it derives from) is persisted so it can be
  // updated LOCALLY when a tile's solidness flips (mining) — never re-BFS'd whole-map on a delta.
  // `hiddenMask` aliases `_maskState.mask` (same ref; updateHiddenMaskAt mutates it in place).
  let _maskState: HiddenMaskState | null = null;
  let hiddenMask: boolean[][] = [];
  const isHiddenTile = (x: number, y: number): boolean => hiddenMask[y]?.[x] ?? false;

  // Previous references for terrain-rebuild change detection (see gameState.subscribe).
  let _prevWorldMap: unknown;
  let _prevBuildingsSig = '';
  let _prevDesignations: unknown;
  let _prevZoneTiles: unknown;
  let _prevTerrainRev: number | undefined; // ADR-021: worker-sent terrain revision (see unsubState)
  let _prevDesignationRev: number | undefined; // §D: worker-sent designation revision → cheap 2D overlay redraw (no terrain rebuild)
  // ADR-026 incremental terrain: the terrain GameGrid is PERSISTENT. A full rebuild (buildGameGrid, 562k
  // setTile) is reserved for `_fullRebuildTerrain` only — first build or a genuine new-map load (worldMap
  // ARRAY ref replaced). Every routine change (harvest/regrowth/mining via worldMapDelta, building
  // placement, blueprint preview) repaints ONLY the affected tiles, driven by the changed-coord channel
  // (mainTileDeltas) — never a whole-map scan or rebuild (the FPS crater that ADR-026 forbids).
  let _terrainGrid: import('$lib/webgl/game-grid.js').GameGrid | null = null;
  let _terrainGridWorldMapRef: unknown; // worldMap ARRAY ref of the last full build (new ref ⇒ new map ⇒ full rebuild)
  // Incremental building diff: last-painted completed buildings keyed by id (pos + visual sig), so a
  // placement/removal/deconstruct repaints just the changed footprints (single cells).
  let _prevBuildingsById = new Map<string, { x: number; y: number; sig: string }>();
  // Blueprint preview tiles painted last frame — repainted (cleared) when the preview moves/ends.
  let _prevBlueprintTiles = new Set<string>();
  // §M grove-glow emitters keyed "y,x" so a delta upserts/deletes one tile's emitter (no full re-scan).
  let _emitterMap = new Map<string, import('$lib/game/services/LightingService.js').LightEmitter>();
  // Terrain rebuild is O(map) (38k-tile vertex buffer). worldMap churns every tick from
  // resource regrowth/harvest, which would rebuild it every frame (~60ms). Those changes are
  // invisible if they lag a fraction of a second, so coalesce sim-driven terrain rebuilds to
  // TERRAIN_REBUILD_MIN_MS; player-driven changes (buildings/designations/zones) stay immediate.
  let _terrainDirty = false;
  let _lastTerrainBuild = 0;
  const TERRAIN_REBUILD_MIN_MS = 500;
  // Set when the whole world is REPLACED (regen / size change / restore — see worldGenRev). Forces the
  // next frame's terrain rebuild to bypass the throttle above, so a player-driven regen repaints
  // immediately (hidden behind the Custom Map overlay) instead of up to 500ms later.
  let _forceTerrainRebuild = false;

  // Render-on-demand. The rAF loop draws the terrain (all visible chunks) EVERY frame; at the zoom-out
  // floor of a big map that rasterizes ~1M tiles/frame even when nothing changes — the sub-20 FPS on
  // the static custom-map / zoomed-out view. When the scene is FROZEN — sim paused, OR zoomed out past
  // FREEZE_TILE_PX (entity motion sub-pixel) — we skip the GL draw unless something VISIBLE changed
  // (`_renderDirty`, set by the event-driven repaint primitives: camera/zoom, terrain rebuild,
  // selection/designation, regen, resize, pause toggle). So a static map is drawn once then costs
  // nothing. Unfrozen (running + zoomed in) draws every frame exactly as before — normal play unchanged.
  let _renderDirty = true;
  const FREEZE_TILE_PX = 4; // below this on-screen tile size, entity motion is imperceptible → freeze
  const markRenderDirty = () => {
    _renderDirty = true;
  };

  // Viewport offset in tile coordinates
  let viewX = 0;
  let viewY = 0;

  // Drag state
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragViewX = 0;
  let dragViewY = 0;
  let dragDistance = 0;

  // Pawn overlay state
  let pawns: Pawn[] = [];
  let selectedPawnId: string | null = null;
  let cameraFollowPawnId: string | null = null;
  let cameraFollowMobId: string | null = null;

  // Entity-overlay layer: pawns are drawn into their own sparse grid rendered as
  // a glyph-only pass ON TOP of the terrain (see renderer setOverlayGrid). This
  // keeps the terrain tile beneath a pawn intact and lets us interpolate motion
  // every animation frame, independent of the simulation tick rate.
  const pawnOverlayGrid: GameGrid = new GameGridClass();
  // Dropped/stored items get their OWN overlay grid, rendered beneath the pawn
  // overlay (terrain → items → entities). Keeping items out of pawnOverlayGrid is
  // what stops a pawn from blanking the item glyph on the tile it walks over.
  const itemOverlayGrid: GameGrid = new GameGridClass();
  // Per-pawn rendered position in float world-tile coords, eased toward the
  // simulation's authoritative sub-tile position each frame for smooth 60fps motion.
  const pawnRenderPos = new Map<string, { x: number; y: number }>();
  const mobRenderPos = new Map<string, { x: number; y: number }>();
  let lastFrameTime = 0;
  // DEBUG gate for the menu-backdrop frame profiler ([MENU-PERF]): ON only when Debug mode is enabled
  // (Settings toggle → $debugMode) or a --debug/--log build flag is set. So normal --play and shipped
  // builds run NONE of the measurement (zero cost). `subscribe` keeps it live with the settings toggle.
  const _DBG_BUILD =
    import.meta.env.VITE_DEBUG_MODE === 'true' || import.meta.env.VITE_DEBUG_LOG === 'true';
  let _menuPerfOn = _DBG_BUILD;
  const _unsubMenuPerf = debugMode.subscribe((v) => (_menuPerfOn = _DBG_BUILD || v));
  // Coalesces many per-mousemove preview redraws into one rebuild per frame.
  let overlayRedrawScheduled = false;
  // Smoothing time-constant (seconds). Lower = snappier, higher = smoother/laggier.
  const MOVE_SMOOTH_TAU = 0.06;
  // Follow-camera smoothing constant (seconds). Slightly looser than pawn motion
  // so the camera trails gently rather than rigidly locking to the pawn.
  const FOLLOW_SMOOTH_TAU = 0.12;
  // Where the followed entity sits vertically in the viewport (fraction from the top). Slightly above
  // centre (just under 0.5) — keeps it near the middle while leaving a little extra room below for the
  // selected-entity HUD card.
  const FOLLOW_VERTICAL = 0.42;

  // World-effect overlay positions (Zzz, progress bars, campfire sparks) are computed
  // in the rAF frame() loop via updateWorldEffectOverlays(). Using $: reactive blocks
  // here caused 60fps Svelte store updates and DOM re-renders whenever viewX/viewY
  // changed (every frame during camera follow), scaling with sleeping-pawn count and
  // tanking FPS at night when everyone was asleep.
  let _glyphFloatKey = ''; // unified sleep/rest/collapse/campfire glyph floats
  let _progressOverlayKey = '';
  let _particleOverlayKey = '';
  // Lair particle-effect tiles, CACHED. Scanning the visible tile-rect every frame is O(map) when
  // zoomed out (the whole map is "visible") — a serious per-frame tax. Lairs change only on
  // regen/grow/destroy, so we scan the full map rarely (worldMap swap + a slow timer) and just
  // project this small list each frame.
  let _lairTiles: { x: number; y: number; effect: string }[] = [];
  let _lairScanAt = 0;
  let _healthOverlayKey = '';
  let _draftOverlayKey = '';
  let _floatTextKey = '';
  let _projOverlayKey = '';

  // Live world-space combat-text events (damage/miss/dodge…). Converted to screen
  // coordinates each frame in updateWorldEffectOverlays so they track the camera.
  let combatTexts: CombatTextEvent[] = [];
  const unsubCombatFeedback = combatFeedback.subscribe((list) => {
    combatTexts = list;
  });

  // Attack lunges: active thrusts keyed by attacker id, read every frame in updatePawnOverlay.
  let attackLungeList: AttackLungeEvent[] = [];
  const unsubAttackLunges = attackLunges.subscribe((list) => {
    attackLungeList = list;
  });

  // In-flight ranged projectiles: lerped to a screen position every frame in
  // updateWorldEffectOverlays so they fly shooter→target and track the camera.
  let projectileList: ProjectileEvent[] = [];
  const unsubProjectiles = projectiles.subscribe((list) => {
    projectileList = list;
  });

  // Peak thrust distance, in tiles — how far "into" the target tile the attacker reaches.
  const LUNGE_DISTANCE = 0.4;

  /**
   * Sub-tile pixel offset for an attacker's lunge this frame: a quick out-and-back
   * thrust toward the struck tile. Returns {x:0,y:0} when the attacker has no active
   * lunge. The sine curve peaks at the lunge midpoint and returns to 0 at the TTL,
   * so the glyph snaps back to its resting position well before the next swing.
   */
  function lungeOffset(id: string, now: number): { x: number; y: number } {
    for (let i = attackLungeList.length - 1; i >= 0; i--) {
      const e = attackLungeList[i];
      if (e.attackerId !== id) continue;
      const t = (now - e.spawnTime) / LUNGE_TTL_MS;
      if (t < 0 || t >= 1) return { x: 0, y: 0 };
      const amp = Math.sin(t * Math.PI) * LUNGE_DISTANCE * BASE_TILE_PX;
      return { x: e.dirX * amp, y: e.dirY * amp };
    }
    return { x: 0, y: 0 };
  }

  // Phase 4: buildings and designations overlay
  let buildings: PlacedBuilding[] = [];
  let designations: Record<string, DesignationType> = {};
  // Standing-zone membership (stockpile…), separate from one-shot action orders above so a
  // tile can be both a zone and an order at once. Drives the stockpile tint + hover/selection.
  let zoneTiles: Record<string, DesignationType[]> = {};
  // Tile → zone-instance id (from game state); lets us suppress a single zone's
  // overlay tint when the player hides that instance's color in the Building tab.
  let designationZoneId: Record<string, string> = {};
  // Full zone-instance list (filters + labels) from the snapshot — drives the clicked-stockpile panel.
  let zoneInstances: ZoneInstance[] = [];
  // Zone-instance ids whose color the player has hidden (persisted on the instance
  // in the save). Derived from zoneInstances in the gameState snapshot below.
  let hiddenZoneInstances = new Set<string>();
  // Change-detection signature so toggling colorHidden (which doesn't touch zoneTiles)
  // still forces a terrain rebuild.
  let _prevHiddenZoneSig = '';

  // Translucent fill colour for each standing-zone type, painted on the 2D overlay (drawDesignations).
  // Kept in sync with ZONE_DEFS in ZonePanel.svelte (stockpile/drink/wash). A type absent here gets no
  // tint. (Was a background blend baked into the WebGL grid; moved to the overlay to avoid rebuilds.)
  const ZONE_TINT_COLORS: Record<string, string> = {
    stockpile: 'rgba(232, 160, 32, 0.30)',
    // Drink/wash sit on (blue) water, so they need a stronger fill than the land stockpile tint to
    // read at all — plus a tile outline (see drawDesignations) so they stand out against the water.
    drink: 'rgba(120, 210, 255, 0.45)',
    wash: 'rgba(150, 240, 215, 0.45)',
    // Restriction zone — matches ZONE_DEFS' #b06cd0; a purple fence the eye reads as "keep pawns here".
    restrict: 'rgba(176, 108, 208, 0.28)'
  };

  // Phase A2 dynamic lighting: lit campfires emit warm point light, baked into
  // the tile renderer (replaces the old floating DOM radial glow). §M: the dim, static
  // ancient-wood grove glows (collected on terrain change into `resourceGlowEmitters`) are
  // merged in here so they bake alongside the building lights.
  let resourceGlowEmitters: import('$lib/game/services/LightingService.js').LightEmitter[] = [];
  function refreshEmitters() {
    lightingService.setEmitters([
      ...lightingService.collectEmitters(buildings),
      ...resourceGlowEmitters
    ]);
    renderer?.setDynamicLight(lightingService.hasEmitters());
    renderer?.setLightVersion(lightingService.getEmittersVersion());
    renderer?.setLightBounds(lightingService.getLitBounds());
  }
  $: {
    buildings; // re-run when buildings change (lit/built/extinguished)
    refreshEmitters();
  }

  // Phase 7: dropped items overlay
  let droppedItems: DroppedItem[] = [];

  // ENTITIES_SPAWNING Phase A: live mobs/animals overlay
  let mobs: Mob[] = [];
  // Zone/designation painting — driven by uiState
  let designationMode = false;
  let designationTypeActive: DesignationType = 'harvest';
  let activeZoneInstanceId: string | null = null;
  // Press X while in designation mode to switch between paint ↔ erase drag
  let zoneEraseMode = false;
  // Blueprint placement mode — set when BUILD is clicked in BuildingMenu
  let blueprintBuildingId: string | null = null;
  // Chosen materials for the blueprint's `category:` cost slots (cost-key → itemId).
  let blueprintMaterials: Record<string, string> | null = null;
  // Debug click-brush (DEBUG tab) — regrow / spawn building / spawn resource on click
  let debugBrush: { kind: 'regrow' | 'building' | 'resource'; id: string | null } | null = null;
  // Selected building (click-locked, like selectedPawnId)
  let selectedBuildingId: string | null = null;
  // Selected mob/animal (click-locked, like selectedPawnId)
  let selectedMobId: string | null = null;
  // Custom Map popup open: the player is shaping/previewing terrain, so suppress hover tooltips and
  // click-selection (the info HUD), while keeping pan + zoom live so they can inspect the map.
  let customMapPreview = false;
  const unsubUI = uiState.subscribe((s) => {
    const prevBlueprintBuildingId = blueprintBuildingId;
    customMapPreview = s.customMapOpen ?? false;
    designationMode = s.designationActive;
    blueprintBuildingId = s.blueprintBuildingId ?? null;
    blueprintMaterials = s.blueprintMaterials ?? null;
    debugBrush = s.debugBrush ?? null;
    activeZoneInstanceId = s.activeZoneInstanceId ?? null;
    if (!s.designationActive) zoneEraseMode = false;
    if (s.designationType) designationTypeActive = s.designationType as DesignationType;
    // Sync selection from the Pawn/Entity tabs (id-based) into the canvas's selection state. Mirrors
    // selectTileAt's mutual exclusion: selecting a pawn/mob via a tab clears the canvas-only
    // selections (building / resource tile) too, so a tab pick produces the same single clean
    // selection a map click does — one shared selection model, two ways in (tile vs id).
    if (s.selectedPawnId !== selectedPawnId) {
      selectedPawnId = s.selectedPawnId;
      if (s.selectedPawnId) {
        selectedBuildingId = null;
        selectedZoneId = null;
        selectedResourceTile = null;
        selectedItemId = null;
        highlightedResourceTiles = new Set();
        _cycleTileX = -1; // a tab pick breaks the map click-cycle
      }
    }
    if (s.selectedMobId !== selectedMobId) {
      selectedMobId = s.selectedMobId;
      if (s.selectedMobId) {
        selectedBuildingId = null;
        selectedZoneId = null;
        selectedResourceTile = null;
        selectedItemId = null;
        highlightedResourceTiles = new Set();
        _cycleTileX = -1;
      }
    }
    cameraFollowPawnId = s.cameraFollowPawnId ?? null;
    cameraFollowMobId = s.cameraFollowMobId ?? null;
    // A uiState change only needs the heavy terrain-grid rebuild when the blueprint placement ghost
    // (the one transient still baked into the WebGL grid) appears or disappears. Everything else a
    // uiState change carries — selection, camera follow, designation mode, map focus — is painted on
    // the lightweight 2D overlay, so a full buildGameGrid here would be wasted work (this was the
    // dominant cause of camera/info-panel lag when jumping around a large map).
    if (blueprintBuildingId !== prevBlueprintBuildingId) redrawOverlay();
    else drawDesignations();
    if (s.mapFocusRequest && ready && renderer?.isReady()) {
      const { x, y, selectTile } = s.mapFocusRequest;
      // Clear the request BEFORE selecting: selectTileAt() writes back to uiState (selectPawn/
      // selectMob), which re-enters this subscriber synchronously — clearing first makes that
      // re-entrant pass skip this block instead of looping on the same focus.
      uiState.clearMapFocus();
      // Focus snaps to a comfortable zoom, not the manual-zoom ceiling (MAX_TILE_W), which is
      // closer than you'd want auto-applied.
      const targetZoom = Math.min(MAX_TILE_W, 24);
      tileWidth = targetZoom;
      tileHeight = targetZoom;
      renderer.setTileSize(tileWidth, tileHeight);
      const visW = (container?.clientWidth ?? 800) / tileWidth;
      const visH = (container?.clientHeight ?? 600) / tileHeight;
      // Place the target at ~25% from the top so the HUD card at the bottom doesn't overlap it.
      setView(Math.round(x - visW / 2), Math.round(y - visH * 0.25));
      // selectTile = "click-here" jumps (EXPLORE resource, Chronicle event location): select whatever
      // is on the tile exactly as a manual click would — same highlight + info HUD, one shared circuit
      // (selectTileAt). When the tile is empty, fall back to a transient yellow highlight so the jump
      // still has a visible anchor. selectTile = false: a Pawn/Entity-tab jump that selects its
      // specific entity by id itself — here we only pan, so the tile-pick can't override that id.
      // Skip the fallback highlight on a fog-hidden tile so a jump to a buried target doesn't pin a
      // yellow marker over the silhouette and give its location away.
      if (selectTile && !selectTileAt(x, y) && !isHiddenTile(x, y)) {
        highlightedResourceTiles = new Set([`${x},${y}`]);
      }
      // No terrain rebuild — the focus jump only moves the camera + selection (2D overlay).
      drawDesignations();
    }
  });

  // Zone drag-paint state (drag fills a rectangle)
  let zoneDragActive = false;

  // Blueprint drag-paint state. Every building is a 1×1 footprint placed per-tile, so a placement
  // drag fills the whole anchor→cursor RECTANGLE (like the zone tool) — drag a box over a room and
  // every wall/roof/floor tile is painted at once, instead of clicking each tile or scrubbing a
  // thin trail that skips cells on a fast drag. placeBuilding rejects blocked/occupied tiles, so
  // filling over a wall or water simply no-ops there.
  let blueprintDragActive = false;
  let blueprintAnchorX = -1;
  let blueprintAnchorY = -1;
  // Resource tile interaction
  let selectedResourceTile: { x: number; y: number; resourceId: string } | null = null;
  // Click-locked stockpile zone (by ZoneInstance.id) — shows the zone filter/draw/clear card.
  let selectedZoneId: string | null = null;
  // Click-locked dropped item (by stable DroppedItem.id) — the loose-item analogue of selectedResourceTile,
  // so a clicked item stack pins its info card just like a pawn/mob/building/resource does. Re-derived
  // live from `droppedItems` so the card tracks decay/durability and clears itself when the stack is gone.
  let selectedItemId: string | null = null;
  // Click-to-cycle: repeated clicks on the SAME tile step through the selectable layers stacked on it
  // (pawn → mob → building → item(s) → resource(s)) one per click. Reset when a different tile is clicked.
  let _cycleTileX = -1;
  let _cycleTileY = -1;
  let _cycleIndex = 0;
  let similarDragMode = false;
  let similarDragResourceId = '';
  let similarDragDesignationType: DesignationType = 'harvest';
  let similarDragActive = false;
  // Tiles highlighted yellow when the user clicks the "show similar" button.
  let highlightedResourceTiles: Set<string> = new Set();
  let similarAnchorX = 0;
  let similarAnchorY = 0;
  let similarEndX = 0;
  let similarEndY = 0;

  // MARK highlight: drag a box to highlight a group of pawns OR mobs — no immediate action. Which
  // kind is decided by the info-panel MARK button that started the drag. Once committed, a group HUD
  // offers the relevant verb: DRAFT/MOVE for pawns, HUNT for mobs. MOVE is an Achtung-style aim (see
  // the moveAim* state below), shared by the selected-pawn info card.
  let markKind: 'pawn' | 'mob' | null = null; // a MARK drag is in progress (selecting)
  let markDragActive = false; // mouse is down, box is being dragged
  let markAnchorX = 0;
  let markAnchorY = 0;
  let markEndX = 0;
  let markEndY = 0;
  let markedKind: 'pawn' | 'mob' | null = null; // committed highlight kind
  let markedIds: string[] = []; // committed highlighted entity ids
  let markedSet = new Set<string>(); // same ids, for O(1) lookup in the per-frame render loop

  // Drafted-pawn MOVE aim (Achtung2-style). A right-press-and-drag draws a line; the drafted pawns
  // (the selected one, or the marked group) spread evenly along it with a live destination preview; a
  // quick right-click (no drag) drops them in a compact block. The MOVE button on the info card / mark
  // HUD ARMS the same gesture so a following left-press starts it too.
  let moveAimActive = false; // a move-aim drag is in progress (press → release)
  let moveAimArmed = false; // MOVE button pressed → the next press (either button) begins the aim
  let moveAimAnchorX = 0;
  let moveAimAnchorY = 0;
  let moveAimEndX = 0;
  let moveAimEndY = 0;
  let moveAimSlots: { x: number; y: number }[] = []; // live preview destinations (recomputed on move)
  let _aimCommitted = false; // set on release so the trailing contextmenu (right-drag) skips its menu

  let zoneAnchorX = 0;
  let zoneAnchorY = 0;
  let zoneEndX = 0;
  let zoneEndY = 0;

  // Hover tile inspector
  let hoverTileX = -1;
  let hoverTileY = -1;
  // Last raw cursor position in canvas pixels — used to recompute hover tile on
  // click when the follow camera has moved viewX/viewY since the last mousemove.
  let lastCursorCx = 0;
  let lastCursorCy = 0;
  // Whether the cursor is currently over the canvas — gates the per-frame hover re-derive
  // during follow (so a stale tile isn't recomputed after the cursor has left the map).
  let cursorOverCanvas = false;
  // A fog-hidden tile (mountain interior / sealed pocket) shows NO inspector — hovering it must not
  // reveal the resources, soil, or subterrain buried under the silhouette.
  $: hoverTile =
    hoverTileX >= 0 &&
    hoverTileY >= 0 &&
    worldMap.length > 0 &&
    !isHiddenTile(hoverTileX, hoverTileY)
      ? (worldMap[hoverTileY]?.[hoverTileX] ?? null)
      : null;
  $: hoverResources = hoverTile
    ? Object.entries(hoverTile.resources ?? {}).filter(([, v]) => v > 0)
    : [];
  // §F: the resource to NAME in the inspector — an active node (count > 0), else a still-STANDING
  // depleted one (a foraged tree/bush keeps a growth entry while its yield regrows). Without this
  // the panel — and its growth readout — blanked the instant a tree was foraged to count 0, even
  // though the tree is still there. Felled/dug/mined nodes drop their growth entry → fall back to '—'.
  // A wild plant reset below the visible threshold reads as bare soil (not yet regrown), so it isn't
  // named — matches the renderer + click selection.
  $: hoverDisplayResource = hoverTile
    ? (hoverResources[0]?.[0] ??
      Object.keys(hoverTile.growth ?? {}).find(
        (id) => (hoverTile.growth?.[id] ?? 0) >= RESOURCE_VISIBLE_GROWTH
      ))
    : undefined;
  $: hoverZoneType = hoverTile
    ? (zoneTiles[`${hoverTile.x},${hoverTile.y}`]?.[0] ??
      designations[`${hoverTile.x},${hoverTile.y}`] ??
      null)
    : null;
  $: hoverTileLight = hoverTile
    ? computeTileLightLevel(
        environmentService.ambientTurn($gameState ?? { turn: 0 }),
        $gameState?.buildings ?? [],
        hoverTile.x,
        hoverTile.y
      )
    : 1.0;
  // Hover entity IDs — updated imperatively using render positions so that
  // interpolated movement doesn't create a mismatch between visual location and click target.
  let hoverPawnId: string | null = null;
  let hoverMobId: string | null = null;

  function findPawnAtTile(tx: number, ty: number): Pawn | null {
    for (const pawn of pawns) {
      const rp = pawnRenderPos.get(pawn.id);
      const cx = rp ? Math.round(rp.x) : (pawn.position?.x ?? -1);
      const cy = rp ? Math.round(rp.y) : (pawn.position?.y ?? -1);
      if (cx === tx && cy === ty) return pawn;
    }
    return null;
  }

  function findMobAtTile(tx: number, ty: number): Mob | null {
    for (const mob of mobs) {
      if (mob.state === 'Corpse') continue;
      const rp = mobRenderPos.get(mob.id);
      const cx = rp ? Math.round(rp.x) : mob.x;
      const cy = rp ? Math.round(rp.y) : mob.y;
      if (cx === tx && cy === ty) return mob;
    }
    return null;
  }

  function updateHoverEntity() {
    if (hoverTileX < 0 || hoverTileY < 0) {
      hoverPawnId = null;
      hoverMobId = null;
      return;
    }
    const pawn = findPawnAtTile(hoverTileX, hoverTileY);
    hoverPawnId = pawn?.id ?? null;
    hoverMobId = pawn ? null : (findMobAtTile(hoverTileX, hoverTileY)?.id ?? null);
  }

  $: hoverPawn = hoverPawnId ? (pawns.find((p) => p.id === hoverPawnId) ?? null) : null;

  // When a pawn is selected its card locks the HUD regardless of hover position.
  $: selectedPawn = selectedPawnId ? (pawns.find((p) => p.id === selectedPawnId) ?? null) : null;

  // Click-selected mob/animal (stays locked until Esc / click elsewhere).
  $: selectedMob = selectedMobId ? (mobs.find((m) => m.id === selectedMobId) ?? null) : null;
  $: selectedMobDef = selectedMob ? (getCreatureById(selectedMob.creatureId) ?? null) : null;

  // Reusable info-card models — both feed the same SelectedEntityCard component.

  /** Returns " #N" in debug mode, derived from debugId or the trailing number in the id string. */

  $: selectedPawnCard = selectedPawn
    ? buildPawnCard(selectedPawn, true, {
        cameraFollowPawnId,
        startMark: () => startMarkDrag('pawn'),
        armMove: () => armMoveAim(),
        toggleFood: () => toggleFoodSettingsPanel(),
        foodOpen: showFoodSettings
      })
    : null;
  $: hoverPawnCard = hoverPawn
    ? buildPawnCard(hoverPawn, false, {
        cameraFollowPawnId,
        startMark: () => startMarkDrag('pawn'),
        armMove: () => armMoveAim(),
        toggleFood: () => {},
        foodOpen: false
      })
    : null;

  // How many of the highlighted pawns are currently drafted — gates the MOVE action.
  $: markedDraftedCount =
    markedKind === 'pawn' ? pawns.filter((p) => p.drafted && markedSet.has(p.id)).length : 0;
  // All highlighted pawns already drafted → the verb flips to UNDRAFT.
  $: markedAllDrafted =
    markedKind === 'pawn' && markedIds.length > 0 && markedDraftedCount === markedIds.length;

  // How many pawns a MOVE aim would command: the marked drafted group if one is highlighted, else the
  // single selected drafted pawn. Drives the aim HUD label + the card/HUD MOVE enablement.
  $: moveAimCount =
    markedKind === 'pawn' && markedDraftedCount > 0
      ? markedDraftedCount
      : selectedPawn?.drafted
        ? 1
        : 0;

  $: hoverMob = hoverMobId ? (mobs.find((m) => m.id === hoverMobId) ?? null) : null;

  $: hoverMobCard = (() => {
    if (!hoverMob) return null;
    const def = getCreatureById(hoverMob.creatureId);
    return def
      ? buildMobCard(hoverMob, def, false, {
          cameraFollowMobId,
          startMark: () => startMarkDrag('mob')
        })
      : null;
  })();

  $: selectedMobCard = (() => {
    if (!selectedMob || !selectedMobDef) return null;
    return buildMobCard(selectedMob, selectedMobDef, true, {
      cameraFollowMobId,
      startMark: () => startMarkDrag('mob')
    });
  })();

  // Summary card for a committed MARK highlight of 2+ entities — reuses SelectedEntityCard (shared
  // chrome) instead of the old floating mark-HUD, so group DRAFT/UNDRAFT/MOVE/HUNT live in the same
  // info panel a single selection uses. Just names + a "multiple selected" header; the per-entity
  // detail is intentionally dropped (it's a group). Takes priority over any single selection below.
  // Gate the force BUILD / HARVEST verbs on whether any such job actually exists right now.
  $: hasBuildJobs = ($gameState?.jobs ?? []).some((j) => j.type === 'construct');
  $: hasHarvestJobs = ($gameState?.jobs ?? []).some((j) => j.type === 'harvest');

  $: markedGroupCard = ((): SelectedEntityModel | null => {
    if (!markedKind || markedIds.length < 1) return null;
    const n = markedIds.length;
    const plural = n !== 1;
    const status = plural ? 'multiple targets' : 'marked';
    if (markedKind === 'pawn') {
      const names = pawns.filter((p) => markedSet.has(p.id)).map((p) => p.name);
      const btns: EntityButton[] = [
        {
          label: markedAllDrafted ? 'UNDRAFT' : 'DRAFT',
          active: markedAllDrafted,
          onClick: () => draftMarkedPawns()
        }
      ];
      // MOVE only once some are drafted (mirrors the old HUD's disabled state) — it arms the aim.
      if (markedDraftedCount > 0) {
        btns.push({ label: `MOVE (${markedDraftedCount})`, onClick: () => armMoveAim() });
      }
      // Force the highlighted colonists onto the nearest build / harvest job right now (overrides idle,
      // work-priority and restrict-zone gating). Shown only when such jobs exist.
      if (hasBuildJobs)
        btns.push({ label: 'BUILD', onClick: () => forceMarkedPawnsJob('construct') });
      if (hasHarvestJobs)
        btns.push({ label: 'HARVEST', onClick: () => forceMarkedPawnsJob('harvest') });
      btns.push({ label: 'CLEAR', onClick: () => clearMark() });
      return {
        name: `${n} pawn${plural ? 's' : ''} selected`,
        status,
        selected: true,
        dismissable: true,
        note: markedDraftedCount > 0 ? `${markedDraftedCount} of ${n} drafted` : 'none drafted',
        lines: [names.join(', ')],
        buttons: btns
      } satisfies SelectedEntityModel;
    }
    // Mobs: a HUNT group.
    const names = mobs
      .filter((m) => markedSet.has(m.id))
      .map((m) => getCreatureById(m.creatureId)?.name ?? 'creature');
    return {
      name: `${n} entit${plural ? 'ies' : 'y'} selected`,
      status,
      selected: true,
      dismissable: true,
      lines: [names.join(', ')],
      buttons: [
        { label: 'HUNT', onClick: () => huntMarkedMobs() },
        { label: 'CLEAR', onClick: () => clearMark() }
      ]
    } satisfies SelectedEntityModel;
  })();

  // Building under hovered tile (all statuses)
  $: hoverBuilding =
    hoverTileX >= 0 && hoverTileY >= 0
      ? (buildings.find((b) => b.x === hoverTileX && b.y === hoverTileY) ?? null)
      : null;
  // Click-selected building (stays locked until Esc / click elsewhere)
  $: selectedBuilding = selectedBuildingId
    ? (buildings.find((b) => b.id === selectedBuildingId) ?? null)
    : null;

  // Resource tile derived state
  $: selectedResourceDef = selectedResourceTile
    ? resourceObjectService.getById(selectedResourceTile.resourceId)
    : null;
  $: selectedResourceAmount = selectedResourceTile
    ? (worldMap[selectedResourceTile.y]?.[selectedResourceTile.x]?.resources?.[
        selectedResourceTile.resourceId
      ] ?? 0)
    : 0;
  $: selectedResourceDesignation = selectedResourceTile
    ? (designations[`${selectedResourceTile.x},${selectedResourceTile.y}`] ?? null)
    : null;

  /** Environmental readout for a tile (light/temp/wet/wind) — shared by the tile, building hover and
   *  building click panels so a floor/sleeping-spot/etc. shows the same conditions a bare tile does. */
  function tileEnv(t: { x: number; y: number; terrainType: string; moisture?: number }) {
    const thermal = computeThermalAt(t.x, t.y, buildings, worldMap);
    return {
      light: computeTileLightLevel(
        environmentService.ambientTurn($gameState ?? { turn: 0 }),
        buildings,
        t.x,
        t.y
      ),
      // Round for the readout only — a thermal aura (embertree warmth, fire) adds a fractional °C
      // that must not leak decimals into the HUD. The sim keeps the un-rounded tileTemperature.
      temp: Math.round(tileTemperature(t.terrainType, $currentSeason, $currentWeather, thermal)),
      wet: tileWetness(t.moisture ?? 0, $currentWeather, thermal),
      wind: windDegreeWord(effectiveWindAt(t.x, t.y, $currentWeather, thermal, worldMap))
    };
  }

  $: buildingCard = (() => {
    if (!selectedBuilding) return null;
    const bDef = buildingService.getBuildingById(selectedBuilding.type);
    const isBlueprint = selectedBuilding.status !== 'complete';
    const workDone = selectedBuilding.workDone ?? 0;
    const workReq = selectedBuilding.workRequired ?? bDef?.workAmount ?? 1;
    const canConfigFuel =
      !isBlueprint && !selectedBuilding.deconstructQueued && bDef?.maxFuel !== undefined;
    const statusStr = isBlueprint
      ? selectedBuilding.paused
        ? 'paused'
        : 'building'
      : `complete${selectedBuilding.deconstructQueued ? ' ⊢ demolish' : ''}`;
    const lines: string[] = [];
    if (bDef?.description) lines.push(bDef.description);
    if (isBlueprint) {
      lines.push(
        `[${jobProgressBar(workReq > 0 ? workDone / workReq : 0)}] ${Math.round(workDone)}/${workReq} work`
      );
    } else if (selectedBuilding.deconstructQueued) {
      const dDone = selectedBuilding.deconstructWorkDone ?? 0;
      const dReq = selectedBuilding.deconstructWorkRequired ?? 1;
      lines.push(
        `[${jobProgressBar(dReq > 0 ? dDone / dReq : 0)}] ${Math.round(dDone)}/${dReq} work`
      );
      lines.push('⊢ demolishing…');
    } else {
      const cost = bDef?.buildingCost ?? {};
      if (Object.keys(cost).length > 0) {
        lines.push(
          `refund ½: ${Object.entries(cost)
            .map(([id, n]) => `${Math.floor(Number(n) * 0.5)}×${id.replace(/_/g, ' ')}`)
            .join(' ')}`
        );
      }
      if (bDef?.maxFuel !== undefined) {
        const fuelMax = bDef.maxFuel;
        const fuelCurr = selectedBuilding.fuel ?? 0;
        const litStr = selectedBuilding.lit ? '● lit' : '○ unlit';
        lines.push(
          `FUEL [${jobProgressBar(fuelMax > 0 ? fuelCurr / fuelMax : 0)}] ${Math.floor(fuelCurr)}/${Math.floor(fuelMax)} ${litStr}`
        );
        // Make the refuel requirement explicit on the card (it always needs tinder + N distinct fuel
        // types), and flag when the colony can't currently satisfy it — so "won't refuel" is obvious.
        const req = getRefuelRequirements(selectedBuilding.type);
        const tinderName =
          itemService.getItemById(req.tinderItemId)?.name ?? req.tinderItemId.replace(/_/g, ' ');
        lines.push(
          `needs: ${req.tinderAmount}× ${tinderName} + ${req.requiredFuelTypes} fuel types`
        );
        const wantsFuel =
          fuelCurr / Math.max(fuelMax, 1) < getRefuelThresholdRatio(selectedBuilding);
        if (wantsFuel && planRefuel($gameState, selectedBuilding) === null) {
          const tinderStock = ($gameState.stockpile ?? {})[req.tinderItemId] ?? 0;
          lines.push(
            tinderStock < req.tinderAmount
              ? `⚠ won't refuel — need ${req.tinderAmount}× ${tinderName} (have ${tinderStock})`
              : `⚠ won't refuel — not enough distinct fuel in stock`
          );
        }
      }
    }
    const btns: EntityButton[] = [];
    if (isBlueprint) {
      btns.push({
        label: selectedBuilding.paused ? 'RESUME' : 'PAUSE',
        onClick: togglePauseBlueprintBuilding
      });
      btns.push({ label: 'ABORT', onClick: cancelBlueprintBuilding });
    } else if (selectedBuilding.deconstructQueued) {
      btns.push({ label: 'CANCEL', onClick: cancelDeconstructBuilding });
    } else {
      // BUILD: jump straight into blueprint-placement mode for another of the same
      // building, skipping the Buildings tab.
      btns.push({ label: 'BUILD', onClick: buildAnother });
      btns.push({ label: 'DEMOLISH', onClick: deconstructBuilding });
      if (canConfigFuel) {
        btns.push({ label: 'FUEL', active: showFuelSettings, onClick: toggleFuelSettingsPanel });
      }
    }
    // Environmental conditions of the tile the building sits on (same readout a bare tile shows).
    const bt = worldMap[selectedBuilding.y]?.[selectedBuilding.x];
    if (bt) {
      const env = tileEnv(bt);
      lines.push(
        `light ${Math.round(env.light * 100)}%  ·  temp ${env.temp}°C  ·  wet ${Math.round(env.wet)}%  ·  ${env.wind}`
      );
    }
    return {
      name: bDef?.name ?? selectedBuilding.type,
      status: statusStr,
      selected: true,
      dismissable: true,
      lines,
      buttons: btns
    } satisfies SelectedEntityModel;
  })();

  $: resourceCard = (() => {
    if (!selectedResourceTile || !selectedResourceDef) return null;
    const activeInteractions = selectedResourceDef.interactions ?? [
      selectedResourceDef.interaction
    ];
    const lines: string[] = [];
    lines.push(
      `${selectedResourceTile.resourceId.replace(/_/g, ' ')} — ×${selectedResourceAmount} nodes`
    );
    // Growth maturity — same readout (colour ramp + tooltip) as the hover HUD, surfaced in the
    // click-locked card too. Only meaningful for growable resources (crops/trees/bushes); scales yield.
    const growthPct = isGrowableResource(selectedResourceDef)
      ? (worldMap[selectedResourceTile.y]?.[selectedResourceTile.x]?.growth?.[
          selectedResourceTile.resourceId
        ] ?? 100)
      : undefined;
    // The tiles this card acts on: the Shift-marked highlight if any, else just the selected node. The
    // HARVEST and CANCEL buttons are derived over THIS set, so a mixed selection (some already marked
    // for harvest, some not) gets BOTH — HARVEST marks the rest, CANCEL clears only the marked ones.
    const tileKeys =
      highlightedResourceTiles.size > 0
        ? [...highlightedResourceTiles]
        : [`${selectedResourceTile.x},${selectedResourceTile.y}`];
    const designatedCount = tileKeys.filter((k) => designations[k]).length;
    const anyDesignated = designatedCount > 0;
    const allDesignated = designatedCount === tileKeys.length;
    if (highlightedResourceTiles.size > 0) {
      lines.push(`◈ ${highlightedResourceTiles.size} tiles selected`);
    }
    if (anyDesignated) {
      lines.push(`⊢ ${designatedCount}/${tileKeys.length} marked for harvest`);
    }
    // Harvestable items become stylised, item-coloured pills (hover → item card). Shown while there's
    // still something to designate. Dedupe by itemId across interactions, widening the quantity range.
    const pillMap = new Map<string, { min: number; max: number }>();
    if (!allDesignated) {
      for (const iact of activeInteractions) {
        for (const y of iact.yields) {
          if (y.max <= 0) continue;
          const prev = pillMap.get(y.itemId);
          pillMap.set(y.itemId, {
            min: Math.min(prev?.min ?? y.min, y.min),
            max: Math.max(prev?.max ?? y.max, y.max)
          });
        }
      }
    }
    const itemPills: ItemPillView[] = [...pillMap].map(([itemId, { min, max }]) => ({
      itemId,
      qty: min === max ? `×${max}` : `${min}–${max}`
    }));
    // §F gradual regrow: a wild plant reset to growth 0 has no nodes until it climbs back to maturity.
    // It stays selectable (inspect its growth%), but the HARVEST verb is withheld until it's ready —
    // "the button doesn't work while regrowing" rather than the tile becoming unclickable.
    const isRegrowing =
      selectedResourceAmount <= 0 &&
      resourceObjectService.isRegrowsFromZero(selectedResourceTile.resourceId);
    if (isRegrowing) lines.push('regrowing — not ready to harvest');
    const btns: EntityButton[] = [];
    // Designate buttons (HARVEST/CUT/…) while ANY tile in the selection is still unmarked.
    if (!allDesignated && !isRegrowing) {
      for (const iact of activeInteractions) {
        const label = selectedResourceDef.lair
          ? 'DESTROY'
          : iact.designationType === 'woodcut'
            ? 'CUT'
            : iact.designationType === 'forage'
              ? 'FORAGE'
              : iact.designationType === 'mine'
                ? 'MINE'
                : iact.designationType === 'dig'
                  ? 'DIG'
                  : 'HARVEST';
        btns.push({ label, onClick: () => designateResource(iact.designationType) });
      }
    }
    // CANCEL while ANY tile in the selection is marked — clears only those, never the whole type.
    if (anyDesignated) {
      btns.push({ label: 'CANCEL', onClick: cancelResourceDesignation });
    }
    btns.push({ label: 'MARK', onClick: startSimilarSelect });
    return {
      name: selectedResourceDef.displayName,
      status:
        selectedResourceDesignation ??
        activeInteractions[0]?.designationType ??
        activeInteractions[0]?.action ??
        'harvest',
      selected: true,
      dismissable: true,
      lines,
      growthPct,
      itemPills,
      buttons: btns
    } satisfies SelectedEntityModel;
  })();

  // Multi-type resource MARK card — shown once 2+ resource KINDS are Shift-selected. Reuses the shared
  // SelectedEntityCard to list the types + highlighted-tile count. Shift+drag HIGHLIGHTS matching tiles;
  // DESIGNATE then queues each with its own designation type (tree → woodcut, stone/berry → harvest …),
  // grouped, in one press — select-then-confirm, never auto-commit. Priority over the single card below.
  $: multiResourceCard = ((): SelectedEntityModel | null => {
    if (selectedResourceTypes.size < 2) return null;
    const typeNames = [...selectedResourceTypes].map(
      (id) => resourceObjectService.getById(id)?.displayName ?? id
    );
    const marked = highlightedResourceTiles.size;
    const designatedCount = [...highlightedResourceTiles].filter((k) => designations[k]).length;
    const allDesignated = marked > 0 && designatedCount === marked;
    const btns: EntityButton[] = [];
    // DESIGNATE while any highlighted tile is still unmarked; CANCEL while any is marked — both act on
    // the SAME working set across all selected types, so 5 different resources cancel with one press.
    if (marked > 0 && !allDesignated) {
      btns.push({
        label: `DESIGNATE (${marked - designatedCount})`,
        onClick: () => designateMarkedMulti()
      });
    }
    if (designatedCount > 0) {
      btns.push({ label: `CANCEL (${designatedCount})`, onClick: () => cancelMarkedMulti() });
    }
    btns.push({ label: 'CLEAR', onClick: () => clearResourceMark() });
    return {
      name: `${selectedResourceTypes.size} resource types`,
      status: 'mark brush',
      selected: true,
      dismissable: true,
      note:
        marked === 0
          ? 'Shift+drag a box to highlight all of these'
          : designatedCount > 0
            ? `${designatedCount}/${marked} marked for harvest`
            : `${marked} tiles highlighted`,
      lines: [typeNames.join(', ')],
      buttons: btns
    } satisfies SelectedEntityModel;
  })();

  // Dropped item under the hovered tile.
  $: hoverDroppedItem =
    hoverTileX >= 0 && hoverTileY >= 0
      ? (droppedItems.find((d) => d.x === hoverTileX && d.y === hoverTileY) ?? null)
      : null;

  function needBar(value: number): string {
    // value 0–100; show as filled/empty blocks
    const filled = Math.round(value / 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  }

  /** Colour for an item bar where higher = better (freshness / condition). */
  function itemBarColor(goodPct: number): string {
    if (goodPct >= 66) return '#4CAF50';
    if (goodPct >= 33) return '#FFA726';
    return '#D32F2F';
  }

  // Click-locked dropped item, re-derived live from droppedItems by id (tracks decay/condition; auto-
  // clears to null when the stack is consumed/hauled away). Same card builder as the hover panel.
  $: selectedItem = selectedItemId
    ? (droppedItems.find((d) => d.id === selectedItemId) ?? null)
    : null;

  // Dropped-item info panel — same shared SelectedEntityCard as pawns/mobs/buildings/resources, so the
  // title sits on top and FRESH/COND bars (the reusable StatBar) render below it. Shared by the hover
  // panel and the click-locked selection (buildItemCard).
  function toggleDropForbidden(d: DroppedItem) {
    gameState.command({
      type: 'setDropForbidden',
      payload: { dropId: d.id, forbidden: !d.forbidden },
      save: true
    });
  }
  function toggleDropUrgent(d: DroppedItem) {
    gameState.command({
      type: 'setDropUrgent',
      payload: { dropId: d.id, urgent: !d.urgent },
      save: true
    });
  }
  function buildItemCard(d: DroppedItem, selected = false): SelectedEntityModel {
    const itemDef = ITEMS_DATABASE.find((i) => i.id === d.resourceId);
    const maxDur = itemDef?.maxDurability ?? 100;
    const freshPct =
      itemDef?.decaySeconds && itemDef.decaySeconds > 0
        ? Math.round(Math.max(0, 1 - (d.decayAcc ?? 0) / itemDef.decaySeconds) * 100)
        : null;
    const durPct = Math.round((Math.min(maxDur, d.durability ?? maxDur) / maxDur) * 100);
    const displayName =
      itemDef?.dynamicName && d.name ? d.name : (itemDef?.name ?? d.resourceId.replace(/_/g, ' '));
    const bars: EntityBar[] = [];
    if (freshPct !== null) {
      bars.push({
        label: 'FRESH',
        value: freshPct,
        color: itemBarColor(freshPct),
        valueText: `${freshPct}%`
      });
    }
    bars.push({
      label: 'COND',
      value: durPct,
      color: itemBarColor(durPct),
      valueText: `${durPct}%`
    });
    return {
      name: `★ ${displayName}`,
      status: `×${d.quantity}`,
      // Same item-card hover (description / recipes / lifespans) as the resource-yield pills, so a
      // dropped item and a resource's yields read identically. The live FRESH/COND bars below stay —
      // they show this instance's current state, which the static pill hover can't.
      itemPills: [{ itemId: d.resourceId }],
      bars,
      note: d.stored
        ? 'stored'
        : d.forbidden
          ? 'forbidden — pawns will not haul this'
          : d.urgent
            ? 'urgent — hauled before other work'
            : 'dropped item — awaiting hauler',
      // Loose stacks get a per-stack haul lockout toggle (FORBID) + an URGENT toggle that jumps this
      // stack's haul to the top of every pawn's queue. Carcasses default to forbidden (see dropCarcass)
      // so the player allows hauling once it's safe; urgency is hidden while forbidden (no haul at all).
      buttons:
        selected && !d.stored
          ? [
              {
                label: d.forbidden ? 'ALLOW HAUL' : 'FORBID HAUL',
                active: !d.forbidden,
                onClick: () => toggleDropForbidden(d)
              },
              ...(!d.forbidden
                ? [
                    {
                      label: d.urgent ? 'NORMAL HAUL' : 'URGENT HAUL',
                      active: !!d.urgent,
                      onClick: () => toggleDropUrgent(d)
                    }
                  ]
                : [])
            ]
          : undefined
    } satisfies SelectedEntityModel;
  }
  $: hoverItemCard = hoverDroppedItem ? buildItemCard(hoverDroppedItem) : null;
  $: selectedItemCard = selectedItem ? buildItemCard(selectedItem, true) : null;

  // ── Click-locked stockpile zone (the zone info/filter card) ───────────────────────
  $: selectedZone = selectedZoneId
    ? (zoneInstances.find((z) => z.id === selectedZoneId) ?? null)
    : null;
  $: selectedZoneTileKeys = selectedZoneId
    ? Object.keys(designationZoneId).filter((k) => designationZoneId[k] === selectedZoneId)
    : [];
  // Per-item totals physically stored on THIS zone's tiles (stored drops) — feeds the filter card's
  // counts so "what's actually here" reads truthfully (and items at 0 still list, for filtering).
  $: selectedZoneInventory = (() => {
    if (!selectedZoneId) return {} as Record<string, number>;
    const tiles = new Set(selectedZoneTileKeys);
    const inv: Record<string, number> = {};
    for (const d of droppedItems) {
      if (!d.stored || !tiles.has(`${d.x},${d.y}`)) continue;
      inv[d.resourceId] = (inv[d.resourceId] ?? 0) + d.quantity;
    }
    return inv;
  })();
  // Is the active DRAW/CLEAR tool currently aimed at the selected zone? (highlights its button)
  $: zoneToolDrawing = designationMode && activeZoneInstanceId === selectedZoneId && !zoneEraseMode;
  $: zoneToolClearing = designationMode && activeZoneInstanceId === selectedZoneId && zoneEraseMode;

  /** Enter the paint tool for a stockpile zone — DRAW extends (erase off), CLEAR reduces (erase on).
   *  All zones reveal while a drawing tool is active (drawDesignations gates on designationMode), so no
   *  colour flag is touched here — they auto-restore their hidden state when the tool is exited. */
  function paintZoneTool(instanceId: string, erase: boolean) {
    zoneEraseMode = erase;
    uiState.activateDesignation('stockpile', instanceId);
  }

  // Zone info card — built through the SHARED SelectedEntityCard model (same chrome as pawn/mob/
  // building), with FILTER/DRAW/CLEAR in the button column. The per-item haul filter is the
  // StockpileZonePanel fly-out the FILTER button opens (mirrors the building card + fuel panel).
  $: zoneStoredTotal = Object.values(selectedZoneInventory).reduce((a, b) => a + b, 0);
  $: zoneCard = ((): SelectedEntityModel | null => {
    if (!selectedZone) return null;
    const allowed = selectedZone.filter.allowedCategories.length === 0 ? 'all items' : 'filtered';
    const id = selectedZone.id;
    return {
      name: selectedZone.label,
      status: 'stockpile',
      selected: true,
      dismissable: true,
      lines: [
        `${selectedZoneTileKeys.length} tiles · ${Math.floor(zoneStoredTotal)} stored`,
        `haul filter: ${allowed}`
      ],
      buttons: [
        {
          label: 'FILTER',
          active: showZoneFilter,
          onClick: () => (showZoneFilter = !showZoneFilter)
        },
        { label: 'DRAW', active: zoneToolDrawing, onClick: () => paintZoneTool(id, false) },
        { label: 'CLEAR', active: zoneToolClearing, onClick: () => paintZoneTool(id, true) }
      ]
    } satisfies SelectedEntityModel;
  })();

  function moveCostLabel(cost: number): { label: string; color: string } {
    if (cost <= 0) return { label: 'impassable', color: '#cc4444' };
    if (cost <= 1.0) return { label: 'normal', color: '#70bb70' };
    if (cost <= 1.5) return { label: 'light', color: '#99cc77' };
    if (cost <= 2.0) return { label: 'slow', color: '#ccaa44' };
    if (cost <= 3.0) return { label: 'very slow', color: '#cc7733' };
    return { label: 'barely passable', color: '#cc4444' };
  }

  // ─── Resource MARK selection (Shift) ──────────────────────────────────────
  // Shift is a shortcut for the resource MARK tool: Shift+CLICK a resource adds its TYPE to the
  // multi-select set (so you can stack "tree" + "stone outcrop" + "berry bush"); Shift+DRAG a box then
  // marks every tile in it that holds ANY selected type. The marked tiles go into highlightedResourceTiles
  // (shared with the single-resource MARK path), and the multi-resource card's DESIGNATE button queues
  // each tile with its resource's own designation type (woodcut / harvest / forage …) in one press.
  let selDragActive = false; // a Shift+drag mark-rectangle is in progress
  let selAnchorX = 0;
  let selAnchorY = 0;
  let selEndX = 0;
  let selEndY = 0;
  // The set of resource type ids currently selected for marking (kebab ids — backend reference only,
  // never rendered raw; the card routes through resourceObjectService.displayName).
  let selectedResourceTypes = new Set<string>();

  const ZONE_META: Record<string, { label: string; color: string; desc: string }> = {
    stockpile: {
      label: 'STOCKPILE ZONE',
      color: '#e8a020',
      desc: 'Haulers deposit carried resources here'
    },
    drink: { label: 'DRINK ZONE', color: '#4fc3f7', desc: 'Thirsty pawns come here to drink' },
    wash: { label: 'WASH ZONE', color: '#80d8c0', desc: 'Dirty pawns come here to wash' },
    grow: {
      label: 'GROW ZONE',
      color: '#6fae3a',
      desc: 'Farmers sow the chosen seed on fertile soil here'
    },
    restrict: {
      label: 'RESTRICT ZONE',
      color: '#b06cd0',
      desc: 'Assigned pawns stay confined to this zone'
    },
    harvest: { label: 'HARVEST', color: '#4ccc44', desc: 'Single-tile harvest designation' },
    mine: { label: 'MINE', color: '#cc8833', desc: 'Single-tile mining designation' },
    construct: { label: 'CONSTRUCT', color: '#44aacc', desc: 'Construction site' }
  };

  // ──────────────────────────────────────────────────────────────────────────

  // Visual signature of the building set for terrain-rebuild change detection.
  // Includes ONLY fields buildGameGrid draws (position, type, status, deconstruct,
  // paused). Deliberately excludes fuel/lit so a burning campfire's per-tick fuel
  // countdown does not force a full terrain rebuild every frame.
  let _lastWorldMapRef: unknown = null;
  const unsubState = gameState.subscribe((s) => {
    // World regen swaps the worldMap reference → force an immediate lair-tile rescan next frame
    // (in-place tile mutations keep the same ref and are caught by the ~4s timer instead).
    if (s.worldMap !== _lastWorldMapRef) {
      _lastWorldMapRef = s.worldMap;
      _lairScanAt = 0;
    }
    worldMap = s.worldMap ?? [];
    pawns = s.pawns ?? [];
    buildings = s.buildings ?? [];
    designations = s.designations ?? {};
    zoneTiles = s.zoneTiles ?? {};
    designationZoneId = s.designationZoneId ?? {};
    zoneInstances = s.zoneInstances ?? [];
    hiddenZoneInstances = new Set(zoneInstances.filter((z) => z.colorHidden).map((z) => z.id));
    droppedItems = s.droppedItems ?? [];
    mobs = s.mobs ?? [];
    // Only the terrain layer is expensive to rebuild (buildGameGrid scans the
    // whole 240×160 map). It only changes when one of these references changes —
    // pawns AND dropped items are rendered as a separate per-frame overlay, so
    // ticks that only move items/pawns need no terrain rebuild. Skipping unchanged
    // rebuilds is the main perf win.
    //
    // Buildings are compared by a VISUAL signature (only the fields buildGameGrid
    // actually draws) rather than array identity: a lit campfire decrements its
    // fuel every tick — producing a fresh buildings array each tick — but fuel/lit
    // are invisible on the map, so an identity check would force a full terrain
    // rebuild every frame while a fire burns. The signature ignores fuel/lit.
    const buildingsSig = buildingsVisualSig(buildings);
    // Terrain rebuild (buildGameGrid + setGrid) bumps the renderer's gridVersion, which
    // invalidates the cached 38k-tile vertex buffer → a ~90ms rebuild. The trigger fields below
    // (designations especially) churn nearly every tick during play, so an immediate rebuild ran
    // every frame and capped FPS. ALL of them are now coalesced to TERRAIN_REBUILD_MIN_MS in the
    // render loop — placed buildings/designations appear ≤throttle late (imperceptible), and the
    // terrain cache finally HITS between rebuilds. (Interactive drag previews bypass this via their
    // own direct redrawOverlay() calls, so painting stays responsive.)
    // In sim-worker mode (ADR-021) structured-clone hands us NEW refs for designations/buildings/
    // zoneTiles every snapshot, so ref-equality always reports "changed" → terrain rebuilds every
    // frame (90ms freeze frames). The worker sends `_terrainRev` (a reliable revision computed where
    // refs are stable); use it when present. In-thread, fall back to the ref checks.
    const workerRev = (s as unknown as { _terrainRev?: number })._terrainRev;
    const workerDesigRev = (s as unknown as { _designationRev?: number })._designationRev;
    // Hiding/showing a zone's colour is a stable string signature (it survives the worker's structured
    // clone), so it's compared directly in both modes to trigger a cheap overlay redraw.
    const hiddenZoneSig = [...hiddenZoneInstances].sort().join(',');

    // Terrain (WebGL grid) rebuild trigger — worldMap + buildings ONLY. Designation icons AND standing-
    // zone tints both live on the cheap 2D overlay now (buildGameGrid renders neither), so they must
    // NOT force the ~90ms 38k-tile rebuild. This is what removes the "map lags then the zone colour
    // appears a second later" hitch when committing a stockpile/drink/wash zone.
    const terrainChanged =
      workerRev !== undefined
        ? workerRev !== _prevTerrainRev
        : worldMap !== _prevWorldMap || buildingsSig !== _prevBuildingsSig;

    // 2D overlay (designation icons + zone tints) redraw trigger. In worker mode the worker bumps
    // _designationRev for designation AND zone changes (structured-clone breaks ref-equality, so refs
    // are useless); in-thread we ref-check designations/zoneTiles. The colour-hidden toggle is the
    // string sig above (so SHOW/HIDE ALL COLORS just repaints the overlay — no terrain rebuild).
    const overlayChanged =
      hiddenZoneSig !== _prevHiddenZoneSig ||
      (workerDesigRev !== undefined
        ? workerDesigRev !== _prevDesignationRev
        : designations !== _prevDesignations || zoneTiles !== _prevZoneTiles);

    _prevTerrainRev = workerRev;
    _prevDesignationRev = workerDesigRev;
    _prevHiddenZoneSig = hiddenZoneSig;
    _prevWorldMap = worldMap;
    _prevBuildingsSig = buildingsSig;
    _prevDesignations = designations;
    _prevZoneTiles = zoneTiles;

    if (overlayChanged && renderer?.isReady() && worldMap.length > 0) drawDesignations();
    // Day/night: update ambient uniforms whenever the turn changes. Season + weather hue is folded
    // into the ambient tint here (PERF-5: a uniform multiply, never a terrain rebuild).
    if (renderer?.isReady()) {
      const { light, tint } = environmentService.getAmbient(environmentService.ambientTurn(s));
      // Season+weather hue, winter-desaturated so snow isn't painted by the dawn/dusk/night hues.
      // Debug-aware season so a season override applies immediately even while paused.
      const tinted = environmentService.getMapAmbientTint(
        tint,
        environmentService.effectiveSeason(s),
        s.weather
      );
      renderer.setAmbient(light, tinted);
      lightingService.setAmbient(light, tinted);
      _ambientLight = light;
      _ambientTint = tinted;
    }
    // Camera follow is driven per-frame in the render loop (updateCameraFollow)
    // so it tracks the pawn's interpolated sub-tile position smoothly.
    if (renderer?.isReady()) {
      if (worldMap.length > 0) {
        if (terrainChanged) {
          // ADR-026: just flag dirty — the throttled redrawOverlayNow repaints ONLY the changed cells
          // and updates the hidden mask + grove glows INCREMENTALLY from the worldMapDelta coords. No
          // whole-map computeHiddenMask / collectResourceEmitters scan here anymore (the per-tick crater).
          _terrainDirty = true; // coalesced in the render loop (throttled)
        }
      } else {
        renderer.setGrid(generatePlaceholderGrid());
      }
      // Re-snap to fit when the real map loads (placeholder vs. actual may differ in size)
      if (worldMap.length > 0 && canvas) {
        const newFit = computeFitTileSize(canvas.width, canvas.height);
        const wasAtFit = Math.abs(tileWidth - fitTileSize) < 0.01;
        const fitChanged = Math.abs(newFit - fitTileSize) > 0.01;
        fitTileSize = newFit;
        if (wasAtFit && fitChanged) {
          tileWidth = tileHeight = fitTileSize;
          renderer.setTileSize(tileWidth, tileHeight);
          setView(0, 0);
        }
      }
    }
  });

  // Humanoid sprites from bitlands_map.bmp (indices 64,66,69,78,85,103,105,125)
  const PAWN_SPRITES = [64, 66, 69, 78, 85, 103, 105, 125].map((i) => glyph(SHEET.MAP, i));

  /**
   * Authoritative sub-tile target for a pawn in float world-tile coords.
   * Delegates to the shared MovementSystem.simTarget, flattening pawn.position.
   */
  function pawnSimTarget(pawn: Pawn): { x: number; y: number } {
    const { x, y } = pawn.position!;
    return simTarget(
      { x, y, path: pawn.path, pathIndex: pawn.pathIndex, nextCellCostLeft: pawn.nextCellCostLeft },
      worldMap
    );
  }

  /**
   * Rebuild the pawn overlay grid every animation frame, easing each pawn's
   * rendered position toward the simulation target using real elapsed time. This
   * decouples visual smoothness from the simulation tick rate (buttery 60fps even
   * when the sim runs at ~22 TPS) and renders pawns as a transparent layer above
   * the terrain so the tile beneath them is never blanked out.
   */
  function updatePawnOverlay(dt: number) {
    pawnOverlayGrid.clear();
    // Dropped/stored items render in a SEPARATE grid beneath the pawn overlay, so
    // a pawn standing on an item's tile composites on top of the item glyph
    // instead of overwriting it (terrain → items → entities, three glyph layers).
    itemOverlayGrid.clear();
    overlayDroppedItems(itemOverlayGrid, droppedItems, isHiddenTile);
    // Clamp dt so a CPU-stall frame (e.g. pathfinding for many entities) doesn't
    // produce alpha≈1 and snap all entities to their new positions at once.
    const clampedDt = Math.min(dt, 0.05);
    // Exponential smoothing factor — shared for pawns and mobs this frame.
    const alpha = clampedDt > 0 ? 1 - Math.exp(-clampedDt / MOVE_SMOOTH_TAU) : 1;
    // Wall-clock for attack-lunge curves (lunge spawn times are Date.now-based).
    const nowMs = Date.now();

    // Read the freshest game state directly from the store's held value.
    // The engine calls gameStore.setSilent() every tick, so get(gameState) is
    // always current-tick data — not the subscriber-throttled snapshot (4 ticks
    // old) stored in the `mobs` / `pawns` component variables. Using stale data
    // caused all entities to simultaneously lurch when the 4-tick flush fired.
    const freshState = get(gameState);
    const liveMobs = freshState.mobs ?? mobs;
    const livePawns = freshState.pawns ?? pawns;

    // ── Mobs / animals — same interpolation approach as pawns ─────────────────
    // Viewport cull bounds (tiles, +margin for mid-slide / re-entry). At 900 mobs this per-frame
    // smooth+setTile loop was THE zoom/pan FPS cost — it ran over EVERY mob regardless of zoom. Now we
    // touch only the on-screen handful. Off-screen mobs stop interpolating and snap when they re-enter
    // (the >2-tile guard below), which happens out in the margin so it's invisible. Selection/hit-tests
    // (findMobAtTile) read the sim mob list, not mobRenderPos, so culling here can't break clicking.
    const CULL_MARGIN = 3;
    const cullMinX = viewX - CULL_MARGIN;
    const cullMinY = viewY - CULL_MARGIN;
    const cullMaxX = viewX + Math.ceil((container?.clientWidth ?? 0) / tileWidth) + CULL_MARGIN;
    const cullMaxY = viewY + Math.ceil((container?.clientHeight ?? 0) / tileHeight) + CULL_MARGIN;
    // Entity render LOD: below this tile pixel size a mob glyph is ~a pixel, and drawing ~900 of them is
    // the dominant zoom-out render cost — drop mobs entirely (terrain + glow + weather still render).
    // mobRenderPos is emptied by the cleanup below, so they snap correctly when zoomed back in. Tunable.
    const ENTITY_RENDER_MIN_PX = 5;
    const renderMobs = tileWidth >= ENTITY_RENDER_MIN_PX;
    const seenMobs = new Set<string>();
    for (const mob of liveMobs) {
      if (!renderMobs) break;
      const def = getCreatureById(mob.creatureId);
      if (!def || !def.chars.length) continue;
      if (mob.x < cullMinX || mob.x > cullMaxX || mob.y < cullMinY || mob.y > cullMaxY) continue;
      seenMobs.add(mob.id);

      const target = simTarget(mob, worldMap);
      let rm = mobRenderPos.get(mob.id);
      if (!rm || Math.abs(rm.x - target.x) > 2 || Math.abs(rm.y - target.y) > 2) {
        rm = { x: target.x, y: target.y };
      } else {
        rm.x += (target.x - rm.x) * alpha;
        rm.y += (target.y - rm.y) * alpha;
      }
      mobRenderPos.set(mob.id, rm);

      // Don't render corpse mobs — the dropped carcass item already represents them on the map.
      if (mob.state === 'Corpse') continue;

      const cellX = Math.round(rm.x);
      const cellY = Math.round(rm.y);
      // Don't draw a mob standing on a fog-hidden tile — it would float on top of the mountain
      // silhouette and give away that the interior is open. (Render-pos bookkeeping above is kept so
      // it slides back in correctly when it steps out of the fog.)
      if (isHiddenTile(cellX, cellY)) continue;
      // MARK highlight reuses the click-selection colour, keyed by id so it follows the mob.
      const isSelected =
        mob.id === selectedMobId || (markedKind === 'mob' && markedSet.has(mob.id));
      const mLunge = lungeOffset(mob.id, nowMs);
      pawnOverlayGrid.setTile(cellX, cellY, {
        char: def.chars[0],
        foreground: isSelected
          ? { r: 1.0, g: 0.9, b: 0.1 }
          : { r: def.fg[0], g: def.fg[1], b: def.fg[2] },
        background: { r: 0, g: 0, b: 0 },
        position: { x: cellX, y: cellY },
        animationOffset: {
          x: (rm.x - cellX) * BASE_TILE_PX + mLunge.x,
          y: (rm.y - cellY) * BASE_TILE_PX + mLunge.y
        }
      });
    }
    if (seenMobs.size !== mobRenderPos.size) {
      for (const id of mobRenderPos.keys()) {
        if (!seenMobs.has(id)) mobRenderPos.delete(id);
      }
    }

    const seen = new Set<string>();

    for (let i = 0; i < livePawns.length; i++) {
      const pawn = livePawns[i];
      if (!pawn.position) continue;
      // Being carried (rescue): the victim rides inside its carrier — don't draw a second glyph that
      // would float a tick behind. It reappears when laid down (carriedBy cleared).
      if (pawn.carriedBy) continue;
      seen.add(pawn.id);

      const target = pawnSimTarget(pawn);
      let rp = pawnRenderPos.get(pawn.id);
      if (!rp || Math.abs(rp.x - target.x) > 2 || Math.abs(rp.y - target.y) > 2) {
        // First sighting or a teleport/path-jump — snap, don't slide across the map.
        rp = { x: target.x, y: target.y };
      } else {
        rp.x += (target.x - rp.x) * alpha;
        rp.y += (target.y - rp.y) * alpha;
      }
      pawnRenderPos.set(pawn.id, rp);

      // Owning cell = nearest integer tile; offset keeps the glyph within ±0.5 tile.
      const cellX = Math.round(rp.x);
      const cellY = Math.round(rp.y);
      // Don't draw a pawn on a fog-hidden tile (see mob note above) — keep its interpolation state but
      // skip the glyph so it doesn't render over the mountain silhouette.
      if (isHiddenTile(cellX, cellY)) continue;
      // MARK highlight reuses the click-selection colour, keyed by id so it follows the pawn.
      const isSelected =
        pawn.id === selectedPawnId || (markedKind === 'pawn' && markedSet.has(pawn.id));
      const isSleeping = pawn.currentState === 'Sleeping';
      // Collapsed = downed from pain / blood loss / starvation — lies on the ground like sleep, but it's
      // an emergency, marked by the red ↓ overlay rather than the calm blue Zzz.
      const isCollapsed = pawn.currentState === 'Collapsed';
      // A Sleeping pawn with real wounds is RECOVERING (red), not just napping (blue) — short-circuit
      // keeps the wound scan to sleeping pawns only.
      const isResting = isSleeping && needsRecovery(pawn as never);
      const isDrafted = pawn.drafted;
      const isCriticallyHungry = (pawn.needs?.hunger ?? 0) >= 85;
      const baseColor = isCollapsed
        ? { r: 0.85, g: 0.12, b: 0.12 }
        : isDrafted
          ? { r: 1.0, g: 0.15, b: 0.15 }
          : isResting
            ? { r: 0.95, g: 0.3, b: 0.3 }
            : isSleeping
              ? { r: 0.35, g: 0.45, b: 1.0 }
              : isCriticallyHungry
                ? { r: 1.0, g: 0.45, b: 0.05 }
                : { r: 1, g: 1, b: 1 };

      const pLunge = lungeOffset(pawn.id, nowMs);
      pawnOverlayGrid.setTile(cellX, cellY, {
        char: PAWN_SPRITES[i % PAWN_SPRITES.length],
        foreground: isSelected ? { r: 1.0, g: 0.9, b: 0.1 } : baseColor,
        background: isDrafted ? { r: 0.3, g: 0, b: 0 } : { r: 0, g: 0, b: 0 },
        position: { x: cellX, y: cellY },
        animationOffset: {
          x: (rp.x - cellX) * BASE_TILE_PX + pLunge.x,
          y: (rp.y - cellY) * BASE_TILE_PX + pLunge.y
        },
        // Both sleep and collapse lay the pawn on its side.
        rotation: isSleeping || isCollapsed ? 90 : undefined
      });
    }

    // Drop render state for pawns that no longer exist.
    if (seen.size !== pawnRenderPos.size) {
      for (const id of pawnRenderPos.keys()) {
        if (!seen.has(id)) pawnRenderPos.delete(id);
      }
    }
  }

  /**
   * Compute world-effect overlay positions (Zzz, progress bars, campfire sparks)
   * once per rAF frame, after the camera follow has updated viewX/viewY. Positions
   * are deduped at 1-px granularity: the Svelte store (and therefore the DOM) only
   * updates when something actually moved, not on every floating-point nudge.
   */
  function updateWorldEffectOverlays() {
    const W = container?.clientWidth ?? 0;
    const H = container?.clientHeight ?? 0;
    const tW = tileWidth;
    const tH = tileHeight;

    // Anchored looping glyph floats — sleep Zzz / recovery ✚ / collapse ↓ / campfire sparks — built
    // into ONE array (discriminated by `kind`) so the render layer shares a single positioning+scaling
    // wrapper instead of four duplicate each-blocks. Each entry's final screen position (incl. the
    // per-kind vertical anchor) is baked in here. Sleeping pawns with real wounds are RECOVERING (red
    // ✚), the rest just nap (Zzz).
    const glyphOf = (id: string, x: number, y: number, kind: GlyphFloatKind): GlyphFloat => ({
      id,
      left: (x - viewX + 0.5) * tW,
      top: (y - viewY) * tH - 18,
      kind
    });
    const onScreen = (o: { left: number; top: number }) => o.left >= 0 && o.top >= 0 && o.left <= W;
    const newGlyphs: GlyphFloat[] = [];
    // Status-animation PRIORITY (conditions.jsonc `priority`): an entity can be in several glyph-worthy
    // states at once (collapsed AND winded, sleeping AND winded). Play only the HIGHEST-priority one so
    // the most important state-to-know shows over the sprite — collapse(100) > sleep(50) > winded(20).
    // Priorities precomputed once (constant per build) → no per-entity lookup in this per-frame loop.
    const prioCollapse = conditionPriority('collapse');
    const prioSleeping = conditionPriority('sleeping');
    const prioWinded = conditionPriority('winded');
    for (const p of pawns) {
      if (!p.position) continue;
      if (p.carriedBy) continue; // carried victim is hidden — no floating ↓ over the carrier
      if (isHiddenTile(p.position.x, p.position.y)) continue; // under the fog → no Zzz/✚/↓ leak
      let kind: GlyphFloatKind | null = null;
      let prio = -1;
      if (p.currentState === 'Collapsed' && prioCollapse > prio) {
        prio = prioCollapse;
        kind = 'collapse';
      }
      // Sleeping pawns with real wounds are RECOVERING (red ✚), the rest just nap (Zzz).
      if (p.currentState === 'Sleeping' && prioSleeping > prio) {
        prio = prioSleeping;
        kind = needsRecovery(p as never) ? 'rest' : 'sleep';
      }
      // Winded (stamina spent) — a blue ↓ tell; loses to collapse/sleep so the more urgent state wins.
      if ((p.transientConditions ?? []).includes('winded') && prioWinded > prio) {
        prio = prioWinded;
        kind = 'winded';
      }
      if (kind) {
        const o = glyphOf(p.id, p.position.x, p.position.y, kind);
        if (onScreen(o)) newGlyphs.push(o);
      }
    }
    for (const m of mobs) {
      // A corpse is inert: the sim FSM skips Corpse mobs (entityAI.stepEntities), so their
      // conditionTimers never tick down and any transient they died with — `winded` especially —
      // stays frozen on the entity forever. Without this guard the blue ↓ "winded" tell (and the
      // sleep Zzz) kept animating over a dead body that no longer renders as a live mob. Living-status
      // overlays must never attach to a corpse, regardless of stale transientConditions.
      if (m.state === 'Corpse') continue;
      if (isHiddenTile(m.x, m.y)) continue; // under the fog → no Zzz/↓ leak
      let kind: GlyphFloatKind | null = null;
      let prio = -1;
      // Collapsed mob (combat KO / starvation) — the downed ↓, the bug fix: it MUST beat winded (a mob
      // that collapses while winded was wrongly showing the winded tell; pawns already prioritised this).
      if (m.state === 'Collapsed' && prioCollapse > prio) {
        prio = prioCollapse;
        kind = 'collapse';
      }
      if (m.state === 'Sleeping' && prioSleeping > prio) {
        prio = prioSleeping;
        kind = 'sleep';
      }
      // Winded mob (e.g. a boar that sprinted itself out) stands still to recover — show the blue ↓ tell.
      if ((m.transientConditions ?? []).includes('winded') && prioWinded > prio) {
        prio = prioWinded;
        kind = 'winded';
      }
      if (kind) {
        const o = glyphOf(m.id, m.x, m.y, kind);
        if (onScreen(o)) newGlyphs.push(o);
      }
    }
    // Campfire sparks anchor at the tile CENTER (not the -18 head offset of the pawn glyphs).
    for (const b of buildings) {
      if (b.type !== 'campfire' || b.status !== 'complete' || b.lit !== true) continue;
      const o: GlyphFloat = {
        id: b.id,
        left: (b.x - viewX + 0.5) * tW,
        top: (b.y - viewY + 0.5) * tH,
        kind: 'campfire'
      };
      if (o.left >= 0 && o.top >= 0 && o.left <= W) newGlyphs.push(o);
    }
    const glyphKey = newGlyphs
      .map((o) => `${o.kind}:${o.id}:${Math.round(o.left)},${Math.round(o.top)}`)
      .join('|');
    if (glyphKey !== _glyphFloatKey) {
      _glyphFloatKey = glyphKey;
      worldEffects.setGlyphFloats(newGlyphs);
    }

    const newProgress = [
      ...pawns
        .filter(
          (p) =>
            p.position &&
            !isHiddenTile(p.position.x, p.position.y) &&
            p.currentState != null &&
            PROGRESS_BAR_STATES.has(p.currentState) &&
            p.activeJob &&
            (p.activeJob.progress ?? 0) >= 0
        )
        .map((p) => ({
          id: p.id,
          left: (p.position!.x - viewX + 0.5) * tW,
          top: (p.position!.y - viewY) * tH - 6,
          progress: Math.max(0, Math.min(1, p.activeJob?.progress ?? 0))
        }))
        .filter((o) => o.left >= 0 && o.top >= 0 && o.left <= W),
      // Eating progress for mobs (foraging / hunting).
      ...mobs
        .filter((m) => (m.eatProgress ?? 0) > 0 && !isHiddenTile(m.x, m.y))
        .map((m) => ({
          id: m.id,
          left: (m.x - viewX + 0.5) * tW,
          top: (m.y - viewY) * tH - 6,
          progress: Math.max(0, Math.min(1, m.eatProgress ?? 0))
        }))
        .filter((o) => o.left >= 0 && o.top >= 0 && o.left <= W)
    ];
    // Round progress to 5% steps so small increments don't trigger re-renders.
    const progressKey = newProgress
      .map(
        (o) => `${o.id}:${Math.round(o.left)},${Math.round(o.top)},${Math.round(o.progress * 20)}`
      )
      .join('|');
    if (progressKey !== _progressOverlayKey) {
      _progressOverlayKey = progressKey;
      worldEffects.setProgressOverlays(newProgress);
    }

    // Lair particle effects: project the CACHED lair tiles (not a per-frame map scan) to screen,
    // keeping only the on-screen ones. O(#lairs) — a handful — regardless of zoom.
    const newParticles: { id: string; left: number; top: number; effect: string }[] = [];
    for (const lt of _lairTiles) {
      const left = (lt.x - viewX + 0.5) * tW;
      const top = (lt.y - viewY + 0.5) * tH; // tile CENTER — effects anchor + rise/fall around it
      if (left < 0 || top < 0 || left > W || top > H) continue;
      newParticles.push({ id: `${lt.x},${lt.y}`, left, top, effect: lt.effect });
    }
    const particleKey = newParticles
      .map((o) => `${o.id}:${Math.round(o.left)},${Math.round(o.top)}:${o.effect}`)
      .join('|');
    if (particleKey !== _particleOverlayKey) {
      _particleOverlayKey = particleKey;
      worldEffects.setParticleOverlays(newParticles);
    }

    // Health bars for damaged pawns and mobs.
    const newHealth = [
      ...pawns
        .filter(
          (p) =>
            p.position &&
            !isHiddenTile(p.position.x, p.position.y) &&
            p.isAlive !== false &&
            (p.state.health ?? 100) < 100
        )
        .map((p) => ({
          id: `hp-${p.id}`,
          left: (p.position!.x - viewX + 0.5) * tW,
          top: (p.position!.y - viewY) * tH - 10,
          health: Math.max(0, Math.min(1, (p.state.health ?? 100) / 100)),
          type: 'pawn' as const
        }))
        .filter((o) => o.left >= 0 && o.top >= 0 && o.left <= W),
      ...mobs
        .filter((m) => m.state !== 'Corpse' && m.health < m.maxHealth && !isHiddenTile(m.x, m.y))
        .map((m) => ({
          id: `hp-${m.id}`,
          left: (m.x - viewX + 0.5) * tW,
          top: (m.y - viewY) * tH - 10,
          health: Math.max(0, Math.min(1, m.maxHealth > 0 ? m.health / m.maxHealth : 1)),
          type: 'mob' as const
        }))
        .filter((o) => o.left >= 0 && o.top >= 0 && o.left <= W)
    ];
    const healthKey = newHealth
      .map((o) => `${o.id}:${Math.round(o.left)},${Math.round(o.top)},${Math.round(o.health * 20)}`)
      .join('|');
    if (healthKey !== _healthOverlayKey) {
      _healthOverlayKey = healthKey;
      worldEffects.setHealthOverlays(newHealth);
    }

    // Draft target lines for drafted pawns with move/attack orders.
    const newDraftTargets = pawns
      .filter((p) => p.position && p.drafted && p.draftTarget)
      .map((p) => {
        const target = p.draftTarget!;
        // Start the polyline at the pawn's INTERPOLATED render position, not its logical tile —
        // otherwise the first segment lags a tile behind the smoothly-sliding glyph and a stub of the
        // line trails visibly behind a moving pawn. `pawnRenderPos` (updated just above this frame)
        // tracks where the glyph actually is.
        const rp = pawnRenderPos.get(p.id) ?? p.position!;
        const points: Array<{ x: number; y: number }> = [
          { x: (rp.x - viewX + 0.5) * tW, y: (rp.y - viewY + 0.5) * tH }
        ];
        const path = p.path ?? [];
        const pathIdx = p.pathIndex ?? 0;
        for (let i = pathIdx; i < path.length; i++) {
          const tile = path[i];
          points.push({ x: (tile.x - viewX + 0.5) * tW, y: (tile.y - viewY + 0.5) * tH });
        }
        // For attack orders, append the live target position (path ends at adjacent tile).
        if (target.type === 'attack') {
          // Mobs carry x/y directly; pawns carry a position object. Resolve per target kind
          // so the union (Pawn | Mob) is narrowed before reading the coordinate.
          let tx = p.position!.x;
          let ty = p.position!.y;
          if (target.targetType === 'mob') {
            const m = mobs.find((mm) => mm.id === target.targetId);
            if (m) {
              tx = m.x;
              ty = m.y;
            }
          } else {
            const pp = pawns.find((q) => q.id === target.targetId);
            if (pp?.position) {
              tx = pp.position.x;
              ty = pp.position.y;
            }
          }
          points.push({ x: (tx - viewX + 0.5) * tW, y: (ty - viewY + 0.5) * tH });
        } else if (pathIdx >= path.length && 'x' in target) {
          // Tile-targeted order (move/haul/equip) with no remaining path yet — e.g. issued while the
          // game is PAUSED, before _processDraftOrders computes the route on a sim tick. Draw a straight
          // line to the destination so the order is visible immediately; the real path replaces it once
          // the sim advances. (NT-U4) rescue/tend target an entity (no tile), so they're skipped here.
          points.push({ x: (target.x - viewX + 0.5) * tW, y: (target.y - viewY + 0.5) * tH });
        }
        return { id: `draft-${p.id}`, points };
      })
      .filter((o) =>
        o.points.some((p) => p.x >= -tW && p.y >= -tH && p.x <= W + tW && p.y <= H + tH)
      );
    const draftKey = newDraftTargets
      .map(
        (o) => `${o.id}:${o.points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join('|')}`
      )
      .join(';');
    if (draftKey !== _draftOverlayKey) {
      _draftOverlayKey = draftKey;
      worldEffects.setDraftTargetOverlays(newDraftTargets);
    }

    // Floating combat text: age out expired events, convert the live tile coord of
    // each to a screen position (so labels track the camera as it pans/follows).
    const now = Date.now();
    const newFloats = combatTexts
      .filter((e) => now - e.spawnTime < FLOAT_TTL_MS)
      .map((e) => ({
        id: e.id,
        left: (e.worldX - viewX + 0.5) * tW,
        top: (e.worldY - viewY) * tH - 14 + (e.dy ?? 0),
        text: e.text,
        kind: e.kind,
        color: e.color
      }))
      .filter((o) => o.left >= -tW && o.top >= -tH && o.left <= W + tW && o.top <= H + tH);
    // Key on id + rounded position: the set changes whenever an event spawns,
    // expires, or the camera moves a label by ≥1px.
    const floatKey = newFloats
      .map((o) => `${o.id}:${Math.round(o.left)},${Math.round(o.top)}`)
      .join('|');
    if (floatKey !== _floatTextKey) {
      _floatTextKey = floatKey;
      worldEffects.setFloatingTextOverlays(newFloats);
    }

    // Ranged projectiles: lerp each in-flight shot shooter→target by elapsed/duration, convert the
    // interpolated world point to screen so it flies and tracks the camera. progress ≥1 = arrived
    // (the layer then shows an impact puff for the brief tail window).
    const newProjectiles = projectileList
      .map((e) => {
        const progress = (now - e.spawnTime) / e.durationMs;
        const tc = Math.min(1, progress);
        const wx = e.fromX + (e.toX - e.fromX) * tc;
        const wy = e.fromY + (e.toY - e.fromY) * tc;
        return {
          id: e.id,
          left: (wx - viewX + 0.5) * tW,
          top: (wy - viewY + 0.5) * tH,
          angle: (Math.atan2(e.toY - e.fromY, e.toX - e.fromX) * 180) / Math.PI,
          effect: e.effect,
          progress
        };
      })
      .filter((o) => o.left >= -tW && o.top >= -tH && o.left <= W + tW && o.top <= H + tH);
    const projKey = newProjectiles
      .map((o) => `${o.id}:${Math.round(o.left)},${Math.round(o.top)}:${o.progress >= 1 ? 1 : 0}`)
      .join('|');
    if (projKey !== _projOverlayKey) {
      _projOverlayKey = projKey;
      worldEffects.setProjectileOverlays(newProjectiles);
    }
  }

  /** Full-map scan for tiles carrying a resource with a `particleEffect` → cached in `_lairTiles`.
   *  Cheap despite scanning the whole map (most tiles skip on the `!resources` guard); run rarely
   *  (worldMap swap + a ~4s timer) so newly-grown / destroyed lairs are picked up without per-frame cost. */
  function rebuildLairTiles() {
    const out: { x: number; y: number; effect: string }[] = [];
    for (let y = 0; y < worldMap.length; y++) {
      const row = worldMap[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x++) {
        const res = row[x]?.resources;
        if (!res) continue;
        for (const rid in res) {
          if ((res[rid] ?? 0) <= 0) continue;
          const eff = resourceObjectService.getById(rid)?.particleEffect;
          if (eff) {
            out.push({ x, y, effect: eff });
            break;
          }
        }
      }
    }
    _lairTiles = out;
  }

  // Rebuilding the full base grid + bumping the terrain version is expensive at
  // zoom-out (tens of thousands of tiles). Mousemove-driven previews (zone paint,
  // selection drag, blueprint drag) can fire many times per frame, so coalesce
  // all redraw requests into a single rebuild per animation frame.
  function redrawOverlay() {
    if (typeof requestAnimationFrame === 'undefined') return; // SSR / no canvas
    if (!renderer?.isReady() || worldMap.length === 0) return;
    if (overlayRedrawScheduled) return;
    overlayRedrawScheduled = true;
    requestAnimationFrame(() => {
      overlayRedrawScheduled = false;
      redrawOverlayNow();
    });
  }

  /** ADR-026 per-building visual signature (the fields applyBuildingToGrid actually draws). */
  function _buildingSig(b: PlacedBuilding): string {
    return `${b.x},${b.y}:${b.type}:${b.status}:${b.deconstructQueued ? 1 : 0}:${b.paused ? 1 : 0}`;
  }

  /** Every "x,y" tile in the blueprint drag rectangle (anchor → current cursor). Empty if no drag. */
  function _blueprintRectTiles(): Set<string> {
    const s = new Set<string>();
    if (!blueprintDragActive || blueprintAnchorX < 0 || hoverTileX < 0 || hoverTileY < 0) return s;
    const x1 = Math.min(blueprintAnchorX, hoverTileX);
    const x2 = Math.max(blueprintAnchorX, hoverTileX);
    const y1 = Math.min(blueprintAnchorY, hoverTileY);
    const y2 = Math.max(blueprintAnchorY, hoverTileY);
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) s.add(`${x},${y}`);
    return s;
  }

  /** Current blueprint-preview cells (the drag rectangle, or the single hover tile), keyed "x,y". */
  function _currentBlueprintTiles(): Set<string> {
    const s = new Set<string>();
    if (!blueprintBuildingId) return s;
    if (blueprintDragActive) {
      return _blueprintRectTiles();
    } else if (hoverTileX >= 0 && hoverTileY >= 0) {
      s.add(`${hoverTileX},${hoverTileY}`);
    }
    return s;
  }

  /** Re-evaluate one tile's grove-glow emitter membership; returns true iff the emitter SET changed. */
  function _updateEmitterAt(y: number, x: number, tile: WorldTile): boolean {
    const key = y + ',' + x;
    const had = _emitterMap.has(key);
    const e = lightingService.emitterForTile(tile);
    const willHave = !!e && !isHiddenTile(x, y); // a buried grove must not bleed light through the fog
    if (willHave === had) {
      if (willHave) _emitterMap.set(key, e!); // refresh content; no structural change
      return false;
    }
    if (willHave) _emitterMap.set(key, e!);
    else _emitterMap.delete(key);
    return true;
  }

  /**
   * ADR-026: the ONLY full-map terrain build, called for the first build or a genuine new-map load
   * (worldMap ARRAY ref replaced). Delegates to the `terrainPaint.fullRebuildTerrain` seam — the single
   * module codegraph allows to call buildGameGrid + computeHiddenMaskState — then assigns the result to
   * component state and seeds every incremental baseline (mask state, building diff, blueprint, emitters).
   */
  function _fullRebuildTerrain(): void {
    const built = fullRebuildTerrain(worldMap, buildings, _buildingSig);
    _terrainGrid = built.terrainGrid;
    _maskState = built.maskState;
    hiddenMask = _maskState.mask;
    _terrainGridWorldMapRef = worldMap;
    _prevBuildingsById = built.buildingsById;
    _emitterMap = built.emitterMap;
    resourceGlowEmitters = built.emitters;
    clearRenderTileDeltas(); // a full repaint supersedes any pending per-tile coords
    refreshEmitters();

    // Blueprint preview (if a placement tool is active across the rebuild) sits on top.
    _prevBlueprintTiles = _currentBlueprintTiles();
    for (const k of _prevBlueprintTiles) {
      const ci = k.indexOf(',');
      _blueprintPreviewTile(_terrainGrid, +k.slice(0, ci), +k.slice(ci + 1));
    }
  }

  function redrawOverlayNow() {
    if (!renderer?.isReady() || worldMap.length === 0) return;
    markRenderDirty(); // terrain changed → force a draw even when frozen
    const W = worldMap[0]?.length ?? 0;

    // ADR-026: FULL rebuild ONLY on first build or a genuine new-map load (worldMap ARRAY ref replaced —
    // worldgen / size change / restore). Every routine change is incremental below.
    if (!_terrainGrid || !_maskState || worldMap !== _terrainGridWorldMapRef) {
      _fullRebuildTerrain();
      renderer.setGrid(_terrainGrid!);
      drawDesignations();
      return;
    }

    // ── Collect the cells to repaint this frame (never a whole-map scan) ──────────────────────────────
    const deltas = drainRenderTileDeltas() ?? []; // worldMap deltas (harvest / regrowth / mining)
    const dirty = new Set<number>();
    for (const c of deltas) dirty.add(c.y * W + c.x);

    // Buildings: diff vs the last-painted set; a placement/removal/deconstruct repaints just its cell.
    const curBuildings = new Map<string, { x: number; y: number; sig: string }>();
    for (const b of buildings) {
      if (b.status === 'complete') curBuildings.set(b.id, { x: b.x, y: b.y, sig: _buildingSig(b) });
    }
    for (const [id, prev] of _prevBuildingsById) {
      const c = curBuildings.get(id);
      if (!c || c.sig !== prev.sig) dirty.add(prev.y * W + prev.x); // removed/changed → clear old cell
    }
    for (const [id, c] of curBuildings) {
      const prev = _prevBuildingsById.get(id);
      if (!prev || prev.sig !== c.sig) dirty.add(c.y * W + c.x); // added/changed → repaint new cell
    }
    _prevBuildingsById = curBuildings;

    // Blueprint preview: repaint the cells it left AND the cells it now covers (clear old, draw new).
    const curBlueprint = _currentBlueprintTiles();
    for (const k of _prevBlueprintTiles) {
      const ci = k.indexOf(',');
      dirty.add(+k.slice(ci + 1) * W + +k.slice(0, ci));
    }
    for (const k of curBlueprint) {
      const ci = k.indexOf(',');
      dirty.add(+k.slice(ci + 1) * W + +k.slice(0, ci));
    }
    _prevBlueprintTiles = curBlueprint;

    // Hidden mask: update LOCALLY from the worldMap deltas (only flips on mining); a changed mask cell
    // changes the silhouette around the mined wall, so repaint those too.
    if (deltas.length) {
      const maskTouched = updateHiddenMaskAt(_maskState, worldMap, deltas as TileCoord[]);
      for (const c of maskTouched) dirty.add(c.y * W + c.x);
    }

    if (dirty.size === 0) {
      renderer.setGrid(_terrainGrid);
      drawDesignations();
      return;
    }

    // ── Repaint terrain for each affected cell, re-overlay any building/blueprint on it, track glows ──
    let emittersChanged = false;
    for (const key of dirty) {
      const x = key % W;
      const y = (key / W) | 0;
      const t = worldMap[y]?.[x];
      if (!t) continue;
      applyTileToGrid(_terrainGrid, t, hiddenMask);
      if (_updateEmitterAt(y, x, t)) emittersChanged = true;
    }
    // ROOFS LAST (same as buildGameGrid): a roof only shades the cell beneath, so paint it after the
    // terrain repaint AND any floor/building sharing the tile.
    for (const b of buildings) {
      if (b.status === 'complete' && !isRoofBuilding(b) && dirty.has(b.y * W + b.x))
        applyBuildingToGrid(_terrainGrid, b);
    }
    for (const b of buildings) {
      if (b.status === 'complete' && isRoofBuilding(b) && dirty.has(b.y * W + b.x))
        applyBuildingToGrid(_terrainGrid, b);
    }
    for (const k of curBlueprint) {
      const ci = k.indexOf(',');
      _blueprintPreviewTile(_terrainGrid, +k.slice(0, ci), +k.slice(ci + 1));
    }
    if (emittersChanged) {
      resourceGlowEmitters = [..._emitterMap.values()];
      refreshEmitters();
    }

    // GPU: invalidate ONLY the chunks holding a changed cell (ADR-026 §6) — not a global gridVersion bump.
    const dirtyTiles: TileCoord[] = [];
    for (const key of dirty) dirtyTiles.push({ x: key % W, y: (key / W) | 0 });
    renderer.setGrid(_terrainGrid, dirtyTiles);
    drawDesignations();
  }

  /**
   * Paint a set of "x,y" tiles as one region: a translucent fill plus an outline drawn ONLY on the
   * region's outer edge (a side gets a line only where the neighbour tile isn't in the set), so it
   * reads as a single zone instead of a grid of per-tile boxes. Shared by the standing-zone tints
   * and the resource MARK highlight so the two look identical. `fill`/`stroke` are CSS colour strings.
   */
  function paintTileRegion(
    ctx: CanvasRenderingContext2D,
    tiles: Set<string>,
    fill: string,
    stroke: string,
    // Tiles to OUTLINE as part of the region but NOT solid-fill — they belong to more than one zone
    // and are painted with a diagonal stripe split instead (see paintSplitTiles), so the colours
    // compose cleanly instead of stacking into a muddy double-fill. The outline still uses the full
    // set, so each zone keeps an unbroken border through the overlap.
    skipFill?: Set<string>
  ) {
    const W = container?.clientWidth ?? 0;
    const H = container?.clientHeight ?? 0;
    const colW = Math.ceil(W / tileWidth);
    const rowH = Math.ceil(H / tileHeight);
    const onScreen = (wx: number, wy: number) =>
      wx >= viewX - 1 && wy >= viewY - 1 && wx <= viewX + colW && wy <= viewY + rowH;
    ctx.save();
    ctx.fillStyle = fill;
    for (const key of tiles) {
      if (skipFill?.has(key)) continue;
      const ci = key.indexOf(',');
      const wx = +key.slice(0, ci);
      const wy = +key.slice(ci + 1);
      if (!onScreen(wx, wy)) continue;
      ctx.fillRect((wx - viewX) * tileWidth, (wy - viewY) * tileHeight, tileWidth, tileHeight);
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const key of tiles) {
      const ci = key.indexOf(',');
      const wx = +key.slice(0, ci);
      const wy = +key.slice(ci + 1);
      if (!onScreen(wx, wy)) continue;
      const sx = (wx - viewX) * tileWidth;
      const sy = (wy - viewY) * tileHeight;
      if (!tiles.has(`${wx - 1},${wy}`)) {
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, sy + tileHeight);
      }
      if (!tiles.has(`${wx + 1},${wy}`)) {
        ctx.moveTo(sx + tileWidth, sy);
        ctx.lineTo(sx + tileWidth, sy + tileHeight);
      }
      if (!tiles.has(`${wx},${wy - 1}`)) {
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + tileWidth, sy);
      }
      if (!tiles.has(`${wx},${wy + 1}`)) {
        ctx.moveTo(sx, sy + tileHeight);
        ctx.lineTo(sx + tileWidth, sy + tileHeight);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Paint tiles that belong to MULTIPLE overlapping zones as diagonal stripes cycling through each
   * zone's colour, clipped to the cell. This lets e.g. a stockpile + restriction zone share tiles and
   * read as BOTH at once, instead of the two translucent fills stacking into a muddy blend (or one
   * hiding the other). `tileColors` maps "x,y" → that tile's ordered list of zone fill colours.
   */
  function paintSplitTiles(ctx: CanvasRenderingContext2D, tileColors: Map<string, string[]>) {
    const W = container?.clientWidth ?? 0;
    const H = container?.clientHeight ?? 0;
    const colW = Math.ceil(W / tileWidth);
    const rowH = Math.ceil(H / tileHeight);
    const stripe = Math.max(5, tileWidth / 3); // diagonal stripe width in px
    for (const [key, colors] of tileColors) {
      const ci = key.indexOf(',');
      const wx = +key.slice(0, ci);
      const wy = +key.slice(ci + 1);
      if (wx < viewX - 1 || wy < viewY - 1 || wx > viewX + colW || wy > viewY + rowH) continue;
      const sx = (wx - viewX) * tileWidth;
      const sy = (wy - viewY) * tileHeight;
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, sy, tileWidth, tileHeight);
      ctx.clip();
      let i = 0;
      for (let o = -tileHeight; o < tileWidth; o += stripe) {
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.moveTo(sx + o, sy);
        ctx.lineTo(sx + o + stripe, sy);
        ctx.lineTo(sx + o + stripe - tileHeight, sy + tileHeight);
        ctx.lineTo(sx + o - tileHeight, sy + tileHeight);
        ctx.closePath();
        ctx.fill();
        i++;
      }
      ctx.restore();
    }
  }

  function drawDesignations() {
    if (!designCanvas || !container || !worldMap.length) return;
    markRenderDirty(); // selection / designation / drag preview changed → force a draw even when frozen
    const W = container.clientWidth;
    const H = container.clientHeight;
    // Back the 2D overlay with the *device* pixel grid (not CSS px). Without this the canvas is
    // rendered at half-resolution on HiDPI screens and nearest-neighbour upscaled, which turns
    // small text (the item-count badges) to mush. All drawing below stays in CSS-pixel coords via
    // the dpr transform, so nothing else needs to change.
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(W * dpr);
    const bh = Math.round(H * dpr);
    if (designCanvas.width !== bw || designCanvas.height !== bh) {
      designCanvas.width = bw;
      designCanvas.height = bh;
    }
    const ctx = designCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Standing-zone tints (stockpile / drink / wash). Painted here on the 2D overlay — bottom-most so
    // designation icons, previews and selection draw over them — instead of being baked into the WebGL
    // terrain grid. That's the fix for the commit hitch: drawing or toggling a zone now repaints just
    // this cheap overlay, so the tint appears immediately with no full terrain rebuild. Only on-screen
    // tiles are filled, and a tile whose zone instance has its colour hidden is skipped.
    {
      // Group every zone tile by its tint colour. Stockpile lives in zoneTiles (per-tile arrays);
      // drink/wash are water-only markers in `designations` (NOT zoneTiles — see DesignationService).
      // Other designation types (harvest/mine/…) have no ZONE_TINT_COLORS entry and are skipped here —
      // they get icons below instead. Tiles whose zone instance has its colour hidden are excluded.
      const byColor = new Map<string, Set<string>>();
      // Every zone colour stacked on a tile, in encounter order — drives the overlap stripe split so a
      // tile in two+ zones (e.g. stockpile + restrict) shows BOTH instead of competing / hiding one.
      const tileColors = new Map<string, string[]>();
      const add = (key: string, color: string) => {
        const inst = designationZoneId[key];
        // A zone whose colour is hidden is skipped — UNLESS a drawing tool is active, in which case
        // EVERY zone is shown so you can lay one out around the others; it re-hides when you exit the
        // tool (this redraws on the designation-mode toggle). No persisted flag is touched.
        if (!designationMode && inst && hiddenZoneInstances.has(inst)) return;
        let set = byColor.get(color);
        if (!set) byColor.set(color, (set = new Set()));
        set.add(key);
        const list = tileColors.get(key);
        if (!list) tileColors.set(key, [color]);
        else if (!list.includes(color)) list.push(color);
      };
      // Collect EVERY tinted zone type on a tile (no early break) so overlaps are detected.
      for (const key in zoneTiles) {
        for (const t of zoneTiles[key]) {
          const c = ZONE_TINT_COLORS[t];
          if (c) add(key, c);
        }
      }
      for (const key in designations) {
        const c = ZONE_TINT_COLORS[designations[key]];
        if (c) add(key, c);
      }

      // Tiles shared by 2+ zones: solid-filled as diagonal stripes (below) rather than stacked fills.
      const overlap = new Set<string>();
      for (const [key, colors] of tileColors) if (colors.length > 1) overlap.add(key);

      // Each zone colour → translucent fill + outer-edge outline (interior shared edges get no line, so
      // a multi-tile zone reads as one region). Overlap tiles are outlined (border stays unbroken) but
      // not solid-filled here; the stripe pass fills them so both colours compose cleanly.
      for (const [color, set] of byColor) {
        paintTileRegion(ctx, set, color, color.replace(/[\d.]+\)$/, '0.95)'), overlap);
      }
      if (overlap.size > 0) {
        const overlapColors = new Map<string, string[]>();
        for (const key of overlap) overlapColors.set(key, tileColors.get(key)!);
        paintSplitTiles(ctx, overlapColors);
      }
    }

    // Work designations (harvest / woodcut / forage / mine / dig) get NO tile tint or zone overlay —
    // each marked tile already shows a work-type icon (drawn below). Only standing zones (stockpile /
    // drink / wash, above) and the live drag preview are tinted.

    // Live zone drag-paint preview. Drawn here on the lightweight 2D overlay
    // (rather than tinting the WebGL grid) so the heavy terrain vertex buffer
    // isn't rebuilt on every mouse move while painting a harvest/work zone.
    if (zoneDragActive && designationMode) {
      const minX = Math.min(zoneAnchorX, zoneEndX);
      const maxX = Math.max(zoneAnchorX, zoneEndX);
      const minY = Math.min(zoneAnchorY, zoneEndY);
      const maxY = Math.max(zoneAnchorY, zoneEndY);
      // Drink/wash zones only commit on water — preview just those tiles, not the whole rect.
      const waterOnly = designationTypeActive === 'drink' || designationTypeActive === 'wash';
      ctx.save();
      if (waterOnly && !zoneEraseMode) {
        ctx.fillStyle = 'rgba(80, 200, 255, 0.30)';
        for (let ry = Math.max(minY, viewY); ry <= maxY; ry++) {
          for (let rx = Math.max(minX, viewX); rx <= maxX; rx++) {
            const t = worldMap[ry]?.[rx];
            if (
              !t ||
              !(t.type === 'water' || t.terrainType === 'river' || t.terrainType === 'lake')
            )
              continue;
            ctx.fillRect(
              (rx - viewX) * tileWidth,
              (ry - viewY) * tileHeight,
              tileWidth,
              tileHeight
            );
          }
        }
        ctx.strokeStyle = 'rgba(120, 220, 255, 0.85)';
        ctx.lineWidth = 1;
      } else {
        const sx = (minX - viewX) * tileWidth;
        const sy = (minY - viewY) * tileHeight;
        const rw = (maxX - minX + 1) * tileWidth;
        const rh = (maxY - minY + 1) * tileHeight;
        ctx.fillStyle = zoneEraseMode ? 'rgba(255, 60, 30, 0.30)' : 'rgba(120, 255, 120, 0.26)';
        ctx.fillRect(sx, sy, rw, rh);
        ctx.strokeStyle = zoneEraseMode ? 'rgba(255, 90, 60, 0.95)' : 'rgba(160, 255, 160, 0.95)';
        ctx.lineWidth = 1;
      }
      const sx = (minX - viewX) * tileWidth;
      const sy = (minY - viewY) * tileHeight;
      const rw = (maxX - minX + 1) * tileWidth;
      const rh = (maxY - minY + 1) * tileHeight;
      ctx.strokeRect(sx + 0.5, sy + 0.5, rw - 1, rh - 1);
      ctx.restore();
    }

    // Live "select similar resource" drag preview — a green zone (matching the standing-zone
    // aesthetic). Matching tiles glow a brighter green; the rest stay a faint green so the drag area
    // reads as one zone instead of a black blackout. Drawn on the 2D overlay so dragging across many
    // tiles never rebuilds the WebGL terrain buffer.
    if (similarDragActive) {
      const minX = Math.min(similarAnchorX, similarEndX);
      const maxX = Math.max(similarAnchorX, similarEndX);
      const minY = Math.min(similarAnchorY, similarEndY);
      const maxY = Math.max(similarAnchorY, similarEndY);
      // Only iterate tiles that are actually on screen.
      const vx0 = Math.max(minX, viewX);
      const vy0 = Math.max(minY, viewY);
      const vx1 = Math.min(maxX, viewX + Math.ceil(W / tileWidth));
      const vy1 = Math.min(maxY, viewY + Math.ceil(H / tileHeight));
      ctx.save();
      for (let ry = vy0; ry <= vy1; ry++) {
        for (let rx = vx0; rx <= vx1; rx++) {
          const sx2 = (rx - viewX) * tileWidth;
          const sy2 = (ry - viewY) * tileHeight;
          const match = (worldMap[ry]?.[rx]?.resources?.[similarDragResourceId] ?? 0) > 0;
          ctx.fillStyle = match ? 'rgba(76, 204, 68, 0.42)' : 'rgba(76, 204, 68, 0.14)';
          ctx.fillRect(sx2, sy2, tileWidth, tileHeight);
        }
      }
      // Lighter-green outline around the drag rect, matching the standing-zone aesthetic.
      const ox = (minX - viewX) * tileWidth;
      const oy = (minY - viewY) * tileHeight;
      const ow = (maxX - minX + 1) * tileWidth;
      const oh = (maxY - minY + 1) * tileHeight;
      ctx.strokeStyle = 'rgba(160, 255, 160, 0.95)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + 0.5, oy + 0.5, ow - 1, oh - 1);
      ctx.restore();
    }

    // Resource MARK highlight (the tiles a "select similar" produced) — painted as a single region
    // with the same translucent-fill + outer-edge-outline look as the standing zones, so a marked
    // resource patch reads as one zone instead of a grid of yellow boxes.
    if (highlightedResourceTiles.size > 0) {
      paintTileRegion(
        ctx,
        highlightedResourceTiles,
        'rgba(240, 208, 32, 0.22)',
        'rgba(240, 208, 32, 0.95)'
      );
    }

    // Selected resource tile (single-click): a yellow box around the tile. Drawn here on the 2D
    // overlay rather than recolouring the WebGL glyph so a tile click never rebuilds the terrain
    // buffer (the dominant cause of click/info-panel lag on big maps).
    if (selectedResourceTile) {
      const sx = (selectedResourceTile.x - viewX) * tileWidth;
      const sy = (selectedResourceTile.y - viewY) * tileHeight;
      ctx.save();
      ctx.fillStyle = 'rgba(255, 220, 40, 0.22)';
      ctx.fillRect(sx, sy, tileWidth, tileHeight);
      ctx.strokeStyle = 'rgba(255, 220, 40, 0.95)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, tileWidth - 1, tileHeight - 1);
      ctx.restore();
    }

    // Shift+drag mark preview (universal). For a RESOURCE drag, tiles holding a selected type glow
    // bright amber (you see what the release will designate); for a PAWN/MOB drag it's a plain amber
    // box. 2D overlay only — no WebGL terrain rebuild while dragging.
    if (selDragActive) {
      const minX = Math.min(selAnchorX, selEndX);
      const minY = Math.min(selAnchorY, selEndY);
      const maxX = Math.max(selAnchorX, selEndX);
      const maxY = Math.max(selAnchorY, selEndY);
      const sx = (minX - viewX) * tileWidth;
      const sy = (minY - viewY) * tileHeight;
      const rw = (maxX - minX + 1) * tileWidth;
      const rh = (maxY - minY + 1) * tileHeight;
      ctx.save();
      if (dragMarkKind() === 'resource') {
        const types =
          selectedResourceTypes.size > 0
            ? selectedResourceTypes
            : selectedResourceTile
              ? new Set([selectedResourceTile.resourceId])
              : new Set<string>();
        const vx0 = Math.max(minX, viewX);
        const vy0 = Math.max(minY, viewY);
        const vx1 = Math.min(maxX, viewX + Math.ceil(W / tileWidth));
        const vy1 = Math.min(maxY, viewY + Math.ceil(H / tileHeight));
        for (let ry = vy0; ry <= vy1; ry++) {
          for (let rx = vx0; rx <= vx1; rx++) {
            if (isHiddenTile(rx, ry)) continue;
            const res = worldMap[ry]?.[rx]?.resources;
            let match = false;
            if (res)
              for (const t of types)
                if ((res[t] ?? 0) > 0) {
                  match = true;
                  break;
                }
            ctx.fillStyle = match ? 'rgba(240, 208, 32, 0.42)' : 'rgba(240, 208, 32, 0.10)';
            ctx.fillRect(
              (rx - viewX) * tileWidth,
              (ry - viewY) * tileHeight,
              tileWidth,
              tileHeight
            );
          }
        }
      } else {
        ctx.fillStyle = 'rgba(255, 200, 90, 0.18)';
        ctx.fillRect(sx, sy, rw, rh);
      }
      ctx.strokeStyle = 'rgba(255, 220, 120, 0.95)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, rw - 1, rh - 1);
      ctx.restore();
    }

    // MARK highlight drag preview — an amber box; entities inside get highlighted on release.
    if (markDragActive) {
      const minX = Math.min(markAnchorX, markEndX);
      const minY = Math.min(markAnchorY, markEndY);
      const maxX = Math.max(markAnchorX, markEndX);
      const maxY = Math.max(markAnchorY, markEndY);
      const sx = (minX - viewX) * tileWidth;
      const sy = (minY - viewY) * tileHeight;
      const rw = (maxX - minX + 1) * tileWidth;
      const rh = (maxY - minY + 1) * tileHeight;
      ctx.save();
      ctx.fillStyle = 'rgba(255, 200, 90, 0.22)';
      ctx.fillRect(sx, sy, rw, rh);
      ctx.strokeStyle = 'rgba(255, 210, 110, 0.95)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, rw - 1, rh - 1);
      ctx.restore();
    }

    // Drafted-pawn MOVE aim preview (Achtung-style): the anchor→cursor line plus an amber dot at each
    // computed destination slot. Drawn here on the cheap 2D overlay (NOT the WebGL grid) so dragging a
    // line never rebuilds the terrain buffer — that rebuild was the jank. Slots are recomputed only on
    // mousemove (moveAimSlots), not per frame.
    if (moveAimActive) {
      const ax = (moveAimAnchorX - viewX + 0.5) * tileWidth;
      const ay = (moveAimAnchorY - viewY + 0.5) * tileHeight;
      const bx = (moveAimEndX - viewX + 0.5) * tileWidth;
      const by = (moveAimEndY - viewY + 0.5) * tileHeight;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 200, 90, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      const r = Math.max(2, tileWidth * 0.22);
      for (const s of moveAimSlots) {
        const dx = (s.x - viewX + 0.5) * tileWidth;
        const dy = (s.y - viewY + 0.5) * tileHeight;
        ctx.beginPath();
        ctx.arc(dx, dy, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 200, 90, 0.35)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 220, 120, 0.95)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    // (The committed MARK highlight is NOT drawn here: it rides the entity glyph grid's selection
    // colour in updatePawnOverlay() so it follows the moving entity, rather than a static tile ring
    // that would stay behind once the pawn walks off.)

    // Item stack counts: a subtle count badge in each item tile's bottom-right corner, drawn only
    // when zoomed in close enough to be legible (and only for piles of 2+) so loose/stockpiled
    // goods read as item stacks rather than buildings. Aggregated per tile, so a mixed pile shows
    // one total. Lives on this 2D world overlay because the WebGL glyph grid is one char per cell
    // and can't carry a second mark.
    const STACK_BADGE_MIN_TILE = 16;
    const STACK_BADGE_FONT_PX = 5; // fixed CSS px, independent of tile/zoom — tweak to taste
    if (tileWidth >= STACK_BADGE_MIN_TILE && droppedItems.length > 0) {
      const tileTotals = new Map<string, number>();
      for (const d of droppedItems) {
        const k = `${d.x},${d.y}`;
        tileTotals.set(k, (tileTotals.get(k) ?? 0) + (d.quantity ?? 1));
      }
      ctx.save();
      ctx.font = `bold ${STACK_BADGE_FONT_PX}px monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#ffffff';
      for (const [k, total] of tileTotals) {
        if (total < 2) continue;
        const [wx, wy] = k.split(',').map(Number);
        const sx = (wx - viewX) * tileWidth;
        const sy = (wy - viewY) * tileHeight;
        if (sx < -tileWidth || sy < -tileHeight || sx > W + tileWidth || sy > H + tileHeight)
          continue;
        const label = total > 999 ? '999+' : String(total);
        ctx.fillText(label, sx + tileWidth - 1, sy + tileHeight - 1);
      }
      ctx.restore();
    }

    // Blueprint pass: planned / under-construction buildings as semi-transparent ghosts of their
    // own sprite — white before work begins, amber once the build meter is above 0. Drawn here on
    // the 2D overlay (real alpha) rather than the opaque glyph grid, so terrain shows through;
    // completed buildings are the opaque ones on the WebGL grid (buildGameGrid).
    if (buildings.length > 0) {
      const tintCanvas = document.createElement('canvas');
      tintCanvas.width = SHEET_CELL_W;
      tintCanvas.height = SHEET_CELL_H;
      const tctx = tintCanvas.getContext('2d');
      if (tctx) {
        tctx.imageSmoothingEnabled = false;
        ctx.imageSmoothingEnabled = false;
        for (const b of buildings) {
          if (b.status === 'complete') continue;
          const span = buildingService.getBuildingById(b.type)?.charSpans?.[0];
          const id = span?.id ?? span?.from;
          if (!span?.sheet || id == null) continue;
          const sheet = getSheet(span.sheet as SheetName);
          if (!sheet) {
            loadSheet(span.sheet as SheetName); // re-runs drawDesignations via onSheetLoaded
            continue;
          }
          const dx = (b.x - viewX) * tileWidth;
          const dy = (b.y - viewY) * tileHeight;
          if (dx < -tileWidth || dy < -tileHeight || dx > W + tileWidth || dy > H + tileHeight)
            continue;
          // Tint the cell on the tint canvas, preserving its pattern. The bitlands sprite is a
          // white body + black line-work on transparent. `multiply` maps white→tint and black→black
          // (so the line-work survives instead of flattening like source-atop did), then
          // `destination-in` re-masks to the sprite's own alpha so transparent stays transparent.
          // Mirrors the world-tile shader so a blueprint reads as its real tile, not a flat block.
          const srcX = (id % 16) * SHEET_CELL_W;
          const srcY = Math.floor(id / 16) * SHEET_CELL_H;
          tctx.clearRect(0, 0, SHEET_CELL_W, SHEET_CELL_H);
          tctx.globalCompositeOperation = 'source-over';
          tctx.drawImage(
            sheet,
            srcX,
            srcY,
            SHEET_CELL_W,
            SHEET_CELL_H,
            0,
            0,
            SHEET_CELL_W,
            SHEET_CELL_H
          );
          const started = (b.workDone ?? 0) > 0 || (b.progress ?? 0) > 0;
          tctx.globalCompositeOperation = 'multiply';
          tctx.fillStyle = started ? '#ffd23a' : '#ffffff';
          tctx.fillRect(0, 0, SHEET_CELL_W, SHEET_CELL_H);
          tctx.globalCompositeOperation = 'destination-in';
          tctx.drawImage(
            sheet,
            srcX,
            srcY,
            SHEET_CELL_W,
            SHEET_CELL_H,
            0,
            0,
            SHEET_CELL_W,
            SHEET_CELL_H
          );
          tctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = b.paused ? 0.25 : 0.5;
          ctx.drawImage(tintCanvas, dx, dy, tileWidth, tileHeight);
        }
        ctx.globalAlpha = 1;
      }
    }

    if (!designations || Object.keys(designations).length === 0) return;

    // Lazy-load sprite sheets on first designation draw (shared cache → gameCanvas/spriteSheets).
    const tilesSheet = getSheet('tiles');
    if (!tilesSheet) {
      loadSheet('tiles');
      return;
    }
    const itemsSheet = getSheet('items');
    if (!itemsSheet) {
      loadSheet('items');
      return;
    }

    const SPRITE_W = SHEET_CELL_W,
      SPRITE_H = SHEET_CELL_H;
    // Icon drawn smaller than the tile, centred within the cell.
    const ICON_SCALE = 0.7;
    const iconW = tileWidth * ICON_SCALE;
    const iconH = tileHeight * ICON_SCALE;
    const padX = (tileWidth - iconW) / 2;
    const padY = (tileHeight - iconH) / 2;
    ctx.save();
    ctx.globalAlpha = 0.75;

    for (const [key, dtype] of Object.entries(designations)) {
      if (dtype === 'stockpile') continue;
      const [wx, wy] = key.split(',').map(Number);
      const sx = (wx - viewX) * tileWidth;
      const sy = (wy - viewY) * tileHeight;
      if (sx < -tileWidth || sy < -tileHeight || sx > W + tileWidth || sy > H + tileHeight)
        continue;

      let sheet: HTMLCanvasElement;
      let spriteId: number;

      if (dtype === 'mine') {
        sheet = itemsSheet;
        spriteId = 207;
      } else if (dtype === 'woodcut') {
        sheet = tilesSheet;
        spriteId = 246;
      } else if (dtype === 'forage') {
        sheet = tilesSheet;
        spriteId = 241;
      } else if (dtype === 'dig') {
        sheet = itemsSheet;
        spriteId = 207; // §F dig — shovel marker
      } else if (dtype === 'harvest') {
        const tile = worldMap[wy]?.[wx];
        const resourceId = tile?.resources
          ? Object.keys(tile.resources).find((id) => (tile.resources![id] ?? 0) > 0)
          : undefined;
        const resDef = resourceId ? resourceObjectService.getById(resourceId) : undefined;
        if (resDef?.interaction.workCategory === 'mining') {
          sheet = itemsSheet;
          spriteId = 207;
        } else {
          sheet = tilesSheet;
          spriteId = 241;
        }
      } else {
        continue;
      }

      const col = spriteId % 16;
      const row = Math.floor(spriteId / 16);
      ctx.drawImage(
        sheet,
        col * SPRITE_W,
        row * SPRITE_H,
        SPRITE_W,
        SPRITE_H,
        sx + padX,
        sy + padY,
        iconW,
        iconH
      );
    }

    // Apply the day/night ambient to the icons only (source-atop paints solely
    // over already-drawn sprite pixels), so they sit beneath the light/dark
    // filter instead of glowing white at night.
    const darken = Math.max(0, 1 - _ambientLight);
    if (darken > 0.001) {
      ctx.globalCompositeOperation = 'source-atop';
      const tr = Math.round(_ambientTint[0] * 255);
      const tg = Math.round(_ambientTint[1] * 255);
      const tb = Math.round(_ambientTint[2] * 255);
      // Tint toward the ambient colour, then darken with black, both scaled by night depth.
      ctx.globalAlpha = darken * 0.5;
      ctx.fillStyle = `rgb(${tr}, ${tg}, ${tb})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = darken * 0.8;
      ctx.fillStyle = 'rgb(0, 0, 0)';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function _blueprintPreviewTile(grid: GameGrid, tx: number, ty: number) {
    if (tx < 0 || ty < 0 || ty >= worldMap.length || tx >= (worldMap[0]?.length ?? 0)) return;
    // Can't build on a blocked tile (mountain/cliff wall, water, existing solid building) — show no
    // placement ghost there, matching the BuildingService.placeBuilding guard that rejects it.
    if (worldMap[ty]?.[tx]?.walkable === false) return;
    const building = buildingService.getBuildingById(blueprintBuildingId!);
    if (!building) return;
    const charSpans = building.charSpans;
    const char = charSpans
      ? (resolveCharSpans(charSpans as Parameters<typeof resolveCharSpans>[0])[0] ?? '#')
      : '#';
    const tile = grid.getTile(tx, ty);
    grid.setTile(tx, ty, {
      char,
      foreground: { r: 1.0, g: 1.0, b: 1.0 },
      background: tile?.background ?? { r: 0, g: 0, b: 0 },
      position: { x: tx, y: ty }
    });
  }

  // One selectable layer stacked on a tile.
  type TileLayer =
    | { kind: 'pawn'; id: string }
    | { kind: 'mob'; id: string }
    | { kind: 'building'; id: string }
    | { kind: 'zone'; id: string }
    | { kind: 'item'; id: string }
    | { kind: 'resource'; resourceId: string };

  // Commit a single layer as THE selection — mutually exclusive (one selected thing at a time). This
  // centralizes the per-kind reset that used to be duplicated across selectTileAt's branches + the tab
  // sync, so every selection path (click, click-cycle, camera jump, tab pick) clears the others the
  // same way and the click-locked item state can't be orphaned.
  function applyTileLayer(layer: TileLayer, x: number, y: number): void {
    selectedPawnId = null;
    selectedMobId = null;
    selectedBuildingId = null;
    selectedZoneId = null;
    selectedResourceTile = null;
    selectedItemId = null;
    highlightedResourceTiles = new Set();
    selectedResourceTypes = new Set();
    showShelterAssign = false;
    uiState.selectPawn(null);
    uiState.selectMob(null);
    switch (layer.kind) {
      case 'pawn':
        selectedPawnId = layer.id;
        uiState.selectPawn(layer.id);
        break;
      case 'mob':
        selectedMobId = layer.id;
        uiState.selectMob(layer.id);
        break;
      case 'building':
        selectedBuildingId = layer.id;
        break;
      case 'zone':
        selectedZoneId = layer.id;
        break;
      case 'item':
        selectedItemId = layer.id;
        break;
      case 'resource':
        selectedResourceTile = { x, y, resourceId: layer.resourceId };
        // Seed the mark type-set with this resource, so a following Shift+drag marks all of its kind.
        selectedResourceTypes = new Set([layer.resourceId]);
        break;
    }
  }

  // Every selectable layer stacked on a tile, in cycle order: pawn → mob → building → item(s) →
  // resource(s). handleTileClick steps through this on repeated clicks of the same tile; the first
  // entry is what a single click picks. Fog-hidden tiles expose nothing (no buried item/resource leak).
  function tileLayers(x: number, y: number): TileLayer[] {
    const layers: TileLayer[] = [];
    const pawn = findPawnAtTile(x, y);
    if (pawn) layers.push({ kind: 'pawn', id: pawn.id });
    const mob = findMobAtTile(x, y);
    if (mob) layers.push({ kind: 'mob', id: mob.id });
    const building = buildings.find((b) => b.x === x && b.y === y);
    if (building) layers.push({ kind: 'building', id: building.id });
    // Stockpile zone on this tile. `zoneTiles` is the canonical membership map (same source the hover
    // inspector uses); the owning instance id comes from `designationZoneId`, falling back to any
    // stockpile instance so a tile painted before instances existed still opens the panel.
    const key = `${x},${y}`;
    if (zoneTiles[key]?.includes('stockpile')) {
      const zoneId =
        designationZoneId[key] ?? zoneInstances.find((z) => z.type === 'stockpile')?.id;
      if (zoneId) layers.push({ kind: 'zone', id: zoneId });
    }
    if (!isHiddenTile(x, y)) {
      for (const it of droppedItems) {
        if (it.x === x && it.y === y) layers.push({ kind: 'item', id: it.id });
      }
      const tileData = worldMap[y]?.[x];
      const seenRes = new Set<string>();
      for (const [resourceId, v] of Object.entries(tileData?.resources ?? {})) {
        if (v > 0) {
          layers.push({ kind: 'resource', resourceId });
          seenRes.add(resourceId);
        }
      }
      // §F gradual regrow: a depleted-but-regrowing wild plant (count 0) is still SELECTABLE once it's
      // visible (growth ≥ threshold) so you can inspect it — it just isn't harvestable yet (the card
      // omits the HARVEST verb). Below the threshold it reads as bare soil and isn't pickable.
      for (const [resourceId, g] of Object.entries(tileData?.growth ?? {})) {
        if (!seenRes.has(resourceId) && g >= RESOURCE_VISIBLE_GROWTH)
          layers.push({ kind: 'resource', resourceId });
      }
    }
    return layers;
  }

  // Pick whatever is on (x,y) and select it — building > pawn > mob > resource, in that priority.
  // Shared by camera jumps (focusMapOn from the EXPLORE/PAWN/ENTITY tabs) so a jumped-to tile gets the
  // *same* selection + highlight + info HUD as a click. Manual clicks use handleTileClick's CYCLE path
  // instead (so a stacked tile steps through its layers). Returns true if something was selected; false
  // if the tile is empty (the caller decides what an empty tile means — deselect, or a drafted move).
  function selectTileAt(x: number, y: number): boolean {
    const clickedBuilding = buildings.find((b) => b.x === x && b.y === y);
    if (clickedBuilding) {
      applyTileLayer({ kind: 'building', id: clickedBuilding.id }, x, y);
      return true;
    }

    const clickedPawn = findPawnAtTile(x, y);
    if (clickedPawn) {
      applyTileLayer({ kind: 'pawn', id: clickedPawn.id }, x, y);
      return true;
    }

    const clickedMob = findMobAtTile(x, y);
    if (clickedMob) {
      applyTileLayer({ kind: 'mob', id: clickedMob.id }, x, y);
      return true;
    }

    const tileData = worldMap[y]?.[x];
    // Fog-hidden tiles (buried mountain interior) expose nothing selectable — an explore-tab jump to a
    // resource under the silhouette must not pin a highlight that gives away its exact buried location.
    if (!isHiddenTile(x, y)) {
      const active = Object.entries(tileData?.resources ?? {}).find(([, v]) => v > 0);
      // Fall back to a depleted-but-regrowing wild plant (count 0, growth ≥ threshold) so it stays
      // inspectable while it grows back — mirrors tileLayers().
      const standing = active
        ? undefined
        : Object.entries(tileData?.growth ?? {}).find(([, g]) => g >= RESOURCE_VISIBLE_GROWTH);
      const pick = active ?? standing;
      if (pick) {
        applyTileLayer({ kind: 'resource', resourceId: pick[0] }, x, y);
        return true;
      }
    }

    return false;
  }

  async function handleTileClick() {
    if (hoverTileX < 0 || hoverTileY < 0) return;

    // Debug click-brush (DEBUG tab): apply the armed brush at this tile and stop (stays armed for
    // repeated clicks; deactivate from the debug menu). Takes priority over normal selection.
    if (debugBrush) {
      if (debugBrush.kind === 'regrow') {
        gameState.command({
          type: 'devRegrowTileAt',
          payload: { x: hoverTileX, y: hoverTileY },
          save: true
        });
      } else if (debugBrush.kind === 'building' && debugBrush.id) {
        gameState.command({
          type: 'devSpawnBuildingAt',
          payload: { buildingId: debugBrush.id, x: hoverTileX, y: hoverTileY },
          save: true
        });
      } else if (debugBrush.kind === 'resource' && debugBrush.id) {
        gameState.command({
          type: 'devSpawnResourceAt',
          payload: { resourceId: debugBrush.id, x: hoverTileX, y: hoverTileY },
          save: true
        });
      }
      redrawOverlay();
      return;
    }

    // Designation mode: handled by drag — single-click still affects one tile. In erase mode (the
    // CLEAR tool) a single click removes that tile instead of painting it.
    if (designationMode) {
      if (zoneEraseMode) {
        gameState.command({
          type: 'clearRect',
          payload: { x1: hoverTileX, y1: hoverTileY, x2: hoverTileX, y2: hoverTileY },
          save: true
        });
      } else {
        gameState.command({
          type: 'designate',
          payload: {
            x: hoverTileX,
            y: hoverTileY,
            type: designationTypeActive,
            instanceId: activeZoneInstanceId ?? undefined
          },
          save: true
        });
      }
      // Designations + zone tints are 2D-overlay layers now — repaint just that, no terrain rebuild.
      drawDesignations();
      return;
    }

    // A plain left-click is a fresh selection focus, so drop any group MARK highlight (created via the
    // MARK box-drag tool) — its summary card otherwise stays pinned over the single entity you clicked.
    if (markedKind) {
      markedKind = null;
      markedIds = [];
      markedSet = new Set();
      moveAimArmed = false;
    }

    // Click-to-cycle: a tile can stack several selectable layers (pawn / mob / building / item(s) /
    // resource(s)). The FIRST click on a tile selects the top layer; each repeat click on the SAME
    // tile steps to the next layer (wrapping around), so you can reach the item or resource under a
    // pawn without moving it. A click on a different tile restarts the cycle at its top layer.
    const layers = tileLayers(hoverTileX, hoverTileY);
    if (layers.length > 0) {
      if (hoverTileX === _cycleTileX && hoverTileY === _cycleTileY) {
        _cycleIndex = (_cycleIndex + 1) % layers.length;
      } else {
        _cycleTileX = hoverTileX;
        _cycleTileY = hoverTileY;
        _cycleIndex = 0;
      }
      applyTileLayer(layers[_cycleIndex], hoverTileX, hoverTileY);
      drawDesignations();
      return;
    }

    // Click on empty tile → deselect all + reset the cycle. Drafted-pawn move orders are right-click
    // only (see handleContextMenu's draft branch).
    _cycleTileX = -1;
    _cycleTileY = -1;
    _cycleIndex = 0;
    selectedBuildingId = null;
    selectedZoneId = null;
    selectedResourceTile = null;
    selectedItemId = null;
    selectedMobId = null;
    highlightedResourceTiles = new Set();
    uiState.selectMob(null);

    selectedPawnId = null;
    uiState.selectPawn(null);
    drawDesignations();
  }

  onMount(async () => {
    // A freshly-loaded sprite sheet must repaint both consumers: the HUD icons and the
    // designation overlay (mirrors the old _loadSpriteSheet onload).
    onSheetLoaded(() => {
      redrawHudSpriteIcons();
      drawDesignations();
    });
    if (browser) await init();
  });

  // A full world replace (worldGenRev bump from regen / size change / restore) forces an immediate,
  // throttle-bypassing terrain rebuild so the new map paints THIS frame — kept hidden behind the
  // Custom Map GENERATING overlay. Skip the first (subscribe-time) emission: init() already draws the
  // initial map via its own buildGameGrid.
  let _worldGenSeen = false;
  const unsubWorldGen = worldGenRev.subscribe(() => {
    if (!_worldGenSeen) {
      _worldGenSeen = true;
      return;
    }
    _forceTerrainRebuild = true;
    _terrainDirty = true;
    markRenderDirty();
  });

  onDestroy(() => {
    unsubState();
    unsubUI();
    unsubWorldGen();
    unsubCombatFeedback();
    unsubAttackLunges();
    unsubProjectiles();
    _unsubMenuPerf();
    // The menu backdrop is not the real renderer boot — leave the boot-reveal flag untouched, but
    // re-arm its own fade-in (a remount must repaint before being revealed again).
    if (menuPreview) menuPreviewRendered.set(false);
    else rendererReady.set(false); // a remount must re-init WebGL before the game shows
    if (browser) {
      cancelAnimationFrame(animationId);
      renderer?.dispose();
    }
  });

  async function init() {
    try {
      canvas.width = container.clientWidth || 800;
      canvas.height = container.clientHeight || 600;

      fitTileSize = computeFitTileSize(canvas.width, canvas.height);
      tileWidth = tileHeight = fitTileSize;
      viewX = 0;
      viewY = 0;

      if (menuPreview) {
        // Static, centred framing zoomed IN past the cover-fit floor (MENU_PREVIEW_ZOOM×) for a closer,
        // more detailed title-screen shot — entities + blowing leaves read clearly. The map still fills
        // the screen (zooming in only shows less of it); both axes overflow, so it's centred. No
        // saved-camera restore — the backdrop must never read or write the player's camera.
        tileWidth = tileHeight = Math.min(MAX_TILE_W, fitTileSize * MENU_PREVIEW_ZOOM);
        const mapW = worldMap.length > 0 ? worldMap[0].length : MAP_W;
        const mapH = worldMap.length > 0 ? worldMap.length : MAP_H;
        const visW = Math.ceil(canvas.width / tileWidth);
        const visH = Math.ceil(canvas.height / tileHeight);
        viewX = Math.max(0, Math.floor((mapW - visW) / 2));
        viewY = Math.max(0, Math.floor((mapH - visH) / 2));
      } else {
        // Restore camera from previous session (survives hot reloads)
        try {
          const saved = sessionStorage.getItem(CAMERA_STORAGE_KEY);
          if (saved) {
            const c = JSON.parse(saved);
            if (typeof c.tileWidth === 'number')
              tileWidth = tileHeight = Math.max(fitTileSize, Math.min(MAX_TILE_W, c.tileWidth));
            if (typeof c.viewX === 'number') viewX = c.viewX;
            if (typeof c.viewY === 'number') viewY = c.viewY;
          }
        } catch {
          /* ignore corrupt data */
        }
      }

      // Init pathfinder WASM early so pawns can navigate as soon as turns start
      wasmPathfinderService.init().catch((e) => console.warn('[GameCanvas] WASM init failed:', e));

      renderer = new WebGLRenderer({
        canvas,
        tileWidth,
        tileHeight,
        contextAttributes: { alpha: false, antialias: false, powerPreference: 'high-performance' }
      });

      const ok = await renderer.waitForInitialization();
      if (!ok || !renderer.isReady()) throw new Error('Renderer init failed');

      // ADR-026: the initial terrain build goes through _fullRebuildTerrain (the single full-build seam)
      // — it seeds the persistent grid, the hidden-mask state, the building-diff baseline and the grove
      // glow map, so every later change can be incremental. Pre-game (no map) shows the placeholder.
      if (worldMap.length > 0) {
        _fullRebuildTerrain();
        renderer.setGrid(_terrainGrid!);
      } else {
        renderer.setGrid(generatePlaceholderGrid());
      }
      renderer.setViewTileOffset(viewX, viewY);
      // Phase A2: bake ONLY the static (flicker-free) additive point light into the
      // renderer; the global day/night ambient and the fire flicker are both applied
      // as shader uniforms, so the terrain buffer never rebakes per frame.
      renderer.setLightSampler((wx, wy) => lightingService.samplePointStatic(wx, wy));
      // Initialise ambient from current turn so the first frame is correctly lit
      {
        const { light, tint } = environmentService.getAmbient($gameState?.turn ?? 0);
        const tinted = environmentService.getMapAmbientTint(
          tint,
          $gameState ? environmentService.effectiveSeason($gameState) : undefined,
          $gameState?.weather
        );
        renderer.setAmbient(light, tinted);
        lightingService.setAmbient(light, tinted);
        if (worldMap.length === 0) refreshEmitters(); // map present ⇒ _fullRebuildTerrain already did
        _ambientLight = light;
        _ambientTint = tinted;
      }

      ready = true;
      // The backdrop must not arm the boot-reveal linger — that belongs to the real game's renderer.
      if (!menuPreview) rendererReady.set(true); // WebGL up — arms the warmup linger that drops overlay
      startLoop();

      new ResizeObserver(() => {
        if (!renderer || !container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        canvas.width = w;
        canvas.height = h;
        renderer.resize(w, h);
        drawDesignations();
        // Keep the fit size in sync; if we're at fit zoom, re-snap to new fit size
        const wasAtFit = Math.abs(tileWidth - fitTileSize) < 0.01;
        fitTileSize = computeFitTileSize(w, h);
        if (wasAtFit) {
          tileWidth = tileHeight = fitTileSize;
          renderer.setTileSize(tileWidth, tileHeight);
          setView(0, 0);
        }
      }).observe(container);
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
      console.error('[GameCanvas]', e);
    }
  }

  // Smoothly slide the camera toward the followed pawn each frame, tracking its
  // INTERPOLATED sub-tile render position (not the snapped integer tile) so the
  // follow never janks tile-to-tile like the old per-store-update snap did.
  function updateCameraFollow(dt: number) {
    if (!cameraFollowPawnId || !ready || !renderer?.isReady()) return;
    const rp = pawnRenderPos.get(cameraFollowPawnId);
    if (!rp) return;
    const visW = (container?.clientWidth ?? 800) / tileWidth;
    const visH = (container?.clientHeight ?? 600) / tileHeight;
    const [targetX, targetY] = clampView(rp.x - visW / 2, rp.y - visH * FOLLOW_VERTICAL);
    // Exponential smoothing keeps the slide framerate-independent; snap when very
    // close to avoid an endless asymptote (and to settle exactly on a teleport).
    const alpha = dt > 0 ? 1 - Math.exp(-dt / FOLLOW_SMOOTH_TAU) : 1;
    const dx = targetX - viewX;
    const dy = targetY - viewY;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
      if (dx !== 0 || dy !== 0) setView(targetX, targetY);
      return;
    }
    setView(viewX + dx * alpha, viewY + dy * alpha);
  }

  function updateCameraFollowMob(dt: number) {
    if (!cameraFollowMobId || !ready || !renderer?.isReady()) return;
    const rp = mobRenderPos.get(cameraFollowMobId);
    if (!rp) return;
    const visW = (container?.clientWidth ?? 800) / tileWidth;
    const visH = (container?.clientHeight ?? 600) / tileHeight;
    const [targetX, targetY] = clampView(rp.x - visW / 2, rp.y - visH * FOLLOW_VERTICAL);
    const alpha = dt > 0 ? 1 - Math.exp(-dt / FOLLOW_SMOOTH_TAU) : 1;
    const dx = targetX - viewX;
    const dy = targetY - viewY;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
      if (dx !== 0 || dy !== 0) setView(targetX, targetY);
      return;
    }
    setView(viewX + dx * alpha, viewY + dy * alpha);
  }

  function startLoop() {
    let lastFpsPush = 0;
    let lastDrawAt = 0;
    // ── DEBUG: menu-backdrop frame profiler (console). Logs a rolling summary ~every 2s and warns on
    // individual hiccup frames (gap > 33ms), so we can see whether the stutter is render-side (terrain
    // re-bake / draw cost) or a GC-sized gap with cheap render. Menu preview only; remove when solved.
    let _dbgPrevT = 0;
    let _dbgN = 0;
    let _dbgRenderSum = 0;
    let _dbgRenderMax = 0;
    let _dbgGapMax = 0;
    let _dbgRebuildSum = 0;
    let _dbgRebuildFrames = 0;
    let _dbgHiccups = 0;
    let _dbgTerrainMaxMs = 0;
    let _dbgWindowStart = 0;
    // Safety net for the frozen render: even with nothing marked dirty, redraw at least this often so a
    // missed dirty trigger (e.g. an async terrain rebuild a few frames after GENERATE / size toggle, or
    // a layout-resize on opening Custom Map) can never leave a STALE frame on screen longer than this.
    // ~2.5 redraws/sec when idle ≈ negligible cost vs. the 20 FPS saturation it replaces, but
    // bulletproof against the "blank/partial map until I pan" staleness.
    const FROZEN_SAFETY_MS = 400;
    function frame() {
      if (!renderer || !ready) return;
      // Real elapsed time drives interpolation so motion is smooth at the display
      // refresh rate regardless of how fast/slow the simulation ticks.
      const now = performance.now();
      const dt = lastFrameTime ? (now - lastFrameTime) / 1000 : 0;
      lastFrameTime = now;
      // Advance the simulation on this same thread/schedule (non-worker mode). Driving the sim
      // from the render loop (rather than a competing setInterval) prevents the timer starvation
      // that throttled a <1 ms/tick sim to ~20 TPS while rendering. (No-op under ?simworker.)
      gameState.stepSimulation(dt * 1000);
      if (customMapPreview) {
        // Map-generation mode is a terrain-only static viewer — never draw entities/items (the fresh
        // New Game map still HAS them in state until GENERATE; we just don't render them here).
        pawnOverlayGrid.clear();
        itemOverlayGrid.clear();
      } else {
        updatePawnOverlay(dt);
      }
      // While a follow camera is panning, the cursor stays put but the world slides under it — so
      // the hovered tile (world coords, only refreshed on mousemove) goes stale within a frame and
      // the hover card flickers off the followed entity. Re-derive it from the live cursor pixel +
      // current view each frame so hover stays pinned to whatever is physically under the cursor.
      if (cursorOverCanvas && (cameraFollowPawnId || cameraFollowMobId)) {
        hoverTileX = Math.floor(lastCursorCx / tileWidth + viewX);
        hoverTileY = Math.floor(lastCursorCy / tileHeight + viewY);
      }
      updateHoverEntity();
      updateCameraFollow(dt);
      updateCameraFollowMob(dt);
      // Refresh the lair-tile cache occasionally (catches grown/destroyed lairs); projection is
      // per-frame in updateWorldEffectOverlays but the full-map scan is throttled to ~4s.
      if (now - _lairScanAt > 4000) {
        _lairScanAt = now;
        rebuildLairTiles();
      }
      updateWorldEffectOverlays();
      // Coalesced sim-driven terrain rebuild: at most once per TERRAIN_REBUILD_MIN_MS instead
      // of the full 38k-tile rebuild every frame that resource regrowth/harvest would force.
      if (
        _terrainDirty &&
        (_forceTerrainRebuild || now - _lastTerrainBuild >= TERRAIN_REBUILD_MIN_MS)
      ) {
        _terrainDirty = false;
        _forceTerrainRebuild = false;
        _lastTerrainBuild = now;
        redrawOverlayNow();
      }
      // Render-on-demand: when the scene is FROZEN skip the GL draw unless something visible changed.
      // The WebGL canvas retains its last frame, so a static map just stays on screen at ~0 render
      // cost. FROZEN = map-generation mode (a static terrain viewer) OR zoomed out past FREEZE_TILE_PX
      // (entity motion sub-pixel). NB: we do NOT freeze on a bare in-game pause — paused-but-zoomed-in
      // still wants its animation layers (weather/status/glow) live (see §E.1 followup: cache the
      // heavy map+entity layers while keeping the light animated layers redrawing).
      // The menu backdrop is a LIVE scene (grazing prey) — never freeze it, even zoomed out.
      const frozen = !menuPreview && (customMapPreview || tileWidth < FREEZE_TILE_PX);
      if (_renderDirty || !frozen || now - lastDrawAt >= FROZEN_SAFETY_MS) {
        renderer.setItemOverlayGrid(itemOverlayGrid);
        renderer.setOverlayGrid(pawnOverlayGrid);
        const _dbgT0 = menuPreview && _menuPerfOn ? performance.now() : 0;
        renderer.beginFrame();
        renderer.endFrame();
        // ── DEBUG: menu-backdrop frame profiler (Debug-mode gated) ────────────────────────────────
        if (menuPreview && _menuPerfOn) {
          const renderMs = performance.now() - _dbgT0;
          const gap = _dbgPrevT ? now - _dbgPrevT : 0; // inter-frame gap (the actual hiccup metric)
          _dbgPrevT = now;
          const st = renderer.getStats();
          _dbgN++;
          _dbgRenderSum += renderMs;
          if (renderMs > _dbgRenderMax) _dbgRenderMax = renderMs;
          if (gap > _dbgGapMax) _dbgGapMax = gap;
          if (st.terrainMs > _dbgTerrainMaxMs) _dbgTerrainMaxMs = st.terrainMs;
          _dbgRebuildSum += st.terrainRebuilds;
          if (st.terrainRebuilds > 0) _dbgRebuildFrames++;
          if (gap > 33) {
            _dbgHiccups++;
            console.warn(
              `[MENU-PERF] HICCUP gap=${gap.toFixed(1)}ms render=${renderMs.toFixed(1)}ms ` +
                `terrain=${st.terrainMs.toFixed(1)}ms rebuilds=${st.terrainRebuilds} ` +
                `tiles=${st.vertexCount / 6}`
            );
          }
          if (!_dbgWindowStart) _dbgWindowStart = now;
          if (now - _dbgWindowStart >= 2000) {
            console.info(
              `[MENU-PERF] ${_dbgN}f/${((now - _dbgWindowStart) / 1000).toFixed(1)}s ` +
                `(${(_dbgN / ((now - _dbgWindowStart) / 1000)).toFixed(0)}fps) | ` +
                `render avg=${(_dbgRenderSum / _dbgN).toFixed(1)} max=${_dbgRenderMax.toFixed(1)}ms | ` +
                `terrain max=${_dbgTerrainMaxMs.toFixed(1)}ms | ` +
                `rebuilds=${(_dbgRebuildSum / _dbgN).toFixed(1)}/frame (${_dbgRebuildFrames}/${_dbgN} frames) | ` +
                `gapMax=${_dbgGapMax.toFixed(1)}ms hiccups=${_dbgHiccups}`
            );
            _dbgWindowStart = now;
            _dbgN = 0;
            _dbgRenderSum = 0;
            _dbgRenderMax = 0;
            _dbgGapMax = 0;
            _dbgRebuildSum = 0;
            _dbgRebuildFrames = 0;
            _dbgHiccups = 0;
            _dbgTerrainMaxMs = 0;
          }
        }
        _renderDirty = false;
        lastDrawAt = now;
        // Backdrop: the terrain is now actually on screen — reveal it (the wrapper fades 0→1), so the
        // WebGL clear/init never flashed in the open. One-shot.
        if (menuPreview && !_previewPainted) {
          _previewPainted = true;
          menuPreviewRendered.set(true);
        }
        // Surface render FPS to the topbar ~4×/sec to avoid store churn.
        if (now - lastFpsPush > 250) {
          lastFpsPush = now;
          renderFps.set(Math.round(renderer.getStats().fps));
        }
      } else if (now - lastFpsPush > 250) {
        // Frozen + idle: no frames drawn, so report 0 — the WebGL canvas retains its last frame.
        lastFpsPush = now;
        renderFps.set(0);
      }
      animationId = requestAnimationFrame(frame);
    }
    frame();
  }

  function clampView(x: number, y: number): [number, number] {
    const mapW = worldMap.length > 0 ? worldMap[0].length : 80;
    const mapH = worldMap.length > 0 ? worldMap.length : 50;
    const visW = Math.ceil((container?.clientWidth ?? 800) / tileWidth);
    const visH = Math.ceil((container?.clientHeight ?? 600) / tileHeight);
    return [Math.max(0, Math.min(x, mapW - visW)), Math.max(0, Math.min(y, mapH - visH))];
  }

  function saveCameraState() {
    if (menuPreview) return; // backdrop never persists the player's camera
    // Debounced: the actual sessionStorage write is a synchronous, blocking call
    // that must not run on every mousemove during a camera drag (caused stutter).
    if (saveCameraTimer !== null) clearTimeout(saveCameraTimer);
    saveCameraTimer = setTimeout(() => {
      saveCameraTimer = null;
      sessionStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify({ viewX, viewY, tileWidth }));
    }, 200);
  }

  function setView(x: number, y: number) {
    [viewX, viewY] = clampView(x, y);
    renderer?.setViewTileOffset(viewX, viewY);
    saveCameraState();
    drawDesignations();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!ready || menuPreview) return;

    // WASD camera panning — ADDITIVE to the arrow keys below (toggleable in Settings → Controls, on by
    // default; never replaces the arrows or mouse-drag). Skipped when a modifier is held so it can't eat
    // a shortcut (Ctrl+S …); a focused text field never reaches here — this handler lives on the
    // focusable canvas, not the window — so typing W/A/S/D in a search/seed box won't scroll the map.
    if (get(wasdPan) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'a':
          setView(viewX - SCROLL_STEP, viewY);
          e.preventDefault();
          return;
        case 'd':
          setView(viewX + SCROLL_STEP, viewY);
          e.preventDefault();
          return;
        case 'w':
          setView(viewX, viewY - SCROLL_STEP);
          e.preventDefault();
          return;
        case 's':
          setView(viewX, viewY + SCROLL_STEP);
          e.preventDefault();
          return;
      }
    }

    switch (e.key) {
      case 'ArrowLeft':
        setView(viewX - SCROLL_STEP, viewY);
        e.preventDefault();
        break;
      case 'ArrowRight':
        setView(viewX + SCROLL_STEP, viewY);
        e.preventDefault();
        break;
      case 'ArrowUp':
        setView(viewX, viewY - SCROLL_STEP);
        e.preventDefault();
        break;
      case 'ArrowDown':
        setView(viewX, viewY + SCROLL_STEP);
        e.preventDefault();
        break;
      case 'Escape': {
        // RimWorld-style "back out one step": Escape dismisses the most recent in-world thing — an
        // active tool/brush first, then a selection/follow. Only when there is genuinely NOTHING left
        // to dismiss do we let the event bubble to the window handler (+page.svelte), which opens the
        // pause menu. Without the consume-when-dismissed gate below, one Escape would BOTH clear the
        // selection here AND pop the pause menu — the reported annoyance.
        let dismissed = true;
        if (debugBrush) {
          uiState.deactivateDebugBrush();
          redrawOverlay();
        } else if (showFuelSettings) {
          showFuelSettings = false;
        } else if (showFoodSettings) {
          showFoodSettings = false;
        } else if (showZoneFilter) {
          showZoneFilter = false;
        } else if (moveAimActive || moveAimArmed) {
          // Back out of a move-aim first, keeping the mark highlight so MOVE can be re-armed.
          moveAimActive = false;
          moveAimArmed = false;
          moveAimSlots = [];
          drawDesignations();
        } else if (markKind || markedKind) {
          clearMark();
        } else if (similarDragMode) {
          similarDragMode = false;
          similarDragActive = false;
          redrawOverlay();
        } else if (designationMode) {
          // Actively painting (e.g. the zone DRAW/CLEAR tool) → back out of the tool first; a second
          // Escape then clears whatever's still selected (the zone card, etc.).
          uiState.deactivateDesignation();
          zoneEraseMode = false;
          zoneDragActive = false;
          drawDesignations();
        } else if (selectedResourceTile) {
          selectedResourceTile = null;
          highlightedResourceTiles = new Set();
          selectedResourceTypes = new Set();
          drawDesignations();
        } else if (selectedItemId) {
          selectedItemId = null;
        } else if (selectedZoneId) {
          selectedZoneId = null;
        } else if (selectedMobId) {
          selectedMobId = null;
          uiState.selectMob(null);
          drawDesignations();
        } else if (selectedBuildingId) {
          selectedBuildingId = null;
        } else if (blueprintBuildingId) {
          uiState.deactivateBlueprint();
          blueprintDragActive = false;
          blueprintAnchorX = -1;
          blueprintAnchorY = -1;
          redrawOverlay();
        } else if (
          designationMode ||
          selectedPawnId ||
          cameraFollowPawnId ||
          cameraFollowMobId ||
          selDragActive
        ) {
          // An active zone/designation tool, a selected/followed pawn, or an in-progress mark drag.
          uiState.deactivateDesignation();
          zoneEraseMode = false;
          zoneDragActive = false;
          selDragActive = false;
          selectedPawnId = null;
          uiState.selectPawn(null);
          uiState.setFollowPawn(null);
          uiState.setFollowMob(null);
          drawDesignations();
        } else {
          dismissed = false; // nothing to back out of → let the pause menu open
        }
        if (dismissed) {
          // Backing out a selection also resets the click-cycle, so re-clicking the same tile starts
          // again at its top layer rather than resuming mid-cycle.
          _cycleTileX = -1;
          _cycleTileY = -1;
          _cycleIndex = 0;
          e.preventDefault();
          e.stopPropagation();
        }
        break;
      }
      case 'x':
      case 'X':
        if (designationMode) {
          zoneEraseMode = !zoneEraseMode;
          if (zoneDragActive) drawDesignations();
          e.preventDefault();
        }
        break;
    }
  }

  function handleWheel(e: WheelEvent) {
    if (!ready || !renderer || menuPreview) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;

    let newW: number;
    const atFit = Math.abs(tileWidth - fitTileSize) < 0.01;

    if (dir > 0) {
      // Zoom in: from fit, snap up to first clean ZOOM_STEP multiple above fitTileSize
      const base = atFit
        ? Math.ceil(fitTileSize / ZOOM_STEP) * ZOOM_STEP
        : Math.round(tileWidth) + ZOOM_STEP;
      newW = Math.min(MAX_TILE_W, base <= fitTileSize ? base + ZOOM_STEP : base);
    } else {
      // Zoom out: step down; when next step would go below fitTileSize, snap to fit
      const nextDown = Math.round(tileWidth) - ZOOM_STEP;
      newW = nextDown <= fitTileSize ? fitTileSize : nextDown;
    }

    if (Math.abs(newW - tileWidth) < 0.001) return;

    const visWBefore = (container?.clientWidth ?? 800) / tileWidth;
    const visHBefore = (container?.clientHeight ?? 600) / tileHeight;
    tileWidth = newW;
    tileHeight = newW; // square cells
    renderer.setTileSize(tileWidth, tileHeight);
    const visWAfter = (container?.clientWidth ?? 800) / tileWidth;
    const visHAfter = (container?.clientHeight ?? 600) / tileHeight;
    setView(
      viewX + Math.round((visWBefore - visWAfter) / 2),
      viewY + Math.round((visHBefore - visHAfter) / 2)
    );
  }

  function handleMouseDown(e: MouseEvent) {
    if (menuPreview) return;
    // Right button: begin a drafted-pawn MOVE aim (press-drag = line, click = block). A SINGLE selected
    // pawn keeps its right-click context menu on a tile that has an attack target or pickup-able items —
    // only an empty tile begins the aim there; a marked group always aims (no per-tile menu for groups).
    if (e.button === 2) {
      if (moveAimCount === 0 || hoverTileX < 0 || hoverTileY < 0) return; // nothing to move → contextmenu
      const groupMove = markedKind === 'pawn' && markedDraftedCount > 0;
      if (!groupMove) {
        const hasMenu =
          hasAttackTargetAt(hoverTileX, hoverTileY) ||
          droppedItems.some((d) => d.x === hoverTileX && d.y === hoverTileY && d.quantity > 0);
        if (hasMenu) return;
      }
      startMoveAim();
      return;
    }
    if (e.button !== 0) return;
    if (moveAimArmed && moveAimCount > 0 && hoverTileX >= 0 && hoverTileY >= 0) {
      // The info-card / mark-HUD MOVE button armed the aim → a left-press now begins it too.
      startMoveAim();
      return;
    }
    if (markKind) {
      // MARK highlight drag (pawns or mobs): start the selection box. Cheap 2D-overlay repaint only
      // (like the zone/resource drags) — never the heavy terrain rebuild that redrawOverlay() forces.
      markDragActive = true;
      markAnchorX = hoverTileX;
      markAnchorY = hoverTileY;
      markEndX = hoverTileX;
      markEndY = hoverTileY;
      drawDesignations();
      return;
    }
    if (similarDragMode) {
      similarDragActive = true;
      similarAnchorX = hoverTileX;
      similarAnchorY = hoverTileY;
      similarEndX = hoverTileX;
      similarEndY = hoverTileY;
      drawDesignations();
      return;
    }
    if (designationMode) {
      // Zone paint mode: start a drag rectangle, don't pan
      zoneDragActive = true;
      zoneAnchorX = hoverTileX;
      zoneAnchorY = hoverTileY;
      zoneEndX = hoverTileX;
      zoneEndY = hoverTileY;
      drawDesignations();
      return;
    }
    if (blueprintBuildingId) {
      // Blueprint paint mode: anchor a fill rectangle here; the preview fills anchor→cursor as it drags.
      blueprintDragActive = true;
      blueprintAnchorX = hoverTileX;
      blueprintAnchorY = hoverTileY;
      redrawOverlay();
      return;
    }
    if (e.shiftKey) {
      // Shift = the resource MARK shortcut: begin a mark box (a no-drag release becomes a Shift+click
      // that adds a resource type to the set; a drag marks every matching tile in the box).
      selDragActive = true;
      selAnchorX = hoverTileX;
      selAnchorY = hoverTileY;
      selEndX = hoverTileX;
      selEndY = hoverTileY;
      drawDesignations();
      return;
    }
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragViewX = viewX;
    dragViewY = viewY;
    // When follow-mode is active the follow camera immediately corrects any
    // pan, so drag-to-pan is a no-op. Skip drag accumulation entirely so that
    // clicks always register regardless of hand tremor.
    if (cameraFollowPawnId || cameraFollowMobId) dragDistance = -Infinity;
    else dragDistance = 0;
  }

  function handleMouseMove(e: MouseEvent) {
    if (menuPreview) return;
    // Always track hover tile
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      lastCursorCx = cx;
      lastCursorCy = cy;
      // Floor the COMBINED world coord, not `floor(px) + viewX`: during follow `viewX/viewY` are
      // fractional (sub-tile smooth scroll), so the old form yielded a fractional tile index that
      // matched no entity or worldMap cell — breaking hover/click picking while following.
      hoverTileX = Math.floor(cx / tileWidth + viewX);
      hoverTileY = Math.floor(cy / tileHeight + viewY);
      cursorOverCanvas = true;
      updateHoverEntity();
    }
    if (moveAimActive) {
      // Extend the aim line to the cursor and recompute where each pawn would land — cheap 2D repaint
      // only (recomputeMoveAim + drawDesignations), never a WebGL terrain rebuild (the jank source).
      moveAimEndX = hoverTileX;
      moveAimEndY = hoverTileY;
      recomputeMoveAim();
      drawDesignations();
      return;
    }
    if (zoneDragActive) {
      zoneEndX = hoverTileX;
      zoneEndY = hoverTileY;
      // Cheap 2D-overlay redraw only — the terrain buffer stays untouched.
      drawDesignations();
      return;
    }
    if (markDragActive) {
      markEndX = hoverTileX;
      markEndY = hoverTileY;
      // Cheap 2D-overlay redraw only — never rebuild the WebGL terrain buffer mid-drag.
      drawDesignations();
      return;
    }
    if (similarDragActive) {
      similarEndX = hoverTileX;
      similarEndY = hoverTileY;
      // Cheap 2D-overlay redraw only — the terrain buffer stays untouched.
      drawDesignations();
      return;
    }
    if (blueprintDragActive) {
      // Rectangle derives from anchor → current hover; repaint the ghost (clears the old rect, draws new).
      redrawOverlay();
      return;
    }
    if (selDragActive) {
      selEndX = hoverTileX;
      selEndY = hoverTileY;
      // Cheap 2D-overlay redraw only — the terrain buffer stays untouched.
      drawDesignations();
      return;
    }
    if (blueprintBuildingId) {
      redrawOverlay();
      return;
    }
    if (!dragging) return;
    dragDistance += Math.abs(e.movementX) + Math.abs(e.movementY);
    const dx = Math.round((dragStartX - e.clientX) / tileWidth);
    const dy = Math.round((dragStartY - e.clientY) / tileHeight);
    setView(dragViewX + dx, dragViewY + dy);
  }

  function handleMouseUp() {
    if (moveAimActive) {
      commitMoveAim();
      return;
    }
    if (markDragActive) {
      completeMarkDrag();
      return;
    }
    if (similarDragActive) {
      completeSimilarDrag();
      return;
    }
    if (blueprintDragActive) {
      // Commit a blueprint at every tile in the drag rectangle (placeBuilding skips blocked/occupied
      // ones). The tool STAYS ACTIVE afterwards — like the zone tool — so several rooms can be roofed
      // back-to-back without reopening the build menu. Esc / right-click clears it.
      const bid = blueprintBuildingId;
      const rectTiles = _blueprintRectTiles();
      if (bid && rectTiles.size > 0) {
        const buildingDef = buildingService.getBuildingById(bid);
        if (buildingDef) {
          // ADR-016: placeBuilding RESERVES the cost to each building (pawns fetch it to the site);
          // it is consumed on construction completion, not at placement.
          gameState.command({
            type: 'placeBuildings',
            payload: {
              bid,
              tiles: [...rectTiles].map((key) => key.split(',').map(Number) as [number, number]),
              materials: blueprintMaterials ?? undefined
            },
            save: true
          });
        }
      }
      blueprintDragActive = false;
      blueprintAnchorX = -1;
      blueprintAnchorY = -1;
      redrawOverlay();
      return;
    }
    if (zoneDragActive) {
      // Commit the painted (or erased) rectangle to game state
      if (zoneEraseMode) {
        gameState.command({
          type: 'clearRect',
          payload: { x1: zoneAnchorX, y1: zoneAnchorY, x2: zoneEndX, y2: zoneEndY },
          save: true
        });
      } else {
        gameState.command({
          type: 'designateRect',
          payload: {
            x1: zoneAnchorX,
            y1: zoneAnchorY,
            x2: zoneEndX,
            y2: zoneEndY,
            type: designationTypeActive,
            instanceId: activeZoneInstanceId ?? undefined
          },
          save: true
        });
      }
      zoneDragActive = false;
      // Zone tints live on the 2D overlay now — repaint it, don't rebuild the terrain grid (this is
      // what made committing a stockpile/drink/wash zone hitch the map for a second).
      drawDesignations();
      return;
    }
    if (selDragActive) {
      selDragActive = false;
      // Shift+CLICK (no box) adds the thing under the tile to its mark set; Shift+DRAG marks the whole
      // box by inferred kind — pawns/mobs into the group card, resources straight to designations.
      if (selAnchorX === selEndX && selAnchorY === selEndY) {
        shiftClickTile(selEndX, selEndY);
      } else {
        const kind = dragMarkKind();
        if (kind === 'resource') {
          commitResourceMarkRect(selAnchorX, selAnchorY, selEndX, selEndY);
        } else {
          markBoxEntities(kind, selAnchorX, selAnchorY, selEndX, selEndY);
        }
      }
      // ALWAYS repaint so the live drag preview is cleared even when nothing matched (no stale box).
      drawDesignations();
      return;
    }
    if (dragDistance < 3 && !customMapPreview && !menuPreview) {
      // Recompute hover tile from current viewX/viewY — the follow camera may
      // have shifted the view since the last mousemove, making the stored tile stale.
      // (Floor the combined coord — viewX/viewY are fractional under smooth follow.)
      // Suppressed while the Custom Map popup is open — clicks shouldn't select during world shaping.
      hoverTileX = Math.floor(lastCursorCx / tileWidth + viewX);
      hoverTileY = Math.floor(lastCursorCy / tileHeight + viewY);
      handleTileClick();
    }
    dragging = false;
  }

  function cancelBlueprintBuilding() {
    if (!selectedBuilding) return;
    const id = selectedBuilding.id;
    gameState.command({ type: 'cancelBuilding', payload: { id }, save: true });
    selectedBuildingId = null;
    redrawOverlay();
  }

  function deconstructBuilding() {
    if (!selectedBuilding) return;
    const id = selectedBuilding.id;
    gameState.command({ type: 'deconstructBuilding', payload: { id }, save: true });
    redrawOverlay();
  }

  // Start placing a new blueprint of the selected building's type. Deselect the
  // existing building so its card doesn't linger over the placement preview.
  function buildAnother() {
    if (!selectedBuilding) return;
    uiState.activateBlueprint(selectedBuilding.type);
    selectedBuildingId = null;
    redrawOverlay();
  }

  function cancelDeconstructBuilding() {
    if (!selectedBuilding) return;
    const id = selectedBuilding.id;
    gameState.command({ type: 'cancelDeconstructBuilding', payload: { id }, save: true });
    redrawOverlay();
  }

  function designateResource(dtype?: DesignationType) {
    if (!selectedResourceTile || !selectedResourceDef) return;
    const resolvedType =
      dtype ?? ((selectedResourceDef.designationTypes?.[0] ?? 'harvest') as DesignationType);
    if (highlightedResourceTiles.size > 0) {
      // Designate all tiles from the drag selection.
      gameState.command({
        type: 'designateTiles',
        payload: {
          tiles: [...highlightedResourceTiles].map(
            (key) => key.split(',').map(Number) as [number, number]
          ),
          type: resolvedType
        },
        save: true
      });
      // Keep the highlight as a persistent working set so the card now offers CANCEL on the same tiles
      // (CLEAR drops it). Designating no longer silently deselects.
    } else {
      const { x, y } = selectedResourceTile;
      gameState.command({ type: 'designate', payload: { x, y, type: resolvedType }, save: true });
    }
    // Designation icons are a 2D-overlay layer — repaint that, not the terrain grid.
    drawDesignations();
  }

  function cancelResourceDesignation() {
    if (!selectedResourceTile) return;
    // Cancel only what's selected: the highlighted (Shift-marked) tiles if any, else just the single
    // selected node — NOT every tile of the resource type.
    if (highlightedResourceTiles.size > 0) {
      gameState.command({
        type: 'clearActionDesignationTiles',
        payload: {
          tiles: [...highlightedResourceTiles].map(
            (key) => key.split(',').map(Number) as [number, number]
          )
        },
        save: true
      });
      // Keep the highlight (working set) — the card flips back to offering HARVEST on the same tiles.
    } else {
      const { x, y } = selectedResourceTile;
      // Action-only clear: cancelling a harvest mark must not evict the tile from a restrict/stockpile
      // zone it also sits in (that silently shrank restrict zones — pawns then couldn't path to beds).
      gameState.command({ type: 'clearActionDesignation', payload: { x, y }, save: true });
    }
    drawDesignations();
  }

  // ── Shift = universal MARK shortcut (pawns / mobs / resources) ──────────────
  // Kind for a Shift+DRAG box: continue an active entity mark, else follow the current selection
  // (resource brush → resource, selected mob → mob), else default to pawns ("grab my units").
  function dragMarkKind(): 'pawn' | 'mob' | 'resource' {
    if (markedKind) return markedKind;
    if (selectedResourceTile || selectedResourceTypes.size > 0) return 'resource';
    if (selectedMobId) return 'mob';
    return 'pawn';
  }

  /** Shift+CLICK one tile → add the top thing on it (pawn ▸ mob ▸ resource) to the matching mark set,
   *  so individuals (or resource KINDS) can be stacked before — or instead of — a drag. */
  function shiftClickTile(x: number, y: number) {
    const pawn = findPawnAtTile(x, y);
    if (pawn) return addEntityToMark('pawn', pawn.id);
    const mob = findMobAtTile(x, y);
    if (mob) return addEntityToMark('mob', mob.id);
    shiftSelectResourceAt(x, y);
  }

  /** The ids a Shift gesture builds on: an active mark of the same kind, ELSE the single normally-selected
   *  entity of that kind (so Shift-clicking a 2nd pawn keeps the 1st you had selected, instead of switching
   *  to just the new one). Different kind → start fresh. */
  function markBase(kind: 'pawn' | 'mob'): string[] {
    if (markedKind === kind) return [...markedIds];
    const selId = kind === 'pawn' ? selectedPawnId : selectedMobId;
    return selId ? [selId] : [];
  }

  /** Add one pawn/mob id to the committed mark highlight (toggles off if already marked). The resource
   *  brush and entity mark are mutually exclusive, so picking an entity clears the resource one. */
  function addEntityToMark(kind: 'pawn' | 'mob', id: string) {
    const base = markBase(kind);
    // Toggle: Shift-clicking an already-marked entity removes it.
    const ids = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    markedKind = ids.length > 0 ? kind : null;
    markedIds = ids;
    markedSet = new Set(ids);
    selectedResourceTile = null;
    selectedResourceTypes = new Set();
    drawDesignations();
  }

  /** Shift+DRAG box for pawns/mobs → ADD every living entity of `kind` in the box to the mark set
   *  (feeds the same markedGroupCard the MARK button does: DRAFT/MOVE for pawns, HUNT for mobs). */
  function markBoxEntities(kind: 'pawn' | 'mob', x1: number, y1: number, x2: number, y2: number) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const inBox = (x?: number, y?: number) =>
      x != null && y != null && x >= minX && x <= maxX && y >= minY && y <= maxY;
    const found =
      kind === 'pawn'
        ? pawns
            .filter((p) => p.isAlive !== false && inBox(p.position?.x, p.position?.y))
            .map((p) => p.id)
        : mobs
            .filter((m) => m.isAlive !== false && m.state !== 'Corpse' && inBox(m.x, m.y))
            .map((m) => m.id);
    const merged = new Set([...markBase(kind), ...found]);
    if (merged.size === 0) return;
    markedKind = kind;
    markedIds = [...merged];
    markedSet = merged;
    selectedResourceTile = null;
    selectedResourceTypes = new Set();
  }

  /** Shift+CLICK on a resource tile: add the top harvestable resource there to the mark type-set (and
   *  focus its card), so several resource KINDS can be stacked before a Shift+drag designates them. */
  function shiftSelectResourceAt(x: number, y: number) {
    if (isHiddenTile(x, y)) return;
    const res = worldMap[y]?.[x]?.resources;
    if (!res) return;
    const rid = Object.entries(res).find(([id, v]) => {
      if (v <= 0) return false;
      const def = resourceObjectService.getById(id);
      return !!def && def.designationTypes.length > 0; // harvestable only
    })?.[0];
    if (!rid) return;
    // Switching to a resource brush drops any entity mark (they're mutually exclusive).
    markedKind = null;
    markedIds = [];
    markedSet = new Set();
    // HIGHLIGHT the clicked node (toggle), so the multi-selection is VISIBLE on the map — same as
    // pawns lighting up — and the card's HARVEST/DESIGNATE button has tiles to act on. Seed from the
    // node that was already (normally) selected so it joins the set instead of being dropped.
    const next = new Set(highlightedResourceTiles);
    if (next.size === 0 && selectedResourceTile) {
      next.add(`${selectedResourceTile.x},${selectedResourceTile.y}`);
    }
    const key = `${x},${y}`;
    if (next.has(key)) next.delete(key);
    else next.add(key);
    highlightedResourceTiles = next;
    selectedResourceTypes = new Set([...selectedResourceTypes, rid]);
    selectedResourceTile = { x, y, resourceId: rid };
    drawDesignations();
  }

  /** Shift+DRAG release: HIGHLIGHT every tile in the box that holds ANY selected resource type (additive,
   *  so repeated drags accumulate). Nothing is designated yet — the card's HARVEST/DESIGNATE button
   *  commits, exactly like the pawn/mob MARK → DRAFT/MOVE flow. Basis falls back to the single selected
   *  resource when the type set is empty. */
  function commitResourceMarkRect(x1: number, y1: number, x2: number, y2: number) {
    const types =
      selectedResourceTypes.size > 0
        ? selectedResourceTypes
        : selectedResourceTile
          ? new Set([selectedResourceTile.resourceId])
          : new Set<string>();
    if (types.size === 0) return;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const next = new Set(highlightedResourceTiles);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (isHiddenTile(x, y)) continue;
        const res = worldMap[y]?.[x]?.resources;
        if (!res) continue;
        for (const t of types) {
          if ((res[t] ?? 0) > 0) {
            next.add(`${x},${y}`);
            break;
          }
        }
      }
    }
    highlightedResourceTiles = next;
    drawDesignations();
  }

  /** DESIGNATE the highlighted multi-type tiles (the multi-resource card's button): each tile is queued
   *  with ITS resource's own designation type (a tree → woodcut, a stone outcrop / berry bush → harvest
   *  …), grouped into one command per type. The highlight stays as a working set so CANCEL can undo the
   *  same tiles; CLEAR drops it. */
  function designateMarkedMulti() {
    if (highlightedResourceTiles.size === 0) return;
    const byType = new Map<string, [number, number][]>();
    for (const key of highlightedResourceTiles) {
      const [x, y] = key.split(',').map(Number);
      const res = worldMap[y]?.[x]?.resources ?? {};
      let dtype: string | null = null;
      for (const t of selectedResourceTypes) {
        if ((res[t] ?? 0) > 0) {
          dtype = resourceObjectService.getById(t)?.designationTypes[0] ?? null;
          break;
        }
      }
      if (!dtype) continue;
      let bucket = byType.get(dtype);
      if (!bucket) byType.set(dtype, (bucket = []));
      bucket.push([x, y]);
    }
    for (const [type, tiles] of byType) {
      gameState.command({ type: 'designateTiles', payload: { tiles, type }, save: true });
    }
    drawDesignations();
  }

  /** CANCEL the highlighted multi-type tiles (the multi-resource card's button): clears the designation
   *  on each marked tile, keeping the highlight so DESIGNATE can re-apply. */
  function cancelMarkedMulti() {
    if (highlightedResourceTiles.size === 0) return;
    gameState.command({
      type: 'clearDesignationTiles',
      payload: {
        tiles: [...highlightedResourceTiles].map(
          (key) => key.split(',').map(Number) as [number, number]
        )
      },
      save: true
    });
    drawDesignations();
  }

  /** Drop the resource highlight + brush (the multi-resource card's CLEAR; also Escape). */
  function clearResourceMark() {
    highlightedResourceTiles = new Set();
    selectedResourceTypes = new Set();
    drawDesignations();
  }

  /** MARK button (pawn or mob card): begin a box-drag that just *highlights* a group — no action
   *  fires until the user presses the group verb (DRAFT/MOVE or HUNT). Clears any prior highlight. */
  function startMarkDrag(kind: 'pawn' | 'mob') {
    markKind = kind;
    markDragActive = false;
    markedKind = null;
    markedIds = [];
    markedSet = new Set();
    moveAimArmed = false;
  }

  /** End of the highlight drag: collect the living entities of the chosen kind inside the box. */
  function completeMarkDrag() {
    const minX = Math.min(markAnchorX, markEndX);
    const maxX = Math.max(markAnchorX, markEndX);
    const minY = Math.min(markAnchorY, markEndY);
    const maxY = Math.max(markAnchorY, markEndY);
    const inBox = (x?: number, y?: number) =>
      x != null && y != null && x >= minX && x <= maxX && y >= minY && y <= maxY;
    if (markKind === 'pawn') {
      markedIds = pawns
        .filter((p) => p.isAlive !== false && inBox(p.position?.x, p.position?.y))
        .map((p) => p.id);
    } else {
      markedIds = mobs
        .filter((m) => m.isAlive !== false && m.state !== 'Corpse' && inBox(m.x, m.y))
        .map((m) => m.id);
    }
    markedKind = markedIds.length > 0 ? markKind : null;
    markedSet = new Set(markedIds);
    markKind = null;
    markDragActive = false;
    // Cheap 2D-overlay repaint only (clears the drag box) — the per-entity highlight rides the
    // glyph grid in the per-frame render loop, so it follows the entity instead of staying behind.
    drawDesignations();
  }

  /** Drop the current highlight + any pending mark gesture. */
  function clearMark() {
    markKind = null;
    markDragActive = false;
    markedKind = null;
    markedIds = [];
    markedSet = new Set();
    moveAimArmed = false;
    moveAimActive = false;
    moveAimSlots = [];
    drawDesignations();
  }

  /** DRAFT verb: draft (or, when all are already drafted, undraft) the highlighted pawns. The
   *  highlight stays so MOVE can follow. */
  function draftMarkedPawns() {
    if (markedKind !== 'pawn' || markedIds.length === 0) return;
    gameState.command({
      type: 'draftPawns',
      payload: { ids: markedIds, drafted: !markedAllDrafted },
      save: true
    });
  }

  /** BUILD / HARVEST verb: force the highlighted colonists onto the nearest build/harvest job right now
   *  (overrides idle wandering, work-priority and restrict-zone gating), then clear the highlight. */
  function forceMarkedPawnsJob(jobType: 'construct' | 'harvest') {
    if (markedKind === 'pawn' && markedIds.length > 0) {
      gameState.command({ type: 'forcePawnJob', payload: { ids: markedIds, jobType }, save: true });
    }
    clearMark();
  }

  /** HUNT verb: queue every highlighted mob for hunting, then clear the highlight. */
  function huntMarkedMobs() {
    if (markedKind === 'mob' && markedIds.length > 0) {
      gameState.command({ type: 'markMobsForHunt', payload: { ids: markedIds }, save: true });
    }
    clearMark();
  }

  /** MOVE verb (info card / mark HUD): arm the Achtung aim, so the next press begins a move-line. */
  function armMoveAim() {
    if (moveAimCount > 0) moveAimArmed = true;
  }

  /** The pawns a MOVE aim commands: the marked drafted group if one is highlighted, else the single
   *  selected drafted pawn. (Mirrors {@link moveAimCount}.) */
  function moveAimIds(): string[] {
    if (markedKind === 'pawn' && markedDraftedCount > 0) {
      return pawns.filter((p) => p.drafted && markedSet.has(p.id)).map((p) => p.id);
    }
    if (selectedPawn?.drafted) return [selectedPawn.id];
    return [];
  }

  /** Whether a single drafted pawn could ATTACK something on (x,y) — a living mob or another pawn.
   *  Such a tile keeps its right-click attack menu instead of starting a move-aim. */
  function hasAttackTargetAt(x: number, y: number): boolean {
    if (mobs.some((m) => m.x === x && m.y === y && m.isAlive !== false)) return true;
    return pawns.some(
      (p) =>
        p.id !== selectedPawnId && p.position?.x === x && p.position?.y === y && p.isAlive !== false
    );
  }

  /** Begin the move-aim at the current hover tile (right-press, or armed left-press). */
  function startMoveAim() {
    moveAimActive = true;
    moveAimArmed = false;
    moveAimAnchorX = hoverTileX;
    moveAimAnchorY = hoverTileY;
    moveAimEndX = hoverTileX;
    moveAimEndY = hoverTileY;
    recomputeMoveAim();
    drawDesignations();
  }

  /** Recompute the live destination dots — the SAME formation the `movePawnsLine` command will apply,
   *  so what you see while dragging is exactly where they go. */
  function recomputeMoveAim() {
    const ids = moveAimIds();
    if (ids.length === 0) {
      moveAimSlots = [];
      return;
    }
    // Match the command's eligibility (drafted + on-map + not collapsed) so the dots == the real move.
    const aimPawns = pawns.filter(
      (p) => ids.includes(p.id) && p.position && p.currentState !== 'Collapsed'
    );
    const m = lineFormationTargets(
      worldMap,
      aimPawns,
      moveAimAnchorX,
      moveAimAnchorY,
      moveAimEndX,
      moveAimEndY
    );
    moveAimSlots = [...m.values()];
  }

  /** Release: a drag past ~1 tile spreads the group along the line (`movePawnsLine`); a near-stationary
   *  release is a click → compact block (`movePawnsFormation`, or a plain move for a single pawn). */
  function commitMoveAim() {
    const ids = moveAimIds();
    const ax = moveAimAnchorX;
    const ay = moveAimAnchorY;
    const bx = moveAimEndX;
    const by = moveAimEndY;
    moveAimActive = false;
    moveAimArmed = false;
    moveAimSlots = [];
    _aimCommitted = true; // the right-drag's trailing contextmenu must not also open a menu
    if (ids.length > 0 && bx >= 0 && by >= 0) {
      const dragLen = Math.abs(bx - ax) + Math.abs(by - ay);
      if (ids.length === 1) {
        gameState.command({
          type: 'setPawnDraftTarget',
          payload: { pawnId: ids[0], target: { type: 'move', x: bx, y: by } },
          save: true
        });
      } else if (dragLen >= 2) {
        gameState.command({ type: 'movePawnsLine', payload: { ids, ax, ay, bx, by }, save: true });
      } else {
        gameState.command({
          type: 'movePawnsFormation',
          payload: { ids, x: bx, y: by },
          save: true
        });
      }
    }
    drawDesignations();
  }

  function startSimilarSelect() {
    if (!selectedResourceTile || !selectedResourceDef) return;
    const dtype = (selectedResourceDef.designationTypes?.[0] ?? 'harvest') as DesignationType;
    similarDragResourceId = selectedResourceTile.resourceId;
    similarDragDesignationType = dtype;
    similarDragMode = true;
    similarDragActive = false;
    // Keep selectedResourceTile alive so the HUD stays visible after the drag.
  }

  function highlightSimilarTiles() {
    if (!selectedResourceTile) return;
    const resourceId = selectedResourceTile.resourceId;
    const newHighlighted = new Set<string>();
    for (const row of worldMap) {
      for (const tile of row) {
        if ((tile.resources?.[resourceId] ?? 0) > 0) {
          newHighlighted.add(`${tile.x},${tile.y}`);
        }
      }
    }
    highlightedResourceTiles = newHighlighted;
    drawDesignations();
  }

  function completeSimilarDrag() {
    const minX = Math.min(similarAnchorX, similarEndX);
    const maxX = Math.max(similarAnchorX, similarEndX);
    const minY = Math.min(similarAnchorY, similarEndY);
    const maxY = Math.max(similarAnchorY, similarEndY);
    // Collect matching tiles into the highlight set — don't designate yet.
    // The user presses the designation button to commit.
    const newHighlighted = new Set<string>();
    for (let ry = minY; ry <= maxY; ry++) {
      for (let rx = minX; rx <= maxX; rx++) {
        const wt = worldMap[ry]?.[rx];
        if ((wt?.resources?.[similarDragResourceId] ?? 0) > 0) {
          newHighlighted.add(`${rx},${ry}`);
        }
      }
    }
    highlightedResourceTiles = newHighlighted;
    similarDragActive = false;
    similarDragMode = false;
    drawDesignations();
  }

  let showShelterAssign = false;
  let showFuelSettings = false;
  let fuelSettingsForBuildingId: string | null = null;

  $: {
    const nextId = selectedBuilding?.id ?? null;
    if (nextId !== fuelSettingsForBuildingId) {
      showFuelSettings = false;
      fuelSettingsForBuildingId = nextId;
    }
  }

  function toggleFuelSettingsPanel() {
    showFuelSettings = !showFuelSettings;
  }

  // Colony food-filter fly-out (mirrors showFuelSettings): owned here, toggled by the pawn card's FOOD
  // button. Colony-wide (not per-pawn), but reset when the selected pawn changes so it doesn't linger.
  let showFoodSettings = false;
  let foodSettingsForPawnId: string | null = null;
  $: {
    const nextPawnId = selectedPawn?.id ?? null;
    if (nextPawnId !== foodSettingsForPawnId) {
      showFoodSettings = false;
      foodSettingsForPawnId = nextPawnId;
    }
  }
  function toggleFoodSettingsPanel() {
    showFoodSettings = !showFoodSettings;
  }

  // Stockpile zone FILTER fly-out (mirrors showFuelSettings): owned here, toggled by the card's
  // FILTER button, reset when the selected zone changes.
  let showZoneFilter = false;
  let zoneFilterForId: string | null = null;
  $: {
    const nextZoneId = selectedZoneId;
    if (nextZoneId !== zoneFilterForId) {
      showZoneFilter = false;
      zoneFilterForId = nextZoneId;
    }
  }

  function assignShelterPawn(pawnId: string | null) {
    if (!selectedBuilding) return;
    const id = selectedBuilding.id;
    gameState.command({ type: 'assignShelterPawn', payload: { id, pawnId }, save: true });
    showShelterAssign = false;
  }

  function togglePauseBlueprintBuilding() {
    if (!selectedBuilding) return;
    const id = selectedBuilding.id;
    gameState.command({ type: 'togglePausedBuilding', payload: { id }, save: true });
    redrawOverlay();
  }

  function handleMouseLeave() {
    dragging = false;
    zoneDragActive = false;
    blueprintDragActive = false;
    blueprintAnchorX = -1;
    blueprintAnchorY = -1;
    if (selDragActive) {
      // Cursor left mid-drag → commit the mark box where it stands (only a real box, not a stray click).
      selDragActive = false;
      if (selAnchorX !== selEndX || selAnchorY !== selEndY) {
        const kind = dragMarkKind();
        if (kind === 'resource') {
          commitResourceMarkRect(selAnchorX, selAnchorY, selEndX, selEndY);
        } else {
          markBoxEntities(kind, selAnchorX, selAnchorY, selEndX, selEndY);
        }
      }
      drawDesignations();
    }
    hoverTileX = -1;
    hoverTileY = -1;
    cursorOverCanvas = false;
    if (blueprintBuildingId) redrawOverlay();
  }

  // Right-click context menu (equip / pick-up / haul for a drafted pawn). null = hidden.
  let equipMenu: { x: number; y: number; entries: { label: string; run: () => void }[] } | null =
    null;

  // "Pick up X…" quantity popup — opened from a menu entry, captures the target so a later
  // selection change can't redirect the pickup. null = hidden.
  let qtyPrompt: {
    pawnId: string;
    dropId: string;
    name: string;
    max: number;
    value: number;
    x: number;
    y: number;
  } | null = null;

  function confirmQtyPickup() {
    if (!qtyPrompt) return;
    const n = Math.max(1, Math.min(qtyPrompt.max, Math.floor(qtyPrompt.value || 1)));
    gameState.pickUpItemFromTile(qtyPrompt.pawnId, qtyPrompt.dropId, n);
    qtyPrompt = null;
  }

  /** "mainHand" → "Main Hand", "bodyBase" → "Body Base" — friendly body-part label. */
  function slotLabel(slot: string): string {
    return slot
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }

  /** Right-click: clear designation at hovered tile (or drag-erase rect in zone mode). */
  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    if (menuPreview) return;
    // A right-press-drag/click that just committed a MOVE aim fires this contextmenu on release —
    // swallow it so the aim doesn't also pop the attack/move menu.
    if (_aimCommitted) {
      _aimCommitted = false;
      return;
    }
    equipMenu = null;
    if (hoverTileX < 0 || hoverTileY < 0) return;

    // ── Medical orders: right-click a hurt colonist → pop a context menu (same chrome the ranged/melee
    // target + equip actions use). Takes priority over draft orders / designation-clear.
    //   • COLLAPSED → "Carry to shelter": with a drafted pawn selected, THAT pawn does it (a drafted
    //     `rescue` order); otherwise the colony auto-dispatches its nearest free pawn (`rescuePawn`).
    //   • Untended wounds (collapsed OR standing) AND a drafted medic selected → "Emergency care now"
    //     (a drafted `tend` order — dresses/stops-the-bleeding on arrival, no need to carry first). ──
    if (!designationMode) {
      const target = findPawnAtTile(hoverTileX, hoverTileY);
      if (
        target &&
        target.id !== selectedPawn?.id &&
        target.isAlive !== false &&
        !target.carriedBy
      ) {
        const id = target.id;
        const medic = selectedPawn?.drafted ? selectedPawn : null;
        const issueOrder = (t: { type: string } & Record<string, unknown>) =>
          gameState.command({
            type: 'setPawnDraftTarget',
            payload: { pawnId: medic!.id, target: t },
            save: true
          });
        const entries: { label: string; run: () => void }[] = [];
        if (target.currentState === 'Collapsed') {
          entries.push({
            label: `Carry ${target.name} to shelter`,
            run: medic
              ? () => issueOrder({ type: 'rescue', victimId: id })
              : () =>
                  gameState.command({ type: 'rescuePawn', payload: { victimId: id }, save: true })
          });
        }
        // A drafted medic can be told to dress the wounds right where the patient lies — the answer for
        // a bleeding colonist that would die before a carry-to-shelter finishes.
        if (medic && hasUntendedWound(target, $gameState?.turn ?? 0)) {
          entries.push({
            label: `Emergency care for ${target.name} now`,
            run: () => issueOrder({ type: 'tend', patientId: id })
          });
        }
        if (entries.length > 0) {
          equipMenu = { x: e.clientX, y: e.clientY, entries };
          return;
        }
      }
    }

    // ── Draft mode: right-click issues orders ────────────────────────────────
    if (selectedPawn?.drafted) {
      // Issue an attack order; `mode` forces melee/ranged (undefined = auto).
      const issueAttack = (
        targetId: string,
        targetType: 'pawn' | 'mob',
        mode?: 'ranged' | 'melee'
      ) =>
        gameState.command({
          type: 'setPawnDraftTarget',
          payload: {
            pawnId: selectedPawn.id,
            target: { type: 'attack', targetId, targetType, mode }
          },
          save: true
        });
      // A pawn holding a ranged weapon gets a ranged/melee choice; a melee-only pawn just attacks.
      const canShoot = !!getRangedWeapon(selectedPawn as never);
      const offerAttack = (targetId: string, targetType: 'pawn' | 'mob') => {
        if (!canShoot) {
          issueAttack(targetId, targetType);
          return;
        }
        equipMenu = {
          x: e.clientX,
          y: e.clientY,
          entries: [
            { label: 'Target (ranged)', run: () => issueAttack(targetId, targetType, 'ranged') },
            { label: 'Target (melee)', run: () => issueAttack(targetId, targetType, 'melee') }
          ]
        };
      };

      const targetMob = mobs.find(
        (m) => m.x === hoverTileX && m.y === hoverTileY && m.isAlive !== false
      );
      if (targetMob) {
        offerAttack(targetMob.id, 'mob');
        return;
      }
      const targetPawn = pawns.find(
        (p) =>
          p.id !== selectedPawn.id &&
          p.position?.x === hoverTileX &&
          p.position?.y === hoverTileY &&
          p.isAlive !== false
      );
      if (targetPawn) {
        offerAttack(targetPawn.id, 'pawn');
        return;
      }
      const pawnId = selectedPawn.id;
      // Capture the clicked tile NOW — `hoverTileX/Y` track the cursor and change (or reset to -1)
      // the moment the cursor moves onto the menu, so a deferred "Move here" must use these snapshots.
      const tileX = hoverTileX;
      const tileY = hoverTileY;
      // This branch only runs for a SINGLE selected pawn on a tile that carries a menu (items here, or
      // an attack target above) — group moves and empty-tile moves go through the right-drag aim. So
      // "Move here" is just the selected pawn.
      const issueMove = () => {
        gameState.command({
          type: 'setPawnDraftTarget',
          payload: { pawnId, target: { type: 'move', x: tileX, y: tileY } },
          save: true
        });
      };

      // Any item on the tile opens a menu (equip / pick-up / haul entries + a Move option), so the
      // menu never silently loses to a move order. Empty tile → move straight away.
      const tileItems = droppedItems.filter(
        (d) => d.x === tileX && d.y === tileY && d.quantity > 0
      );
      if (tileItems.length > 0) {
        const entries: { label: string; run: () => void }[] = [];
        for (const d of tileItems) {
          const it = itemService.getItemById(d.resourceId);
          if (!it) continue;
          const name = itemService.getItemDisplayName(d);
          const slot = getEquipmentSlot(it);
          if (slot) {
            // Equippable gear → ORDER the drafted pawn to walk to the item and equip it (handled by the
            // 'equip' draft target in _processDraftOrders), not an instant teleport-equip. `target` picks
            // the destination: a specific equipment slot, 'inventory' (carry), or undefined (auto-resolve).
            const equipOrder = (target?: EquipmentSlot | 'inventory') =>
              gameState.command({
                type: 'setPawnDraftTarget',
                payload: {
                  pawnId,
                  target: { type: 'equip', dropId: d.id, x: tileX, y: tileY, slot: target }
                },
                save: true
              });
            if (it.type === 'weapon') {
              // A one-handed weapon may go in EITHER hand; a two-hander only in the main hand.
              entries.push({
                label: `Equip ${name} → Main Hand`,
                run: () => equipOrder('mainHand')
              });
              if (!it.weaponProperties?.twoHanded) {
                entries.push({
                  label: `Equip ${name} → Off Hand`,
                  run: () => equipOrder('offHand')
                });
              }
            } else if (it.type === 'tool') {
              // A tool can be WIELDED in hand, or CARRIED in the pack so a weapon can stay in hand —
              // a carried tool still grants its work boost (heldToolBoost reads inventory too).
              entries.push({
                label: `Equip ${name} → Main Hand`,
                run: () => equipOrder('mainHand')
              });
              entries.push({
                label: `Carry ${name} (inventory)`,
                run: () => equipOrder('inventory')
              });
            } else {
              // Armour / shields / rings → their canonical slot (undefined = auto-resolve, so a 2nd
              // ring still pairs into the free ring slot instead of swapping the first).
              entries.push({
                label: `Equip ${name} → ${slotLabel(slot)}`,
                run: () => equipOrder()
              });
            }
            continue;
          }
          // Non-equippable → three pick-up tiers into the pawn's inventory.
          const qty = Math.floor(d.quantity);
          entries.push({
            label: `Pick up 1 ${name}`,
            run: () => gameState.pickUpItemFromTile(pawnId, d.id, 1)
          });
          if (qty > 1) {
            entries.push({
              label: `Pick up X ${name}…`,
              run: () => {
                qtyPrompt = {
                  pawnId,
                  dropId: d.id,
                  name,
                  max: qty,
                  value: qty,
                  x: e.clientX,
                  y: e.clientY
                };
              }
            });
            entries.push({
              label: `Pick up all ${name} (×${qty})`,
              run: () => gameState.pickUpItemFromTile(pawnId, d.id, qty)
            });
          }
        }
        // Haul the loose stack to a stockpile (multi-trip), if one exists and this tile isn't one.
        const looseHere = tileItems.some((d) => !d.stored && !d.reservedFor);
        const tileIsStockpile = (zoneTiles[`${tileX},${tileY}`] ?? []).includes('stockpile');
        const stockpileExists = Object.values(zoneTiles).some((t) => t.includes('stockpile'));
        if (looseHere && stockpileExists && !tileIsStockpile) {
          entries.push({
            label: 'Haul to stockpile',
            run: () => gameState.haulTileToStockpile(pawnId, tileX, tileY)
          });
        }
        equipMenu = {
          x: e.clientX,
          y: e.clientY,
          entries: [...entries, { label: 'Move here', run: issueMove }]
        };
        return;
      }

      // Empty tile — move straight away.
      issueMove();
      return;
    }

    if (designationMode) {
      // In zone mode, right-click clears a zone tile
      gameState.command({
        type: 'clearDesignation',
        payload: { x: hoverTileX, y: hoverTileY },
        save: true
      });
      redrawOverlay();
    } else if (designationService.getDesignation(hoverTileX, hoverTileY, $gameState)) {
      // Outside zone mode, right-click cancels the ACTION order only — leave any restrict/stockpile
      // zone the tile belongs to intact (full clearDesignation here used to silently shrink zones).
      gameState.command({
        type: 'clearActionDesignation',
        payload: { x: hoverTileX, y: hoverTileY },
        save: true
      });
      redrawOverlay();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="canvas-wrap"
  class:dragging
  bind:this={container}
  tabindex="0"
  role="application"
  aria-label="World map"
  on:keydown={handleKeyDown}
  on:mousedown={handleMouseDown}
  on:mousemove={handleMouseMove}
  on:mouseup={handleMouseUp}
  on:mouseleave={handleMouseLeave}
  on:wheel={handleWheel}
  on:contextmenu={handleContextMenu}
>
  <canvas bind:this={canvas}></canvas>
  <canvas bind:this={designCanvas} class="desig-layer"></canvas>

  {#if errorMsg}
    <div class="error">WebGL unavailable: {errorMsg}</div>
  {/if}
  <!-- No "Initializing renderer…" screen: the single page-level loading overlay (+page.svelte) stays
       up past rendererReady (until the paused warmup linger ends), so WebGL init happens behind it. -->

  {#if debugBrush}
    <div class="designation-hud" style:border-color="#c8a048" style:color="#e0b868">
      [DEBUG: {debugBrush.kind === 'regrow'
        ? 'REGROW'
        : debugBrush.kind === 'building'
          ? 'SPAWN BUILDING'
          : 'SPAWN RESOURCE'}] click tiles to apply · Esc to stop
    </div>
  {:else if designationMode}
    <div
      class="designation-hud"
      style:border-color={zoneEraseMode ? '#cc3322' : undefined}
      style:color={zoneEraseMode ? '#ff6655' : undefined}
    >
      {#if zoneEraseMode}
        [ERASE] drag to remove · X to paint · Esc cancel
      {:else}
        [{designationTypeActive.toUpperCase()}] drag to paint · X to erase · Esc cancel
      {/if}
      {#if zoneDragActive}
        — {zoneEraseMode ? 'erasing' : 'selecting'} ({Math.abs(zoneEndX - zoneAnchorX) +
          1}×{Math.abs(zoneEndY - zoneAnchorY) + 1})
      {/if}
    </div>
  {:else if selDragActive}
    <div class="designation-hud" style:color="#ffd66a" style:border-color="#ffd66a">
      [⊞ MARK {dragMarkKind() === 'resource'
        ? 'RESOURCES'
        : dragMarkKind() === 'mob'
          ? 'CREATURES'
          : 'PAWNS'}] ({Math.abs(selEndX - selAnchorX) + 1}×{Math.abs(selEndY - selAnchorY) + 1}) —
      release to mark · Esc cancel
    </div>
  {:else if blueprintBuildingId}
    <div class="designation-hud">
      [◆ {buildingService.getBuildingById(blueprintBuildingId)?.name ??
        blueprintBuildingId}]{#if blueprintDragActive}
        ({Math.abs(hoverTileX - blueprintAnchorX) + 1}×{Math.abs(hoverTileY - blueprintAnchorY) +
          1}){/if} — drag a box to fill · stays active · Esc cancel
    </div>
  {:else if similarDragMode}
    <div class="designation-hud">
      [⊞ SELECT {similarDragResourceId.replace(/_/g, ' ').toUpperCase()}] — drag to designate all ·
      Esc cancel{#if similarDragActive}
        — ({Math.abs(similarEndX - similarAnchorX) + 1}×{Math.abs(similarEndY - similarAnchorY) +
          1}){/if}
    </div>
  {:else if markKind}
    <div class="designation-hud" style:color="#ffc85a" style:border-color="#ffc85a">
      [⊞ MARK {markKind === 'pawn' ? 'PAWNS' : 'ENTITIES'}] — drag a box to highlight · Esc cancel{#if markDragActive}
        — ({Math.abs(markEndX - markAnchorX) + 1}×{Math.abs(markEndY - markAnchorY) + 1}){/if}
    </div>
  {:else if moveAimActive}
    <div class="designation-hud" style:color="#ffc85a" style:border-color="#ffc85a">
      [⊞ MOVE] — drag a line, release to spread {moveAimCount} drafted pawn{moveAimCount !== 1
        ? 's'
        : ''} along it · Esc cancel
    </div>
  {:else if moveAimArmed}
    <div class="designation-hud" style:color="#ffc85a" style:border-color="#ffc85a">
      [⊞ MOVE] — right-drag a line (or click) to send {moveAimCount} drafted pawn{moveAimCount !== 1
        ? 's'
        : ''} · Esc cancel
    </div>
  {/if}
  <!-- Info HUD (selection + hover cards + tile tooltip). Entirely suppressed while the Custom Map
       popup is open OR in the menu backdrop — neither inspects entities. A committed MARK group takes
       priority over any single selection — its summary card (markedGroupCard) carries the group verbs. -->
  {#if !customMapPreview && !menuPreview}
    {#if markedGroupCard}
      <!-- Group summary for a MARK highlight: names + DRAFT/UNDRAFT/MOVE (or HUNT) + CLEAR. -->
      <SelectedEntityCard model={markedGroupCard} />
    {:else if selectedPawnCard}
      <!-- Selected pawn card + the colony FOOD filter fly-out, laid out exactly like the building card +
           fuel panel so the FOOD button's fly-out anchors above the card. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="bld-row"
        role="presentation"
        on:mousedown|stopPropagation
        on:mouseup|stopPropagation
      >
        <SelectedEntityCard model={selectedPawnCard} embedded />
        <FoodFilterPanel open={showFoodSettings} />
      </div>
    {:else if selectedMobCard}
      <!-- Selected mob/animal card — locked to this creature regardless of hover -->
      <SelectedEntityCard model={selectedMobCard} />
    {:else if selectedBuilding}
      {@const canConfigureFuel =
        selectedBuilding.status === 'complete' &&
        !selectedBuilding.deconstructQueued &&
        buildingService.getBuildingById(selectedBuilding.type)?.maxFuel !== undefined}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="bld-row"
        role="presentation"
        on:mousedown|stopPropagation
        on:mouseup|stopPropagation
      >
        {#if buildingCard}
          <SelectedEntityCard model={buildingCard} embedded />
        {/if}
        {#if canConfigureFuel}
          <BuildingFuelPanel building={selectedBuilding} {pawns} open={showFuelSettings} />
        {/if}
      </div>
    {:else if selectedZone && zoneCard}
      <!-- Stockpile zone: shared SelectedEntityCard chrome (FILTER/DRAW/CLEAR in the button column)
           plus the FILTER fly-out, laid out exactly like the building card + fuel panel. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="bld-row"
        role="presentation"
        on:mousedown|stopPropagation
        on:mouseup|stopPropagation
      >
        <SelectedEntityCard model={zoneCard} embedded />
        <StockpileZonePanel
          instanceId={selectedZone.id}
          filter={selectedZone.filter}
          inventory={selectedZoneInventory}
          open={showZoneFilter}
        />
      </div>
    {:else if selectedItemCard}
      <!-- Click-locked dropped item card (from the tile click-cycle), above the hover/resource cards -->
      <SelectedEntityCard model={selectedItemCard} />
    {:else if multiResourceCard}
      <!-- Multi-type resource MARK summary (2+ Shift-selected kinds) — takes priority over the single. -->
      <SelectedEntityCard model={multiResourceCard} />
    {:else if resourceCard}
      <SelectedEntityCard model={resourceCard} />
    {:else if hoverPawnCard}
      <SelectedEntityCard model={hoverPawnCard} />
    {:else if hoverMobCard}
      <SelectedEntityCard model={hoverMobCard} />
    {:else if hoverBuilding && !hoverPawn}
      {@const bDef = buildingService.getBuildingById(hoverBuilding.type)}
      {@const isBlueprint = hoverBuilding.status !== 'complete'}
      <div class="tile-hud tile-hud--building">
        <div class="bld-header">
          <span class="bld-name">{bDef?.name ?? hoverBuilding.type}</span>
          <span class="bld-status">
            [{isBlueprint
              ? hoverBuilding.paused
                ? 'paused'
                : 'building'
              : 'complete'}{hoverBuilding.deconstructQueued ? ' ⊢ demolish' : ''}]
          </span>
        </div>
        {#if isBlueprint}
          {@const workDone = hoverBuilding.workDone ?? 0}
          {@const workReq = hoverBuilding.workRequired ?? bDef?.workAmount ?? 1}
          <div class="bld-progress">
            [{jobProgressBar(workReq > 0 ? workDone / workReq : 0)}] {Math.round(
              workDone
            )}/{workReq} work
          </div>
        {:else if hoverBuilding.deconstructQueued}
          {@const dDone = hoverBuilding.deconstructWorkDone ?? 0}
          {@const dReq = hoverBuilding.deconstructWorkRequired ?? 1}
          <div class="bld-progress">
            [{jobProgressBar(dReq > 0 ? dDone / dReq : 0)}] {Math.round(dDone)}/{dReq} work
          </div>
          <div class="bld-note">⊢ demolishing…</div>
        {/if}
        {#if bDef?.description}
          <div class="bld-desc">{bDef.description}</div>
        {/if}
        {#if !isBlueprint && !hoverBuilding.deconstructQueued && bDef?.maxFuel !== undefined}
          {@const fuelMax = bDef.maxFuel}
          {@const fuelCurr = hoverBuilding.fuel ?? 0}
          <div class="bld-fuel">
            FUEL [{jobProgressBar(fuelMax > 0 ? fuelCurr / fuelMax : 0)}] {Math.floor(
              fuelCurr
            )}/{Math.floor(fuelMax)}
            {#if hoverBuilding.lit}<span class="fuel-lit">● lit</span>{:else}<span class="fuel-dark"
                >○ unlit</span
              >{/if}
          </div>
        {/if}
        {#if hoverTile}
          {@const env = tileEnv(hoverTile)}
          <div class="tile-env">
            <span
              style="color:{env.light >= 0.8
                ? '#68b030'
                : env.light >= 0.4
                  ? '#b09030'
                  : '#c83018'}">light {Math.round(env.light * 100)}%</span
            >
            <span style="color:{env.temp <= 0 ? '#5aa0e0' : env.temp >= 30 ? '#e07a2a' : '#b0a060'}"
              >temp {env.temp}°C</span
            >
            <span style="color:{env.wet >= 60 ? '#3a9ed0' : env.wet >= 30 ? '#6aa0a0' : '#a08a5a'}"
              >wet {Math.round(env.wet)}%</span
            >
            <span style="color:#9aa6b2">wind {env.wind}</span>
          </div>
        {/if}
      </div>
    {:else if hoverItemCard}
      <!-- Dropped item on the hovered tile — shared SelectedEntityCard, bars below the title -->
      <SelectedEntityCard model={hoverItemCard} />
    {:else if hoverTile}
      {@const tileThermal = computeThermalAt(hoverTile.x, hoverTile.y, buildings, worldMap)}
      {@const tileTemp = Math.round(
        tileTemperature(hoverTile.terrainType, $currentSeason, $currentWeather, tileThermal)
      )}
      {@const tileWet = tileWetness(hoverTile.moisture ?? 0, $currentWeather, tileThermal)}
      {@const windWord = windDegreeWord(
        effectiveWindAt(hoverTile.x, hoverTile.y, $currentWeather, tileThermal, worldMap)
      )}
      {@const tileSnow = Math.round(hoverTile.snow ?? 0)}
      {@const soilTier = soilTierForTile(hoverTile)}
      {@const soilPct = soilFertilityPct(hoverTile)}
      <div class="tile-hud">
        <span class="tile-coord">({hoverTile.x},{hoverTile.y})</span><span class="tile-layers"
          >{BIOMES[hoverTile.terrainType]?.displayName ?? hoverTile.terrainType},{SUBTERRAINS[
            hoverTile.subType
          ]?.displayName ?? hoverTile.subType},{hoverDisplayResource
            ? (resourceObjectService.getById(hoverDisplayResource)?.displayName ??
              hoverDisplayResource)
            : '—'}</span
        >
        {#if !hoverTile.walkable}
          <div class="tile-move" style="color:#cc4444">move: impassable</div>
        {:else}
          {@const effMoveCost = (hoverTile.movementCost ?? 1) * (1 + tileSnow / 100)}
          {@const mc = moveCostLabel(effMoveCost)}
          <div class="tile-move" style="color:{mc.color}">
            move ×{effMoveCost.toFixed(1)}{#if tileSnow > 0}<span style="color:#cdd6e0">
                (snow)</span
              >{/if}
          </div>
        {/if}
        {#if hoverZoneType && ZONE_META[hoverZoneType]}
          <div class="tile-zone" style="color:{ZONE_META[hoverZoneType].color}">
            {ZONE_META[hoverZoneType].label} — {ZONE_META[hoverZoneType].desc}
          </div>
        {/if}
        <div class="tile-env">
          <span
            style="color:{hoverTileLight >= 0.8
              ? '#68b030'
              : hoverTileLight >= 0.4
                ? '#b09030'
                : '#c83018'}">light {Math.round(hoverTileLight * 100)}%</span
          >
          {#if hoverDisplayResource}
            {@const growRes = resourceObjectService.getById(hoverDisplayResource)}
            {#if growRes && isGrowableResource(growRes)}
              {@const gpct = Math.round(hoverTile.growth?.[hoverDisplayResource] ?? 100)}
              <span
                style="color:{gpct >= 100 ? '#68b030' : gpct >= 50 ? '#9aac3a' : '#c89a3a'}"
                title="resource maturity — scales harvest yield; crops grow only with enough fertility, warmth, water and light"
                >growth {gpct}%</span
              >
            {/if}
          {/if}
        </div>
        <div class="tile-env">
          <span style="color:{tileTemp <= 0 ? '#5aa0e0' : tileTemp >= 30 ? '#e07a2a' : '#b0a060'}"
            >temp {tileTemp}°C</span
          >
          <span style="color:{tileWet >= 60 ? '#3a9ed0' : tileWet >= 30 ? '#6aa0a0' : '#a08a5a'}"
            >wet {Math.round(tileWet)}%</span
          >
          <span
            style="color:{soilTier >= 4
              ? '#6fae3a'
              : soilTier === 3
                ? '#86ac3a'
                : soilTier === 2
                  ? '#9aac3a'
                  : soilTier === 1
                    ? '#a89a4a'
                    : '#8a7a5a'}"
            title="soil fertility ({SOIL_TIER_NAME[
              soilTier
            ]}) — drives what crops grow here and how fast">fertility {soilPct}%</span
          >
          {#if tileSnow > 0}<span style="color:#cdd6e0">snow {tileSnow}%</span>{/if}
          {#if windWord}<span style="color:#8fc8a0">{windWord} windy</span>{/if}
          {#if tileThermal.roofed}<span style="color:#7e9fbf">roofed</span>{/if}
        </div>
      </div>
    {/if}
  {/if}

  {#if equipMenu}
    <!-- backdrop closes the menu on any outside click / right-click -->
    <div
      class="ctx-backdrop"
      role="presentation"
      on:click={() => (equipMenu = null)}
      on:contextmenu|preventDefault={() => (equipMenu = null)}
    ></div>
    <div class="ctx-menu" style="left:{equipMenu.x}px; top:{equipMenu.y}px">
      {#each equipMenu.entries as entry}
        <button
          class="ctx-item"
          on:click={() => {
            entry.run();
            equipMenu = null;
          }}>{entry.label}</button
        >
      {/each}
    </div>
  {/if}

  {#if qtyPrompt}
    <!-- backdrop closes the prompt on any outside click / right-click -->
    <div
      class="ctx-backdrop"
      role="presentation"
      on:click={() => (qtyPrompt = null)}
      on:contextmenu|preventDefault={() => (qtyPrompt = null)}
    ></div>
    <div class="ctx-menu qty-prompt" style="left:{qtyPrompt.x}px; top:{qtyPrompt.y}px">
      <div class="qty-label">Pick up {qtyPrompt.name} (max {qtyPrompt.max})</div>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="qty-input"
        type="number"
        min="1"
        max={qtyPrompt.max}
        bind:value={qtyPrompt.value}
        on:keydown={(ev) => {
          if (ev.key === 'Enter') confirmQtyPickup();
          else if (ev.key === 'Escape') qtyPrompt = null;
        }}
        autofocus
      />
      <div class="qty-actions">
        <button class="ctx-item" on:click={confirmQtyPickup}>OK</button>
        <button class="ctx-item" on:click={() => (qtyPrompt = null)}>Cancel</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 998;
  }
  .ctx-menu {
    position: fixed;
    z-index: 999;
    display: flex;
    flex-direction: column;
    min-width: 160px;
    background: var(--bg-panel);
    border: 1px solid var(--border-hi);
    border-radius: 2px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    /* Day/night hue + weather desaturation, matching the chrome panels and info card
       (see +page.svelte #ambient-tint) — the drafted-pawn equip/pick-up menu. */
    filter: url(#ambient-tint);
  }
  .ctx-item {
    text-align: left;
    padding: 5px 10px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }
  .ctx-item:last-child {
    border-bottom: none;
  }
  .ctx-item:hover {
    background: var(--bg-active);
    color: var(--accent-hi);
  }
  .qty-prompt {
    padding: 6px;
    gap: 6px;
  }
  .qty-label {
    font-size: 11px;
    color: var(--text);
    white-space: nowrap;
  }
  .qty-input {
    width: 100%;
    box-sizing: border-box;
    padding: 3px 6px;
    background: var(--bg);
    border: 1px solid var(--border-hi);
    color: var(--text);
    font-size: 12px;
    font-family: inherit;
  }
  .qty-actions {
    display: flex;
    gap: 6px;
  }
  .qty-actions .ctx-item {
    flex: 1;
    text-align: center;
    border: 1px solid var(--border-hi);
    border-bottom: 1px solid var(--border-hi);
  }

  .canvas-wrap {
    position: relative;
    width: 100%;
    height: 100%;
    background: #050706;
    overflow: hidden;
    outline: none;
    cursor: var(--app-cursor), crosshair;
    user-select: none;
  }
  .canvas-wrap.dragging {
    cursor: var(--app-cursor), grabbing;
  }
  .desig-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
    image-rendering: pixelated;
    /* Sit the zone tints / designations / resource highlight / selection markings UNDER the day/night
       + weather filter, like the WebGL terrain (shader-dimmed) and the panels (#ambient-tint). Without
       this the 2D overlay glowed at full brightness at night while everything else dimmed — animal
       highlighting (baked into the dimmed WebGL render) already sat behind it; now the rest matches. */
    filter: url(#ambient-tint);
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
  .error {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 12px;
  }
  /* NT-U3: every hover/selection panel shares the building reference width (300px, fixed)
     so no info panel is narrower or wider than another; long content wraps inside the box. */
  .tile-hud {
    position: absolute;
    bottom: 6px;
    left: 6px;
    width: 300px;
    box-sizing: border-box;
    background: rgba(28, 16, 6, 0.92);
    border: 1px solid #6b4a2a;
    color: #a07840;
    font-family: var(--font-mono);
    font-size: 10px;
    line-height: 1.5;
    padding: 2px 7px;
    pointer-events: none;
    white-space: normal;
    overflow-wrap: break-word;
    z-index: 10;
    /* Day/night hue + weather desaturation, matching the chrome panels and selection card
       (see +page.svelte #ambient-tint) — tile inspector / hover-building info panels. */
    filter: url(#ambient-tint);
  }

  .tile-zone {
    font-size: 9px;
    margin-top: 1px;
  }
  .tile-move {
    font-size: 9px;
    margin-top: 1px;
  }
  .tile-env {
    font-size: 9px;
    margin-top: 1px;
    display: flex;
    gap: 8px;
  }
  .designation-hud {
    position: absolute;
    top: 6px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 20, 10, 0.92);
    border: 1px solid #3aaa60;
    color: #50ee80;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: bold;
    padding: 3px 10px;
    pointer-events: none;
    white-space: nowrap;
    z-index: 10;
  }
  /* (The MARK group action HUD was folded into the shared SelectedEntityCard — see markedGroupCard.) */
  /* ── Building HUD card ─────────────────────────── */
  .tile-hud--building {
    /* width comes from .tile-hud (NT-U3 shared 300px) */
    pointer-events: none;
  }
  .bld-row {
    position: absolute;
    bottom: 6px;
    left: 6px;
    display: flex;
    align-items: stretch;
    gap: 4px;
    pointer-events: all;
  }
  .bld-header {
    display: flex;
    gap: 5px;
    align-items: baseline;
    margin-bottom: 2px;
  }
  .bld-name {
    color: #c8a060;
    font-weight: bold;
    font-size: 11px;
  }
  .bld-status {
    color: #7a6030;
    font-size: 9px;
    flex: 1;
  }
  .bld-desc {
    color: #8a7040;
    font-size: 9px;
    margin-top: 1px;
    line-height: 1.4;
  }
  .bld-progress {
    color: #a08840;
    font-size: 9px;
    margin-top: 2px;
  }
  .bld-note {
    color: #cc8833;
    font-size: 9px;
    margin-top: 2px;
  }
  .bld-fuel {
    color: #c87020;
    font-size: 9px;
    margin-top: 3px;
    font-family: var(--font-mono);
    letter-spacing: 0.02em;
  }
  .fuel-lit {
    color: #ff8800;
    margin-left: 4px;
  }
  .fuel-dark {
    color: #604020;
    margin-left: 4px;
  }
  .tile-coord {
    color: #e8b86a;
    font-weight: bold;
    margin-right: 5px;
  }
  .tile-layers {
    color: #b08848;
  }
  .error {
    color: #c04040;
  }
</style>
