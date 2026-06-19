<!-- WebGL tile renderer canvas for Fantasia4x world map -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { browser } from '$app/environment';
  import { WebGLRenderer } from '$lib/webgl/renderer.js';
  import { buildGameGrid, generatePlaceholderGrid } from '$lib/webgl/fantasia-world.js';
  import {
    gameState,
    rendererReady,
    currentSeason,
    currentWeather
  } from '$lib/stores/gameState.js';
  import { cameraTileSize } from '$lib/stores/cameraView.js';
  import type {
    WorldTile,
    Pawn,
    PlacedBuilding,
    DesignationType,
    DroppedItem,
    FuelSettings,
    Item,
    Mob
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
    tileWetnessAt,
    computeThermalAt,
    weatherWindStrength
  } from '$lib/game/services/EnvironmentService.js';
  import { lightingService } from '$lib/game/services/LightingService.js';
  import { glyph, SHEET } from '$lib/webgl/tilesets.js';
  import { uiState } from '$lib/stores/uiState.js';
  import { worldEffects } from '$lib/stores/worldEffects.js';
  import {
    combatFeedback,
    FLOAT_TTL_MS,
    type CombatTextEvent
  } from '$lib/stores/combatFeedback.js';
  import { attackLunges, LUNGE_TTL_MS, type AttackLungeEvent } from '$lib/stores/attackLunges.js';
  import { renderFps } from '$lib/stores/perfStats.js';
  import { buildingService } from '$lib/game/services/BuildingService.js';
  import { resolveCharSpans, BIOMES, SUBTERRAINS } from '$lib/game/core/Terrains.js';
  import { resourceObjectService } from '$lib/game/services/ResourceObjectService.js';
  import { itemService } from '$lib/game/services/ItemService.js';
  import {
    getRefuelRequirements,
    getRefuelThresholdRatio,
    planRefuel
  } from '$lib/game/services/fuelRules.js';
  import { getEquipmentSlot } from '$lib/game/core/PawnEquipment.js';
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
  import {
    buildPawnCard,
    buildMobCard,
    jobProgressBar,
    PROGRESS_BAR_STATES
  } from '$lib/components/UI/gameCanvas/selectionCard';
  import { overlayDroppedItems, buildingsVisualSig } from '$lib/components/UI/gameCanvas/overlay';
  import itemsData from '$lib/game/database/items.jsonc';

  const ITEMS_DATABASE = itemsData as unknown as Item[];
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

  function computeFitTileSize(canvasW: number, canvasH: number): number {
    const mapW = worldMap.length > 0 ? worldMap[0].length : MAP_W;
    const mapH = worldMap.length > 0 ? worldMap.length : MAP_H;
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

  // Previous references for terrain-rebuild change detection (see gameState.subscribe).
  let _prevWorldMap: unknown;
  let _prevBuildingsSig = '';
  let _prevDesignations: unknown;
  let _prevZoneTiles: unknown;
  let _prevTerrainRev: number | undefined; // ADR-021: worker-sent terrain revision (see unsubState)
  let _prevDesignationRev: number | undefined; // §D: worker-sent designation revision → cheap 2D overlay redraw (no terrain rebuild)
  // Terrain rebuild is O(map) (38k-tile vertex buffer). worldMap churns every tick from
  // resource regrowth/harvest, which would rebuild it every frame (~60ms). Those changes are
  // invisible if they lag a fraction of a second, so coalesce sim-driven terrain rebuilds to
  // TERRAIN_REBUILD_MIN_MS; player-driven changes (buildings/designations/zones) stay immediate.
  let _terrainDirty = false;
  let _lastTerrainBuild = 0;
  const TERRAIN_REBUILD_MIN_MS = 500;

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
  // Coalesces many per-mousemove preview redraws into one rebuild per frame.
  let overlayRedrawScheduled = false;
  // Smoothing time-constant (seconds). Lower = snappier, higher = smoother/laggier.
  const MOVE_SMOOTH_TAU = 0.06;
  // Follow-camera smoothing constant (seconds). Slightly looser than pawn motion
  // so the camera trails gently rather than rigidly locking to the pawn.
  const FOLLOW_SMOOTH_TAU = 0.12;

  // World-effect overlay positions (Zzz, progress bars, campfire sparks) are computed
  // in the rAF frame() loop via updateWorldEffectOverlays(). Using $: reactive blocks
  // here caused 60fps Svelte store updates and DOM re-renders whenever viewX/viewY
  // changed (every frame during camera follow), scaling with sleeping-pawn count and
  // tanking FPS at night when everyone was asleep.
  let _sleepOverlayKey = '';
  let _progressOverlayKey = '';
  let _campfireOverlayKey = '';
  let _particleOverlayKey = '';
  let _healthOverlayKey = '';
  let _draftOverlayKey = '';
  let _floatTextKey = '';

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
  // Zone-instance ids whose color the player has hidden (persisted on the instance
  // in the save). Derived from zoneInstances in the gameState snapshot below.
  let hiddenZoneInstances = new Set<string>();
  // Change-detection signature so toggling colorHidden (which doesn't touch zoneTiles)
  // still forces a terrain rebuild.
  let _prevHiddenZoneSig = '';

  /** Tile keys whose stockpile tint should be suppressed, per the player's per-zone toggles. */
  function computeHiddenZoneTiles(): ReadonlySet<string> | undefined {
    if (hiddenZoneInstances.size === 0) return undefined;
    const out = new Set<string>();
    for (const [key, types] of Object.entries(zoneTiles)) {
      if (!types.includes('stockpile')) continue;
      const inst = designationZoneId[key];
      if (inst && hiddenZoneInstances.has(inst)) out.add(key);
    }
    return out;
  }

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
  const unsubUI = uiState.subscribe((s) => {
    designationMode = s.designationActive;
    blueprintBuildingId = s.blueprintBuildingId ?? null;
    blueprintMaterials = s.blueprintMaterials ?? null;
    debugBrush = s.debugBrush ?? null;
    activeZoneInstanceId = s.activeZoneInstanceId ?? null;
    if (!s.designationActive) zoneEraseMode = false;
    if (s.designationType) designationTypeActive = s.designationType as DesignationType;
    // Sync selected pawn from Pawn Tab (only when it differs to avoid clobbering map clicks)
    if (s.selectedPawnId !== selectedPawnId) {
      selectedPawnId = s.selectedPawnId;
    }
    // Sync selected mob from Entity Tab (only when it differs)
    if (s.selectedMobId !== selectedMobId) {
      selectedMobId = s.selectedMobId;
    }
    cameraFollowPawnId = s.cameraFollowPawnId ?? null;
    cameraFollowMobId = s.cameraFollowMobId ?? null;
    redrawOverlay();
    if (s.mapFocusRequest && ready && renderer?.isReady()) {
      const { x, y } = s.mapFocusRequest;
      // Focus snaps to a comfortable zoom, not the manual-zoom ceiling (MAX_TILE_W), which is
      // closer than you'd want auto-applied.
      const targetZoom = Math.min(MAX_TILE_W, 24);
      tileWidth = targetZoom;
      tileHeight = targetZoom;
      renderer.setTileSize(tileWidth, tileHeight);
      const visW = (container?.clientWidth ?? 800) / tileWidth;
      const visH = (container?.clientHeight ?? 600) / tileHeight;
      // Place the pawn at ~25% from the top so the HUD card at the bottom doesn't overlap it.
      setView(Math.round(x - visW / 2), Math.round(y - visH * 0.25));
      // Highlight the focused tile (yellow) so the jump target is actually visible — without this,
      // jumping to a single resource (e.g. a lair) just pans the camera with no indication of which
      // tile to look at.
      highlightedResourceTiles = new Set([`${x},${y}`]);
      redrawOverlay();
      uiState.clearMapFocus();
    }
  });

  // Zone drag-paint state (drag fills a rectangle)
  let zoneDragActive = false;

  // Blueprint drag-paint state
  let blueprintDragActive = false;
  let blueprintDragTiles = new Set<string>();
  // Resource tile interaction
  let selectedResourceTile: { x: number; y: number; resourceId: string } | null = null;
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

  // Hunt-drag mode: drag a zone to mark all same-type mobs in the area for hunting
  let huntDragMode = false;
  let huntDragCreatureId = '';
  let huntDragCreatureName = '';
  let huntDragActive = false;
  let huntAnchorX = 0;
  let huntAnchorY = 0;
  let huntEndX = 0;
  let huntEndY = 0;

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
  $: hoverTile =
    hoverTileX >= 0 && hoverTileY >= 0 && worldMap.length > 0
      ? (worldMap[hoverTileY]?.[hoverTileX] ?? null)
      : null;
  $: hoverResources = hoverTile
    ? Object.entries(hoverTile.resources ?? {}).filter(([, v]) => v > 0)
    : [];
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
    ? buildPawnCard(selectedPawn, true, { cameraFollowPawnId })
    : null;
  $: hoverPawnCard = hoverPawn ? buildPawnCard(hoverPawn, false, { cameraFollowPawnId }) : null;

  $: hoverMob = hoverMobId ? (mobs.find((m) => m.id === hoverMobId) ?? null) : null;

  $: hoverMobCard = (() => {
    if (!hoverMob) return null;
    const def = getCreatureById(hoverMob.creatureId);
    return def ? buildMobCard(hoverMob, def, false, { cameraFollowMobId, startHuntDrag }) : null;
  })();

  $: selectedMobCard = (() => {
    if (!selectedMob || !selectedMobDef) return null;
    return buildMobCard(selectedMob, selectedMobDef, true, { cameraFollowMobId, startHuntDrag });
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
    if (selectedResourceDesignation) {
      lines.push(`⊢ ${selectedResourceDesignation}…`);
    } else {
      for (const iact of activeInteractions) {
        if (iact.yields.length > 0) {
          lines.push(
            `${iact.action}: ${iact.yields
              .filter((y) => y.max > 0)
              .map((y) => `${y.min}–${y.max}×${y.itemId.replace(/_/g, ' ')}`)
              .join(' ')}`
          );
        }
      }
    }
    const btns: EntityButton[] = [];
    if (selectedResourceDesignation) {
      btns.push({ label: 'CANCEL ALL', onClick: cancelResourceDesignation });
    } else {
      for (const iact of activeInteractions) {
        const label = selectedResourceDef.lair
          ? 'DESTROY'
          : iact.designationType === 'woodcut'
            ? 'CUT'
            : iact.designationType === 'forage'
              ? 'FORAGE'
              : iact.designationType === 'mine'
                ? 'MINE'
                : 'HARVEST';
        btns.push({ label, onClick: () => designateResource(iact.designationType) });
      }
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

  // Dropped-item hover panel — same shared SelectedEntityCard as pawns/mobs/buildings/resources,
  // so the title sits on top and FRESH/COND bars (the reusable StatBar) render below it.
  $: hoverItemCard = (() => {
    const d = hoverDroppedItem;
    if (!d) return null;
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
      bars,
      note: d.stored ? 'stored' : 'dropped item — awaiting hauler'
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

  // ─── Selection system ─────────────────────────────────────────────────────
  // Shift+drag to drag-select a rectangle; highlights entities inside.
  let selDragActive = false;
  let selAnchorX = 0;
  let selAnchorY = 0;
  let selEndX = 0;
  let selEndY = 0;
  // Committed selection rect (null = no selection)
  let selRect: { x1: number; y1: number; x2: number; y2: number } | null = null;

  const ZONE_META: Record<string, { label: string; color: string; desc: string }> = {
    stockpile: {
      label: 'STOCKPILE ZONE',
      color: '#e8a020',
      desc: 'Haulers deposit carried resources here'
    },
    harvest: { label: 'HARVEST', color: '#4ccc44', desc: 'Single-tile harvest designation' },
    mine: { label: 'MINE', color: '#cc8833', desc: 'Single-tile mining designation' },
    construct: { label: 'CONSTRUCT', color: '#44aacc', desc: 'Construction site' }
  };

  // Entities inside committed selRect
  $: selPawns = selRect
    ? pawns.filter(
        (p) =>
          p.position &&
          p.position.x >= Math.min(selRect!.x1, selRect!.x2) &&
          p.position.x <= Math.max(selRect!.x1, selRect!.x2) &&
          p.position.y >= Math.min(selRect!.y1, selRect!.y2) &&
          p.position.y <= Math.max(selRect!.y1, selRect!.y2)
      )
    : [];
  $: selBuildings = selRect
    ? buildings.filter(
        (b) =>
          b.x >= Math.min(selRect!.x1, selRect!.x2) &&
          b.x <= Math.max(selRect!.x1, selRect!.x2) &&
          b.y >= Math.min(selRect!.y1, selRect!.y2) &&
          b.y <= Math.max(selRect!.y1, selRect!.y2)
      )
    : [];
  $: selZones = (() => {
    if (!selRect) return {} as Record<string, number>;
    const minX = Math.min(selRect.x1, selRect.x2);
    const maxX = Math.max(selRect.x1, selRect.x2);
    const minY = Math.min(selRect.y1, selRect.y2);
    const maxY = Math.max(selRect.y1, selRect.y2);
    const counts: Record<string, number> = {};
    const tally = (key: string, type: string) => {
      const [x, y] = key.split(',').map(Number);
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) counts[type] = (counts[type] ?? 0) + 1;
    };
    for (const [key, type] of Object.entries(designations)) tally(key, type);
    for (const [key, types] of Object.entries(zoneTiles)) for (const t of types) tally(key, t);
    return counts;
  })();
  $: hasSelection =
    selRect !== null &&
    (selPawns.length > 0 || selBuildings.length > 0 || Object.keys(selZones).length > 0);
  // ──────────────────────────────────────────────────────────────────────────

  // Visual signature of the building set for terrain-rebuild change detection.
  // Includes ONLY fields buildGameGrid draws (position, type, status, deconstruct,
  // paused). Deliberately excludes fuel/lit so a burning campfire's per-tick fuel
  // countdown does not force a full terrain rebuild every frame.
  const unsubState = gameState.subscribe((s) => {
    worldMap = s.worldMap ?? [];
    pawns = s.pawns ?? [];
    buildings = s.buildings ?? [];
    designations = s.designations ?? {};
    zoneTiles = s.zoneTiles ?? {};
    designationZoneId = s.designationZoneId ?? {};
    hiddenZoneInstances = new Set(
      (s.zoneInstances ?? []).filter((z) => z.colorHidden).map((z) => z.id)
    );
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
    // Hiding/showing a zone's color changes what buildGameGrid paints but touches
    // neither zoneTiles nor _terrainRev, so track it with its own signature.
    const hiddenZoneSig = [...hiddenZoneInstances].sort().join(',');
    const terrainChanged =
      hiddenZoneSig !== _prevHiddenZoneSig ||
      (workerRev !== undefined
        ? workerRev !== _prevTerrainRev
        : worldMap !== _prevWorldMap ||
          buildingsSig !== _prevBuildingsSig ||
          designations !== _prevDesignations ||
          zoneTiles !== _prevZoneTiles);
    _prevHiddenZoneSig = hiddenZoneSig;
    _prevTerrainRev = workerRev;
    _prevWorldMap = worldMap;
    _prevBuildingsSig = buildingsSig;
    _prevDesignations = designations;
    _prevZoneTiles = zoneTiles;
    // §D: designations changed → redraw ONLY the cheap 2D designation overlay, NOT the 38k-tile
    // terrain buffer (buildGameGrid doesn't render designations). This is the dominant-harvest-dip fix:
    // designation churn was forcing full terrain rebuilds ~2×/s for a layer the terrain doesn't contain.
    const workerDesigRev = (s as unknown as { _designationRev?: number })._designationRev;
    const designationsChanged =
      workerDesigRev !== undefined
        ? workerDesigRev !== _prevDesignationRev
        : designations !== _prevDesignations;
    _prevDesignationRev = workerDesigRev;
    if (designationsChanged && renderer?.isReady() && worldMap.length > 0) drawDesignations();
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
          _terrainDirty = true; // coalesced in the render loop (throttled)
          // §M: recompute the static grove glows on the same (gated) cadence as terrain rebuilds —
          // groves rarely change, and this O(map) scan piggybacks on the rebuild that's happening
          // anyway. Then re-merge with the building lights.
          resourceGlowEmitters = lightingService.collectResourceEmitters(worldMap);
          refreshEmitters();
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
    overlayDroppedItems(itemOverlayGrid, droppedItems);
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
    const seenMobs = new Set<string>();
    for (const mob of liveMobs) {
      const def = getCreatureById(mob.creatureId);
      if (!def || !def.chars.length) continue;
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
      const isSelected = mob.id === selectedMobId;
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
      const isSelected = pawn.id === selectedPawnId;
      const isSleeping = pawn.currentState === 'Sleeping';
      const isDrafted = pawn.drafted;
      const isCriticallyHungry = (pawn.needs?.hunger ?? 0) >= 85;
      const baseColor = isDrafted
        ? { r: 1.0, g: 0.15, b: 0.15 }
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
        rotation: isSleeping ? 90 : undefined
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

    const newSleep = [
      ...pawns
        .filter((p) => p.position && p.currentState === 'Sleeping')
        .map((p) => ({
          id: p.id,
          left: (p.position!.x - viewX + 0.5) * tW,
          top: (p.position!.y - viewY) * tH - 18
        }))
        .filter((o) => o.left >= 0 && o.top >= 0 && o.left <= W),
      ...mobs
        .filter((m) => m.state === 'Sleeping')
        .map((m) => ({
          id: m.id,
          left: (m.x - viewX + 0.5) * tW,
          top: (m.y - viewY) * tH - 18
        }))
        .filter((o) => o.left >= 0 && o.top >= 0 && o.left <= W)
    ];
    const sleepKey = newSleep
      .map((o) => `${o.id}:${Math.round(o.left)},${Math.round(o.top)}`)
      .join('|');
    if (sleepKey !== _sleepOverlayKey) {
      _sleepOverlayKey = sleepKey;
      worldEffects.setSleepingOverlays(newSleep);
    }

    const newProgress = [
      ...pawns
        .filter(
          (p) =>
            p.position &&
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
        .filter((m) => (m.eatProgress ?? 0) > 0)
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

    const newCampfire = buildings
      .filter((b) => b.type === 'campfire' && b.status === 'complete' && b.lit === true)
      .map((b) => ({
        id: b.id,
        left: (b.x - viewX + 0.5) * tW,
        top: (b.y - viewY + 0.5) * tH
      }))
      .filter((o) => o.left >= 0 && o.top >= 0 && o.left <= W);
    const campfireKey = newCampfire
      .map((o) => `${o.id}:${Math.round(o.left)},${Math.round(o.top)}`)
      .join('|');
    if (campfireKey !== _campfireOverlayKey) {
      _campfireOverlayKey = campfireKey;
      worldEffects.setCampfireOverlays(newCampfire);
    }

    // Ambient per-tile particle effects (e.g. a goblin/orc warren's smoke). Scan ONLY the visible
    // tile rect (bounded ~viewport size) for resources whose def declares a `particleEffect` — never
    // the whole map. One emitter per affected tile, on-screen only.
    const newParticles: { id: string; left: number; top: number; effect: string }[] = [];
    const px0 = Math.max(0, Math.floor(viewX));
    const py0 = Math.max(0, Math.floor(viewY));
    const px1 = Math.min((worldMap[0]?.length ?? 0) - 1, Math.ceil(viewX + W / tW));
    const py1 = Math.min(worldMap.length - 1, Math.ceil(viewY + H / tH));
    for (let ty = py0; ty <= py1; ty++) {
      const trow = worldMap[ty];
      if (!trow) continue;
      for (let tx = px0; tx <= px1; tx++) {
        const res = trow[tx]?.resources;
        if (!res) continue;
        for (const rid in res) {
          if ((res[rid] ?? 0) <= 0) continue;
          const eff = resourceObjectService.getById(rid)?.particleEffect;
          if (!eff) continue;
          newParticles.push({
            id: `${tx},${ty}`,
            left: (tx - viewX + 0.5) * tW,
            top: (ty - viewY + 0.35) * tH,
            effect: eff
          });
          break; // one emitter per tile
        }
      }
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
        .filter((p) => p.position && p.isAlive !== false && (p.state.health ?? 100) < 100)
        .map((p) => ({
          id: `hp-${p.id}`,
          left: (p.position!.x - viewX + 0.5) * tW,
          top: (p.position!.y - viewY) * tH - 10,
          health: Math.max(0, Math.min(1, (p.state.health ?? 100) / 100)),
          type: 'pawn' as const
        }))
        .filter((o) => o.left >= 0 && o.top >= 0 && o.left <= W),
      ...mobs
        .filter((m) => m.state !== 'Corpse' && m.health < m.maxHealth)
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
        // Build polyline from current position through remaining path tiles to target.
        const points: Array<{ x: number; y: number }> = [
          { x: (p.position!.x - viewX + 0.5) * tW, y: (p.position!.y - viewY + 0.5) * tH }
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
        } else if (pathIdx >= path.length) {
          // Move order with no remaining path yet — e.g. issued while the game is PAUSED,
          // before _processDraftOrders computes the route on a sim tick. Draw a straight line
          // to the destination so the order is visible immediately; the real path replaces it
          // once the sim advances. (NT-U4)
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
        top: (e.worldY - viewY) * tH - 14,
        text: e.text,
        kind: e.kind
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

  function redrawOverlayNow() {
    if (!renderer?.isReady() || worldMap.length === 0) return;
    // Profiler: how often the full 38k-tile terrain grid is rebuilt + re-uploaded. If this is
    // ~1/tick during RUNNING, the renderCPU cost is rebuild churn (fix the trigger); if ~0 while
    // renderCPU stays high, the cost is the per-frame buffer re-upload in the renderer instead.
    const grid = buildGameGrid(
      worldMap,
      buildings,
      designations,
      zoneTiles,
      computeHiddenZoneTiles()
    );

    // (Live zone drag-paint preview is drawn on the 2D overlay in
    // drawDesignations(), not here, to avoid rebuilding the terrain buffer.)

    // Selection drag preview (Shift+drag in progress)
    if (selDragActive) {
      _overlayRect(
        grid,
        selAnchorX,
        selAnchorY,
        selEndX,
        selEndY,
        { r: 0.9, g: 0.9, b: 1.0 },
        { rMul: 0.5, rAdd: 0.0, gMul: 0.5, gAdd: 0.0, bMul: 0.5, bAdd: 0.3 }
      );
    }

    // Committed selection highlight
    if (selRect) {
      _overlayRect(
        grid,
        selRect.x1,
        selRect.y1,
        selRect.x2,
        selRect.y2,
        { r: 0.8, g: 0.9, b: 1.0 },
        { rMul: 0.6, rAdd: 0.0, gMul: 0.6, gAdd: 0.05, bMul: 0.6, bAdd: 0.2 }
      );
    }

    // Blueprint placement preview
    if (blueprintBuildingId) {
      if (blueprintDragActive && blueprintDragTiles.size > 0) {
        for (const key of blueprintDragTiles) {
          const [tx, ty] = key.split(',').map(Number);
          _blueprintPreviewTile(grid, tx, ty);
        }
      } else if (hoverTileX >= 0 && hoverTileY >= 0) {
        _blueprintPreviewTile(grid, hoverTileX, hoverTileY);
      }
    }

    // Selected resource tile highlight (yellow)
    if (selectedResourceTile) {
      const { x, y } = selectedResourceTile;
      const t = grid.getTile(x, y);
      if (t) {
        grid.setTile(x, y, {
          char: t.char,
          foreground: { r: 1.0, g: 0.9, b: 0.1 },
          background: {
            r: t.background.r * 0.4 + 0.14,
            g: t.background.g * 0.4 + 0.1,
            b: t.background.b * 0.4
          },
          position: { x, y }
        });
      }
    }

    // (Live "select similar" drag preview is drawn on the 2D overlay in
    // drawDesignations(), not here, to avoid rebuilding the terrain buffer.)

    renderer.setGrid(grid);
    drawDesignations();
  }

  function drawDesignations() {
    if (!designCanvas || !container || !worldMap.length) return;
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

    // Live "select similar resource" drag preview. Matching tiles glow green, the
    // rest are dimmed. Drawn on the 2D overlay so dragging across many tiles never
    // rebuilds the WebGL terrain buffer.
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
          ctx.fillStyle = match ? 'rgba(60, 230, 90, 0.40)' : 'rgba(0, 0, 0, 0.45)';
          ctx.fillRect(sx2, sy2, tileWidth, tileHeight);
        }
      }
      ctx.restore();
    }

    // Draw yellow tile highlights (below icons) — just transparent rect fills.
    if (highlightedResourceTiles.size > 0) {
      ctx.save();
      ctx.fillStyle = '#f0d020';
      ctx.globalAlpha = 0.28;
      for (const key of highlightedResourceTiles) {
        const [wx, wy] = key.split(',').map(Number);
        const sx = (wx - viewX) * tileWidth;
        const sy = (wy - viewY) * tileHeight;
        if (sx < -tileWidth || sy < -tileHeight || sx > W + tileWidth || sy > H + tileHeight)
          continue;
        ctx.fillRect(sx, sy, tileWidth, tileHeight);
      }
      ctx.restore();
    }

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
  function _overlayRect(
    grid: GameGrid,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    fg: { r: number; g: number; b: number },
    bg: { rMul: number; rAdd: number; gMul: number; gAdd: number; bMul: number; bAdd: number }
  ) {
    const minX = Math.min(x1, x2),
      maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2),
      maxY = Math.max(y1, y2);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = grid.getTile(x, y);
        if (!t) continue;
        grid.setTile(x, y, {
          char: t.char,
          foreground: fg,
          background: {
            r: t.background.r * bg.rMul + bg.rAdd,
            g: t.background.g * bg.gMul + bg.gAdd,
            b: t.background.b * bg.bMul + bg.bAdd
          },
          position: { x, y }
        });
      }
    }
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

    // Designation mode: handled by drag — single-click still paints one tile
    if (designationMode) {
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
      redrawOverlay();
      return;
    }

    // Click on any building at this tile → select it, deselect pawn
    const clickedBuilding = buildings.find((b) => b.x === hoverTileX && b.y === hoverTileY);
    if (clickedBuilding) {
      selectedBuildingId = clickedBuilding.id;
      selectedPawnId = null;
      selectedMobId = null;
      showShelterAssign = false;
      uiState.selectPawn(null);
      uiState.selectMob(null);
      redrawOverlay();
      return;
    }

    // Click on a pawn → select it, deselect building
    const clickedPawn = findPawnAtTile(hoverTileX, hoverTileY);
    if (clickedPawn) {
      selectedPawnId = clickedPawn.id;
      selectedBuildingId = null;
      selectedMobId = null;
      selectedResourceTile = null;
      highlightedResourceTiles = new Set();
      uiState.selectPawn(clickedPawn.id);
      uiState.selectMob(null);
      redrawOverlay();
      return;
    }

    // Click on a live mob/animal → select it, deselect everything else
    const clickedMob = findMobAtTile(hoverTileX, hoverTileY);
    if (clickedMob) {
      selectedMobId = clickedMob.id;
      selectedPawnId = null;
      selectedBuildingId = null;
      selectedResourceTile = null;
      highlightedResourceTiles = new Set();
      uiState.selectPawn(null);
      uiState.selectMob(clickedMob.id);
      redrawOverlay();
      return;
    }

    // Click on a tile with resources → show info HUD
    const clickedTileData = worldMap[hoverTileY]?.[hoverTileX];
    const tileResources = Object.entries(clickedTileData?.resources ?? {}).filter(([, v]) => v > 0);
    if (tileResources.length > 0) {
      const [resourceId] = tileResources[0];
      selectedResourceTile = { x: hoverTileX, y: hoverTileY, resourceId };
      selectedPawnId = null;
      selectedBuildingId = null;
      selectedMobId = null;
      uiState.selectPawn(null);
      uiState.selectMob(null);
      redrawOverlay();
      return;
    }

    // Click on empty tile → if drafted pawn selected, move there; else deselect all
    selectedBuildingId = null;
    selectedResourceTile = null;
    selectedMobId = null;
    highlightedResourceTiles = new Set();
    uiState.selectMob(null);

    if (selectedPawn?.drafted && worldMap.length > 0) {
      const targetTile = worldMap[hoverTileY]?.[hoverTileX];
      if (targetTile?.walkable) {
        gameState.command({
          type: 'setPawnDraftTarget',
          payload: {
            pawnId: selectedPawn.id,
            target: { type: 'move', x: hoverTileX, y: hoverTileY }
          },
          save: true
        });
        redrawOverlay();
        return;
      }
    }

    selectedPawnId = null;
    uiState.selectPawn(null);
    redrawOverlay();
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

  onDestroy(() => {
    unsubState();
    unsubUI();
    unsubCombatFeedback();
    unsubAttackLunges();
    rendererReady.set(false); // a remount must re-init WebGL before the game is shown again
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

      const grid =
        worldMap.length > 0
          ? buildGameGrid(worldMap, buildings, designations, zoneTiles, computeHiddenZoneTiles())
          : generatePlaceholderGrid();
      renderer.setGrid(grid);
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
        // §M: seed grove glows from the current map, then merge with building lights.
        if (worldMap.length > 0)
          resourceGlowEmitters = lightingService.collectResourceEmitters(worldMap);
        refreshEmitters();
        _ambientLight = light;
        _ambientTint = tinted;
      }

      ready = true;
      rendererReady.set(true); // WebGL is up — arms the paused warmup linger that drops the overlay
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
    const [targetX, targetY] = clampView(rp.x - visW / 2, rp.y - visH * 0.25);
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
    const [targetX, targetY] = clampView(rp.x - visW / 2, rp.y - visH * 0.25);
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
      updatePawnOverlay(dt);
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
      updateWorldEffectOverlays();
      // Coalesced sim-driven terrain rebuild: at most once per TERRAIN_REBUILD_MIN_MS instead
      // of the full 38k-tile rebuild every frame that resource regrowth/harvest would force.
      if (_terrainDirty && now - _lastTerrainBuild >= TERRAIN_REBUILD_MIN_MS) {
        _terrainDirty = false;
        _lastTerrainBuild = now;
        redrawOverlayNow();
      }
      renderer.setItemOverlayGrid(itemOverlayGrid);
      renderer.setOverlayGrid(pawnOverlayGrid);
      renderer.beginFrame();
      renderer.endFrame();
      // Surface render FPS to the topbar ~4×/sec to avoid store churn.
      if (now - lastFpsPush > 250) {
        lastFpsPush = now;
        renderFps.set(Math.round(renderer.getStats().fps));
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
    if (!ready) return;
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
      case 'Escape':
        if (debugBrush) {
          uiState.deactivateDebugBrush();
          redrawOverlay();
          break;
        }
        if (showFuelSettings) {
          showFuelSettings = false;
          break;
        }
        if (huntDragMode) {
          huntDragMode = false;
          huntDragActive = false;
          redrawOverlay();
          break;
        }
        if (similarDragMode) {
          similarDragMode = false;
          similarDragActive = false;
          redrawOverlay();
          break;
        }
        if (selectedResourceTile) {
          selectedResourceTile = null;
          highlightedResourceTiles = new Set();
          redrawOverlay();
          break;
        }
        if (selectedMobId) {
          selectedMobId = null;
          uiState.selectMob(null);
          redrawOverlay();
          break;
        }
        if (selectedBuildingId) {
          selectedBuildingId = null;
          break;
        }
        if (blueprintBuildingId) {
          uiState.deactivateBlueprint();
          blueprintDragActive = false;
          blueprintDragTiles.clear();
          redrawOverlay();
          break;
        }
        uiState.deactivateDesignation();
        zoneEraseMode = false;
        zoneDragActive = false;
        selDragActive = false;
        selRect = null;
        selectedPawnId = null;
        uiState.selectPawn(null);
        uiState.setFollowPawn(null);
        uiState.setFollowMob(null);
        redrawOverlay();
        break;
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
    if (!ready || !renderer) return;
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
    if (e.button !== 0) return;
    if (huntDragMode) {
      huntDragActive = true;
      huntAnchorX = hoverTileX;
      huntAnchorY = hoverTileY;
      huntEndX = hoverTileX;
      huntEndY = hoverTileY;
      redrawOverlay();
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
      // Blueprint paint mode: track tiles as user drags
      blueprintDragActive = true;
      blueprintDragTiles.clear();
      if (hoverTileX >= 0 && hoverTileY >= 0) blueprintDragTiles.add(`${hoverTileX},${hoverTileY}`);
      redrawOverlay();
      return;
    }
    if (e.shiftKey) {
      // Shift+drag: start selection rectangle
      selDragActive = true;
      selAnchorX = hoverTileX;
      selAnchorY = hoverTileY;
      selEndX = hoverTileX;
      selEndY = hoverTileY;
      // Clear previous committed rect while dragging
      selRect = null;
      redrawOverlay();
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
    if (zoneDragActive) {
      zoneEndX = hoverTileX;
      zoneEndY = hoverTileY;
      // Cheap 2D-overlay redraw only — the terrain buffer stays untouched.
      drawDesignations();
      return;
    }
    if (huntDragActive) {
      huntEndX = hoverTileX;
      huntEndY = hoverTileY;
      redrawOverlay();
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
      if (hoverTileX >= 0 && hoverTileY >= 0) blueprintDragTiles.add(`${hoverTileX},${hoverTileY}`);
      redrawOverlay();
      return;
    }
    if (selDragActive) {
      selEndX = hoverTileX;
      selEndY = hoverTileY;
      redrawOverlay();
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
    if (huntDragActive) {
      completeHuntDrag();
      return;
    }
    if (similarDragActive) {
      completeSimilarDrag();
      return;
    }
    if (blueprintDragActive) {
      // Commit blueprint placements at all dragged tiles
      const bid = blueprintBuildingId;
      if (bid && blueprintDragTiles.size > 0) {
        const buildingDef = buildingService.getBuildingById(bid);
        if (buildingDef) {
          // ADR-016: placeBuilding RESERVES the cost to each building (pawns fetch it to the site);
          // it is consumed on construction completion, not at placement.
          gameState.command({
            type: 'placeBuildings',
            payload: {
              bid,
              tiles: [...blueprintDragTiles].map(
                (key) => key.split(',').map(Number) as [number, number]
              ),
              materials: blueprintMaterials ?? undefined
            },
            save: true
          });
        }
      }
      blueprintDragActive = false;
      blueprintDragTiles.clear();
      uiState.deactivateBlueprint();
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
      redrawOverlay();
      return;
    }
    if (selDragActive) {
      // Commit selection
      selDragActive = false;
      selRect = { x1: selAnchorX, y1: selAnchorY, x2: selEndX, y2: selEndY };
      redrawOverlay();
      return;
    }
    if (dragDistance < 3) {
      // Recompute hover tile from current viewX/viewY — the follow camera may
      // have shifted the view since the last mousemove, making the stored tile stale.
      // (Floor the combined coord — viewX/viewY are fractional under smooth follow.)
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
      highlightedResourceTiles = new Set();
    } else {
      const { x, y } = selectedResourceTile;
      gameState.command({ type: 'designate', payload: { x, y, type: resolvedType }, save: true });
    }
    redrawOverlay();
  }

  function cancelResourceDesignation() {
    if (!selectedResourceTile) return;
    // Symmetric with MARK: clear every designated tile of this resource, not just the selected one,
    // so a batch-marked resource cancels in full.
    gameState.command({
      type: 'clearDesignationsForResource',
      payload: { resourceId: selectedResourceTile.resourceId },
      save: true
    });
    redrawOverlay();
  }

  function startHuntDrag(mob: Mob) {
    const def = getCreatureById(mob.creatureId);
    huntDragCreatureId = mob.creatureId;
    huntDragCreatureName = def?.name ?? mob.creatureId.replace(/_/g, ' ');
    huntDragMode = true;
    huntDragActive = false;
  }

  function completeHuntDrag() {
    const minX = Math.min(huntAnchorX, huntEndX);
    const maxX = Math.max(huntAnchorX, huntEndX);
    const minY = Math.min(huntAnchorY, huntEndY);
    const maxY = Math.max(huntAnchorY, huntEndY);
    const ids = new Set(
      mobs
        .filter(
          (m) =>
            m.creatureId === huntDragCreatureId &&
            m.state !== 'Corpse' &&
            m.x >= minX &&
            m.x <= maxX &&
            m.y >= minY &&
            m.y <= maxY
        )
        .map((m) => m.id)
    );
    if (ids.size > 0) {
      gameState.command({ type: 'markMobsForHunt', payload: { ids: [...ids] }, save: true });
    }
    huntDragMode = false;
    huntDragActive = false;
    redrawOverlay();
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
    redrawOverlay();
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
    blueprintDragTiles.clear();
    if (selDragActive) {
      selDragActive = false;
      selRect = { x1: selAnchorX, y1: selAnchorY, x2: selEndX, y2: selEndY };
      redrawOverlay();
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
    equipMenu = null;
    if (hoverTileX < 0 || hoverTileY < 0) return;

    // ── Draft mode: right-click issues orders ────────────────────────────────
    if (selectedPawn?.drafted) {
      const targetMob = mobs.find(
        (m) => m.x === hoverTileX && m.y === hoverTileY && m.isAlive !== false
      );
      if (targetMob) {
        // Attack mob
        gameState.command({
          type: 'setPawnDraftTarget',
          payload: {
            pawnId: selectedPawn.id,
            target: { type: 'attack', targetId: targetMob.id, targetType: 'mob' }
          },
          save: true
        });
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
        // Attack pawn
        gameState.command({
          type: 'setPawnDraftTarget',
          payload: {
            pawnId: selectedPawn.id,
            target: { type: 'attack', targetId: targetPawn.id, targetType: 'pawn' }
          },
          save: true
        });
        return;
      }
      const pawnId = selectedPawn.id;
      // Capture the clicked tile NOW — `hoverTileX/Y` track the cursor and change (or reset to -1)
      // the moment the cursor moves onto the menu, so a deferred "Move here" must use these snapshots.
      const tileX = hoverTileX;
      const tileY = hoverTileY;
      const issueMove = () =>
        gameState.command({
          type: 'setPawnDraftTarget',
          payload: { pawnId, target: { type: 'move', x: tileX, y: tileY } },
          save: true
        });

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
            // Equippable gear → equip onto the pawn (existing behaviour).
            entries.push({
              label: `Equip ${name} → ${slotLabel(slot)}`,
              run: () => gameState.equipItemFromTile(pawnId, d.id)
            });
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
    } else if (designationService.hasDesignation(hoverTileX, hoverTileY, $gameState)) {
      gameState.command({
        type: 'clearDesignation',
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
    <div class="designation-hud">
      ◈ SELECTING ({Math.abs(selEndX - selAnchorX) + 1}×{Math.abs(selEndY - selAnchorY) + 1}) —
      release to highlight
    </div>
  {:else if blueprintBuildingId}
    <div class="designation-hud">
      [◆ {buildingService.getBuildingById(blueprintBuildingId)?.name ?? blueprintBuildingId}] — drag
      to paint · Esc cancel
    </div>
  {:else if similarDragMode}
    <div class="designation-hud">
      [⊞ SELECT {similarDragResourceId.replace(/_/g, ' ').toUpperCase()}] — drag to designate all ·
      Esc cancel{#if similarDragActive}
        — ({Math.abs(similarEndX - similarAnchorX) + 1}×{Math.abs(similarEndY - similarAnchorY) +
          1}){/if}
    </div>
  {:else if huntDragMode}
    <div class="designation-hud" style:color="#ee8844" style:border-color="#ee8844">
      [⊞ HUNT {huntDragCreatureName.toUpperCase()}] — drag zone to queue all for hunting · Esc
      cancel{#if huntDragActive}
        — ({Math.abs(huntEndX - huntAnchorX) + 1}×{Math.abs(huntEndY - huntAnchorY) + 1}){/if}
    </div>
  {/if}
  {#if selectedPawnCard}
    <!-- Selected pawn card — locked to this pawn regardless of mouse hover -->
    <SelectedEntityCard model={selectedPawnCard} />
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
  {:else if resourceCard}
    <SelectedEntityCard model={resourceCard} />
  {:else if hasSelection}
    <!-- Multi-tile drag-select summary -->
    <div class="tile-hud tile-hud--selection">
      <span class="sel-title">◈ SELECTION</span>
      {#if selPawns.length > 0}
        <div class="sel-row sel-pawns">
          {selPawns.length} pawn{selPawns.length !== 1 ? 's' : ''}: {selPawns
            .map((p) => p.name ?? p.id)
            .join(', ')}
        </div>
      {/if}
      {#if selBuildings.length > 0}
        <div class="sel-row sel-buildings">
          {selBuildings.length} building{selBuildings.length !== 1 ? 's' : ''}: {selBuildings
            .map((b) => b.type)
            .join(', ')}
        </div>
      {/if}
      {#each Object.entries(selZones) as [type, count]}
        <div class="sel-row" style="color:{ZONE_META[type]?.color ?? '#aaa'}">
          {count}× {ZONE_META[type]?.label ?? type}
        </div>
      {/each}
      <div class="sel-hint">Esc to clear</div>
    </div>
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
          [{jobProgressBar(workReq > 0 ? workDone / workReq : 0)}] {Math.round(workDone)}/{workReq} work
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
    </div>
  {:else if hoverItemCard}
    <!-- Dropped item on the hovered tile — shared SelectedEntityCard, bars below the title -->
    <SelectedEntityCard model={hoverItemCard} />
  {:else if hoverTile}
    {@const tileThermal = computeThermalAt(hoverTile.x, hoverTile.y, buildings)}
    {@const tileTemp = tileTemperature(
      hoverTile.terrainType,
      $currentSeason,
      $currentWeather,
      tileThermal
    )}
    {@const tileWet = tileWetnessAt(
      hoverTile.x,
      hoverTile.y,
      hoverTile.terrainType,
      $currentWeather,
      tileThermal
    )}
    {@const windy =
      Math.max(weatherWindStrength($currentWeather?.type), $currentWeather?.wind ?? 0) >= 0.4}
    {@const tileSnow = Math.round(hoverTile.snow ?? 0)}
    <div class="tile-hud">
      <span class="tile-coord">({hoverTile.x},{hoverTile.y})</span><span class="tile-layers"
        >{BIOMES[hoverTile.terrainType]?.displayName ?? hoverTile.terrainType},{SUBTERRAINS[
          hoverTile.subType
        ]?.displayName ?? hoverTile.subType},{hoverResources[0]?.[0]
          ? (resourceObjectService.getById(hoverResources[0][0])?.displayName ??
            hoverResources[0][0])
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
      <div
        class="tile-light"
        style="color:{hoverTileLight >= 0.8
          ? '#68b030'
          : hoverTileLight >= 0.4
            ? '#b09030'
            : '#c83018'}"
      >
        light {Math.round(hoverTileLight * 100)}%
      </div>
      <div class="tile-env">
        <span style="color:{tileTemp <= 0 ? '#5aa0e0' : tileTemp >= 30 ? '#e07a2a' : '#b0a060'}"
          >temp {tileTemp}°C</span
        >
        <span style="color:{tileWet >= 60 ? '#3a9ed0' : tileWet >= 30 ? '#6aa0a0' : '#a08a5a'}"
          >wet {Math.round(tileWet)}%</span
        >
        {#if tileSnow > 0}<span style="color:#cdd6e0">snow {tileSnow}%</span>{/if}
        {#if windy}<span style="color:#8fc8a0">windy</span>{/if}
        {#if tileThermal.roofed}<span style="color:#7e9fbf">roofed</span>{/if}
      </div>
    </div>
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
    cursor: crosshair;
    user-select: none;
  }
  .canvas-wrap.dragging {
    cursor: crosshair;
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
    font-family: 'Courier New', monospace;
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
    font-family: 'Courier New', monospace;
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

  .tile-hud--selection {
    white-space: normal;
  }
  .sel-title {
    color: #c08040;
    font-weight: bold;
    margin-right: 5px;
    display: block;
    margin-bottom: 1px;
  }
  .sel-row {
    font-size: 9px;
    line-height: 1.4;
  }
  .sel-pawns {
    color: #c8a060;
  }
  .sel-buildings {
    color: #a08040;
  }
  .sel-hint {
    color: #7a6030;
    font-size: 9px;
    margin-top: 2px;
  }
  .tile-zone {
    font-size: 9px;
    margin-top: 1px;
  }
  .tile-move {
    font-size: 9px;
    margin-top: 1px;
  }
  .tile-light {
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
    font-family: 'Courier New', monospace;
    font-size: 11px;
    font-weight: bold;
    padding: 3px 10px;
    pointer-events: none;
    white-space: nowrap;
    z-index: 10;
  }
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
    font-family: 'Courier New', monospace;
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
