<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { browser } from '$app/environment';
  import { wasdPan, debugMode } from '$lib/stores/uiPrefs';
  import { WebGLRenderer } from '$lib/webgl/renderer.js';
  import { crashBreadcrumb } from '$lib/webgl/crashLog.js';
  import { startFreezeWatchdog, beat, stopFreezeWatchdog } from '$lib/webgl/freezeWatchdog.js';
  import {
    applyTileToGrid,
    applyResourceToGrid,
    applySnowToGrid,
    applyBuildingToGrid,
    resourceSeasonChanges,
    isRoofBuilding,
    isFloorBuilding,
    generatePlaceholderGrid,
    updateHiddenMaskAt,
    type HiddenMaskState,
    type TileCoord
  } from '$lib/webgl/fantasia-world.js';
  import {
    drainRenderTileDeltas,
    drainSnowRenderTileDeltas,
    clearRenderTileDeltas
  } from '$lib/components/UI/canvas/mainTileDeltas';
  import { fullRebuildTerrain } from '$lib/components/UI/canvas/terrainPaint';
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
  import { pawnService } from '$lib/game/services/PawnService.js';
  import {
    buildPathfindingGrids,
    pathfinderService
  } from '$lib/game/services/PathfinderService.js';
  import { designationService } from '$lib/game/services/DesignationService.js';
  import {
    environmentService,
    computeTileLightLevel,
    tileTemperature,
    seasonBakedTemp,
    tileWetness,
    computeThermalAt,
    effectiveWindAt,
    windDegreeWord,
    ICE_VISIBLE
  } from '$lib/game/services/EnvironmentService.js';
  import { lightingService } from '$lib/game/services/LightingService.js';
  import { glyph, SHEET } from '$lib/webgl/tilesets.js';
  import { uiState } from '$lib/stores/uiState.js';
  import { worldEffects } from '$lib/stores/fx/worldEffects.js';
  import type { GlyphFloat, GlyphFloatKind } from '$lib/stores/fx/worldEffects.js';
  import { combatFeedback, floatTtl, type CombatTextEvent } from '$lib/stores/fx/combatFeedback.js';
  import { animNow, setAnimPaused } from '$lib/stores/fx/animClock.js';
  import {
    attackLunges,
    LUNGE_TTL_MS,
    type AttackLungeEvent
  } from '$lib/stores/fx/attackLunges.js';
  import { projectiles, type ProjectileEvent } from '$lib/stores/fx/projectiles.js';
  import { renderFps } from '$lib/stores/perfStats.js';
  import { buildingService } from '$lib/game/services/BuildingService.js';
  import { roomFor } from '$lib/game/core/rules/gear/vessels';
  import {
    resolveCharSpans,
    BIOMES,
    SUBTERRAINS,
    soilFertilityPct,
    soilTierForTile,
    SOIL_TIER_NAME
  } from '$lib/game/core/defs/terrains.js';
  import {
    resourceObjectService,
    isGrowableResource
  } from '$lib/game/services/ResourceObjectService.js';
  import { RESOURCE_VISIBLE_GROWTH } from '$lib/game/core/rules/world/wildGrowth.js';
  import { cropGrowthDirection } from '$lib/game/core/rules/world/cropHealth.js';
  import { isHarvestableTileNow, MIN_FORAGE_GROWTH } from '$lib/game/services/jobs/filters.js';
  import { itemService } from '$lib/game/services/ItemService.js';
  import { jobService } from '$lib/game/services/JobService.js';
  import { isEdibleFood } from '$lib/game/services/foodRules.js';
  import { getEquipmentSlot } from '$lib/game/core/rules/gear/equipment.js';
  import { getRangedWeapon } from '$lib/game/systems/rangedCombat.js';
  import { needsRecovery } from '$lib/game/systems/pawn/pawnHelpers';
  import { hasUntendedWound } from '$lib/game/services/jobs/caretake';
  import { conditionPriority } from '$lib/game/core/rules/body/conditions';
  import { getCreatureById } from '$lib/game/core/defs/creatures.js';
  import { TICKS_PER_SECOND } from '$lib/game/core/util/time.js';
  import { vlog } from '$lib/game/core/util/logSink.js';
  import { simTarget } from '$lib/game/services/MovementSystem.js';
  import SelectedEntityCard from '$lib/components/UI/hud/SelectedEntityCard.svelte';
  import type {
    SelectedEntityModel,
    EntityBar,
    EntityButton
  } from '$lib/components/UI/hud/SelectedEntityCard.svelte';
  import {
    SHEET_CELL_W,
    SHEET_CELL_H,
    getSheet,
    loadSheet,
    onSheetLoaded,
    type SheetName
  } from '$lib/components/UI/canvas/spriteSheets';
  import { redrawHudSpriteIcons } from '$lib/components/UI/canvas/hudSpriteIcon';
  import BuildingFuelPanel from '$lib/components/UI/canvas/BuildingFuelPanel.svelte';
  import BuildingRepairPanel from '$lib/components/UI/canvas/BuildingRepairPanel.svelte';
  import BuildingStoragePanel from '$lib/components/UI/canvas/BuildingStoragePanel.svelte';
  import FoodFilterPanel from '$lib/components/UI/canvas/FoodFilterPanel.svelte';
  import StockpileZonePanel from '$lib/components/UI/canvas/StockpileZonePanel.svelte';
  import EnvReadout from '$lib/components/UI/canvas/EnvReadout.svelte';
  import BuildingInfo from '$lib/components/UI/canvas/BuildingInfo.svelte';
  import {
    buildPawnCard,
    buildMobCard,
    dryingIndicator,
    growthIndicator,
    PROGRESS_BAR_STATES
  } from '$lib/components/UI/canvas/selectionCard';
  import { overlayDroppedItems, overlayBuildings } from '$lib/components/UI/canvas/overlay';
  import { buildingsVisualSig } from '$lib/game/core/state/buildingSig';
  import { lineFormationTargets } from '$lib/game/sim/commands';
  import type { ItemPillView } from '$lib/components/UI/widget/ItemPills.svelte';
  import itemsData from '$lib/game/database/items/items.jsonc';

  const ITEMS_DATABASE = itemsData as unknown as Item[];

  export let menuPreview = false;
  const MENU_PREVIEW_ZOOM = 2;
  const TIER_GLYPH_SCALE: Record<number, number> = { 1: 0.5, 2: 1, 3: 1.15, 4: 1.3, 5: 1.4 };
  const TIER_GLYPH_TINT: Record<number, number> = { 1: 0.72, 2: 1, 3: 1.1, 4: 1.2, 5: 1.35 };
  let _previewPainted = false;

  const MAP_W = 240;
  const MAP_H = 160;
  const MAX_TILE_W = 64;
  const ZOOM_STEP = 2;
  const CAMERA_STORAGE_KEY = 'fantasia4x-camera';
  let saveCameraTimer: ReturnType<typeof setTimeout> | null = null;

  let fitTileSize = 8;
  let tileWidth = 8;
  let tileHeight = 8;
  $: cameraTileSize.set(tileWidth);
  $: cameraZoomRange.set({ min: fitTileSize, max: MAX_TILE_W });
  $: cameraViewport.set({
    x: viewX,
    y: viewY,
    w: (container?.clientWidth ?? 0) / tileWidth,
    h: (container?.clientHeight ?? 0) / tileHeight
  });

  function computeFitTileSize(canvasW: number, canvasH: number): number {
    const mapW = worldMap.length > 0 ? worldMap[0].length : MAP_W;
    const mapH = worldMap.length > 0 ? worldMap.length : MAP_H;
    return Math.max(canvasW / mapW, canvasH / mapH);
  }

  let canvas: HTMLCanvasElement;
  let designCanvas: HTMLCanvasElement;
  let _ambientLight = 1;
  let _ambientTint: [number, number, number] = [1, 1, 1];
  let container: HTMLDivElement;
  let renderer: WebGLRenderer | null = null;
  let animationId = 0;
  let ready = false;
  let errorMsg = '';
  let worldMap: WorldTile[][] = [];

  let _maskState: HiddenMaskState | null = null;
  let hiddenMask: boolean[][] = [];
  const isHiddenTile = (x: number, y: number): boolean => hiddenMask[y]?.[x] ?? false;

  let _prevWorldMap: unknown;
  let _prevBuildingsSig = '';
  let _prevDesignations: unknown;
  let _prevZoneTiles: unknown;
  let _prevTerrainRev: number | undefined;
  let _prevDesignationRev: number | undefined;
  let _terrainGrid: import('$lib/webgl/game-grid.js').GameGrid | null = null;
  let _resourceGrid: import('$lib/webgl/game-grid.js').GameGrid | null = null;
  let _resourceTallGrid: import('$lib/webgl/game-grid.js').GameGrid | null = null;
  let _snowGrid: import('$lib/webgl/game-grid.js').GameGrid | null = null;
  let _snowDirty = false;
  let _snowPendingChunks = new Map<string, { x: number; y: number }[]>();
  const SNOW_CHUNK_SIZE = 32;
  const SNOW_CHUNKS_PER_FRAME = 1;
  let _heavyRenderReason = '';
  const HEAVY_RENDER_TILES = 4000;
  let _lastSnowBuild = 0;
  let _prevSnowRev: number | undefined;
  let _renderSeason: import('$lib/game/core/types.js').Season | undefined;
  const TURNS_PER_GAME_DAY = 300 * TICKS_PER_SECOND;
  const FOLIAGE_WINDOW_TURNS = 4 * TURNS_PER_GAME_DAY;
  const FOLIAGE_FLIPS_PER_FRAME = 48;
  let _foliagePending: { x: number; y: number; flipTurn: number }[] = [];
  let _foliageIdx = 0;
  let _curTurn = 0;
  let _terrainGridWorldMapRef: unknown;
  let _prevBuildingsById = new Map<string, { x: number; y: number; sig: string }>();
  let _prevBlueprintTiles = new Set<string>();
  let _emitterMap = new Map<string, import('$lib/game/services/LightingService.js').LightEmitter>();
  let _terrainDirty = false;
  let _lastTerrainBuild = 0;
  const TERRAIN_REBUILD_MIN_MS = 500;
  let _forceTerrainRebuild = false;

  let _renderDirty = true;
  const FREEZE_TILE_PX = 4;
  const markRenderDirty = () => {
    _renderDirty = true;
  };

  let viewX = 0;
  let viewY = 0;

  const heldPan = { left: false, right: false, up: false, down: false };
  let panVelX = 0;
  let panVelY = 0;
  const clearHeldPan = () => {
    heldPan.left = heldPan.right = heldPan.up = heldPan.down = false;
  };

  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragViewX = 0;
  let dragViewY = 0;
  let dragDistance = 0;

  let pawns: Pawn[] = [];
  let selectedPawnId: string | null = null;
  let cameraFollowPawnId: string | null = null;
  let cameraFollowMobId: string | null = null;

  const pawnOverlayGrid: GameGrid = new GameGridClass();
  const itemOverlayGrid: GameGrid = new GameGridClass();
  const buildingOverlayGrid: GameGrid = new GameGridClass();
  const pawnRenderPos = new Map<string, { x: number; y: number }>();
  const mobRenderPos = new Map<string, { x: number; y: number }>();
  let lastFrameTime = 0;
  const _DBG_BUILD =
    import.meta.env.VITE_DEBUG_MODE === 'true' || import.meta.env.VITE_DEBUG_LOG === 'true';
  let _menuPerfOn = _DBG_BUILD;
  const _unsubMenuPerf = debugMode.subscribe((v) => (_menuPerfOn = _DBG_BUILD || v));
  let overlayRedrawScheduled = false;
  const MOVE_SMOOTH_TAU = 0.06;
  const FOLLOW_SMOOTH_TAU = 0.12;
  const PAN_SPEED = 24;
  const PAN_SMOOTH_TAU = 0.09;
  const FOLLOW_VERTICAL = 0.42;

  let _glyphFloatKey = '';
  let _progressOverlayKey = '';
  let _particleOverlayKey = '';
  let _lairTiles: { x: number; y: number; effect: string }[] = [];
  let _lairScanAt = 0;
  let _healthOverlayKey = '';
  let _draftOverlayKey = '';
  let _floatTextKey = '';
  let _projOverlayKey = '';

  let combatTexts: CombatTextEvent[] = [];
  const unsubCombatFeedback = combatFeedback.subscribe((list) => {
    combatTexts = list;
  });

  const unsubAnimPause = gameState.isPaused.subscribe((p) => setAnimPaused(p));

  let attackLungeList: AttackLungeEvent[] = [];
  const unsubAttackLunges = attackLunges.subscribe((list) => {
    attackLungeList = list;
  });

  let projectileList: ProjectileEvent[] = [];
  const unsubProjectiles = projectiles.subscribe((list) => {
    projectileList = list;
  });

  const LUNGE_DISTANCE = 0.4;

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

  let buildings: PlacedBuilding[] = [];
  let designations: Record<string, DesignationType> = {};
  let zoneTiles: Record<string, DesignationType[]> = {};
  let designationZoneId: Record<string, Partial<Record<DesignationType, string>>> = {};
  let zoneInstances: ZoneInstance[] = [];
  let hiddenZoneInstances = new Set<string>();
  let _prevHiddenZoneSig = '';

  const ZONE_TINT_COLORS: Record<string, string> = {
    stockpile: 'rgba(232, 160, 32, 0.30)',
    drink: 'rgba(120, 210, 255, 0.45)',
    wash: 'rgba(150, 240, 215, 0.45)',
    restrict: 'rgba(176, 108, 208, 0.28)',
    grow: 'rgba(111, 174, 58, 0.30)'
  };

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
    buildings;
    refreshEmitters();
  }

  let droppedItems: DroppedItem[] = [];

  let mobs: Mob[] = [];
  let designationMode = false;
  let designationTypeActive: DesignationType = 'harvest';
  let activeZoneInstanceId: string | null = null;
  let zoneEraseMode = false;
  let blueprintBuildingId: string | null = null;
  let blueprintMaterials: Record<string, string> | null = null;
  let debugBrush: {
    kind: 'regrow' | 'building' | 'resource' | 'kill' | 'resurrect';
    id: string | null;
  } | null = null;
  let selectedBuildingId: string | null = null;
  let selectedMobId: string | null = null;
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
    if (s.selectedPawnId !== selectedPawnId) {
      selectedPawnId = s.selectedPawnId;
      if (s.selectedPawnId) {
        selectedBuildingId = null;
        selectedZoneId = null;
        selectedResourceTile = null;
        selectedItemId = null;
        highlightedResourceTiles = new Set();
        _cycleTileX = -1;
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
    if (blueprintBuildingId !== prevBlueprintBuildingId) redrawOverlay();
    else drawDesignations();
    if (s.mapFocusRequest && ready && renderer?.isReady()) {
      const { x, y, selectTile } = s.mapFocusRequest;
      uiState.clearMapFocus();
      const targetZoom = MAX_TILE_W;
      tileWidth = targetZoom;
      tileHeight = targetZoom;
      renderer.setTileSize(tileWidth, tileHeight);
      const visW = (container?.clientWidth ?? 800) / tileWidth;
      const visH = (container?.clientHeight ?? 600) / tileHeight;
      setView(Math.round(x - visW / 2), Math.round(y - visH * 0.25));
      if (selectTile && !selectTileAt(x, y) && !isHiddenTile(x, y)) {
        highlightedResourceTiles = new Set([`${x},${y}`]);
      }
      drawDesignations();
    }
  });

  let zoneDragActive = false;

  let blueprintDragActive = false;
  let blueprintAnchorX = -1;
  let blueprintAnchorY = -1;
  let _blueprintRoofSupport: ((x: number, y: number) => boolean) | null = null;
  let selectedResourceTile: { x: number; y: number; resourceId: string } | null = null;
  let selectedZoneId: string | null = null;
  let selectedItemId: string | null = null;
  let _cycleTileX = -1;
  let _cycleTileY = -1;
  let _cycleIndex = 0;
  let similarDragMode = false;
  let similarDragResourceId = '';
  let similarDragDesignationType: DesignationType = 'harvest';
  let similarDragActive = false;
  let highlightedResourceTiles: Set<string> = new Set();
  let similarAnchorX = 0;
  let similarAnchorY = 0;
  let similarEndX = 0;
  let similarEndY = 0;

  let markKind: 'pawn' | 'mob' | null = null;
  let markDragActive = false;
  let markAnchorX = 0;
  let markAnchorY = 0;
  let markEndX = 0;
  let markEndY = 0;
  let markedKind: 'pawn' | 'mob' | null = null;
  let markedIds: string[] = [];
  let markedSet = new Set<string>();

  let moveAimActive = false;
  let moveAimArmed = false;
  let moveAimAnchorX = 0;
  let moveAimAnchorY = 0;
  let moveAimEndX = 0;
  let moveAimEndY = 0;
  let moveAimSlots: { x: number; y: number }[] = [];
  let _aimCommitted = false;

  let zoneAnchorX = 0;
  let zoneAnchorY = 0;
  let zoneEndX = 0;
  let zoneEndY = 0;

  let hoverTileX = -1;
  let hoverTileY = -1;
  let lastCursorCx = 0;
  let lastCursorCy = 0;
  let cursorOverCanvas = false;
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
        hoverTile.y,
        $gameState?.worldMap
      )
    : 1.0;
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

  $: selectedPawn = selectedPawnId ? (pawns.find((p) => p.id === selectedPawnId) ?? null) : null;

  $: selectedMob = selectedMobId ? (mobs.find((m) => m.id === selectedMobId) ?? null) : null;
  $: selectedMobDef = selectedMob ? (getCreatureById(selectedMob.creatureId) ?? null) : null;

  $: selectedPawnCard = selectedPawn
    ? buildPawnCard(selectedPawn, true, {
        cameraFollowPawnId,
        startMark: () => startMarkDrag('pawn'),
        armMove: () => armMoveAim(),
        toggleFood: () => toggleFoodSettingsPanel(),
        foodOpen: showFoodSettings,
        moodModel: $gameState ? pawnService.getMoodBreakdown(selectedPawn, $gameState) : undefined
      })
    : null;
  $: hoverPawnCard = hoverPawn
    ? buildPawnCard(hoverPawn, false, {
        cameraFollowPawnId,
        startMark: () => startMarkDrag('pawn'),
        armMove: () => armMoveAim(),
        toggleFood: () => {},
        foodOpen: false,
        moodModel: $gameState ? pawnService.getMoodBreakdown(hoverPawn, $gameState) : undefined
      })
    : null;

  $: markedDraftedCount =
    markedKind === 'pawn' ? pawns.filter((p) => p.drafted && markedSet.has(p.id)).length : 0;
  $: markedAllDrafted =
    markedKind === 'pawn' && markedIds.length > 0 && markedDraftedCount === markedIds.length;

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
          startMark: () => startMarkDrag('mob'),
          colonyName: $gameState?.culture?.name
        })
      : null;
  })();

  $: selectedMobCard = (() => {
    if (!selectedMob || !selectedMobDef) return null;
    return buildMobCard(selectedMob, selectedMobDef, true, {
      cameraFollowMobId,
      startMark: () => startMarkDrag('mob'),
      colonyName: $gameState?.culture?.name
    });
  })();

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
      if (markedDraftedCount > 0) {
        btns.push({ label: `MOVE (${markedDraftedCount})`, onClick: () => armMoveAim() });
      }
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
    const names = mobs
      .filter((m) => markedSet.has(m.id))
      .map((m) => m.name ?? getCreatureById(m.creatureId)?.name ?? 'creature');
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

  $: hoverBuilding =
    hoverTileX >= 0 && hoverTileY >= 0
      ? (buildings.find(
          (b) =>
            b.x === hoverTileX && b.y === hoverTileY && !isRoofBuilding(b) && !isFloorBuilding(b)
        ) ?? null)
      : null;
  $: hoverFloorName =
    hoverTile && hoverTile.floor
      ? (() => {
          const f = buildings.find(
            (b) => b.x === hoverTile.x && b.y === hoverTile.y && isFloorBuilding(b)
          );
          return f ? (buildingService.getBuildingById(f.type)?.name ?? null) : null;
        })()
      : null;
  const buildingIsStorageBin = (b: { type: string; status: string }) =>
    b.status === 'complete' && !!buildingService.getBuildingById(b.type)?.effects?.storageStacks;
  $: hasStorageBin = buildings.some(buildingIsStorageBin);
  $: hoverBin = hoverBuilding && buildingIsStorageBin(hoverBuilding) ? hoverBuilding : null;
  $: hoverBinContents = hoverBin
    ? droppedItems.filter((d) => d.stored && d.x === hoverBin.x && d.y === hoverBin.y)
    : [];

  $: selectedBuilding = selectedBuildingId
    ? (buildings.find((b) => b.id === selectedBuildingId) ?? null)
    : null;

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

  function tileEnv(t: { x: number; y: number; terrainType: string; moisture?: number }) {
    const thermal = computeThermalAt(t.x, t.y, buildings, worldMap);
    const envTurn = environmentService.ambientTurn($gameState ?? { turn: 0 });
    return {
      light: computeTileLightLevel(envTurn, buildings, t.x, t.y, worldMap),
      temp: Math.round(
        tileTemperature(t.terrainType, $currentSeason, envTurn, $currentWeather, thermal)
      ),
      wet: tileWetness(t.moisture ?? 0, $currentWeather, thermal),
      wind: windDegreeWord(effectiveWindAt(t.x, t.y, $currentWeather, thermal, worldMap))
    };
  }

  $: buildingModel = ((): SelectedEntityModel | null => {
    if (!selectedBuilding) return null;
    const bDef = buildingService.getBuildingById(selectedBuilding.type);
    const isBlueprint = selectedBuilding.status !== 'complete';
    const canConfigFuel =
      !isBlueprint && !selectedBuilding.deconstructQueued && bDef?.maxFuel !== undefined;
    const canConfigStorage =
      !isBlueprint &&
      !selectedBuilding.deconstructQueued &&
      (bDef?.effects?.storageStacks ?? 0) > 0;
    const canRepair =
      !isBlueprint &&
      !selectedBuilding.deconstructQueued &&
      buildingService.deterioratingRate(selectedBuilding.type) > 0;
    const status = isBlueprint
      ? selectedBuilding.paused
        ? 'paused'
        : 'building'
      : `complete${selectedBuilding.deconstructQueued ? ' ⊢ demolish' : ''}`;
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
      btns.push({ label: 'BUILD', onClick: buildAnother });
      btns.push({ label: 'DEMOLISH', onClick: deconstructBuilding });
      if (canConfigFuel) {
        btns.push({ label: 'FUEL', active: showFuelSettings, onClick: toggleFuelSettingsPanel });
      }
      if (canRepair) {
        btns.push({
          label: 'REPAIR',
          active: showRepairSettings,
          onClick: toggleRepairSettingsPanel
        });
      }
      if (canConfigStorage) {
        btns.push({
          label: 'FILTER',
          active: showStorageSettings,
          onClick: toggleStorageSettingsPanel
        });
      }
    }
    return {
      name: bDef?.name ?? selectedBuilding.type,
      status,
      selected: true,
      dismissable: true,
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
    const growthPct = isGrowableResource(selectedResourceDef)
      ? (worldMap[selectedResourceTile.y]?.[selectedResourceTile.x]?.growth?.[
          selectedResourceTile.resourceId
        ] ?? 100)
      : undefined;
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
    const isRegrowing =
      selectedResourceAmount <= 0 &&
      resourceObjectService.isRegrowsFromZero(selectedResourceTile.resourceId);
    if (isRegrowing) lines.push('regrowing — not ready to harvest');
    const harvestableNow = (dtype: DesignationType) =>
      tileKeys.some((k) => {
        const [hx, hy] = k.split(',').map(Number);
        return isHarvestableTileNow({ worldMap }, hx, hy, dtype);
      });
    const btns: EntityButton[] = [];
    let withheldImmature = false;
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
        const dtype = iact.designationType;
        if (dtype && !harvestableNow(dtype)) {
          withheldImmature = true;
          continue;
        }
        btns.push({ label, onClick: () => designateResource(dtype) });
      }
    }
    if (withheldImmature && growthPct !== undefined)
      lines.push(`not ready — ${Math.round(growthPct)}% grown (needs ${MIN_FORAGE_GROWTH}%)`);
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

  $: multiResourceCard = ((): SelectedEntityModel | null => {
    if (selectedResourceTypes.size < 2) return null;
    const typeNames = [...selectedResourceTypes].map(
      (id) => resourceObjectService.getById(id)?.displayName ?? id
    );
    const marked = highlightedResourceTiles.size;
    const designatedCount = [...highlightedResourceTiles].filter((k) => designations[k]).length;
    const allDesignated = marked > 0 && designatedCount === marked;
    const btns: EntityButton[] = [];
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

  $: hoverDroppedItem =
    hoverTileX >= 0 && hoverTileY >= 0
      ? (droppedItems.find((d) => d.x === hoverTileX && d.y === hoverTileY) ?? null)
      : null;

  function needBar(value: number): string {
    const filled = Math.round(value / 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  }

  function itemBarColor(goodPct: number): string {
    if (goodPct >= 66) return '#4CAF50';
    if (goodPct >= 33) return '#FFA726';
    return '#D32F2F';
  }

  $: selectedItem = selectedItemId
    ? (droppedItems.find((d) => d.id === selectedItemId) ?? null)
    : null;

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
    const dryStatus = itemService.dryingStatus(d, $gameState);
    if (dryStatus) {
      const dryPct = Math.round(Math.min(1, dryStatus.progress / dryStatus.target) * 100);
      const ind = dryingIndicator(dryStatus);
      bars.push({
        label: 'DRY',
        value: dryPct,
        color: ind.color,
        valueText: `${dryPct}% ${ind.glyph}`,
        title: ind.title
      });
    }
    return {
      name: `★ ${displayName}`,
      status: `×${d.quantity}`,
      itemPills: [{ itemId: d.resourceId }],
      bars,
      note: d.stored
        ? 'stored'
        : d.forbidden
          ? 'forbidden — pawns will not haul this'
          : d.urgent
            ? 'urgent — hauled before other work'
            : 'dropped item — awaiting hauler',
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

  $: selectedZone = selectedZoneId
    ? (zoneInstances.find((z) => z.id === selectedZoneId) ?? null)
    : null;
  $: selectedZoneTileKeys = selectedZoneId
    ? Object.keys(designationZoneId).filter((k) =>
        Object.values(designationZoneId[k] ?? {}).includes(selectedZoneId!)
      )
    : [];
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
  $: zoneToolDrawing = designationMode && activeZoneInstanceId === selectedZoneId && !zoneEraseMode;
  $: zoneToolClearing = designationMode && activeZoneInstanceId === selectedZoneId && zoneEraseMode;

  function paintZoneTool(instanceId: string, erase: boolean) {
    zoneEraseMode = erase;
    uiState.activateDesignation('stockpile', instanceId);
  }

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

  let selDragActive = false;
  let selAnchorX = 0;
  let selAnchorY = 0;
  let selEndX = 0;
  let selEndY = 0;
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

  let _lastWorldMapRef: unknown = null;
  const unsubState = gameState.subscribe((s) => {
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
    const buildingsSig = buildingsVisualSig(buildings);
    const workerRev = (s as unknown as { _terrainRev?: number })._terrainRev;
    const workerSnowRev = (s as unknown as { _snowRev?: number })._snowRev;
    const workerDesigRev = (s as unknown as { _designationRev?: number })._designationRev;
    const hiddenZoneSig = [...hiddenZoneInstances].sort().join(',');

    const terrainChanged =
      workerRev !== undefined
        ? workerRev !== _prevTerrainRev
        : worldMap !== _prevWorldMap || buildingsSig !== _prevBuildingsSig;

    const overlayChanged =
      hiddenZoneSig !== _prevHiddenZoneSig ||
      (workerDesigRev !== undefined
        ? workerDesigRev !== _prevDesignationRev
        : designations !== _prevDesignations || zoneTiles !== _prevZoneTiles);

    if (workerSnowRev !== undefined && workerSnowRev !== _prevSnowRev) _snowDirty = true;

    _prevTerrainRev = workerRev;
    _prevSnowRev = workerSnowRev;
    _prevDesignationRev = workerDesigRev;
    _prevHiddenZoneSig = hiddenZoneSig;
    _prevWorldMap = worldMap;
    _prevBuildingsSig = buildingsSig;
    _prevDesignations = designations;
    _prevZoneTiles = zoneTiles;

    if (overlayChanged && renderer?.isReady() && worldMap.length > 0) drawDesignations();
    if (renderer?.isReady()) {
      const { light, tint } = environmentService.getAmbient(environmentService.ambientTurn(s));
      const season = environmentService.effectiveSeason(s);
      const tinted = environmentService.getMapAmbientTint(tint, season, s.weather);
      renderer.setAmbient(light, tinted);
      lightingService.setAmbient(light, tinted);
      _ambientLight = light;
      _ambientTint = tinted;
      _curTurn = (s as unknown as { turn?: number }).turn ?? _curTurn;
      if (season !== undefined && season !== _renderSeason) {
        const prev = _renderSeason;
        if (_foliagePending.length > 0) _flushFoliageTransition();
        _renderSeason = season;
        if (
          prev !== undefined &&
          _terrainGrid &&
          _maskState &&
          worldMap === _terrainGridWorldMapRef
        ) {
          _startFoliageTransition(prev, season, _curTurn);
        }
      }
    }
    if (renderer?.isReady()) {
      if (worldMap.length > 0) {
        if (terrainChanged) {
          _terrainDirty = true;
        }
      } else {
        renderer.setGrid(generatePlaceholderGrid());
      }
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

  const PAWN_SPRITES = [64, 66, 69, 78, 85, 103, 105, 125].map((i) => glyph(SHEET.MAP, i));

  function pawnSimTarget(pawn: Pawn): { x: number; y: number } {
    const { x, y } = pawn.position!;
    return simTarget(
      { x, y, path: pawn.path, pathIndex: pawn.pathIndex, nextCellCostLeft: pawn.nextCellCostLeft },
      worldMap
    );
  }

  function updatePawnOverlay(dt: number) {
    pawnOverlayGrid.clear();
    itemOverlayGrid.clear();
    overlayDroppedItems(itemOverlayGrid, droppedItems, isHiddenTile);
    buildingOverlayGrid.clear();
    overlayBuildings(buildingOverlayGrid, buildings, isHiddenTile);
    const clampedDt = Math.min(dt, 0.05);
    const alpha = clampedDt > 0 ? 1 - Math.exp(-clampedDt / MOVE_SMOOTH_TAU) : 1;
    const nowMs = animNow();

    const freshState = get(gameState);
    const liveMobs = freshState.mobs ?? mobs;
    const livePawns = freshState.pawns ?? pawns;

    const CULL_MARGIN = 3;
    const cullMinX = viewX - CULL_MARGIN;
    const cullMinY = viewY - CULL_MARGIN;
    const cullMaxX = viewX + Math.ceil((container?.clientWidth ?? 0) / tileWidth) + CULL_MARGIN;
    const cullMaxY = viewY + Math.ceil((container?.clientHeight ?? 0) / tileHeight) + CULL_MARGIN;
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

      if (mob.state === 'Corpse') continue;

      const cellX = Math.round(rm.x);
      const cellY = Math.round(rm.y);
      if (isHiddenTile(cellX, cellY)) continue;
      const isSelected =
        mob.id === selectedMobId || (markedKind === 'mob' && markedSet.has(mob.id));
      const mLunge = lungeOffset(mob.id, nowMs);
      const mTier = def.tier;
      const mScale = mTier != null ? TIER_GLYPH_SCALE[mTier] : undefined;
      const mTint = mTier != null ? TIER_GLYPH_TINT[mTier] : 1;
      pawnOverlayGrid.setTile(cellX, cellY, {
        char: def.chars[0],
        foreground: isSelected
          ? { r: 1.0, g: 0.9, b: 0.1 }
          : {
              r: Math.min(1, def.fg[0] * mTint),
              g: Math.min(1, def.fg[1] * mTint),
              b: Math.min(1, def.fg[2] * mTint * (mTier === 5 ? 0.85 : 1))
            },
        background: { r: 0, g: 0, b: 0 },
        ...(mScale != null && mScale !== 1 ? { scale: mScale } : {}),
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
      if (pawn.carriedBy) continue;
      seen.add(pawn.id);

      const target = pawnSimTarget(pawn);
      let rp = pawnRenderPos.get(pawn.id);
      if (!rp || Math.abs(rp.x - target.x) > 2 || Math.abs(rp.y - target.y) > 2) {
        rp = { x: target.x, y: target.y };
      } else {
        rp.x += (target.x - rp.x) * alpha;
        rp.y += (target.y - rp.y) * alpha;
      }
      pawnRenderPos.set(pawn.id, rp);

      const cellX = Math.round(rp.x);
      const cellY = Math.round(rp.y);
      if (isHiddenTile(cellX, cellY)) continue;
      const isSelected =
        pawn.id === selectedPawnId || (markedKind === 'pawn' && markedSet.has(pawn.id));
      const isSleeping = pawn.currentState === 'Sleeping';
      const isCollapsed = pawn.currentState === 'Collapsed';
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
        rotation: isSleeping || isCollapsed ? 90 : undefined
      });
    }

    if (seen.size !== pawnRenderPos.size) {
      for (const id of pawnRenderPos.keys()) {
        if (!seen.has(id)) pawnRenderPos.delete(id);
      }
    }
  }

  function updateWorldEffectOverlays() {
    const W = container?.clientWidth ?? 0;
    const H = container?.clientHeight ?? 0;
    const tW = tileWidth;
    const tH = tileHeight;

    const glyphOf = (id: string, x: number, y: number, kind: GlyphFloatKind): GlyphFloat => ({
      id,
      left: (x - viewX + 0.5) * tW,
      top: (y - viewY) * tH - 18,
      kind
    });
    const onScreen = (o: { left: number; top: number }) => o.left >= 0 && o.top >= 0 && o.left <= W;
    const newGlyphs: GlyphFloat[] = [];
    const prioCollapse = conditionPriority('collapse');
    const prioSleeping = conditionPriority('sleeping');
    const prioWinded = conditionPriority('winded');
    for (const p of pawns) {
      if (!p.position) continue;
      if (p.carriedBy) continue;
      if (isHiddenTile(p.position.x, p.position.y)) continue;
      let kind: GlyphFloatKind | null = null;
      let prio = -1;
      if (p.currentState === 'Collapsed' && prioCollapse > prio) {
        prio = prioCollapse;
        kind = 'collapse';
      }
      if (p.currentState === 'Sleeping' && prioSleeping > prio) {
        prio = prioSleeping;
        kind = needsRecovery(p as never) ? 'rest' : 'sleep';
      }
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
      if (m.state === 'Corpse') continue;
      if (isHiddenTile(m.x, m.y)) continue;
      let kind: GlyphFloatKind | null = null;
      let prio = -1;
      if (m.state === 'Collapsed' && prioCollapse > prio) {
        prio = prioCollapse;
        kind = 'collapse';
      }
      if (m.state === 'Sleeping' && prioSleeping > prio) {
        prio = prioSleeping;
        kind = 'sleep';
      }
      if ((m.transientConditions ?? []).includes('winded') && prioWinded > prio) {
        prio = prioWinded;
        kind = 'winded';
      }
      if (m.partyRole === 'trader') kind = 'trade';
      if (kind) {
        const rp = mobRenderPos.get(m.id);
        const o = glyphOf(m.id, rp?.x ?? m.x, rp?.y ?? m.y, kind);
        if (onScreen(o)) newGlyphs.push(o);
      }
    }
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
      ...pawns
        .filter(
          (p) =>
            p.draftTarget?.type === 'tend' &&
            (p.tendProgress ?? -1) >= 0 &&
            p.position &&
            !isHiddenTile(p.position.x, p.position.y)
        )
        .map((p) => ({
          id: p.id,
          left: (p.position!.x - viewX + 0.5) * tW,
          top: (p.position!.y - viewY) * tH - 6,
          progress: Math.max(0, Math.min(1, p.tendProgress ?? 0))
        }))
        .filter((o) => o.left >= 0 && o.top >= 0 && o.left <= W),
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
    const progressKey = newProgress
      .map(
        (o) => `${o.id}:${Math.round(o.left)},${Math.round(o.top)},${Math.round(o.progress * 20)}`
      )
      .join('|');
    if (progressKey !== _progressOverlayKey) {
      _progressOverlayKey = progressKey;
      worldEffects.setProgressOverlays(newProgress);
    }

    const newParticles: { id: string; left: number; top: number; effect: string }[] = [];
    for (const lt of _lairTiles) {
      const left = (lt.x - viewX + 0.5) * tW;
      const top = (lt.y - viewY + 0.5) * tH;
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

    const newDraftTargets = pawns
      .filter((p) => p.position && p.drafted && p.draftTarget)
      .map((p) => {
        const target = p.draftTarget!;
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
        if (target.type === 'attack') {
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

    const now = animNow();
    const newFloats = combatTexts
      .filter((e) => now - e.spawnTime < floatTtl(e.kind))
      .map((e) => ({
        id: e.id,
        left: (e.worldX - viewX + 0.5) * tW,
        top: (e.worldY - viewY) * tH - 14 + (e.dy ?? 0),
        text: e.text,
        kind: e.kind,
        color: e.color
      }))
      .filter((o) => o.left >= -tW && o.top >= -tH && o.left <= W + tW && o.top <= H + tH);
    const flScale = Math.min(1.2, Math.max(0.25, tW / 20));
    const CHAR_W = 5;
    const MAX_TXT_W = 152;
    const LINE_H = 15;
    const boxOf = (text: string) => {
      const full = Math.max(text.length * CHAR_W, 30);
      return {
        w: Math.min(MAX_TXT_W, full) + 8,
        h: Math.max(1, Math.ceil(full / MAX_TXT_W)) * LINE_H + 6
      };
    };
    const SEAT_EPS = 0.5;
    const placedSocial: { left: number; top: number; w: number; h: number }[] = [];
    for (const o of newFloats) {
      if (o.kind !== 'social') continue;
      const ob = boxOf(o.text);
      for (let pass = 0; pass < placedSocial.length; pass++) {
        let moved = false;
        for (const p of placedSocial) {
          const horiz = Math.abs(p.left - o.left) < (flScale * (p.w + ob.w)) / 2 + 2;
          if (!horiz) continue;
          const gap = (flScale * (p.h + ob.h)) / 2 + 2;
          if (Math.abs(p.top + p.h / 2 - (o.top + ob.h / 2)) < gap) {
            o.top = p.top + p.h / 2 + gap + SEAT_EPS - ob.h / 2;
            moved = true;
          }
        }
        if (!moved) break;
      }
      placedSocial.push({ left: o.left, top: o.top, w: ob.w, h: ob.h });
    }
    const floatKey = newFloats
      .map((o) => `${o.id}:${Math.round(o.left)},${Math.round(o.top)}`)
      .join('|');
    if (floatKey !== _floatTextKey) {
      _floatTextKey = floatKey;
      worldEffects.setFloatingTextOverlays(newFloats);
    }

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

  function redrawOverlay() {
    if (typeof requestAnimationFrame === 'undefined') return;
    if (!renderer?.isReady() || worldMap.length === 0) return;
    if (overlayRedrawScheduled) return;
    overlayRedrawScheduled = true;
    requestAnimationFrame(() => {
      overlayRedrawScheduled = false;
      redrawOverlayNow();
    });
  }

  function _buildingSig(b: PlacedBuilding): string {
    return `${b.x},${b.y}:${b.type}:${b.status}:${b.deconstructQueued ? 1 : 0}:${b.paused ? 1 : 0}`;
  }

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

  function _updateEmitterAt(y: number, x: number, tile: WorldTile): boolean {
    const key = y + ',' + x;
    const had = _emitterMap.has(key);
    const e = lightingService.emitterForTile(tile);
    const willHave = !!e && !isHiddenTile(x, y);
    if (willHave === had) {
      if (willHave) _emitterMap.set(key, e!);
      return false;
    }
    if (willHave) _emitterMap.set(key, e!);
    else _emitterMap.delete(key);
    return true;
  }

  function _fullRebuildTerrain(): void {
    _heavyRenderReason = `FULL-REBUILD map=${worldMap[0]?.length ?? 0}x${worldMap.length} season=${_renderSeason ?? '?'}`;
    const built = fullRebuildTerrain(worldMap, buildings, _buildingSig, _renderSeason);
    _terrainGrid = built.terrainGrid;
    _resourceGrid = built.resourceGrid;
    _resourceTallGrid = built.resourceTallGrid;
    _snowGrid = built.snowGrid;
    renderer?.setSnowGrid(_snowGrid);
    _maskState = built.maskState;
    hiddenMask = _maskState.mask;
    _terrainGridWorldMapRef = worldMap;
    _prevBuildingsById = built.buildingsById;
    _emitterMap = built.emitterMap;
    resourceGlowEmitters = built.emitters;
    clearRenderTileDeltas();
    _snowPendingChunks.clear();
    refreshEmitters();

    _blueprintRoofSupport = null;
    _prevBlueprintTiles = _currentBlueprintTiles();
    for (const k of _prevBlueprintTiles) {
      const ci = k.indexOf(',');
      _blueprintPreviewTile(_terrainGrid, +k.slice(0, ci), +k.slice(ci + 1));
    }
  }

  function redrawOverlayNow() {
    if (!renderer?.isReady() || worldMap.length === 0) return;
    markRenderDirty();
    const W = worldMap[0]?.length ?? 0;

    if (!_terrainGrid || !_maskState || worldMap !== _terrainGridWorldMapRef) {
      _fullRebuildTerrain();
      renderer.setGrid(_terrainGrid!);
      drawDesignations();
      return;
    }

    const deltas = drainRenderTileDeltas() ?? [];
    const dirty = new Set<number>();
    for (const c of deltas) dirty.add(c.y * W + c.x);

    const curBuildings = new Map<string, { x: number; y: number; sig: string }>();
    for (const b of buildings) {
      if (b.status === 'complete') curBuildings.set(b.id, { x: b.x, y: b.y, sig: _buildingSig(b) });
    }
    for (const [id, prev] of _prevBuildingsById) {
      const c = curBuildings.get(id);
      if (!c || c.sig !== prev.sig) dirty.add(prev.y * W + prev.x);
    }
    for (const [id, c] of curBuildings) {
      const prev = _prevBuildingsById.get(id);
      if (!prev || prev.sig !== c.sig) dirty.add(c.y * W + c.x);
    }
    _prevBuildingsById = curBuildings;

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

    if (deltas.length) {
      const maskTouched = updateHiddenMaskAt(_maskState, worldMap, deltas as TileCoord[]);
      for (const c of maskTouched) dirty.add(c.y * W + c.x);
    }

    if (dirty.size === 0) {
      renderer.setGrid(_terrainGrid);
      drawDesignations();
      return;
    }
    if (dirty.size > HEAVY_RENDER_TILES) _heavyRenderReason = `TERRAIN-DELTA ${dirty.size} cells`;

    let emittersChanged = false;
    for (const key of dirty) {
      const x = key % W;
      const y = (key / W) | 0;
      const t = worldMap[y]?.[x];
      if (!t) continue;
      applyTileToGrid(_terrainGrid, t, hiddenMask);
      if (_resourceGrid && _resourceTallGrid)
        applyResourceToGrid(_resourceGrid, _resourceTallGrid, t, hiddenMask, _renderSeason);
      if (_snowGrid) applySnowToGrid(_snowGrid, t, hiddenMask);
      if (_updateEmitterAt(y, x, t)) emittersChanged = true;
    }
    for (const b of buildings) {
      if (b.status === 'complete' && isFloorBuilding(b) && dirty.has(b.y * W + b.x))
        applyBuildingToGrid(_terrainGrid, b, worldMap[b.y]?.[b.x]);
    }
    for (const b of buildings) {
      if (b.status === 'complete' && isRoofBuilding(b) && dirty.has(b.y * W + b.x))
        applyBuildingToGrid(_terrainGrid, b, worldMap[b.y]?.[b.x]);
    }
    _blueprintRoofSupport = null;
    for (const k of curBlueprint) {
      const ci = k.indexOf(',');
      _blueprintPreviewTile(_terrainGrid, +k.slice(0, ci), +k.slice(ci + 1));
    }
    if (emittersChanged) {
      resourceGlowEmitters = [..._emitterMap.values()];
      refreshEmitters();
    }

    const dirtyTiles: TileCoord[] = [];
    for (const key of dirty) dirtyTiles.push({ x: key % W, y: (key / W) | 0 });
    renderer.setGrid(_terrainGrid, dirtyTiles);
    if (_snowGrid) renderer.setSnowGrid(_snowGrid, dirtyTiles);
    drawDesignations();
  }

  function _queueSnowDeltas() {
    const coords = drainSnowRenderTileDeltas();
    if (!coords || coords.length === 0) return;
    const CS = SNOW_CHUNK_SIZE;
    for (const c of coords) {
      const key = Math.floor(c.x / CS) + ':' + Math.floor(c.y / CS);
      let cells = _snowPendingChunks.get(key);
      if (!cells) {
        cells = [];
        _snowPendingChunks.set(key, cells);
      }
      cells.push(c);
    }
  }

  function repaintSnowNow() {
    if (!renderer?.isReady() || !_snowGrid || worldMap.length === 0) return;
    if (_snowPendingChunks.size === 0) return;
    beat(`snow:chunks ${_snowPendingChunks.size}`);
    const due: { x: number; y: number }[] = [];
    let chunks = SNOW_CHUNKS_PER_FRAME;
    for (const [key, cells] of _snowPendingChunks) {
      _snowPendingChunks.delete(key);
      for (const c of cells) {
        const t = worldMap[c.y]?.[c.x];
        if (t) {
          applySnowToGrid(_snowGrid, t, hiddenMask);
          due.push({ x: c.x, y: c.y });
        }
      }
      if (--chunks <= 0) break;
    }
    if (due.length > 0) {
      renderer.setSnowGrid(_snowGrid, due);
      markRenderDirty();
    }
  }

  function _startFoliageTransition(
    prev: import('$lib/game/core/types.js').Season,
    next: import('$lib/game/core/types.js').Season,
    turn: number
  ): void {
    const pending: { x: number; y: number; flipTurn: number }[] = [];
    for (const row of worldMap) {
      for (const t of row) {
        if (!t.resources || isHiddenTile(t.x, t.y)) continue;
        if (resourceSeasonChanges(t, prev, next))
          pending.push({
            x: t.x,
            y: t.y,
            flipTurn: turn + Math.floor(Math.random() * FOLIAGE_WINDOW_TURNS)
          });
      }
    }
    pending.sort((a, b) => a.flipTurn - b.flipTurn);
    _foliagePending = pending;
    _foliageIdx = 0;
  }

  function _flushFoliageTransition(): void {
    if (
      _resourceGrid &&
      _resourceTallGrid &&
      _terrainGrid &&
      _foliageIdx < _foliagePending.length
    ) {
      const due: TileCoord[] = [];
      for (let i = _foliageIdx; i < _foliagePending.length; i++) {
        const p = _foliagePending[i];
        const t = worldMap[p.y]?.[p.x];
        if (t) {
          applyResourceToGrid(_resourceGrid, _resourceTallGrid, t, hiddenMask, _renderSeason);
          due.push({ x: p.x, y: p.y });
        }
      }
      if (due.length > 0 && renderer?.isReady()) {
        renderer.setGrid(_terrainGrid, due);
        markRenderDirty();
      }
    }
    _foliagePending = [];
    _foliageIdx = 0;
  }

  function _processFoliageTransition(): void {
    const P = _foliagePending;
    if (_foliageIdx >= P.length) {
      if (P.length) {
        _foliagePending = [];
        _foliageIdx = 0;
      }
      return;
    }
    if (!renderer?.isReady() || !_resourceGrid || !_resourceTallGrid || !_terrainGrid) return;
    let budget = FOLIAGE_FLIPS_PER_FRAME;
    const due: TileCoord[] = [];
    while (_foliageIdx < P.length && budget > 0 && _curTurn >= P[_foliageIdx].flipTurn) {
      const p = P[_foliageIdx++];
      const t = worldMap[p.y]?.[p.x];
      if (t) {
        applyResourceToGrid(_resourceGrid, _resourceTallGrid, t, hiddenMask, _renderSeason);
        due.push({ x: p.x, y: p.y });
        budget--;
      }
    }
    if (due.length > 0) {
      renderer.setGrid(_terrainGrid, due);
      markRenderDirty();
    }
  }

  function paintTileRegion(
    ctx: CanvasRenderingContext2D,
    tiles: Set<string>,
    fill: string,
    stroke: string,
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

  function paintSplitTiles(ctx: CanvasRenderingContext2D, tileColors: Map<string, string[]>) {
    const W = container?.clientWidth ?? 0;
    const H = container?.clientHeight ?? 0;
    const colW = Math.ceil(W / tileWidth);
    const rowH = Math.ceil(H / tileHeight);
    const stripe = Math.max(5, tileWidth / 3);
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
    markRenderDirty();
    const W = container.clientWidth;
    const H = container.clientHeight;
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

    {
      const byColor = new Map<string, Set<string>>();
      const tileColors = new Map<string, string[]>();
      const add = (key: string, color: string, type: DesignationType) => {
        const inst = designationZoneId[key]?.[type];
        if (!designationMode && inst && hiddenZoneInstances.has(inst)) return;
        let set = byColor.get(color);
        if (!set) byColor.set(color, (set = new Set()));
        set.add(key);
        const list = tileColors.get(key);
        if (!list) tileColors.set(key, [color]);
        else if (!list.includes(color)) list.push(color);
      };
      for (const key in zoneTiles) {
        for (const t of zoneTiles[key]) {
          const c = ZONE_TINT_COLORS[t];
          if (c) add(key, c, t);
        }
      }
      for (const key in designations) {
        const c = ZONE_TINT_COLORS[designations[key]];
        if (c) add(key, c, designations[key]);
      }

      const overlap = new Set<string>();
      for (const [key, colors] of tileColors) if (colors.length > 1) overlap.add(key);

      for (const [color, set] of byColor) {
        paintTileRegion(ctx, set, color, color.replace(/[\d.]+\)$/, '0.95)'), overlap);
      }
      if (overlap.size > 0) {
        const overlapColors = new Map<string, string[]>();
        for (const key of overlap) overlapColors.set(key, tileColors.get(key)!);
        paintSplitTiles(ctx, overlapColors);
      }
    }

    if (zoneDragActive && designationMode) {
      const minX = Math.min(zoneAnchorX, zoneEndX);
      const maxX = Math.max(zoneAnchorX, zoneEndX);
      const minY = Math.min(zoneAnchorY, zoneEndY);
      const maxY = Math.max(zoneAnchorY, zoneEndY);
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

    if (similarDragActive) {
      const minX = Math.min(similarAnchorX, similarEndX);
      const maxX = Math.max(similarAnchorX, similarEndX);
      const minY = Math.min(similarAnchorY, similarEndY);
      const maxY = Math.max(similarAnchorY, similarEndY);
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
      const ox = (minX - viewX) * tileWidth;
      const oy = (minY - viewY) * tileHeight;
      const ow = (maxX - minX + 1) * tileWidth;
      const oh = (maxY - minY + 1) * tileHeight;
      ctx.strokeStyle = 'rgba(160, 255, 160, 0.95)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + 0.5, oy + 0.5, ow - 1, oh - 1);
      ctx.restore();
    }

    if (highlightedResourceTiles.size > 0) {
      paintTileRegion(
        ctx,
        highlightedResourceTiles,
        'rgba(240, 208, 32, 0.22)',
        'rgba(240, 208, 32, 0.95)'
      );
    }

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

    const STACK_BADGE_MIN_TILE = 16;
    const STACK_BADGE_FONT_PX = 5;
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
            loadSheet(span.sheet as SheetName);
            continue;
          }
          const dx = (b.x - viewX) * tileWidth;
          const dy = (b.y - viewY) * tileHeight;
          if (dx < -tileWidth || dy < -tileHeight || dx > W + tileWidth || dy > H + tileHeight)
            continue;
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
        spriteId = 207;
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

    const darken = Math.max(0, 1 - _ambientLight);
    if (darken > 0.001) {
      ctx.globalCompositeOperation = 'source-atop';
      const tr = Math.round(_ambientTint[0] * 255);
      const tg = Math.round(_ambientTint[1] * 255);
      const tb = Math.round(_ambientTint[2] * 255);
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
    if (worldMap[ty]?.[tx]?.walkable === false) return;
    const building = buildingService.getBuildingById(blueprintBuildingId!);
    if (!building) return;
    if (building.effects?.roof) {
      _blueprintRoofSupport ??= buildingService.makeRoofSupportLookup(buildings, worldMap);
      if (!buildingService.roofTileSupported(tx, ty, _blueprintRoofSupport)) return;
    }
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

  type TileLayer =
    | { kind: 'pawn'; id: string }
    | { kind: 'mob'; id: string }
    | { kind: 'building'; id: string }
    | { kind: 'zone'; id: string }
    | { kind: 'item'; id: string }
    | { kind: 'resource'; resourceId: string };

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
        selectedResourceTypes = new Set([layer.resourceId]);
        break;
    }
  }

  function tileLayers(x: number, y: number): TileLayer[] {
    const layers: TileLayer[] = [];
    const pawn = findPawnAtTile(x, y);
    if (pawn) layers.push({ kind: 'pawn', id: pawn.id });
    const mob = findMobAtTile(x, y);
    if (mob) layers.push({ kind: 'mob', id: mob.id });
    const building = buildings.find(
      (b) => b.x === x && b.y === y && !isRoofBuilding(b) && !isFloorBuilding(b)
    );
    if (building) layers.push({ kind: 'building', id: building.id });
    const key = `${x},${y}`;
    if (zoneTiles[key]?.includes('stockpile')) {
      const zoneId =
        designationZoneId[key]?.stockpile ?? zoneInstances.find((z) => z.type === 'stockpile')?.id;
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
      for (const [resourceId, g] of Object.entries(tileData?.growth ?? {})) {
        if (!seenRes.has(resourceId) && g >= RESOURCE_VISIBLE_GROWTH)
          layers.push({ kind: 'resource', resourceId });
      }
    }
    const floor = buildings.find((b) => b.x === x && b.y === y && isFloorBuilding(b));
    if (floor) layers.push({ kind: 'building', id: floor.id });
    const roof = buildings.find((b) => b.x === x && b.y === y && isRoofBuilding(b));
    if (roof) layers.push({ kind: 'building', id: roof.id });
    return layers;
  }

  function selectTileAt(x: number, y: number): boolean {
    const clickedBuilding = buildings.find(
      (b) => b.x === x && b.y === y && !isRoofBuilding(b) && !isFloorBuilding(b)
    );
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
    if (!isHiddenTile(x, y)) {
      const active = Object.entries(tileData?.resources ?? {}).find(([, v]) => v > 0);
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
      } else if (debugBrush.kind === 'kill') {
        const victim =
          findPawnAtTile(hoverTileX, hoverTileY) ?? findMobAtTile(hoverTileX, hoverTileY);
        if (victim)
          gameState.command({ type: 'devKillEntity', payload: { id: victim.id }, save: true });
      } else if (debugBrush.kind === 'resurrect') {
        gameState.command({
          type: 'devResurrectAt',
          payload: { x: hoverTileX, y: hoverTileY },
          save: true
        });
      }
      redrawOverlay();
      return;
    }

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
      drawDesignations();
      return;
    }

    if (markedKind) {
      markedKind = null;
      markedIds = [];
      markedSet = new Set();
      moveAimArmed = false;
    }

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
    onSheetLoaded(() => {
      redrawHudSpriteIcons();
      drawDesignations();
    });
    if (browser) await init();
  });

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
    unsubAnimPause();
    unsubAttackLunges();
    unsubProjectiles();
    _unsubMenuPerf();
    if (menuPreview) menuPreviewRendered.set(false);
    else rendererReady.set(false);
    if (browser) {
      cancelAnimationFrame(animationId);
      stopFreezeWatchdog();
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
        tileWidth = tileHeight = Math.min(MAX_TILE_W, fitTileSize * MENU_PREVIEW_ZOOM);
        const mapW = worldMap.length > 0 ? worldMap[0].length : MAP_W;
        const mapH = worldMap.length > 0 ? worldMap.length : MAP_H;
        const visW = Math.ceil(canvas.width / tileWidth);
        const visH = Math.ceil(canvas.height / tileHeight);
        viewX = Math.max(0, Math.floor((mapW - visW) / 2));
        viewY = Math.max(0, Math.floor((mapH - visH) / 2)) + 0.5;
      } else {
        try {
          const saved = sessionStorage.getItem(CAMERA_STORAGE_KEY);
          if (saved) {
            const c = JSON.parse(saved);
            if (typeof c.tileWidth === 'number')
              tileWidth = tileHeight = Math.max(fitTileSize, Math.min(MAX_TILE_W, c.tileWidth));
            if (typeof c.viewX === 'number') viewX = c.viewX;
            if (typeof c.viewY === 'number') viewY = c.viewY;
          }
        } catch {}
      }

      pathfinderService.init().catch((e) => console.warn('[GameCanvas] WASM init failed:', e));

      renderer = new WebGLRenderer({
        canvas,
        tileWidth,
        tileHeight,
        contextAttributes: { alpha: false, antialias: false, powerPreference: 'high-performance' }
      });

      const ok = await renderer.waitForInitialization();
      if (!ok || !renderer.isReady()) throw new Error('Renderer init failed');

      if (worldMap.length > 0) {
        _fullRebuildTerrain();
        renderer.setGrid(_terrainGrid!);
      } else {
        renderer.setGrid(generatePlaceholderGrid());
      }
      renderer.setViewTileOffset(viewX, viewY);
      renderer.setLightSampler((wx, wy) => lightingService.samplePointStatic(wx, wy));
      {
        const { light, tint } = environmentService.getAmbient($gameState?.turn ?? 0);
        const tinted = environmentService.getMapAmbientTint(
          tint,
          $gameState ? environmentService.effectiveSeason($gameState) : undefined,
          $gameState?.weather
        );
        renderer.setAmbient(light, tinted);
        lightingService.setAmbient(light, tinted);
        if (worldMap.length === 0) refreshEmitters();
        _ambientLight = light;
        _ambientTint = tinted;
      }

      ready = true;
      if (!menuPreview) rendererReady.set(true);
      startLoop();

      new ResizeObserver(() => {
        if (!renderer || !container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        canvas.width = w;
        canvas.height = h;
        renderer.resize(w, h);
        drawDesignations();
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

  function updateCameraFollow(dt: number) {
    if (!cameraFollowPawnId || !ready || !renderer?.isReady()) return;
    const rp = pawnRenderPos.get(cameraFollowPawnId);
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

  function updateKeyboardPan(dt: number) {
    if (dt <= 0 || !ready || menuPreview) return;
    if (cameraFollowPawnId || cameraFollowMobId) {
      panVelX = panVelY = 0;
      return;
    }
    const tx = (heldPan.right ? 1 : 0) - (heldPan.left ? 1 : 0);
    const ty = (heldPan.down ? 1 : 0) - (heldPan.up ? 1 : 0);
    const a = 1 - Math.exp(-dt / PAN_SMOOTH_TAU);
    panVelX += (tx * PAN_SPEED - panVelX) * a;
    panVelY += (ty * PAN_SPEED - panVelY) * a;
    if (tx === 0 && Math.abs(panVelX) < 0.02) panVelX = 0;
    if (ty === 0 && Math.abs(panVelY) < 0.02) panVelY = 0;
    if (panVelX === 0 && panVelY === 0) return;
    setView(viewX + panVelX * dt, viewY + panVelY * dt);
  }

  function startLoop() {
    let lastFpsPush = 0;
    let lastDrawAt = 0;
    let _rpWinStart = 0;
    let _rpFrames = 0;
    let _rpDtSum = 0;
    let _rpMaxDt = 0;
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
    const FROZEN_SAFETY_MS = 400;
    function frame() {
      if (!renderer || !ready) return;
      try {
        beat('frame');
        const now = performance.now();
        const dt = lastFrameTime ? (now - lastFrameTime) / 1000 : 0;
        lastFrameTime = now;
        if (dt > 0) {
          _rpFrames++;
          _rpDtSum += dt;
          if (dt > _rpMaxDt) _rpMaxDt = dt;
        }
        if (_rpWinStart === 0) _rpWinStart = now;
        else if (now - _rpWinStart >= 1000) {
          const el = now - _rpWinStart;
          const st = renderer.getStats();
          const gs = get(gameState);
          vlog(
            'perf',
            gs.turn,
            `render fps=${Math.round((_rpFrames * 1000) / el)} ` +
              `frameAvg=${((_rpDtSum * 1000) / Math.max(1, _rpFrames)).toFixed(1)}ms ` +
              `frameMax=${(_rpMaxDt * 1000).toFixed(1)}ms ` +
              `terrain=${st.terrainMs.toFixed(2)}ms overlay=${st.overlayMs.toFixed(2)}ms ` +
              `rebuilds=${st.terrainRebuilds} resourceRebuilds=${st.resourceRebuilds} ` +
              `draws=${st.drawCalls} verts=${st.vertexCount} ` +
              `mobs=${gs.mobs?.length ?? 0} pawns=${gs.pawns?.length ?? 0}`
          );
          _rpWinStart = now;
          _rpFrames = 0;
          _rpDtSum = 0;
          _rpMaxDt = 0;
        }
        gameState.stepSimulation(dt * 1000);
        if (customMapPreview) {
          pawnOverlayGrid.clear();
          itemOverlayGrid.clear();
          buildingOverlayGrid.clear();
        } else {
          updatePawnOverlay(dt);
        }
        if (cursorOverCanvas && (cameraFollowPawnId || cameraFollowMobId)) {
          hoverTileX = Math.floor(lastCursorCx / tileWidth + viewX);
          hoverTileY = Math.floor(lastCursorCy / tileHeight + viewY);
        }
        updateHoverEntity();
        updateCameraFollow(dt);
        updateCameraFollowMob(dt);
        updateKeyboardPan(dt);
        if (now - _lairScanAt > 4000) {
          _lairScanAt = now;
          rebuildLairTiles();
        }
        updateWorldEffectOverlays();
        if (
          _terrainDirty &&
          (_forceTerrainRebuild || now - _lastTerrainBuild >= TERRAIN_REBUILD_MIN_MS)
        ) {
          _terrainDirty = false;
          _forceTerrainRebuild = false;
          _lastTerrainBuild = now;
          beat('terrain-rebuild');
          redrawOverlayNow();
        }
        if (_snowDirty && now - _lastSnowBuild >= TERRAIN_REBUILD_MIN_MS) {
          _snowDirty = false;
          _lastSnowBuild = now;
          _queueSnowDeltas();
        }
        if (_snowPendingChunks.size > 0) repaintSnowNow();
        if (_foliagePending.length > 0) {
          beat(`foliage ${_foliagePending.length - _foliageIdx}`);
          _processFoliageTransition();
        }
        const frozen = !menuPreview && (customMapPreview || tileWidth < FREEZE_TILE_PX);
        if (_renderDirty || !frozen || now - lastDrawAt >= FROZEN_SAFETY_MS) {
          beat('gl:setgrids');
          renderer.setResourceOverlayGrid(_resourceGrid);
          renderer.setResourceTallOverlayGrid(_resourceTallGrid);
          renderer.setBuildingOverlayGrid(buildingOverlayGrid);
          renderer.setItemOverlayGrid(itemOverlayGrid);
          renderer.setOverlayGrid(pawnOverlayGrid);
          const _dbgT0 = menuPreview && _menuPerfOn ? performance.now() : 0;
          if (_heavyRenderReason) {
            crashBreadcrumb(
              get(gameState).turn,
              `→ heavy draw START: ${_heavyRenderReason} (prevVerts≈${renderer.getStats().vertexCount}, tile=${tileWidth.toFixed(1)}px)`
            );
          }
          beat(`gl-draw${_heavyRenderReason ? ':' + _heavyRenderReason : ''}`, get(gameState).turn);
          renderer.beginFrame();
          renderer.endFrame();
          beat('idle');
          if (_heavyRenderReason) {
            const _hst = renderer.getStats();
            crashBreadcrumb(
              get(gameState).turn,
              `✓ heavy draw OK: ${_heavyRenderReason} rebuilds=${_hst.terrainRebuilds} resRebuilds=${_hst.resourceRebuilds} draws=${_hst.drawCalls} verts=${_hst.vertexCount} frame=${_hst.frameTime.toFixed(1)}ms`
            );
            _heavyRenderReason = '';
          }
          if (menuPreview && _menuPerfOn) {
            const renderMs = performance.now() - _dbgT0;
            const gap = _dbgPrevT ? now - _dbgPrevT : 0;
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
          if (menuPreview && !_previewPainted) {
            _previewPainted = true;
            menuPreviewRendered.set(true);
          }
          if (now - lastFpsPush > 250) {
            lastFpsPush = now;
            renderFps.set(Math.round(renderer.getStats().fps));
          }
        } else if (now - lastFpsPush > 250) {
          lastFpsPush = now;
          renderFps.set(0);
        }
        animationId = requestAnimationFrame(frame);
      } catch (_frameErr) {
        crashBreadcrumb(
          get(gameState).turn,
          `FRAME EXCEPTION — ${(_frameErr as Error)?.stack || String(_frameErr)}`
        );
        throw _frameErr;
      }
    }
    startFreezeWatchdog();
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
    if (menuPreview) return;
    if (saveCameraTimer !== null) clearTimeout(saveCameraTimer);
    saveCameraTimer = setTimeout(() => {
      saveCameraTimer = null;
      sessionStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify({ viewX, viewY, tileWidth }));
    }, 200);
  }

  function setView(x: number, y: number) {
    [viewX, viewY] = clampView(x, y);
    renderer?.setViewTileOffset(viewX, viewY);
    markRenderDirty();
    saveCameraState();
    drawDesignations();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!ready || menuPreview) return;

    if (get(wasdPan) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'a':
          heldPan.left = true;
          e.preventDefault();
          return;
        case 'd':
          heldPan.right = true;
          e.preventDefault();
          return;
        case 'w':
          heldPan.up = true;
          e.preventDefault();
          return;
        case 's':
          heldPan.down = true;
          e.preventDefault();
          return;
      }
    }

    switch (e.key) {
      case 'ArrowLeft':
        heldPan.left = true;
        e.preventDefault();
        break;
      case 'ArrowRight':
        heldPan.right = true;
        e.preventDefault();
        break;
      case 'ArrowUp':
        heldPan.up = true;
        e.preventDefault();
        break;
      case 'ArrowDown':
        heldPan.down = true;
        e.preventDefault();
        break;
      case 'Escape': {
        let dismissed = true;
        if (debugBrush) {
          uiState.deactivateDebugBrush();
          redrawOverlay();
        } else if (showFuelSettings) {
          showFuelSettings = false;
        } else if (showRepairSettings) {
          showRepairSettings = false;
        } else if (showStorageSettings) {
          showStorageSettings = false;
        } else if (showFoodSettings) {
          showFoodSettings = false;
        } else if (showZoneFilter) {
          showZoneFilter = false;
        } else if (moveAimActive || moveAimArmed) {
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
          dismissed = false;
        }
        if (dismissed) {
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

  function handleKeyUp(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowLeft':
        heldPan.left = false;
        break;
      case 'ArrowRight':
        heldPan.right = false;
        break;
      case 'ArrowUp':
        heldPan.up = false;
        break;
      case 'ArrowDown':
        heldPan.down = false;
        break;
    }
    switch (e.key.toLowerCase()) {
      case 'a':
        heldPan.left = false;
        break;
      case 'd':
        heldPan.right = false;
        break;
      case 'w':
        heldPan.up = false;
        break;
      case 's':
        heldPan.down = false;
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
      const base = atFit
        ? Math.ceil(fitTileSize / ZOOM_STEP) * ZOOM_STEP
        : Math.round(tileWidth) + ZOOM_STEP;
      newW = Math.min(MAX_TILE_W, base <= fitTileSize ? base + ZOOM_STEP : base);
    } else {
      const nextDown = Math.round(tileWidth) - ZOOM_STEP;
      newW = nextDown <= fitTileSize ? fitTileSize : nextDown;
    }

    if (Math.abs(newW - tileWidth) < 0.001) return;

    const visWBefore = (container?.clientWidth ?? 800) / tileWidth;
    const visHBefore = (container?.clientHeight ?? 600) / tileHeight;
    tileWidth = newW;
    tileHeight = newW;
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
    if (e.button === 2) {
      if (moveAimCount === 0 || hoverTileX < 0 || hoverTileY < 0) return;
      const groupMove = markedKind === 'pawn' && markedDraftedCount > 0;
      if (groupMove) {
        if (mobAt(hoverTileX, hoverTileY)) return;
      } else {
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
      startMoveAim();
      return;
    }
    if (markKind) {
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
      zoneDragActive = true;
      zoneAnchorX = hoverTileX;
      zoneAnchorY = hoverTileY;
      zoneEndX = hoverTileX;
      zoneEndY = hoverTileY;
      drawDesignations();
      return;
    }
    if (blueprintBuildingId) {
      blueprintDragActive = true;
      blueprintAnchorX = hoverTileX;
      blueprintAnchorY = hoverTileY;
      redrawOverlay();
      return;
    }
    if (e.shiftKey) {
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
    if (cameraFollowPawnId || cameraFollowMobId) dragDistance = -Infinity;
    else dragDistance = 0;
  }

  function handleMouseMove(e: MouseEvent) {
    if (menuPreview) return;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      lastCursorCx = cx;
      lastCursorCy = cy;
      hoverTileX = Math.floor(cx / tileWidth + viewX);
      hoverTileY = Math.floor(cy / tileHeight + viewY);
      cursorOverCanvas = true;
      updateHoverEntity();
    }
    if (moveAimActive) {
      moveAimEndX = hoverTileX;
      moveAimEndY = hoverTileY;
      recomputeMoveAim();
      drawDesignations();
      return;
    }
    if (zoneDragActive) {
      zoneEndX = hoverTileX;
      zoneEndY = hoverTileY;
      drawDesignations();
      return;
    }
    if (markDragActive) {
      markEndX = hoverTileX;
      markEndY = hoverTileY;
      drawDesignations();
      return;
    }
    if (similarDragActive) {
      similarEndX = hoverTileX;
      similarEndY = hoverTileY;
      drawDesignations();
      return;
    }
    if (blueprintDragActive) {
      redrawOverlay();
      return;
    }
    if (selDragActive) {
      selEndX = hoverTileX;
      selEndY = hoverTileY;
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
      const bid = blueprintBuildingId;
      const rectTiles = _blueprintRectTiles();
      if (bid && rectTiles.size > 0) {
        const buildingDef = buildingService.getBuildingById(bid);
        if (buildingDef) {
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
      drawDesignations();
      return;
    }
    if (selDragActive) {
      selDragActive = false;
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
      drawDesignations();
      return;
    }
    if (dragDistance < 3 && !customMapPreview && !menuPreview) {
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
    } else {
      const { x, y } = selectedResourceTile;
      gameState.command({ type: 'designate', payload: { x, y, type: resolvedType }, save: true });
    }
    drawDesignations();
  }

  function cancelResourceDesignation() {
    if (!selectedResourceTile) return;
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
    } else {
      const { x, y } = selectedResourceTile;
      gameState.command({ type: 'clearActionDesignation', payload: { x, y }, save: true });
    }
    drawDesignations();
  }

  function dragMarkKind(): 'pawn' | 'mob' | 'resource' {
    if (markedKind) return markedKind;
    if (selectedResourceTile || selectedResourceTypes.size > 0) return 'resource';
    if (selectedMobId) return 'mob';
    return 'pawn';
  }

  function shiftClickTile(x: number, y: number) {
    const pawn = findPawnAtTile(x, y);
    if (pawn) return addEntityToMark('pawn', pawn.id);
    const mob = findMobAtTile(x, y);
    if (mob) return addEntityToMark('mob', mob.id);
    shiftSelectResourceAt(x, y);
  }

  function markBase(kind: 'pawn' | 'mob'): string[] {
    if (markedKind === kind) return [...markedIds];
    const selId = kind === 'pawn' ? selectedPawnId : selectedMobId;
    return selId ? [selId] : [];
  }

  function addEntityToMark(kind: 'pawn' | 'mob', id: string) {
    const base = markBase(kind);
    const ids = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    markedKind = ids.length > 0 ? kind : null;
    markedIds = ids;
    markedSet = new Set(ids);
    selectedResourceTile = null;
    selectedResourceTypes = new Set();
    drawDesignations();
  }

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

  function shiftSelectResourceAt(x: number, y: number) {
    if (isHiddenTile(x, y)) return;
    const res = worldMap[y]?.[x]?.resources;
    if (!res) return;
    const rid = Object.entries(res).find(([id, v]) => {
      if (v <= 0) return false;
      const def = resourceObjectService.getById(id);
      return !!def && def.designationTypes.length > 0;
    })?.[0];
    if (!rid) return;
    markedKind = null;
    markedIds = [];
    markedSet = new Set();
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

  function clearResourceMark() {
    highlightedResourceTiles = new Set();
    selectedResourceTypes = new Set();
    drawDesignations();
  }

  function startMarkDrag(kind: 'pawn' | 'mob') {
    markKind = kind;
    markDragActive = false;
    markedKind = null;
    markedIds = [];
    markedSet = new Set();
    moveAimArmed = false;
  }

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
    drawDesignations();
  }

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

  function draftMarkedPawns() {
    if (markedKind !== 'pawn' || markedIds.length === 0) return;
    gameState.command({
      type: 'draftPawns',
      payload: { ids: markedIds, drafted: !markedAllDrafted },
      save: true
    });
  }

  function forceMarkedPawnsJob(jobType: 'construct' | 'harvest') {
    if (markedKind === 'pawn' && markedIds.length > 0) {
      gameState.command({ type: 'forcePawnJob', payload: { ids: markedIds, jobType }, save: true });
    }
    clearMark();
  }

  function huntMarkedMobs() {
    if (markedKind === 'mob' && markedIds.length > 0) {
      gameState.command({ type: 'markMobsForHunt', payload: { ids: markedIds }, save: true });
    }
    clearMark();
  }

  function armMoveAim() {
    if (moveAimCount > 0) moveAimArmed = true;
  }

  function moveAimIds(): string[] {
    if (markedKind === 'pawn' && markedDraftedCount > 0) {
      return pawns.filter((p) => p.drafted && markedSet.has(p.id)).map((p) => p.id);
    }
    if (selectedPawn?.drafted) return [selectedPawn.id];
    return [];
  }

  function hasAttackTargetAt(x: number, y: number): boolean {
    if (mobs.some((m) => m.x === x && m.y === y && m.isAlive !== false)) return true;
    return pawns.some(
      (p) =>
        p.id !== selectedPawnId && p.position?.x === x && p.position?.y === y && p.isAlive !== false
    );
  }

  function mobAt(x: number, y: number) {
    return mobs.find((m) => m.x === x && m.y === y && m.isAlive !== false) ?? null;
  }

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

  function recomputeMoveAim() {
    const ids = moveAimIds();
    if (ids.length === 0) {
      moveAimSlots = [];
      return;
    }
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

  function commitMoveAim() {
    const ids = moveAimIds();
    const ax = moveAimAnchorX;
    const ay = moveAimAnchorY;
    const bx = moveAimEndX;
    const by = moveAimEndY;
    moveAimActive = false;
    moveAimArmed = false;
    moveAimSlots = [];
    _aimCommitted = true;
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
  let showStorageSettings = false;
  let showRepairSettings = false;
  let fuelSettingsForBuildingId: string | null = null;

  $: {
    const nextId = selectedBuilding?.id ?? null;
    if (nextId !== fuelSettingsForBuildingId) {
      showFuelSettings = false;
      showStorageSettings = false;
      showRepairSettings = false;
      fuelSettingsForBuildingId = nextId;
    }
  }

  function toggleFuelSettingsPanel() {
    showFuelSettings = !showFuelSettings;
    if (showFuelSettings) {
      showStorageSettings = false;
      showRepairSettings = false;
    }
  }

  function toggleStorageSettingsPanel() {
    showStorageSettings = !showStorageSettings;
    if (showStorageSettings) {
      showFuelSettings = false;
      showRepairSettings = false;
    }
  }

  function toggleRepairSettingsPanel() {
    showRepairSettings = !showRepairSettings;
    if (showRepairSettings) {
      showFuelSettings = false;
      showStorageSettings = false;
    }
  }

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

  let equipMenu: { x: number; y: number; entries: { label: string; run: () => void }[] } | null =
    null;

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

  function slotLabel(slot: string): string {
    return slot
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    if (menuPreview) return;
    if (_aimCommitted) {
      _aimCommitted = false;
      return;
    }
    equipMenu = null;
    if (hoverTileX < 0 || hoverTileY < 0) return;

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

    if (markedKind === 'pawn' && markedDraftedCount > 0) {
      const mob = mobAt(hoverTileX, hoverTileY);
      if (mob) {
        const ids = pawns.filter((p) => p.drafted && markedSet.has(p.id)).map((p) => p.id);
        gameState.command({
          type: 'attackTargetWith',
          payload: { ids, targetId: mob.id, targetType: 'mob' },
          save: true
        });
        return;
      }
    }

    if (selectedPawn) {
      const isDrafted = !!selectedPawn.drafted;
      const pawnId = selectedPawn.id;
      const shift = e.shiftKey;
      const tileX = hoverTileX;
      const tileY = hoverTileY;
      const issueOrder = (target: unknown, append = shift) =>
        gameState.command({
          type: 'setPawnDraftTarget',
          payload: { pawnId, target, append },
          save: true
        });

      {
        const traderMob = mobs.find(
          (m) =>
            m.x === tileX &&
            m.y === tileY &&
            m.isAlive !== false &&
            m.partyRole === 'trader' &&
            m.partyId
        );
        if (traderMob) {
          const entries: { label: string; run: () => void }[] = [
            {
              label: `Trade — ${selectedPawn.name} negotiates`,
              run: () => uiState.openTrade(traderMob.partyId!, pawnId)
            }
          ];
          if (isDrafted) {
            entries.push({
              label: 'Attack — their kingdom will not forgive it',
              run: () =>
                issueOrder({ type: 'attack', targetId: traderMob.id, targetType: 'mob' }, false)
            });
          }
          equipMenu = { x: e.clientX, y: e.clientY, entries };
          return;
        }
      }

      if (isDrafted) {
        const issueAttack = (
          targetId: string,
          targetType: 'pawn' | 'mob',
          mode?: 'ranged' | 'melee'
        ) => issueOrder({ type: 'attack', targetId, targetType, mode }, false);
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
        const targetMob = mobs.find((m) => m.x === tileX && m.y === tileY && m.isAlive !== false);
        if (targetMob) {
          offerAttack(targetMob.id, 'mob');
          return;
        }
        const targetPawn = pawns.find(
          (p) =>
            p.id !== pawnId &&
            p.position?.x === tileX &&
            p.position?.y === tileY &&
            p.isAlive !== false
        );
        if (targetPawn) {
          offerAttack(targetPawn.id, 'pawn');
          return;
        }
      }

      const issueMove = () => issueOrder({ type: 'move', x: tileX, y: tileY }, false);

      const entries: { label: string; run: () => void }[] = [];

      const seenJobLabels = new Set<string>();
      for (const j of $gameState?.jobs ?? []) {
        if (j.targetX !== tileX || j.targetY !== tileY) continue;
        const label = jobService.getJobLabel(j.type) ?? j.type;
        if (seenJobLabels.has(label)) continue;
        seenJobLabels.add(label);
        const jobId = j.id;
        entries.push({ label, run: () => issueOrder({ type: 'forceJob', jobId }) });
      }

      for (const b of $gameState?.buildings ?? []) {
        if (b.x !== tileX || b.y !== tileY || b.status !== 'complete') continue;
        for (const e of b.fluidContents ?? []) {
          if ((e.litres ?? 0) <= 0) continue;
          const hasVessel = (droppedItems ?? []).some(
            (d) =>
              d.stored &&
              !d.reservedFor &&
              !d.forbidden &&
              d.instance &&
              !d.instance.contents?.length &&
              roomFor(d.instance, e.itemId, 0.001) > 0
          );
          if (!hasVessel) continue;
          const fluidName = itemService.getItemById(e.itemId)?.name ?? e.itemId;
          const stationName = buildingService.getBuildingById(b.type)?.name ?? b.type;
          entries.push({
            label: `Draw ${fluidName} from the ${stationName}`,
            run: () =>
              gameState.command({
                type: 'drawFluidFromStation',
                payload: { buildingId: b.id, itemId: e.itemId, pawnId },
                save: true
              })
          });
        }
      }

      const tileItems = droppedItems.filter(
        (d) => d.x === tileX && d.y === tileY && d.quantity > 0
      );
      for (const d of tileItems) {
        const it = itemService.getItemById(d.resourceId);
        if (!it) continue;
        const name = itemService.getItemDisplayName(d);
        const slot = getEquipmentSlot(it);
        if (slot) {
          const equipOrder = (target?: EquipmentSlot | 'inventory') =>
            issueOrder({ type: 'equip', dropId: d.id, x: tileX, y: tileY, slot: target });
          if (it.type === 'weapon') {
            entries.push({ label: `Equip ${name} → Main Hand`, run: () => equipOrder('mainHand') });
            if (!it.weaponProperties?.twoHanded) {
              entries.push({ label: `Equip ${name} → Off Hand`, run: () => equipOrder('offHand') });
            }
          } else if (it.type === 'tool') {
            const handTool = slot === 'mainHand' || slot === 'offHand';
            entries.push({
              label: handTool ? `Equip ${name} → Main Hand` : `Equip ${name} → ${slotLabel(slot)}`,
              run: () => equipOrder(handTool ? 'mainHand' : slot)
            });
            entries.push({
              label: `Carry ${name} (inventory)`,
              run: () => equipOrder('inventory')
            });
          } else {
            entries.push({ label: `Equip ${name} → ${slotLabel(slot)}`, run: () => equipOrder() });
          }
          continue;
        }
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
        if (d.instance?.contents?.length) {
          entries.push({
            label: `Empty ${name} on the ground`,
            run: () =>
              gameState.command({
                type: 'emptyVessel',
                payload: { instanceId: d.instance!.instanceId },
                save: true
              })
          });
        }
        if (!isDrafted && isEdibleFood(it)) {
          entries.push({
            label: `Eat ${name}`,
            run: () => issueOrder({ type: 'forceConsume', dropId: d.id, x: tileX, y: tileY })
          });
        }
      }

      if (!isDrafted) {
        const wt = worldMap[tileY]?.[tileX];
        if (
          wt &&
          (wt.type === 'water' || wt.terrainType === 'river' || wt.terrainType === 'lake')
        ) {
          entries.push({
            label: 'Drink',
            run: () => issueOrder({ type: 'drink', x: tileX, y: tileY })
          });
        }
      }

      if (isDrafted) {
        const looseHere = tileItems.some((d) => !d.stored && !d.reservedFor);
        const tileIsStockpile =
          (zoneTiles[`${tileX},${tileY}`] ?? []).includes('stockpile') ||
          buildings.some((b) => b.x === tileX && b.y === tileY && buildingIsStorageBin(b));
        const stockpileExists =
          Object.values(zoneTiles).some((t) => t.includes('stockpile')) || hasStorageBin;
        if (looseHere && stockpileExists && !tileIsStockpile) {
          entries.push({
            label: 'Haul to stockpile',
            run: () => gameState.haulTileToStockpile(pawnId, tileX, tileY)
          });
        }
      }

      if (designationService.getDesignation(tileX, tileY, $gameState)) {
        entries.push({
          label: 'Cancel order here',
          run: () => {
            gameState.command({
              type: 'clearActionDesignation',
              payload: { x: tileX, y: tileY },
              save: true
            });
            redrawOverlay();
          }
        });
      }

      if (isDrafted) entries.push({ label: 'Move here', run: issueMove });

      if (entries.length > 0) {
        equipMenu = { x: e.clientX, y: e.clientY, entries };
        return;
      }
      if (isDrafted) {
        issueMove();
        return;
      }
    }

    if (designationMode) {
      gameState.command({
        type: 'clearDesignation',
        payload: { x: hoverTileX, y: hoverTileY },
        save: true
      });
      redrawOverlay();
    } else if (designationService.getDesignation(hoverTileX, hoverTileY, $gameState)) {
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
  on:keyup={handleKeyUp}
  on:blur={clearHeldPan}
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

  {#if debugBrush}
    <div class="designation-hud" style:border-color="#c8a048" style:color="#e0b868">
      [DEBUG: {debugBrush.kind === 'regrow'
        ? 'REGROW'
        : debugBrush.kind === 'building'
          ? 'SPAWN BUILDING'
          : debugBrush.kind === 'kill'
            ? 'KILL'
            : debugBrush.kind === 'resurrect'
              ? 'RESURRECT'
              : 'SPAWN RESOURCE'}] click {debugBrush.kind === 'kill'
        ? 'a pawn/mob to kill it'
        : debugBrush.kind === 'resurrect'
          ? 'a corpse to revive it'
          : 'tiles to apply'} · Esc to stop
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
      [⊞ SELECT {(resourceObjectService.getById(similarDragResourceId)?.displayName ??
        similarDragResourceId
      ).toUpperCase()}] — drag to designate all ·
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

  {#if !customMapPreview && !menuPreview}
    {#if markedGroupCard}
      <SelectedEntityCard model={markedGroupCard} />
    {:else if selectedPawnCard}
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
      <SelectedEntityCard model={selectedMobCard} />
    {:else if selectedBuilding}
      {@const canConfigureFuel =
        selectedBuilding.status === 'complete' &&
        !selectedBuilding.deconstructQueued &&
        buildingService.getBuildingById(selectedBuilding.type)?.maxFuel !== undefined}
      {@const canConfigureStorage =
        selectedBuilding.status === 'complete' &&
        !selectedBuilding.deconstructQueued &&
        (buildingService.getBuildingById(selectedBuilding.type)?.effects?.storageStacks ?? 0) > 0}
      {@const canConfigureRepair =
        selectedBuilding.status === 'complete' &&
        !selectedBuilding.deconstructQueued &&
        buildingService.deterioratingRate(selectedBuilding.type) > 0}
      {@const bt = worldMap[selectedBuilding.y]?.[selectedBuilding.x]}
      {@const clickedBin = buildingIsStorageBin(selectedBuilding)
        ? droppedItems.filter(
            (d) => d.stored && d.x === selectedBuilding.x && d.y === selectedBuilding.y
          )
        : []}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="bld-row"
        role="presentation"
        on:mousedown|stopPropagation
        on:mouseup|stopPropagation
      >
        {#if buildingModel}
          <SelectedEntityCard model={buildingModel} embedded>
            {#snippet body()}
              <BuildingInfo
                building={selectedBuilding}
                detailed
                showHeader={false}
                binContents={clickedBin}
                gameState={$gameState}
              />
              {#if bt}
                {@const benv = tileEnv(bt)}
                <EnvReadout
                  light={benv.light}
                  temp={benv.temp}
                  wet={benv.wet}
                  wind={benv.wind}
                  debugTemp={$debugMode ? seasonBakedTemp(bt.terrainType, $currentSeason) : null}
                />
              {/if}
            {/snippet}
          </SelectedEntityCard>
        {/if}
        {#if canConfigureFuel}
          <BuildingFuelPanel building={selectedBuilding} {pawns} open={showFuelSettings} />
        {/if}
        {#if canConfigureRepair}
          <BuildingRepairPanel building={selectedBuilding} {pawns} open={showRepairSettings} />
        {/if}
        {#if canConfigureStorage}
          <BuildingStoragePanel building={selectedBuilding} open={showStorageSettings} />
        {/if}
      </div>
    {:else if selectedZone && zoneCard}
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
          priority={selectedZone.priority ?? 'normal'}
          containerBudget={selectedZone.containerBudget ?? 0}
          open={showZoneFilter}
        />
      </div>
    {:else if selectedItemCard}
      <SelectedEntityCard model={selectedItemCard} />
    {:else if multiResourceCard}
      <SelectedEntityCard model={multiResourceCard} />
    {:else if resourceCard}
      <SelectedEntityCard model={resourceCard} />
    {:else if hoverPawnCard}
      <SelectedEntityCard model={hoverPawnCard} />
    {:else if hoverMobCard}
      <SelectedEntityCard model={hoverMobCard} />
    {:else if hoverBuilding && !hoverPawn}
      <div class="tile-hud tile-hud--building">
        <div class="tile-hud-body">
          <BuildingInfo building={hoverBuilding} binContents={hoverBin ? hoverBinContents : []} />
          {#if hoverTile}
            {@const env = tileEnv(hoverTile)}
            <EnvReadout
              light={env.light}
              temp={env.temp}
              wet={env.wet}
              wind={env.wind}
              debugTemp={$debugMode ? seasonBakedTemp(hoverTile.terrainType, $currentSeason) : null}
            />
          {/if}
        </div>
      </div>
    {:else if hoverItemCard}
      <SelectedEntityCard model={hoverItemCard} />
    {:else if hoverTile}
      {@const tileThermal = computeThermalAt(hoverTile.x, hoverTile.y, buildings, worldMap)}
      {@const tileTemp = Math.round(
        tileTemperature(
          hoverTile.terrainType,
          $currentSeason,
          environmentService.ambientTurn($gameState ?? { turn: 0 }),
          $currentWeather,
          tileThermal
        )
      )}
      {@const tileIce = Math.round(hoverTile.ice ?? 0)}
      {@const tileWet =
        tileWetness(hoverTile.moisture ?? 0, $currentWeather, tileThermal, tileIce) *
        (hoverTile.floor ? 1 - hoverTile.floor.dryness : 1)}
      {@const windWord = windDegreeWord(
        effectiveWindAt(hoverTile.x, hoverTile.y, $currentWeather, tileThermal, worldMap)
      )}
      {@const tileSnow = Math.round(hoverTile.snow ?? 0)}
      {@const soilTier = soilTierForTile(hoverTile)}
      {@const soilPct = soilFertilityPct(hoverTile)}
      <div class="tile-hud">
        <div class="tile-hud-body">
          <span class="tile-coord">({hoverTile.x},{hoverTile.y})</span><span class="tile-layers"
            >{BIOMES[hoverTile.terrainType]?.displayName ??
              hoverTile.terrainType},{hoverFloorName ??
              SUBTERRAINS[hoverTile.subType]?.displayName ??
              hoverTile.subType},{hoverDisplayResource
              ? (resourceObjectService.getById(hoverDisplayResource)?.displayName ??
                hoverDisplayResource)
              : '—'}</span
          >
          {#if !hoverTile.walkable}
            <div class="tile-move" style="color:#cc4444">move: impassable</div>
          {:else}
            {@const effMoveCost = (hoverTile.movementCost ?? 1) * (1 + (tileSnow + tileIce) / 100)}
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
          <EnvReadout
            light={hoverTileLight}
            temp={tileTemp}
            wet={tileWet}
            wind={windWord}
            debugTemp={$debugMode ? seasonBakedTemp(hoverTile.terrainType, $currentSeason) : null}
          />
          <div class="tile-env">
            {#if tileThermal.roofed}
              {@const roofB = buildings.find(
                (b) =>
                  b.x === hoverTile.x &&
                  b.y === hoverTile.y &&
                  b.status === 'complete' &&
                  isRoofBuilding(b)
              )}
              {@const roofDef = roofB ? buildingService.getBuildingById(roofB.type) : null}
              <span
                style="color:#7e9fbf"
                title="under cover — this roof keeps rain and wind off the tile"
                >{roofDef?.name ?? 'roofed'}</span
              >{#if roofDef?.conditionDecayPerTurn}{@const cond = Math.round(
                  roofB?.condition ?? 100
                )}<span
                  style="color:{cond >= 70 ? '#68b030' : cond >= 35 ? '#c8a13a' : '#cc5544'}"
                  title="roof condition — weather wears it down; repair before it fails"
                >
                  {cond}%</span
                >{/if}
            {/if}
            {#if hoverDisplayResource && hoverTile.walkable}
              {@const growRes = resourceObjectService.getById(hoverDisplayResource)}
              {#if growRes && isGrowableResource(growRes)}
                {@const gpct = Math.round(hoverTile.growth?.[hoverDisplayResource] ?? 100)}
                {@const dir = growRes.crop
                  ? cropGrowthDirection(gpct, growRes.crop, {
                      soilTier,
                      temp: tileTemp,
                      moisture: hoverTile.moisture ?? 0,
                      snow: tileSnow
                    })
                  : gpct >= 100
                    ? 'mature'
                    : 'rising'}
                {@const gi = growthIndicator(dir)}
                <span
                  style="color:{gpct >= 100 ? '#68b030' : gpct >= 50 ? '#9aac3a' : '#c89a3a'}"
                  title="resource maturity — scales harvest yield; crops grow only with enough fertility, warmth, water and light"
                  >growth {gpct}%</span
                ><span style="color:{gi.color}" title={gi.title}>{gi.glyph}</span>
              {/if}
            {/if}
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
            {#if hoverTile.walkable && tileSnow > 0}<span style="color:#cdd6e0"
                >snow {tileSnow}%</span
              >{/if}
            {#if hoverTile.walkable && tileIce >= ICE_VISIBLE}<span
                style="color:#9fc8e0"
                title="frozen layer — suppresses wetness; thick ice on water turns it walkable but slippery"
                >ice {tileIce}%</span
              >{/if}
          </div>
        </div>
      </div>
    {/if}
  {/if}

  {#if equipMenu}
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
    filter: url(#ambient-tint);
  }
  .ctx-item {
    text-align: left;
    padding: 5px 10px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    font-size: 12px;
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
    font-size: 12px;
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
    font-size: 13px;
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
    font-size: 13px;
  }
  .tile-hud {
    position: absolute;
    bottom: 6px;
    left: 6px;
    width: 340px;
    box-sizing: border-box;
    background: transparent;
    border: 1px solid transparent;
    color: #a07840;
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.5;
    padding: 2px 7px;
    pointer-events: none;
    white-space: normal;
    overflow-wrap: break-word;
    z-index: 10;
  }
  .tile-hud::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    background: rgba(28, 16, 6, 0.92);
    box-shadow: inset 0 0 0 1px #6b4a2a;
    filter: url(#ambient-tint);
    pointer-events: none;
  }
  .tile-hud-body {
    position: relative;
    z-index: 1;
    filter: url(#ambient-tint-legible);
  }

  .tile-zone {
    font-size: 10px;
    margin-top: 1px;
  }
  .tile-move {
    font-size: 10px;
    margin-top: 1px;
  }
  .tile-env {
    font-size: 10px;
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
    font-size: 12px;
    font-weight: bold;
    padding: 3px 10px;
    pointer-events: none;
    white-space: nowrap;
    z-index: 10;
  }
  .tile-hud--building {
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
    z-index: 10;
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
