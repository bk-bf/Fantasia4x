<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { browser } from '$app/environment';
  import { wasdPan, debugMode, vignetteOn, windSwayOn } from '$lib/stores/uiPrefs';
  import { WebGLRenderer, type SpriteLayer } from '$lib/webgl/renderer.js';
  import { crashBreadcrumb } from '$lib/webgl/crashLog.js';
  import { startFreezeWatchdog, beat, stopFreezeWatchdog } from '$lib/webgl/freezeWatchdog.js';
  import { passOn } from '$lib/webgl/passes.js';
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
  import { farZoomTileSize } from '$lib/components/UI/canvas/zoomLimits';
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
    Mob,
    ZoneInstance,
    EquipmentSlot
  } from '$lib/game/core/types.js';
  import type { GameGrid } from '$lib/webgl/game-grid.js';
  import { GameGrid as GameGridClass } from '$lib/webgl/game-grid.js';
  import { BASE_TILE_PX } from '$lib/webgl/tile-types.js';
  import { PAINTED_TILES, paintedEntity, paintedPawn } from '$lib/webgl/painted/tileset.js';
  import { PAINTED_LIGHT } from '$lib/webgl/painted/flag.js';
  import { pawnService } from '$lib/game/services/PawnService.js';
  import { pathfinderService } from '$lib/game/services/PathfinderService.js';
  import { designationService } from '$lib/game/services/DesignationService.js';
  import {
    environmentService,
    computeTileLightLevel
  } from '$lib/game/services/EnvironmentService.js';
  import { lightingService } from '$lib/game/services/LightingService.js';
  import { glyph, SHEET } from '$lib/webgl/tilesets.js';
  import { uiState } from '$lib/stores/uiState.js';
  import { animNow, setAnimPaused } from '$lib/stores/fx/animClock.js';
  import { combatFeedback } from '$lib/stores/fx/combatFeedback.js';
  import { EntityMotion } from './entityMotion.js';
  import {
    attackLunges,
    LUNGE_TTL_MS,
    type AttackLungeEvent
  } from '$lib/stores/fx/attackLunges.js';
  import { worldFx } from './worldFx/layer';
  import { renderFps } from '$lib/stores/perfStats.js';
  import { buildingService } from '$lib/game/services/BuildingService.js';
  import { roomFor } from '$lib/game/core/rules/gear/vessels';
  import { resolveCharSpans } from '$lib/game/core/defs/terrains.js';
  import {
    resourceObjectService,
    isGrowableResource
  } from '$lib/game/services/ResourceObjectService.js';
  import { RESOURCE_VISIBLE_GROWTH } from '$lib/game/core/rules/world/growthStages.js';
  import { isHarvestableTileNow } from '$lib/game/services/jobs/filters.js';
  import { itemService } from '$lib/game/services/ItemService.js';
  import { jobService } from '$lib/game/services/JobService.js';
  import { isEdibleFood } from '$lib/game/services/foodRules.js';
  import { getEquipmentSlot } from '$lib/game/core/rules/gear/equipment.js';
  import { getRangedWeapon } from '$lib/game/systems/rangedCombat.js';
  import { needsRecovery } from '$lib/game/systems/pawn/pawnHelpers';
  import { hasUntendedWound, pickTendMedicine } from '$lib/game/services/jobs/caretake';
  import { getCreatureById } from '$lib/game/core/defs/creatures.js';
  import { TICKS_PER_SECOND } from '$lib/game/core/util/time.js';
  import { vlog } from '$lib/game/core/util/logSink.js';
  import { simTarget } from '$lib/game/services/MovementSystem.js';
  import {
    brackets,
    dragBox,
    MARK_INK,
    type ScreenRect
  } from '$lib/components/UI/canvas/selectionMarks';
  import {
    BUILDING_SPRITES,
    drawnFirst,
    drawnTile,
    RESOURCE_SPRITES,
    spriteRect,
    type TileLayer
  } from '$lib/components/UI/canvas/drawnSelection';
  import VerbTag from '$lib/components/UI/hud/VerbTag.svelte';
  import PawnCard from '$lib/components/UI/hud/PawnCard.svelte';
  import BuildingCard from '$lib/components/UI/hud/BuildingCard.svelte';
  import CreatureCard from '$lib/components/UI/hud/CreatureCard.svelte';
  import ItemCard from '$lib/components/UI/hud/ItemCard.svelte';
  import ZoneCard from '$lib/components/UI/hud/ZoneCard.svelte';
  import {
    designationVerb,
    keyTiles,
    type TagVerb,
    type VerbTagModel
  } from '$lib/components/UI/canvas/verbTag';
  import type { EntityButton } from '$lib/components/UI/hud/entityCard';
  import {
    SHEET_CELL_W,
    SHEET_CELL_H,
    getSheet,
    loadSheet,
    onSheetLoaded,
    type SheetName
  } from '$lib/components/UI/canvas/spriteSheets';
  import { redrawHudSpriteIcons } from '$lib/components/UI/canvas/hudSpriteIcon';
  import { buildingTarget, storeTarget } from '$lib/components/UI/canvas/windowTargets';
  import TileTip from '$lib/components/UI/canvas/TileTip.svelte';
  import ContextMenu from '$lib/components/UI/canvas/ContextMenu.svelte';
  import QtyPrompt from '$lib/components/UI/canvas/QtyPrompt.svelte';
  import ModeBanner, { type BannerModel } from '$lib/components/UI/canvas/ModeBanner.svelte';
  import { envFacts, tileFacts } from '$lib/components/UI/canvas/tileFacts';
  import BuildingInfo from '$lib/components/UI/canvas/BuildingInfo.svelte';
  import { overlayDroppedItems, overlayBuildings } from '$lib/components/UI/canvas/overlay';
  import { buildingsVisualSig } from '$lib/game/core/state/buildingSig';
  import { lineFormationTargets } from '$lib/game/sim/commands';

  export let menuPreview = false;
  const MENU_PREVIEW_ZOOM = 2;
  const TIER_GLYPH_SCALE: Record<number, number> = { 1: 0.5, 2: 1, 3: 1.15, 4: 1.3, 5: 1.4 };
  const TIER_GLYPH_TINT: Record<number, number> = { 1: 0.72, 2: 1, 3: 1.1, 4: 1.2, 5: 1.35 };
  let _previewPainted = false;

  const MAP_W = 240;
  const MAP_H = 160;
  const MAX_TILE_W = 64;
  const ENTITY_RENDER_MIN_PX = 5;
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
    return farZoomTileSize(canvasW, canvasH, mapW, mapH);
  }

  let canvas: HTMLCanvasElement;
  let designCanvas: HTMLCanvasElement;
  let markCanvas: HTMLCanvasElement;
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
  let designationsStale = false;
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
  const motion = new EntityMotion();
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

  let simPaused = false;
  const unsubAnimPause = gameState.isPaused.subscribe((p) => {
    simPaused = p;
    setAnimPaused(p);
  });
  const unsubVignette = vignetteOn.subscribe((on) => renderer?.setVignette(on));
  const unsubSway = windSwayOn.subscribe((on) => {
    renderer?.setSway(on);
    markRenderDirty();
  });

  let attackLungeList: AttackLungeEvent[] = [];
  const unsubAttackLunges = attackLunges.subscribe((list) => {
    attackLungeList = list;
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
  function refreshEmitters(buildingList = buildings) {
    const emitters = [...lightingService.collectEmitters(buildingList), ...resourceGlowEmitters];
    lightingService.setEmitters(emitters);
    if (PAINTED_LIGHT) renderer?.setPointLights(emitters);
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
  let highlightedResourceTiles: Set<string> = new Set();

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
  $: hoverFactsInput = hoverTile
    ? {
        tile: hoverTile,
        light: hoverTileLight,
        floorName: hoverFloorName ?? null,
        resourceId: hoverDisplayResource,
        zoneType: hoverZoneType,
        buildings,
        worldMap,
        season: $currentSeason,
        weather: $currentWeather,
        ambientTurn: environmentService.ambientTurn($gameState ?? { turn: 0 }),
        debug: $debugMode
      }
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

  function findPawnAtTile(tx: number, ty: number, pawnList = pawns): Pawn | null {
    for (const pawn of pawnList) {
      const rp = pawnRenderPos.get(pawn.id);
      const cx = rp ? Math.round(rp.x) : (pawn.position?.x ?? -1);
      const cy = rp ? Math.round(rp.y) : (pawn.position?.y ?? -1);
      if (cx === tx && cy === ty) return pawn;
    }
    return null;
  }

  function findMobAtTile(tx: number, ty: number, mobList = mobs): Mob | null {
    for (const mob of mobList) {
      if (mob.state === 'Corpse') continue;
      const rp = mobRenderPos.get(mob.id);
      const cx = rp ? Math.round(rp.x) : mob.x;
      const cy = rp ? Math.round(rp.y) : mob.y;
      if (cx === tx && cy === ty) return mob;
    }
    return null;
  }

  function updateHoverEntity(tx = hoverTileX, ty = hoverTileY, pawnList?: Pawn[], mobList?: Mob[]) {
    if (tx < 0 || ty < 0) {
      hoverPawnId = null;
      hoverMobId = null;
      return;
    }
    const pawn = findPawnAtTile(tx, ty, pawnList);
    hoverPawnId = pawn?.id ?? null;
    hoverMobId = pawn ? null : (findMobAtTile(tx, ty, mobList)?.id ?? null);
  }

  $: hoverPawn = hoverPawnId ? (pawns.find((p) => p.id === hoverPawnId) ?? null) : null;

  $: selectedPawn = selectedPawnId ? (pawns.find((p) => p.id === selectedPawnId) ?? null) : null;

  $: selectedMob = selectedMobId ? (mobs.find((m) => m.id === selectedMobId) ?? null) : null;
  $: selectedMobDef = selectedMob ? (getCreatureById(selectedMob.creatureId) ?? null) : null;

  $: selectedPawnMood =
    selectedPawn && $gameState ? pawnService.getMoodBreakdown(selectedPawn, $gameState) : undefined;
  $: hoverPawnMood =
    hoverPawn && $gameState ? pawnService.getMoodBreakdown(hoverPawn, $gameState) : undefined;

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
  $: hoverMobDef = hoverMob ? (getCreatureById(hoverMob.creatureId) ?? null) : null;

  $: hasBuildJobs = ($gameState?.jobs ?? []).some((j) => j.type === 'construct');
  $: hasHarvestJobs = ($gameState?.jobs ?? []).some((j) => j.type === 'harvest');

  $: markedTag = ((): VerbTagModel | null => {
    if (!markedKind || markedIds.length < 1) return null;
    const n = markedIds.length;
    if (markedKind === 'pawn') {
      const marked = pawns.filter((p) => markedSet.has(p.id));
      const verbs: TagVerb[] = [
        { label: markedAllDrafted ? 'Undraft' : 'Draft', glyph: 'sword', onClick: draftMarkedPawns }
      ];
      if (markedDraftedCount > 0) verbs.push({ label: 'Move', quiet: true, onClick: armMoveAim });
      if (hasBuildJobs)
        verbs.push({
          label: 'Build',
          quiet: true,
          onClick: () => forceMarkedPawnsJob('construct')
        });
      if (hasHarvestJobs)
        verbs.push({
          label: 'Harvest',
          quiet: true,
          onClick: () => forceMarkedPawnsJob('harvest')
        });
      return {
        what: n === 1 ? (marked[0]?.name ?? 'Pawn') : 'Pawns',
        count: n,
        verbs,
        tiles: marked.flatMap((p) => (p.position ? [p.position] : [])),
        onClear: clearMark
      };
    }
    const marked = mobs.filter((m) => markedSet.has(m.id));
    const def =
      new Set(marked.map((m) => m.creatureId)).size === 1
        ? getCreatureById(marked[0].creatureId)
        : undefined;
    return {
      what: n === 1 ? (marked[0]?.name ?? def?.name ?? 'Creature') : (def?.name ?? 'Creatures'),
      count: n,
      verbs: [{ label: 'Hunt', glyph: 'bow', onClick: huntMarkedMobs }],
      tiles: marked.map((m) => ({ x: m.x, y: m.y })),
      onClear: clearMark
    };
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

  $: buildingVerbs = ((): EntityButton[] => {
    if (!selectedBuilding) return [];
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
    const btns: EntityButton[] = [];
    if (isBlueprint) {
      btns.push({
        label: selectedBuilding.paused ? 'Resume' : 'Pause',
        onClick: togglePauseBlueprintBuilding
      });
      btns.push({ label: 'Abort', onClick: cancelBlueprintBuilding });
    } else if (selectedBuilding.deconstructQueued) {
      btns.push({ label: 'Cancel', onClick: cancelDeconstructBuilding });
    } else {
      btns.push({ label: 'Build', onClick: buildAnother });
      btns.push({ label: 'Demolish', onClick: deconstructBuilding });
      if (canConfigFuel) {
        btns.push({ label: 'Fuel', active: showFuelSettings, onClick: toggleFuelSettingsPanel });
      }
      if (canRepair) {
        btns.push({
          label: 'Repair',
          active: showRepairSettings,
          onClick: toggleRepairSettingsPanel
        });
      }
      if (canConfigStorage) {
        btns.push({
          label: 'Stores',
          active: showStorageSettings,
          onClick: toggleStorageSettingsPanel
        });
      }
    }
    return btns;
  })();

  function deselectResource() {
    selectedResourceTile = null;
    highlightedResourceTiles = new Set();
    selectedResourceTypes = new Set();
    drawDesignations();
  }

  $: resourceTag = ((): VerbTagModel | null => {
    if (!selectedResourceTile || !selectedResourceDef) return null;
    const def = selectedResourceDef;
    const { x, y, resourceId } = selectedResourceTile;
    const tileKeys =
      highlightedResourceTiles.size > 0 ? [...highlightedResourceTiles] : [`${x},${y}`];
    const designatedCount = tileKeys.filter((k) => designations[k]).length;
    const growthPct = isGrowableResource(def)
      ? (worldMap[y]?.[x]?.growth?.[resourceId] ?? 100)
      : undefined;
    const regrowing =
      selectedResourceAmount <= 0 &&
      growthPct !== undefined &&
      growthPct < resourceObjectService.minHarvestGrowth(resourceId);
    const ripe = (dtype: DesignationType) =>
      keyTiles(tileKeys).some((t) => isHarvestableTileNow({ worldMap }, t.x, t.y, dtype));
    const verbs: TagVerb[] = [];
    let unripe = false;
    if (designatedCount < tileKeys.length && !regrowing) {
      for (const iact of def.interactions ?? [def.interaction]) {
        const dtype = iact.designationType;
        if (dtype && !ripe(dtype)) {
          unripe = true;
          continue;
        }
        const [label, glyph] = designationVerb(dtype, !!def.lair);
        if (verbs.some((v) => v.label === label)) continue;
        verbs.push({
          label,
          glyph,
          quiet: verbs.length > 0,
          onClick: () => designateResource(dtype)
        });
      }
    }
    if (designatedCount > 0)
      verbs.push({ label: 'Cancel', quiet: true, onClick: cancelResourceDesignation });
    return {
      what: def.displayName,
      count: tileKeys.length,
      note: regrowing
        ? 'regrowing'
        : unripe && growthPct !== undefined
          ? `${Math.round(growthPct)}% grown`
          : undefined,
      verbs,
      tiles: keyTiles(tileKeys),
      onClear: deselectResource
    };
  })();

  $: multiResourceTag = ((): VerbTagModel | null => {
    if (selectedResourceTypes.size < 2) return null;
    const names = [...selectedResourceTypes].flatMap(
      (id) => resourceObjectService.getById(id)?.displayName ?? []
    );
    const marked = highlightedResourceTiles.size;
    const designatedCount = [...highlightedResourceTiles].filter((k) => designations[k]).length;
    const verbs: TagVerb[] = [];
    if (marked > designatedCount)
      verbs.push({ label: 'Harvest', glyph: 'sprout', onClick: designateMarkedMulti });
    if (designatedCount > 0)
      verbs.push({ label: 'Cancel', quiet: true, onClick: cancelMarkedMulti });
    const tiles =
      marked > 0
        ? keyTiles(highlightedResourceTiles)
        : selectedResourceTile
          ? [selectedResourceTile]
          : [];
    if (tiles.length === 0) return null;
    return { what: names.join(', '), count: marked, verbs, tiles, onClear: deselectResource };
  })();

  $: verbTag = markedTag ?? multiResourceTag ?? resourceTag;

  $: hoverDroppedItem =
    hoverTileX >= 0 && hoverTileY >= 0
      ? (droppedItems.find((d) => d.x === hoverTileX && d.y === hoverTileY) ?? null)
      : null;

  function needBar(value: number): string {
    const filled = Math.round(value / 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  }

  $: selectedItem = selectedItemId
    ? (droppedItems.find((d) => d.id === selectedItemId) ?? null)
    : null;

  $: selectedZone = selectedZoneId
    ? (zoneInstances.find((z) => z.id === selectedZoneId) ?? null)
    : null;
  $: selectedZoneTileKeys = selectedZoneId
    ? Object.keys(designationZoneId).filter((k) =>
        Object.values(designationZoneId[k] ?? {}).includes(selectedZoneId!)
      )
    : [];
  $: selectedZoneFilled = (() => {
    const tiles = new Set(selectedZoneTileKeys);
    return new Set(
      droppedItems.filter((d) => d.stored && tiles.has(`${d.x},${d.y}`)).map((d) => `${d.x},${d.y}`)
    ).size;
  })();
  $: zoneToolDrawing = designationMode && activeZoneInstanceId === selectedZoneId && !zoneEraseMode;
  $: zoneToolClearing = designationMode && activeZoneInstanceId === selectedZoneId && zoneEraseMode;

  function paintZoneTool(instanceId: string, erase: boolean) {
    zoneEraseMode = erase;
    uiState.activateDesignation('stockpile', instanceId);
  }

  function deleteSelectedZone() {
    if (!selectedZoneId) return;
    if (designationMode && activeZoneInstanceId === selectedZoneId) uiState.deactivateDesignation();
    gameState.command({
      type: 'removeZoneInstance',
      payload: { instanceId: selectedZoneId },
      save: true
    });
    selectedZoneId = null;
  }

  let selDragActive = false;
  let selAnchorX = 0;
  let selAnchorY = 0;
  let selEndX = 0;
  let selEndY = 0;
  let selectedResourceTypes = new Set<string>();

  const unsubState = gameState.subscribe((s) => {
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
      renderer.setAmbient(light, tinted, tint, s.weather, season);
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

  function pawnSimTarget(pawn: Pawn, map: WorldTile[][]): { x: number; y: number } {
    const { x, y } = pawn.position!;
    return simTarget(
      { x, y, path: pawn.path, pathIndex: pawn.pathIndex, nextCellCostLeft: pawn.nextCellCostLeft },
      map
    );
  }

  function updatePawnOverlay(
    dt: number,
    map: WorldTile[][],
    items: DroppedItem[],
    buildingList: PlacedBuilding[],
    mobList: Mob[],
    pawnList: Pawn[],
    vx: number,
    vy: number,
    box: HTMLDivElement,
    tW: number,
    tH: number
  ) {
    pawnOverlayGrid.clear();
    itemOverlayGrid.clear();
    overlayDroppedItems(itemOverlayGrid, items, isHiddenTile);
    buildingOverlayGrid.clear();
    overlayBuildings(buildingOverlayGrid, buildingList, isHiddenTile);
    const clampedDt = Math.min(dt, 0.05);
    const alpha = clampedDt > 0 ? 1 - Math.exp(-clampedDt / MOVE_SMOOTH_TAU) : 1;
    const nowMs = animNow();
    motion.begin(performance.now(), nowMs);
    motion.noteHits(combatFeedback.live(nowMs));

    const freshState = get(gameState);
    const liveMobs = freshState.mobs ?? mobList;
    const livePawns = freshState.pawns ?? pawnList;

    const CULL_MARGIN = 3;
    const cullMinX = vx - CULL_MARGIN;
    const cullMinY = vy - CULL_MARGIN;
    const cullMaxX = vx + Math.ceil((box?.clientWidth ?? 0) / tW) + CULL_MARGIN;
    const cullMaxY = vy + Math.ceil((box?.clientHeight ?? 0) / tH) + CULL_MARGIN;
    const renderMobs = tW >= ENTITY_RENDER_MIN_PX;
    const seenMobs = new Set<string>();
    for (const mob of liveMobs) {
      if (!renderMobs) break;
      const def = getCreatureById(mob.creatureId);
      if (!def || !def.chars.length) continue;
      if (mob.x < cullMinX || mob.x > cullMaxX || mob.y < cullMinY || mob.y > cullMaxY) continue;
      seenMobs.add(mob.id);

      const target = simTarget(mob, map);
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
      const mLunge = lungeOffset(mob.id, nowMs);
      const mTier = def.tier;
      const mScale = mTier != null ? TIER_GLYPH_SCALE[mTier] : undefined;
      const mPose = motion.mob(mob.id, rm.x, rm.y, mob.state, def.gait, mLunge.x, mScale);
      const mTint = mTier != null ? TIER_GLYPH_TINT[mTier] : 1;
      pawnOverlayGrid.setTile(cellX, cellY, {
        char: def.chars[0],
        foreground: {
          r: Math.min(1, def.fg[0] * mTint),
          g: Math.min(1, def.fg[1] * mTint),
          b: Math.min(1, def.fg[2] * mTint * (mTier === 5 ? 0.85 : 1))
        },
        background: { r: 0, g: 0, b: 0 },
        ...(mScale != null && mScale !== 1 ? { scale: mScale } : {}),
        ...(PAINTED_TILES ? paintedEntity('creature', def.id, mob.id) : null),
        position: { x: cellX, y: cellY },
        animationOffset: {
          x: (rm.x - cellX) * BASE_TILE_PX + mLunge.x + mPose.dx,
          y: (rm.y - cellY) * BASE_TILE_PX + mLunge.y + mPose.dy
        },
        flip: mPose.flip,
        lean: mPose.lean,
        squash: mPose.squash
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

      const target = pawnSimTarget(pawn, map);
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
      const pPose = motion.pawn(pawn.id, rp.x, rp.y, pawn.currentState, pLunge.x);
      pawnOverlayGrid.setTile(cellX, cellY, {
        char: PAWN_SPRITES[i % PAWN_SPRITES.length],
        foreground: baseColor,
        background: isDrafted ? { r: 0.3, g: 0, b: 0 } : { r: 0, g: 0, b: 0 },
        position: { x: cellX, y: cellY },
        animationOffset: {
          x: (rp.x - cellX) * BASE_TILE_PX + pLunge.x + pPose.dx,
          y: (rp.y - cellY) * BASE_TILE_PX + pLunge.y + pPose.dy
        },
        flip: pPose.flip,
        lean: pPose.lean,
        squash: pPose.squash,
        rotation: isSleeping || isCollapsed ? 90 : undefined,
        ...(PAINTED_TILES ? paintedPawn(pawn, freshState.culturePool) : null)
      });
    }

    if (seen.size !== pawnRenderPos.size) {
      for (const id of pawnRenderPos.keys()) {
        if (!seen.has(id)) pawnRenderPos.delete(id);
      }
    }
    motion.end();
  }

  let _selectionRingKey = '';

  function updateSelectionRings(vx: number, vy: number, tW: number, tH: number) {
    const ids =
      markedKind && markedSet.size > 0
        ? [...markedSet]
        : [selectedPawnId, selectedMobId].filter((id): id is string => !!id);
    const w = Math.round(tW * 1.2);
    const next: { x: number; y: number; w: number; h: number }[] = [];
    for (const id of ids) {
      const rp = pawnRenderPos.get(id) ?? mobRenderPos.get(id);
      if (!rp) continue;
      const x = Math.round((rp.x - vx + 0.5) * tW - w / 2);
      next.push({ x, y: Math.round((rp.y - vy + 1) * tH - w * 0.3), w, h: Math.round(w * 0.4) });
    }
    const key = next.map((r) => `${r.x},${r.y},${r.w}`).join('|');
    if (key === _selectionRingKey) return;
    _selectionRingKey = key;
    renderer?.setGroundRings(next, MARK_INK);
    markRenderDirty();
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

  function _blueprintRectTiles(
    hx = hoverTileX,
    hy = hoverTileY,
    dragActive = blueprintDragActive
  ): Set<string> {
    const s = new Set<string>();
    if (!dragActive) return s;
    const ax = blueprintAnchorX;
    const ay = blueprintAnchorY;
    if (ax < 0 || hx < 0 || hy < 0) return s;
    const x1 = Math.min(ax, hx);
    const x2 = Math.max(ax, hx);
    const y1 = Math.min(ay, hy);
    const y2 = Math.max(ay, hy);
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) s.add(`${x},${y}`);
    return s;
  }

  function _currentBlueprintTiles(bpId: string | null, hx: number, hy: number): Set<string> {
    const s = new Set<string>();
    if (!bpId) return s;
    if (blueprintDragActive) {
      return _blueprintRectTiles(hx, hy, true);
    } else if (hx >= 0 && hy >= 0) {
      s.add(`${hx},${hy}`);
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

  function _fullRebuildTerrain(
    map = worldMap,
    buildingList = buildings,
    bpId = blueprintBuildingId,
    hx = hoverTileX,
    hy = hoverTileY
  ): void {
    _heavyRenderReason = `FULL-REBUILD map=${map[0]?.length ?? 0}x${map.length} season=${_renderSeason ?? '?'}`;
    const built = fullRebuildTerrain(map, buildingList, _buildingSig, _renderSeason);
    _terrainGrid = built.terrainGrid;
    _resourceGrid = built.resourceGrid;
    _resourceTallGrid = built.resourceTallGrid;
    _snowGrid = built.snowGrid;
    renderer?.setSnowGrid(_snowGrid);
    _maskState = built.maskState;
    hiddenMask = _maskState.mask;
    _terrainGridWorldMapRef = map;
    _prevBuildingsById = built.buildingsById;
    _emitterMap = built.emitterMap;
    resourceGlowEmitters = built.emitters;
    clearRenderTileDeltas();
    _snowPendingChunks.clear();
    refreshEmitters(buildingList);

    _blueprintRoofSupport = null;
    _prevBlueprintTiles = _currentBlueprintTiles(bpId, hx, hy);
    for (const k of _prevBlueprintTiles) {
      const ci = k.indexOf(',');
      _blueprintPreviewTile(
        _terrainGrid,
        +k.slice(0, ci),
        +k.slice(ci + 1),
        map,
        buildingList,
        bpId
      );
    }
  }

  function redrawOverlayNow(
    map = worldMap,
    buildingList = buildings,
    hx = hoverTileX,
    hy = hoverTileY
  ) {
    if (!renderer?.isReady() || map.length === 0) return;
    markRenderDirty();
    const W = map[0]?.length ?? 0;
    const bpId = blueprintBuildingId;

    if (!_terrainGrid || !_maskState || map !== _terrainGridWorldMapRef) {
      _fullRebuildTerrain(map, buildingList, bpId, hx, hy);
      renderer.setGrid(_terrainGrid!);
      drawDesignations();
      return;
    }

    const deltas = drainRenderTileDeltas() ?? [];
    const dirty = new Set<number>();
    for (const c of deltas) dirty.add(c.y * W + c.x);

    const curBuildings = new Map<string, { x: number; y: number; sig: string }>();
    for (const b of buildingList) {
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

    const curBlueprint = _currentBlueprintTiles(bpId, hx, hy);
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
      const maskTouched = updateHiddenMaskAt(_maskState, map, deltas as TileCoord[]);
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
      const t = map[y]?.[x];
      if (!t) continue;
      applyTileToGrid(_terrainGrid, t, hiddenMask);
      if (_resourceGrid && _resourceTallGrid)
        applyResourceToGrid(_resourceGrid, _resourceTallGrid, t, hiddenMask, _renderSeason, map);
      if (_snowGrid) applySnowToGrid(_snowGrid, t, hiddenMask);
      if (_updateEmitterAt(y, x, t)) emittersChanged = true;
    }
    for (const b of buildingList) {
      if (b.status === 'complete' && isFloorBuilding(b) && dirty.has(b.y * W + b.x))
        applyBuildingToGrid(_terrainGrid, b, map[b.y]?.[b.x]);
    }
    for (const b of buildingList) {
      if (b.status === 'complete' && isRoofBuilding(b) && dirty.has(b.y * W + b.x))
        applyBuildingToGrid(_terrainGrid, b, map[b.y]?.[b.x]);
    }
    _blueprintRoofSupport = null;
    for (const k of curBlueprint) {
      const ci = k.indexOf(',');
      _blueprintPreviewTile(
        _terrainGrid,
        +k.slice(0, ci),
        +k.slice(ci + 1),
        map,
        buildingList,
        bpId
      );
    }
    if (emittersChanged) {
      resourceGlowEmitters = [..._emitterMap.values()];
      refreshEmitters(buildingList);
    }

    const dirtyTiles: TileCoord[] = [];
    for (const key of dirty) dirtyTiles.push({ x: key % W, y: (key / W) | 0 });
    renderer.setGrid(_terrainGrid, dirtyTiles);
    if (_snowGrid) renderer.setSnowGrid(_snowGrid, dirtyTiles);
    drawDesignations();
  }

  function _queueSnowDeltas() {
    const coords = drainSnowRenderTileDeltas();
    if (!coords || coords.length === 0 || !_snowGrid) return;
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

  function repaintSnowNow(map: WorldTile[][]) {
    if (!renderer?.isReady() || !_snowGrid || map.length === 0) return;
    if (_snowPendingChunks.size === 0) return;
    beat(`snow:chunks ${_snowPendingChunks.size}`);
    const due: { x: number; y: number }[] = [];
    let chunks = SNOW_CHUNKS_PER_FRAME;
    for (const [key, cells] of _snowPendingChunks) {
      _snowPendingChunks.delete(key);
      for (const c of cells) {
        const t = map[c.y]?.[c.x];
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
          applyResourceToGrid(
            _resourceGrid,
            _resourceTallGrid,
            t,
            hiddenMask,
            _renderSeason,
            worldMap
          );
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

  function _processFoliageTransition(map: WorldTile[][]): void {
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
      const t = map[p.y]?.[p.x];
      if (t) {
        applyResourceToGrid(_resourceGrid, _resourceTallGrid, t, hiddenMask, _renderSeason, map);
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

  function tileRect(x: number, y: number): ScreenRect {
    return { x: (x - viewX) * tileWidth, y: (y - viewY) * tileHeight, w: tileWidth, h: tileHeight };
  }

  function markRect(layers: readonly SpriteLayer[], x: number, y: number): ScreenRect {
    const view = { viewX, viewY, tileWidth, tileHeight };
    return spriteRect(renderer, layers, x, y, view) ?? tileRect(x, y);
  }

  function tileBoxRect(minX: number, minY: number, maxX: number, maxY: number): ScreenRect {
    return {
      x: (minX - viewX) * tileWidth,
      y: (minY - viewY) * tileHeight,
      w: (maxX - minX + 1) * tileWidth,
      h: (maxY - minY + 1) * tileHeight
    };
  }

  function tilesInBox(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    W: number,
    H: number,
    keep: (x: number, y: number) => boolean
  ): ScreenRect[] {
    const out: ScreenRect[] = [];
    const x1 = Math.min(maxX, viewX + Math.ceil(W / tileWidth));
    const y1 = Math.min(maxY, viewY + Math.ceil(H / tileHeight));
    for (let ry = Math.max(minY, viewY); ry <= y1; ry++)
      for (let rx = Math.max(minX, viewX); rx <= x1; rx++)
        if (keep(rx, ry)) out.push(markRect(RESOURCE_SPRITES, rx, ry));
    return out;
  }

  function keyRects(keys: Set<string>, W: number, H: number): ScreenRect[] {
    const out: ScreenRect[] = [];
    const colW = Math.ceil(W / tileWidth);
    const rowH = Math.ceil(H / tileHeight);
    for (const key of keys) {
      const ci = key.indexOf(',');
      const wx = +key.slice(0, ci);
      const wy = +key.slice(ci + 1);
      if (wx < viewX - 1 || wy < viewY - 1 || wx > viewX + colW || wy > viewY + rowH) continue;
      out.push(markRect(RESOURCE_SPRITES, wx, wy));
    }
    return out;
  }

  function drawDesignations() {
    if (!designCanvas || !markCanvas || !container || !worldMap.length) return;
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
    if (markCanvas.width !== bw || markCanvas.height !== bh) {
      markCanvas.width = bw;
      markCanvas.height = bh;
    }
    const mctx = markCanvas.getContext('2d');
    if (!mctx) return;
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.clearRect(0, 0, W, H);

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

    if (highlightedResourceTiles.size > 0) {
      brackets(mctx, keyRects(highlightedResourceTiles, W, H));
    } else if (selectedResourceTile) {
      brackets(mctx, [markRect(RESOURCE_SPRITES, selectedResourceTile.x, selectedResourceTile.y)]);
    } else if (selectedBuilding) {
      brackets(mctx, [markRect(BUILDING_SPRITES, selectedBuilding.x, selectedBuilding.y)]);
    }

    if (selDragActive) {
      const minX = Math.min(selAnchorX, selEndX);
      const minY = Math.min(selAnchorY, selEndY);
      const maxX = Math.max(selAnchorX, selEndX);
      const maxY = Math.max(selAnchorY, selEndY);
      if (dragMarkKind() === 'resource') {
        const types =
          selectedResourceTypes.size > 0
            ? selectedResourceTypes
            : selectedResourceTile
              ? new Set([selectedResourceTile.resourceId])
              : new Set<string>();
        brackets(
          mctx,
          tilesInBox(minX, minY, maxX, maxY, W, H, (rx, ry) => {
            if (isHiddenTile(rx, ry)) return false;
            const res = worldMap[ry]?.[rx]?.resources;
            if (res) for (const t of types) if ((res[t] ?? 0) > 0) return true;
            return false;
          })
        );
      }
      dragBox(mctx, tileBoxRect(minX, minY, maxX, maxY));
    }

    if (markDragActive) {
      const minX = Math.min(markAnchorX, markEndX);
      const minY = Math.min(markAnchorY, markEndY);
      const maxX = Math.max(markAnchorX, markEndX);
      const maxY = Math.max(markAnchorY, markEndY);
      dragBox(mctx, tileBoxRect(minX, minY, maxX, maxY));
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

    const darken = PAINTED_LIGHT ? 0 : Math.max(0, 1 - _ambientLight);
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

  function _blueprintPreviewTile(
    grid: GameGrid,
    tx: number,
    ty: number,
    map: WorldTile[][],
    buildingList: PlacedBuilding[],
    bpId: string | null
  ) {
    if (tx < 0 || ty < 0 || ty >= map.length || tx >= (map[0]?.length ?? 0)) return;
    if (map[ty]?.[tx]?.walkable === false) return;
    const building = buildingService.getBuildingById(bpId!);
    if (!building) return;
    if (building.effects?.roof) {
      _blueprintRoofSupport ??= buildingService.makeRoofSupportLookup(buildingList, map);
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

    const view = { viewX, viewY, tileWidth, tileHeight };
    const hit = drawnTile(renderer, lastCursorCx, lastCursorCy, view);
    const layers = drawnFirst(tileLayers(hit.x, hit.y), hit.layer);
    if (layers.length > 0) {
      if (hit.x === _cycleTileX && hit.y === _cycleTileY) {
        _cycleIndex = (_cycleIndex + 1) % layers.length;
      } else {
        _cycleTileX = hit.x;
        _cycleTileY = hit.y;
        _cycleIndex = 0;
      }
      applyTileLayer(layers[_cycleIndex], hit.x, hit.y);
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
    unsubAnimPause();
    unsubVignette();
    unsubSway();
    unsubAttackLunges();
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
      renderer.setVignette(get(vignetteOn));
      renderer.setSway(get(windSwayOn));

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
        renderer.setAmbient(light, tinted, tint, $gameState?.weather);
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

  function updateCameraFollow(
    dt: number,
    followId: string | null,
    vx: number,
    vy: number,
    map: WorldTile[][],
    box: HTMLDivElement,
    tW: number,
    tH: number
  ): [number, number] | null {
    if (!followId || !ready || !renderer?.isReady()) return null;
    const rp = pawnRenderPos.get(followId);
    if (!rp) return null;
    const visW = (box?.clientWidth ?? 800) / tW;
    const visH = (box?.clientHeight ?? 600) / tH;
    const [targetX, targetY] = clampView(
      rp.x - visW / 2,
      rp.y - visH * FOLLOW_VERTICAL,
      map,
      box,
      tW,
      tH
    );
    const alpha = dt > 0 ? 1 - Math.exp(-dt / FOLLOW_SMOOTH_TAU) : 1;
    const dx = targetX - vx;
    const dy = targetY - vy;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
      if (dx !== 0 || dy !== 0) return [targetX, targetY];
      return null;
    }
    return [vx + dx * alpha, vy + dy * alpha];
  }

  function updateCameraFollowMob(
    dt: number,
    followId: string | null,
    vx: number,
    vy: number,
    map: WorldTile[][],
    box: HTMLDivElement,
    tW: number,
    tH: number
  ): [number, number] | null {
    if (!followId || !ready || !renderer?.isReady()) return null;
    const rp = mobRenderPos.get(followId);
    if (!rp) return null;
    const visW = (box?.clientWidth ?? 800) / tW;
    const visH = (box?.clientHeight ?? 600) / tH;
    const [targetX, targetY] = clampView(
      rp.x - visW / 2,
      rp.y - visH * FOLLOW_VERTICAL,
      map,
      box,
      tW,
      tH
    );
    const alpha = dt > 0 ? 1 - Math.exp(-dt / FOLLOW_SMOOTH_TAU) : 1;
    const dx = targetX - vx;
    const dy = targetY - vy;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
      if (dx !== 0 || dy !== 0) return [targetX, targetY];
      return null;
    }
    return [vx + dx * alpha, vy + dy * alpha];
  }

  function updateKeyboardPan(
    dt: number,
    preview: boolean,
    followPawnId: string | null,
    followMobId: string | null,
    vx: number,
    vy: number
  ): [number, number] | null {
    if (dt <= 0 || !ready || preview) return null;
    if (followPawnId || followMobId) {
      panVelX = panVelY = 0;
      return null;
    }
    const tx = (heldPan.right ? 1 : 0) - (heldPan.left ? 1 : 0);
    const ty = (heldPan.down ? 1 : 0) - (heldPan.up ? 1 : 0);
    const a = 1 - Math.exp(-dt / PAN_SMOOTH_TAU);
    panVelX += (tx * PAN_SPEED - panVelX) * a;
    panVelY += (ty * PAN_SPEED - panVelY) * a;
    if (tx === 0 && Math.abs(panVelX) < 0.02) panVelX = 0;
    if (ty === 0 && Math.abs(panVelY) < 0.02) panVelY = 0;
    if (panVelX === 0 && panVelY === 0) return null;
    return [vx + panVelX * dt, vy + panVelY * dt];
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
        const preview = menuPreview;
        const mapPreview = customMapPreview;
        const map = worldMap;
        const box = container;
        const tW = tileWidth;
        const tH = tileHeight;
        const pawnList = pawns;
        const mobList = mobs;
        const buildingList = buildings;
        const followPawnId = cameraFollowPawnId;
        const followMobId = cameraFollowMobId;
        let vx = viewX;
        let vy = viewY;
        let hx = hoverTileX;
        let hy = hoverTileY;
        if (mapPreview) {
          pawnOverlayGrid.clear();
          itemOverlayGrid.clear();
          buildingOverlayGrid.clear();
        } else if (passOn('overlay')) {
          updatePawnOverlay(
            dt,
            map,
            droppedItems,
            buildingList,
            mobList,
            pawnList,
            vx,
            vy,
            box,
            tW,
            tH
          );
        }
        if (cursorOverCanvas && (followPawnId || followMobId)) {
          hx = Math.floor(lastCursorCx / tW + vx);
          hoverTileX = hx;
          hy = Math.floor(lastCursorCy / tH + vy);
          hoverTileY = hy;
        }
        updateHoverEntity(hx, hy, pawnList, mobList);
        const pawnView = updateCameraFollow(dt, followPawnId, vx, vy, map, box, tW, tH);
        if (pawnView) [vx, vy] = setView(pawnView[0], pawnView[1], map, box, tW, tH, preview);
        const mobView = updateCameraFollowMob(dt, followMobId, vx, vy, map, box, tW, tH);
        if (mobView) [vx, vy] = setView(mobView[0], mobView[1], map, box, tW, tH, preview);
        const panView = updateKeyboardPan(dt, preview, followPawnId, followMobId, vx, vy);
        if (panView) [vx, vy] = setView(panView[0], panView[1], map, box, tW, tH, preview);
        if (designationsStale) {
          designationsStale = false;
          drawDesignations();
        }
        if (passOn('effects'))
          worldFx.frame(
            {
              pawns: pawnList,
              mobs: mobList,
              pawnPos: pawnRenderPos,
              mobPos: mobRenderPos,
              renderer,
              hidden: isHiddenTile,
              mobsDrawn: tW >= ENTITY_RENDER_MIN_PX
            },
            { vx, vy, tW, tH, paused: simPaused }
          );
        updateSelectionRings(vx, vy, tW, tH);
        if (
          _terrainDirty &&
          (_forceTerrainRebuild || now - _lastTerrainBuild >= TERRAIN_REBUILD_MIN_MS)
        ) {
          _terrainDirty = false;
          _forceTerrainRebuild = false;
          _lastTerrainBuild = now;
          beat('terrain-rebuild');
          redrawOverlayNow(map, buildingList, hx, hy);
        }
        if (_snowDirty && now - _lastSnowBuild >= TERRAIN_REBUILD_MIN_MS) {
          _snowDirty = false;
          _lastSnowBuild = now;
          _queueSnowDeltas();
        }
        if (_snowPendingChunks.size > 0) repaintSnowNow(map);
        if (_foliagePending.length > 0) {
          beat(`foliage ${_foliagePending.length - _foliageIdx}`);
          _processFoliageTransition(map);
        }
        const frozen = !preview && (mapPreview || tW < FREEZE_TILE_PX);
        if (_renderDirty || !frozen || now - lastDrawAt >= FROZEN_SAFETY_MS) {
          beat('gl:setgrids');
          renderer.setResourceOverlayGrid(_resourceGrid);
          renderer.setResourceTallOverlayGrid(_resourceTallGrid);
          renderer.setBuildingOverlayGrid(buildingOverlayGrid);
          renderer.setItemOverlayGrid(itemOverlayGrid);
          renderer.setOverlayGrid(pawnOverlayGrid);
          const _dbgT0 = preview && _menuPerfOn ? performance.now() : 0;
          if (_heavyRenderReason) {
            crashBreadcrumb(
              get(gameState).turn,
              `→ heavy draw START: ${_heavyRenderReason} (prevVerts≈${renderer.getStats().vertexCount}, tile=${tW.toFixed(1)}px)`
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
          if (preview && _menuPerfOn) {
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
          if (preview && !_previewPainted) {
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

  function clampView(
    x: number,
    y: number,
    map = worldMap,
    box = container,
    tW = tileWidth,
    tH = tileHeight
  ): [number, number] {
    const mapW = map.length > 0 ? map[0].length : 80;
    const mapH = map.length > 0 ? map.length : 50;
    const visW = Math.ceil((box?.clientWidth ?? 800) / tW);
    const visH = Math.ceil((box?.clientHeight ?? 600) / tH);
    return [Math.max(0, Math.min(x, mapW - visW)), Math.max(0, Math.min(y, mapH - visH))];
  }

  function saveCameraState(preview = menuPreview) {
    if (preview) return;
    if (saveCameraTimer !== null) clearTimeout(saveCameraTimer);
    saveCameraTimer = setTimeout(() => {
      saveCameraTimer = null;
      sessionStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify({ viewX, viewY, tileWidth }));
    }, 200);
  }

  function setView(
    x: number,
    y: number,
    map?: WorldTile[][],
    box?: HTMLDivElement,
    tW?: number,
    tH?: number,
    preview?: boolean
  ): [number, number] {
    const view = clampView(x, y, map, box, tW, tH);
    [viewX, viewY] = view;
    renderer?.setViewTileOffset(view[0], view[1]);
    markRenderDirty();
    saveCameraState(preview);
    designationsStale = true;
    return view;
  }

  function panKeyDown(e: KeyboardEvent): boolean {
    if (get(wasdPan) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'a':
          heldPan.left = true;
          e.preventDefault();
          return true;
        case 'd':
          heldPan.right = true;
          e.preventDefault();
          return true;
        case 'w':
          heldPan.up = true;
          e.preventDefault();
          return true;
        case 's':
          heldPan.down = true;
          e.preventDefault();
          return true;
      }
    }
    switch (e.key) {
      case 'ArrowLeft':
        heldPan.left = true;
        break;
      case 'ArrowRight':
        heldPan.right = true;
        break;
      case 'ArrowUp':
        heldPan.up = true;
        break;
      case 'ArrowDown':
        heldPan.down = true;
        break;
      default:
        return false;
    }
    e.preventDefault();
    return true;
  }

  function isTextEntry(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    );
  }

  function handleWindowKeyDown(e: KeyboardEvent) {
    if (!ready || menuPreview || e.defaultPrevented) return;
    if (container?.contains(e.target as Node) || isTextEntry(e.target)) return;
    panKeyDown(e);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!ready || menuPreview) return;
    if (panKeyDown(e)) return;

    switch (e.key) {
      case 'Escape': {
        let dismissed = true;
        if (debugBrush) {
          uiState.deactivateDebugBrush();
          redrawOverlay();
        } else if (showFuelSettings) {
          uiState.closeWindow('fuel');
        } else if (showRepairSettings) {
          uiState.closeWindow('repair');
        } else if (storesOpen) {
          uiState.closeWindow('stores');
        } else if (showFoodSettings) {
          uiState.closeWindow('food');
        } else if (moveAimActive || moveAimArmed) {
          stopMoveAim();
        } else if (markKind || markedKind) {
          clearMark();
        } else if (designationMode) {
          stopDesignation();
        } else if (selectedResourceTile) {
          deselectResource();
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
          stopBlueprint();
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
    setView(
      dragViewX + (dragStartX - e.clientX) / tileWidth,
      dragViewY + (dragStartY - e.clientY) / tileHeight
    );
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

  function stopMoveAim() {
    moveAimActive = false;
    moveAimArmed = false;
    moveAimSlots = [];
    drawDesignations();
  }

  function stopDesignation() {
    uiState.deactivateDesignation();
    zoneEraseMode = false;
    zoneDragActive = false;
    drawDesignations();
  }

  function stopBlueprint() {
    uiState.deactivateBlueprint();
    blueprintDragActive = false;
    blueprintAnchorX = -1;
    blueprintAnchorY = -1;
    redrawOverlay();
  }

  const dragSize = (ax: number, ay: number, bx: number, by: number) =>
    `${Math.abs(bx - ax) + 1} × ${Math.abs(by - ay) + 1}`;

  const BRUSH_NAMES = {
    regrow: 'Regrow',
    building: 'Raise building',
    kill: 'Strike down',
    resurrect: 'Raise the dead',
    resource: 'Sow resource'
  } as const;

  $: banner = ((): BannerModel | null => {
    if (debugBrush)
      return {
        lead: 'Brush',
        subject: BRUSH_NAMES[debugBrush.kind],
        verbs: [
          {
            label: 'Stop',
            verb: true,
            onClick: () => {
              uiState.deactivateDebugBrush();
              redrawOverlay();
            }
          }
        ]
      };
    if (designationMode) {
      const zone = zoneInstances.find((z) => z.id === activeZoneInstanceId);
      return {
        lead: zoneEraseMode ? 'Erasing' : 'Painting',
        subject: zone?.label ?? designationVerb(designationTypeActive, false)[0],
        size: zoneDragActive ? dragSize(zoneAnchorX, zoneAnchorY, zoneEndX, zoneEndY) : null,
        verbs: [
          {
            label: 'Erase',
            glyph: 'x',
            on: zoneEraseMode,
            onClick: () => (zoneEraseMode = !zoneEraseMode)
          },
          { label: 'Done', verb: true, onClick: stopDesignation }
        ]
      };
    }
    if (selDragActive) {
      const kind = dragMarkKind();
      return {
        lead: 'Marking',
        subject: kind === 'resource' ? 'resources' : kind === 'mob' ? 'creatures' : 'colonists',
        size: dragSize(selAnchorX, selAnchorY, selEndX, selEndY),
        verbs: []
      };
    }
    if (blueprintBuildingId)
      return {
        lead: 'Placing',
        subject: buildingService.getBuildingById(blueprintBuildingId)?.name ?? '',
        size: blueprintDragActive
          ? dragSize(blueprintAnchorX, blueprintAnchorY, hoverTileX, hoverTileY)
          : null,
        verbs: [{ label: 'Done', verb: true, onClick: stopBlueprint }]
      };
    if (markKind)
      return {
        lead: 'Marking',
        subject: markKind === 'pawn' ? 'colonists' : 'creatures',
        size: markDragActive ? dragSize(markAnchorX, markAnchorY, markEndX, markEndY) : null,
        verbs: [{ label: 'Done', verb: true, onClick: clearMark }]
      };
    if (moveAimActive || moveAimArmed)
      return {
        lead: 'Moving',
        subject: `${moveAimCount} drafted`,
        verbs: [{ label: 'Cancel', onClick: stopMoveAim }]
      };
    return null;
  })();

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

  let showShelterAssign = false;
  $: showFuelSettings = $uiState.windows.includes('fuel');
  $: showRepairSettings = $uiState.windows.includes('repair');
  $: storesOpen = $uiState.windows.includes('stores');
  $: showStorageSettings = storesOpen && $storeTarget?.kind === 'building';
  $: showZoneFilter = storesOpen && $storeTarget?.kind === 'zone';
  let fuelSettingsForBuildingId: string | null = null;

  $: {
    const nextId = selectedBuilding?.id ?? null;
    if (nextId !== fuelSettingsForBuildingId) {
      uiState.closeWindow('fuel');
      uiState.closeWindow('repair');
      if (get(storeTarget)?.kind === 'building') uiState.closeWindow('stores');
      fuelSettingsForBuildingId = nextId;
    }
  }

  function toggleFuelSettingsPanel() {
    if (!selectedBuilding) return;
    buildingTarget.set(selectedBuilding.id);
    uiState.toggleWindow('fuel');
  }

  function toggleStorageSettingsPanel() {
    if (!selectedBuilding) return;
    storeTarget.set({ kind: 'building', id: selectedBuilding.id });
    uiState.toggleWindow('stores');
  }

  function toggleRepairSettingsPanel() {
    if (!selectedBuilding) return;
    buildingTarget.set(selectedBuilding.id);
    uiState.toggleWindow('repair');
  }

  $: showFoodSettings = $uiState.windows.includes('food');
  function toggleFoodSettingsPanel() {
    uiState.toggleWindow('food');
  }

  function toggleZoneFilter() {
    if (!selectedZoneId) return;
    storeTarget.set({ kind: 'zone', id: selectedZoneId });
    uiState.toggleWindow('stores');
  }

  let zoneFilterForId: string | null = null;
  $: {
    const nextZoneId = selectedZoneId;
    if (nextZoneId !== zoneFilterForId) {
      if (get(storeTarget)?.kind === 'zone') uiState.closeWindow('stores');
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
          if ($gameState && pickTendMedicine($gameState, target, medic))
            entries.push({
              label: `Emergency tend ${target.name} with medicine`,
              run: () => issueOrder({ type: 'tend', patientId: id })
            });
          entries.push({
            label: `Emergency tend ${target.name} without medicine`,
            run: () => issueOrder({ type: 'tend', patientId: id, withoutMedicine: true })
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
            label: `Pick up ${name}…`,
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

<svelte:window on:keydown={handleWindowKeyDown} on:keyup={handleKeyUp} />

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
  <canvas bind:this={markCanvas} class="desig-layer mark-layer"></canvas>

  {#if errorMsg}
    <div class="error">WebGL unavailable: {errorMsg}</div>
  {/if}

  {#if banner}<ModeBanner model={banner} />{/if}

  {#if !customMapPreview && !menuPreview}
    {#if verbTag && container && !selDragActive}
      <VerbTag
        model={verbTag}
        view={{
          x: viewX,
          y: viewY,
          tw: tileWidth,
          th: tileHeight,
          w: container.clientWidth,
          h: container.clientHeight
        }}
      />
    {/if}
    {#if markedTag}{:else if selectedPawn}
      <div
        class="bld-row"
        role="presentation"
        on:mousedown|stopPropagation
        on:mouseup|stopPropagation
      >
        <PawnCard
          pawn={selectedPawn}
          selected
          moodModel={selectedPawnMood}
          foodOpen={showFoodSettings}
          onmove={armMoveAim}
          onfood={toggleFoodSettingsPanel}
        />
      </div>
    {:else if selectedMob && selectedMobDef}
      <div
        class="bld-row"
        role="presentation"
        on:mousedown|stopPropagation
        on:mouseup|stopPropagation
      >
        <CreatureCard
          mob={selectedMob}
          def={selectedMobDef}
          selected
          colonyName={$gameState?.culture?.name}
        />
      </div>
    {:else if selectedBuilding}
      {@const clickedBin = buildingIsStorageBin(selectedBuilding)
        ? droppedItems.filter(
            (d) => d.stored && d.x === selectedBuilding.x && d.y === selectedBuilding.y
          )
        : []}
      <div
        class="bld-row"
        role="presentation"
        on:mousedown|stopPropagation
        on:mouseup|stopPropagation
      >
        <BuildingCard building={selectedBuilding} verbs={buildingVerbs} stored={clickedBin} />
      </div>
    {:else if selectedZone}
      <div
        class="bld-row"
        role="presentation"
        on:mousedown|stopPropagation
        on:mouseup|stopPropagation
      >
        <ZoneCard
          zone={selectedZone}
          tiles={selectedZoneTileKeys.length}
          filled={selectedZoneFilled}
          filterOpen={showZoneFilter}
          painting={zoneToolDrawing}
          erasing={zoneToolClearing}
          onfilter={toggleZoneFilter}
          onpaint={(erase) => selectedZone && paintZoneTool(selectedZone.id, erase)}
          ondelete={deleteSelectedZone}
        />
      </div>
    {:else if selectedItem}
      <div
        class="bld-row"
        role="presentation"
        on:mousedown|stopPropagation
        on:mouseup|stopPropagation
      >
        <ItemCard drop={selectedItem} selected />
      </div>
    {:else if hoverPawn}
      <div class="bld-row hover-card">
        <PawnCard pawn={hoverPawn} selected={false} moodModel={hoverPawnMood} />
      </div>
    {:else if hoverMob && hoverMobDef}
      <div class="bld-row hover-card">
        <CreatureCard mob={hoverMob} def={hoverMobDef} selected={false} />
      </div>
    {:else if hoverBuilding && !hoverPawn && hoverFactsInput}
      <BuildingInfo
        building={hoverBuilding}
        binContents={hoverBin ? hoverBinContents : []}
        env={envFacts(hoverFactsInput)}
      />
    {:else if hoverDroppedItem}
      <div class="bld-row hover-card"><ItemCard drop={hoverDroppedItem} /></div>
    {:else if hoverFactsInput}
      {@const facts = tileFacts(hoverFactsInput)}
      <TileTip title={facts.title} desc={facts.desc} rows={facts.rows} />
    {/if}
  {/if}

  {#if equipMenu}
    <ContextMenu
      x={equipMenu.x}
      y={equipMenu.y}
      entries={equipMenu.entries}
      onclose={() => (equipMenu = null)}
    />
  {/if}

  {#if qtyPrompt}
    <QtyPrompt
      x={qtyPrompt.x}
      y={qtyPrompt.y}
      name={qtyPrompt.name}
      max={qtyPrompt.max}
      bind:value={qtyPrompt.value}
      onconfirm={confirmQtyPickup}
      onclose={() => (qtyPrompt = null)}
    />
  {/if}
</div>

<style>
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
  .desig-layer.mark-layer {
    filter: none;
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
  .bld-row {
    position: absolute;
    bottom: 6px;
    left: calc(var(--hud-left-inset, 0px) + 6px);
    display: flex;
    align-items: stretch;
    gap: 4px;
    pointer-events: all;
    z-index: 10;
  }
  .hover-card {
    pointer-events: none;
  }
  .error {
    color: #c04040;
  }
</style>
