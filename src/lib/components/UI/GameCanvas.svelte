<!-- WebGL tile renderer canvas for Fantasia4x world map -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { WebGLRenderer } from '$lib/webgl/renderer.js';
  import { buildGameGrid, generatePlaceholderGrid } from '$lib/webgl/fantasia-world.js';
  import { gameState } from '$lib/stores/gameState.js';
  import type {
    WorldTile,
    Pawn,
    PlacedBuilding,
    DesignationType,
    DroppedItem
  } from '$lib/game/core/types.js';
  import type { GameGrid } from '$lib/webgl/game-grid.js';
  import { wasmPathfinderService } from '$lib/game/services/WasmPathfinderService.js';
  import { pawnService } from '$lib/game/services/PawnService.js';
  import { buildPathfindingGrids } from '$lib/game/services/PathfinderService.js';
  import { designationService } from '$lib/game/services/DesignationService.js';
  import { glyph, SHEET } from '$lib/webgl/tilesets.js';
  import { uiState } from '$lib/stores/uiState.js';
  import { worldEffects } from '$lib/stores/worldEffects.js';
  import { buildingService } from '$lib/game/services/BuildingService.js';
  import { resolveCharSpans } from '$lib/game/core/Terrains.js';

  // Tile size range for zoom (square cells for CoQ sprite-mode)
  // MAP_W / MAP_H must match the generateWorld() call in gameState.ts
  const MAP_W = 240;
  const MAP_H = 160;
  const MAX_TILE_W = 24;
  const ZOOM_STEP = 2;
  const SCROLL_STEP = 4; // tiles per arrow key press
  const CAMERA_STORAGE_KEY = 'fantasia4x-camera';

  // fitTileSize: exact float that makes the whole map fill the canvas edge-to-edge.
  // Used as the initial tile size and the zoom-out limit.
  let fitTileSize = 8;
  let tileWidth = 8;
  let tileHeight = 8;

  function computeFitTileSize(canvasW: number, canvasH: number): number {
    const mapW = worldMap.length > 0 ? worldMap[0].length : MAP_W;
    const mapH = worldMap.length > 0 ? worldMap.length : MAP_H;
    return Math.max(canvasW / mapW, canvasH / mapH);
  }

  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let renderer: WebGLRenderer | null = null;
  let animationId = 0;
  let ready = false;
  let errorMsg = '';
  let worldMap: WorldTile[][] = [];

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

  // Sleeping overlays: push to worldEffectsStore so WorldEffectsLayer renders them
  // at the correct z-index (above tiles, below popup panels).
  $: worldEffects.setSleepingOverlays(
    pawns
      .filter((p) => p.position && p.currentState === 'Sleeping')
      .map((p) => {
        const left = (p.position!.x - viewX + 0.5) * tileWidth;
        const top = (p.position!.y - viewY) * tileHeight - 18;
        return { id: p.id, left, top };
      })
      .filter((o) => o.left >= 0 && o.top >= 0 && o.left <= (container?.clientWidth ?? 0))
  );

  // Working progress bars: same pathway as sleeping overlays.
  $: worldEffects.setProgressOverlays(
    pawns
      .filter(
        (p) =>
          p.position &&
          p.currentState === 'Working' &&
          p.activeJob &&
          (p.activeJob.progress ?? 0) >= 0
      )
      .map((p) => {
        const left = (p.position!.x - viewX + 0.5) * tileWidth;
        const top = (p.position!.y - viewY) * tileHeight - 6;
        return {
          id: p.id,
          left,
          top,
          progress: Math.max(0, Math.min(1, p.activeJob?.progress ?? 0))
        };
      })
      .filter((o) => o.left >= 0 && o.top >= 0 && o.left <= (container?.clientWidth ?? 0))
  );

  // Phase 4: buildings and designations overlay
  let buildings: PlacedBuilding[] = [];
  let designations: Record<string, DesignationType> = {};

  // Phase 7: dropped items overlay
  let droppedItems: DroppedItem[] = [];

  // Zone/designation painting — driven by uiState
  let designationMode = false;
  let designationTypeActive: DesignationType = 'harvest';
  let activeZoneInstanceId: string | null = null;
  // Press X while in designation mode to switch between paint ↔ erase drag
  let zoneEraseMode = false;
  // Blueprint placement mode — set when BUILD is clicked in BuildingMenu
  let blueprintBuildingId: string | null = null;
  const unsubUI = uiState.subscribe((s) => {
    designationMode = s.designationActive;
    blueprintBuildingId = s.blueprintBuildingId ?? null;
    activeZoneInstanceId = s.activeZoneInstanceId ?? null;
    if (!s.designationActive) zoneEraseMode = false;
    if (s.designationType) designationTypeActive = s.designationType as DesignationType;
    // Sync selected pawn from Pawn Tab (only when it differs to avoid clobbering map clicks)
    if (s.selectedPawnId !== selectedPawnId) {
      selectedPawnId = s.selectedPawnId;
    }
    cameraFollowPawnId = s.cameraFollowPawnId ?? null;
    redrawOverlay();
    if (s.mapFocusRequest && ready && renderer?.isReady()) {
      const { x, y } = s.mapFocusRequest;
      const targetZoom = MAX_TILE_W;
      tileWidth = targetZoom;
      tileHeight = targetZoom;
      renderer.setTileSize(tileWidth, tileHeight);
      const visW = (container?.clientWidth ?? 800) / tileWidth;
      const visH = (container?.clientHeight ?? 600) / tileHeight;
      // Place the pawn at ~25% from the top so the HUD card at the bottom doesn't overlap it.
      setView(Math.round(x - visW / 2), Math.round(y - visH * 0.25));
      uiState.clearMapFocus();
    }
  });

  // Zone drag-paint state (drag fills a rectangle)
  let zoneDragActive = false;

  // Blueprint drag-paint state
  let blueprintDragActive = false;
  let blueprintDragTiles = new Set<string>();

  // Context popup for planned/in-progress buildings
  let buildingPopup: {
    placedId: string;
    type: string;
    status: string;
    paused: boolean;
    deconstructQueued: boolean;
    screenX: number;
    screenY: number;
  } | null = null;
  let zoneAnchorX = 0;
  let zoneAnchorY = 0;
  let zoneEndX = 0;
  let zoneEndY = 0;

  // Hover tile inspector
  let hoverTileX = -1;
  let hoverTileY = -1;
  $: hoverTile =
    hoverTileX >= 0 && hoverTileY >= 0 && worldMap.length > 0
      ? (worldMap[hoverTileY]?.[hoverTileX] ?? null)
      : null;
  $: hoverResources = hoverTile
    ? Object.entries(hoverTile.resources ?? {}).filter(([, v]) => v > 0)
    : [];
  $: hoverZoneType = hoverTile ? (designations[`${hoverTile.x},${hoverTile.y}`] ?? null) : null;
  $: hoverPawn =
    hoverTileX >= 0 && hoverTileY >= 0
      ? (pawns.find((p) => p.position?.x === hoverTileX && p.position?.y === hoverTileY) ?? null)
      : null;

  // When a pawn is selected its card locks the HUD regardless of hover position.
  $: selectedPawn = selectedPawnId ? (pawns.find((p) => p.id === selectedPawnId) ?? null) : null;

  // Yellow box ring positioned over the selected pawn's tile on the map canvas.
  $: selectionRing = (() => {
    if (!selectedPawn?.position) return null;
    const left = (selectedPawn.position.x - viewX) * tileWidth;
    const top = (selectedPawn.position.y - viewY) * tileHeight;
    const cW = container?.clientWidth ?? 0;
    const cH = container?.clientHeight ?? 0;
    if (left < -tileWidth || top < -tileHeight || left >= cW || top >= cH) return null;
    return { left, top, width: tileWidth, height: tileHeight };
  })();

  // Dropped item under the hovered tile.
  $: hoverDroppedItem =
    hoverTileX >= 0 && hoverTileY >= 0
      ? (droppedItems.find((d) => d.x === hoverTileX && d.y === hoverTileY) ?? null)
      : null;

  function pawnStateLabel(p: import('$lib/game/core/types').Pawn): string {
    const s = p.currentState ?? 'Idle';
    if (s === 'Working' && p.activeJob) {
      const t = p.activeJob.type;
      const res = p.activeJob.resourceId ?? '';
      if (t === 'harvest') return `Harvesting${res ? ` ${res}` : ''}`;
      if (t === 'haul') return 'Hauling';
      if (t === 'construct') return 'Building';
      if (t === 'craft') return 'Crafting';
    }
    return s.replace(/([A-Z])/g, ' $1').trim();
  }

  function needBar(value: number): string {
    // value 0–100; show as filled/empty blocks
    const filled = Math.round(value / 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  }

  function jobProgressBar(progress: number): string {
    const clamped = Math.max(0, Math.min(1, progress));
    const filled = Math.round(clamped * 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  }

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
    forage: {
      label: 'FORAGE ZONE',
      color: '#3aaa60',
      desc: 'Pawns gather berries, twigs, bark and plant fiber'
    },
    scavenge: {
      label: 'SCAVENGE ZONE',
      color: '#a07840',
      desc: 'Pawns collect surface stone, flint and clay'
    },
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
    for (const [key, type] of Object.entries(designations)) {
      const [x, y] = key.split(',').map(Number);
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) counts[type] = (counts[type] ?? 0) + 1;
    }
    return counts;
  })();
  $: hasSelection =
    selRect !== null &&
    (selPawns.length > 0 || selBuildings.length > 0 || Object.keys(selZones).length > 0);
  // ──────────────────────────────────────────────────────────────────────────

  const unsubState = gameState.subscribe((s) => {
    worldMap = s.worldMap ?? [];
    pawns = s.pawns ?? [];
    buildings = s.buildings ?? [];
    designations = s.designations ?? {};
    droppedItems = s.droppedItems ?? [];
    // Camera follow: pan to the followed pawn whenever pawn positions update
    if (cameraFollowPawnId && ready && renderer?.isReady()) {
      const followed = pawns.find((p) => p.id === cameraFollowPawnId);
      if (followed?.position) {
        const { x, y } = followed.position;
        const visW = (container?.clientWidth ?? 800) / tileWidth;
        const visH = (container?.clientHeight ?? 600) / tileHeight;
        setView(Math.round(x - visW / 2), Math.round(y - visH * 0.25));
      }
    }
    if (renderer?.isReady()) {
      const grid =
        worldMap.length > 0
          ? buildGameGrid(worldMap, buildings, designations)
          : generatePlaceholderGrid();
      overlayDroppedItems(grid, droppedItems);
      overlayPawns(grid, pawns, selectedPawnId);
      renderer.setGrid(grid);
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

  /** All pawns render white so they stand out clearly against any terrain. */
  function pawnIdColor(_id: string): { r: number; g: number; b: number } {
    return { r: 1, g: 1, b: 1 };
  }

  function overlayPawns(grid: GameGrid, pawnList: Pawn[], selectedId: string | null) {
    for (let i = 0; i < pawnList.length; i++) {
      const pawn = pawnList[i];
      if (!pawn.position) continue;
      const { x, y } = pawn.position;
      const isSelected = pawn.id === selectedId;
      const isSleeping = pawn.currentState === 'Sleeping';
      const isCriticallyHungry = (pawn.needs?.hunger ?? 0) >= 85;

      // Color: blue for sleeping, orange for critically hungry, white otherwise
      const baseColor = isSleeping
        ? { r: 0.35, g: 0.45, b: 1.0 }
        : isCriticallyHungry
          ? { r: 1.0, g: 0.45, b: 0.05 }
          : { r: 1, g: 1, b: 1 };

      grid.setTile(x, y, {
        char: PAWN_SPRITES[i % PAWN_SPRITES.length],
        foreground: baseColor,
        background: grid.getTile(x, y)?.background ?? { r: 0, g: 0, b: 0 },
        position: { x, y },
        rotation: isSleeping ? 90 : undefined
      });
    }
  }

  /** Render dropped items as a yellow/gold '*' glyph; stored stockpile items as a green '$'. */
  function overlayDroppedItems(grid: GameGrid, drops: DroppedItem[]) {
    // ASCII '*' glyph index in the sprite sheet (glyph 42 in standard CP437)
    const STAR_GLYPH = glyph(SHEET.MAP, 42);
    // '$' glyph (glyph 36 in CP437) for stored stockpile items
    const DOLLAR_GLYPH = glyph(SHEET.MAP, 36);
    for (const drop of drops) {
      const existing = grid.getTile(drop.x, drop.y);
      if (drop.stored) {
        // Stored in stockpile — render as green '$'
        grid.setTile(drop.x, drop.y, {
          char: DOLLAR_GLYPH,
          foreground: { r: 0.2, g: 0.9, b: 0.3 }, // green
          background: existing?.background ?? { r: 0, g: 0, b: 0 },
          position: { x: drop.x, y: drop.y }
        });
      } else {
        // Freshly dropped, awaiting hauling — render as gold '*'
        grid.setTile(drop.x, drop.y, {
          char: STAR_GLYPH,
          foreground: { r: 1.0, g: 0.85, b: 0.1 }, // gold
          background: existing?.background ?? { r: 0, g: 0, b: 0 },
          position: { x: drop.x, y: drop.y }
        });
      }
    }
  }

  function redrawOverlay() {
    if (!renderer?.isReady() || worldMap.length === 0) return;
    const grid = buildGameGrid(worldMap, buildings, designations);
    overlayDroppedItems(grid, droppedItems);
    overlayPawns(grid, pawns, selectedPawnId);

    // Zone drag-paint preview
    if (zoneDragActive && designationMode) {
      if (zoneEraseMode) {
        // Red tint for erase drag
        _overlayRect(
          grid,
          zoneAnchorX,
          zoneAnchorY,
          zoneEndX,
          zoneEndY,
          { r: 1.0, g: 0.2, b: 0.1 },
          { rMul: 0.4, rAdd: 0.35, gMul: 0.3, gAdd: 0.0, bMul: 0.3, bAdd: 0.0 }
        );
      } else {
        _overlayRect(
          grid,
          zoneAnchorX,
          zoneAnchorY,
          zoneEndX,
          zoneEndY,
          { r: 1.0, g: 1.0, b: 1.0 },
          { rMul: 0.4, rAdd: 0.4, gMul: 0.4, gAdd: 0.3, bMul: 0.4, bAdd: 0.0 }
        );
      }
    }

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

    // Selected resource tile highlight (yellow tint)
    if (selectedResourceTile) {
      const { x, y } = selectedResourceTile;
      const t = grid.getTile(x, y);
      if (t) {
        grid.setTile(x, y, {
          char: t.char,
          foreground: { r: 1.0, g: 0.9, b: 0.1 },
          background: { r: t.background.r * 0.4 + 0.14, g: t.background.g * 0.4 + 0.10, b: t.background.b * 0.4 },
          position: { x, y }
        });
      }
    }

    // Similar-resource drag preview: green for matching, dimmed for non-matching
    if (similarDragActive) {
      const minX = Math.min(similarAnchorX, similarEndX);
      const maxX = Math.max(similarAnchorX, similarEndX);
      const minY = Math.min(similarAnchorY, similarEndY);
      const maxY = Math.max(similarAnchorY, similarEndY);
      for (let ry = minY; ry <= maxY; ry++) {
        for (let rx = minX; rx <= maxX; rx++) {
          const wt = worldMap[ry]?.[rx];
          if (!wt) continue;
          const t = grid.getTile(rx, ry);
          if (!t) continue;
          if ((wt.resources?.[similarDragResourceId] ?? 0) > 0) {
            grid.setTile(rx, ry, {
              char: t.char,
              foreground: { r: 0.25, g: 1.0, b: 0.35 },
              background: { r: t.background.r * 0.3 + 0.03, g: t.background.g * 0.3 + 0.16, b: t.background.b * 0.3 },
              position: { x: rx, y: ry }
            });
          } else {
            grid.setTile(rx, ry, {
              char: t.char,
              foreground: { r: t.foreground.r * 0.35, g: t.foreground.g * 0.35, b: t.foreground.b * 0.35 },
              background: t.background,
              position: { x: rx, y: ry }
            });
          }
        }
      }
    }

    renderer.setGrid(grid);
  }

  function _blueprintPreviewTile(grid: GameGrid, tx: number, ty: number) {
    if (tx < 0 || ty < 0 || ty >= worldMap.length || tx >= (worldMap[0]?.length ?? 0)) return;
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

    // Close any open popup when clicking the map
    if (buildingPopup) {
      buildingPopup = null;
    }

    // Designation mode: handled by drag — single-click still paints one tile
    if (designationMode) {
      gameState.updateWithSave((state) =>
        designationService.designate(
          hoverTileX,
          hoverTileY,
          designationTypeActive,
          state,
          activeZoneInstanceId ?? undefined
        )
      );
      redrawOverlay();
      return;
    }

    // Click on a planned/under_construction building → show context popup
    const clickedBuilding = buildings.find(
      (b) => b.x === hoverTileX && b.y === hoverTileY && b.status !== 'complete'
    );
    if (clickedBuilding) {
      buildingPopup = {
        placedId: clickedBuilding.id,
        type: clickedBuilding.type,
        status: clickedBuilding.status,
        paused: clickedBuilding.paused ?? false,
        deconstructQueued: false,
        screenX: (hoverTileX - viewX) * tileWidth,
        screenY: Math.max(4, (hoverTileY - viewY) * tileHeight - 68)
      };
      return;
    }

    // Click on a complete building → show context popup with DECONSTRUCT
    const clickedComplete = buildings.find(
      (b) => b.x === hoverTileX && b.y === hoverTileY && b.status === 'complete'
    );
    if (clickedComplete) {
      buildingPopup = {
        placedId: clickedComplete.id,
        type: clickedComplete.type,
        status: clickedComplete.status,
        paused: false,
        deconstructQueued: clickedComplete.deconstructQueued ?? false,
        screenX: (hoverTileX - viewX) * tileWidth,
        screenY: Math.max(4, (hoverTileY - viewY) * tileHeight - 68)
      };
      return;
    }

    // Click on a pawn → select it
    const clickedPawn = pawns.find(
      (p) => p.position?.x === hoverTileX && p.position?.y === hoverTileY
    );
    if (clickedPawn) {
      selectedPawnId = clickedPawn.id;
      uiState.selectPawn(clickedPawn.id);
      redrawOverlay();
      return;
    }
    // TODO: draft-control mechanic will re-enable direct pawn movement later.
    // For now, pawns must only move through the automated AI and turn processing.
    //
    // if (selectedPawnId && worldMap.length > 0) {
    //   const targetTile = worldMap[hoverTileY]?.[hoverTileX];
    //   if (!targetTile?.walkable) return;
    //   const mover = pawns.find((p) => p.id === selectedPawnId);
    //   if (!mover?.position) return;
    //   await wasmPathfinderService.init();
    //   const { walkable, costs, width, height } = buildPathfindingGrids(worldMap);
    //   const path = wasmPathfinderService.findPath(
    //     walkable,
    //     costs,
    //     width,
    //     height,
    //     mover.position.x,
    //     mover.position.y,
    //     hoverTileX,
    //     hoverTileY
    //   );
    //   if (path.length > 0) {
    //     gameState.updateWithSave((state) => pawnService.assignPath(selectedPawnId!, path, state));
    //   }
    // }
  }

  onMount(async () => {
    if (browser) await init();
  });

  onDestroy(() => {
    unsubState();
    unsubUI();
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
          ? buildGameGrid(worldMap, buildings, designations)
          : generatePlaceholderGrid();
      overlayDroppedItems(grid, droppedItems);
      overlayPawns(grid, pawns, selectedPawnId);
      renderer.setGrid(grid);
      renderer.setViewTileOffset(viewX, viewY);

      ready = true;
      startLoop();

      new ResizeObserver(() => {
        if (!renderer || !container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        canvas.width = w;
        canvas.height = h;
        renderer.resize(w, h);
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

  function startLoop() {
    function frame() {
      if (!renderer || !ready) return;
      renderer.beginFrame();
      renderer.endFrame();
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
    sessionStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify({ viewX, viewY, tileWidth }));
  }

  function setView(x: number, y: number) {
    [viewX, viewY] = clampView(x, y);
    renderer?.setViewTileOffset(viewX, viewY);
    saveCameraState();
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
        if (buildingPopup) {
          buildingPopup = null;
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
        redrawOverlay();
        break;
      case 'x':
      case 'X':
        if (designationMode) {
          zoneEraseMode = !zoneEraseMode;
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
    if (designationMode) {
      // Zone paint mode: start a drag rectangle, don't pan
      zoneDragActive = true;
      zoneAnchorX = hoverTileX;
      zoneAnchorY = hoverTileY;
      zoneEndX = hoverTileX;
      zoneEndY = hoverTileY;
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
    dragDistance = 0;
  }

  function handleMouseMove(e: MouseEvent) {
    // Always track hover tile
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      hoverTileX = Math.floor(cx / tileWidth) + viewX;
      hoverTileY = Math.floor(cy / tileHeight) + viewY;
    }
    if (zoneDragActive) {
      zoneEndX = hoverTileX;
      zoneEndY = hoverTileY;
      redrawOverlay();
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
    if (blueprintDragActive) {
      // Commit blueprint placements at all dragged tiles
      const bid = blueprintBuildingId;
      if (bid && blueprintDragTiles.size > 0) {
        const buildingDef = buildingService.getBuildingById(bid);
        if (buildingDef) {
          gameState.updateWithSave((state) => {
            let current = state;
            for (const key of blueprintDragTiles) {
              const [tx, ty] = key.split(',').map(Number);
              const newItems = current.item.map((item) => {
                const cost =
                  (buildingDef as unknown as { buildingCost?: Record<string, number> })
                    .buildingCost?.[item.id] ?? 0;
                return { ...item, amount: Math.max(0, item.amount - cost) };
              });
              current = buildingService.placeBuilding(bid, tx, ty, { ...current, item: newItems });
            }
            return current;
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
        gameState.updateWithSave((state) =>
          designationService.clearRect(zoneAnchorX, zoneAnchorY, zoneEndX, zoneEndY, state)
        );
      } else {
        gameState.updateWithSave((state) =>
          designationService.designateRect(
            zoneAnchorX,
            zoneAnchorY,
            zoneEndX,
            zoneEndY,
            designationTypeActive,
            state,
            activeZoneInstanceId ?? undefined
          )
        );
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
    if (dragDistance < 3) handleTileClick();
    dragging = false;
  }

  function cancelBlueprintBuilding() {
    if (!buildingPopup) return;
    gameState.updateWithSave((state) =>
      buildingService.cancelBuilding(buildingPopup!.placedId, state)
    );
    buildingPopup = null;
    redrawOverlay();
  }

  function deconstructBuilding() {
    if (!buildingPopup) return;
    gameState.updateWithSave((state) =>
      buildingService.deconstructBuilding(buildingPopup!.placedId, state)
    );
    buildingPopup = null;
    redrawOverlay();
  }

  function cancelDeconstructBuilding() {
    if (!buildingPopup) return;
    gameState.updateWithSave((state) =>
      buildingService.cancelDeconstructBuilding(buildingPopup!.placedId, state)
    );
    buildingPopup = null;
    redrawOverlay();
  }

  function togglePauseBlueprintBuilding() {
    if (!buildingPopup) return;
    gameState.updateWithSave((state) =>
      buildingService.togglePausedBuilding(buildingPopup!.placedId, state)
    );
    buildingPopup = { ...buildingPopup, paused: !buildingPopup.paused };
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
    if (blueprintBuildingId) redrawOverlay();
  }

  /** Right-click: clear designation at hovered tile (or drag-erase rect in zone mode). */
  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    if (hoverTileX < 0 || hoverTileY < 0) return;
    if (designationMode) {
      // In zone mode, right-click clears a zone tile
      gameState.updateWithSave((state) =>
        designationService.clearDesignation(hoverTileX, hoverTileY, state)
      );
      redrawOverlay();
    } else if (designationService.hasDesignation(hoverTileX, hoverTileY, $gameState)) {
      gameState.updateWithSave((state) =>
        designationService.clearDesignation(hoverTileX, hoverTileY, state)
      );
      redrawOverlay();
    }
  }
</script>

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

  {#if selectionRing}
    <div
      class="pawn-selection-ring"
      style="left:{selectionRing.left}px;top:{selectionRing.top}px;width:{selectionRing.width}px;height:{selectionRing.height}px;"
    ></div>
  {/if}

  {#if errorMsg}
    <div class="error">WebGL unavailable: {errorMsg}</div>
  {:else if !ready}
    <div class="loading">Initializing renderer…</div>
  {/if}
  {#if designationMode}
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
    <div class="designation-hud" style="border-color:#5566cc;color:#99aaee;">
      ◈ SELECTING ({Math.abs(selEndX - selAnchorX) + 1}×{Math.abs(selEndY - selAnchorY) + 1}) —
      release to highlight
    </div>
  {:else if blueprintBuildingId}
    <div class="designation-hud" style="border-color:#00ddcc;color:#00ffee;">
      [◆ {buildingService.getBuildingById(blueprintBuildingId)?.name ?? blueprintBuildingId}] — drag
      to paint · Esc cancel
    </div>
  {:else if similarDragMode}
    <div class="designation-hud" style="border-color:#ccaa33;color:#ffdd55;">
      [SELECT SIMILAR: {similarDragResourceId.replace(/_/g, ' ').toUpperCase()}] drag to designate
      all · Esc cancel{#if similarDragActive} — ({Math.abs(similarEndX - similarAnchorX) + 1}×{Math.abs(similarEndY - similarAnchorY) + 1}){/if}
    </div>
  {/if}
  {#if buildingPopup}
    {@const bDef = buildingService.getBuildingById(buildingPopup.type)}
    <div
      class="building-popup"
      style="left:{buildingPopup.screenX}px; top:{buildingPopup.screenY}px;"
    >
      <div class="building-popup__name">{bDef?.name ?? buildingPopup.type}</div>
      <div class="building-popup__status">
        [{buildingPopup.status.replace('_', ' ')}{buildingPopup.paused ? ' • paused' : ''}]
      </div>
      <div class="building-popup__actions">
        {#if buildingPopup.status === 'complete'}
          {@const cost = bDef?.buildingCost ?? {}}
          {#if buildingPopup.deconstructQueued}
            <div class="building-popup__refund">queued — will be removed next turn</div>
            <button on:click={cancelDeconstructBuilding}>CANCEL DEMOLITION</button>
          {:else}
            {#if Object.keys(cost).length > 0}
              <div class="building-popup__refund">
                refund: {Object.entries(cost).map(([id, n]) => `${Math.floor(Number(n) * 0.5)} ${id.replace(/_/g, ' ')}`).join(' · ')}
              </div>
            {/if}
            <button class="cancel-btn" on:click={deconstructBuilding}>DECONSTRUCT</button>
          {/if}
        {:else}
          <button on:click={togglePauseBlueprintBuilding}
            >{buildingPopup.paused ? 'RESUME' : 'PAUSE'}</button
          >
          <button class="cancel-btn" on:click={cancelBlueprintBuilding}>CANCEL</button>
        {/if}
      </div>
    </div>
  {/if}
  {#if selectedPawn}
    <!-- Selected pawn card — locked to this pawn regardless of mouse hover -->
    <div class="tile-hud tile-hud--pawn tile-hud--selected">
      <div class="pawn-header">
        <span class="pawn-name">{selectedPawn.name}</span>
        <span class="pawn-state">[{pawnStateLabel(selectedPawn)}]</span>
        <span class="pawn-dismiss" title="Press Esc to deselect">◈</span>
      </div>
      <div class="pawn-row">
        <span class="pawn-stat-label">HP</span><span class="pawn-stat-val"
          >{Math.floor(selectedPawn.state.health ?? 100)}</span
        >
        <span class="pawn-stat-label">Mood</span><span class="pawn-stat-val"
          >{Math.floor(selectedPawn.state.mood)}</span
        >
        <span class="pawn-stat-label">Hunger</span><span
          class="pawn-stat-val"
          class:pawn-warn={selectedPawn.needs.hunger > 60}
          >{Math.floor(selectedPawn.needs.hunger)}</span
        >
        <span class="pawn-stat-label">Fatigue</span><span
          class="pawn-stat-val"
          class:pawn-warn={selectedPawn.needs.fatigue > 60}
          >{Math.floor(selectedPawn.needs.fatigue)}</span
        >
      </div>
      {#if selectedPawn.activeJob}
        <div class="pawn-job">
          → {pawnStateLabel(selectedPawn)}{selectedPawn.activeJob.resourceId
            ? ` (${selectedPawn.activeJob.resourceId})`
            : ''}
        </div>
        <div class="pawn-progress">[{jobProgressBar(selectedPawn.activeJob.progress ?? 0)}]</div>
      {:else}
        <div class="pawn-job pawn-idle">→ Idle</div>
      {/if}
      {#if selectedPawn.position}
        <div class="pawn-pos">pos ({selectedPawn.position.x},{selectedPawn.position.y})</div>
      {/if}
    </div>
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
  {:else if hoverPawn}
    <div class="tile-hud tile-hud--pawn">
      <div class="pawn-header">
        <span class="pawn-name">{hoverPawn.name}</span>
        <span class="pawn-state">[{pawnStateLabel(hoverPawn)}]</span>
      </div>
      <div class="pawn-row">
        <span class="pawn-stat-label">HP</span><span class="pawn-stat-val"
          >{Math.floor(hoverPawn.state.health ?? 100)}</span
        >
        <span class="pawn-stat-label">Mood</span><span class="pawn-stat-val"
          >{Math.floor(hoverPawn.state.mood)}</span
        >
        <span class="pawn-stat-label">Hunger</span><span
          class="pawn-stat-val"
          class:pawn-warn={hoverPawn.needs.hunger > 60}>{Math.floor(hoverPawn.needs.hunger)}</span
        >
        <span class="pawn-stat-label">Fatigue</span><span
          class="pawn-stat-val"
          class:pawn-warn={hoverPawn.needs.fatigue > 60}>{Math.floor(hoverPawn.needs.fatigue)}</span
        >
      </div>
      {#if hoverPawn.activeJob}
        <div class="pawn-job">
          → {pawnStateLabel(hoverPawn)}{hoverPawn.activeJob.resourceId
            ? ` (${hoverPawn.activeJob.resourceId})`
            : ''}
        </div>
        <div class="pawn-progress">[{jobProgressBar(hoverPawn.activeJob.progress ?? 0)}]</div>
      {/if}
    </div>
  {:else if hoverDroppedItem}
    <!-- Dropped item on the hovered tile -->
    <div class="tile-hud tile-hud--item">
      <span class="item-glyph">★</span>
      <span class="item-name">{hoverDroppedItem.resourceId}</span>
      <span class="item-qty">×{hoverDroppedItem.quantity}</span>
      <div class="item-hint">dropped item — awaiting hauler</div>
    </div>
  {:else if hoverTile}
    <div class="tile-hud">
      <span class="tile-coord">({hoverTile.x},{hoverTile.y})</span><span class="tile-layers"
        >{hoverTile.type},{hoverTile.terrainType},{hoverTile.subType}</span
      >
      {#if !hoverTile.walkable}
        <div class="tile-move" style="color:#cc4444">move: impassable</div>
      {:else}
        {@const mc = moveCostLabel(hoverTile.movementCost ?? 1)}
        <div class="tile-move" style="color:{mc.color}">
          move ×{(hoverTile.movementCost ?? 1).toFixed(1)} · {mc.label}
        </div>
      {/if}
      {#if hoverZoneType && ZONE_META[hoverZoneType]}
        <div class="tile-zone" style="color:{ZONE_META[hoverZoneType].color}">
          {ZONE_META[hoverZoneType].label} — {ZONE_META[hoverZoneType].desc}
        </div>
      {/if}
      {#if hoverResources.length > 0}
        <div class="tile-res">{hoverResources.map(([k, v]) => `${k}:${v}`).join(' ')}</div>
      {/if}
    </div>
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
    cursor: crosshair;
    user-select: none;
  }
  .canvas-wrap.dragging {
    cursor: crosshair;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
  .error,
  .loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Courier New', monospace;
    font-size: 12px;
  }
  .pawn-selection-ring {
    position: absolute;
    pointer-events: none;
    box-shadow:
      inset 0 0 0 2px #ffdd00,
      0 0 6px 2px rgba(255, 221, 0, 0.35);
    z-index: 5;
  }

  .tile-hud {
    position: absolute;
    bottom: 6px;
    left: 6px;
    background: rgba(28, 16, 6, 0.92);
    border: 1px solid #6b4a2a;
    color: #a07840;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    line-height: 1.5;
    padding: 2px 7px;
    pointer-events: none;
    white-space: nowrap;
    z-index: 10;
  }

  .tile-hud--selection {
    border-color: #5566cc;
    background: rgba(8, 12, 40, 0.94);
    color: #99aaee;
    max-width: 340px;
    white-space: normal;
  }
  .tile-hud--pawn {
    border-color: #3a9a8a;
    background: rgba(4, 20, 18, 0.94);
    color: #7adaca;
    min-width: 180px;
    white-space: nowrap;
  }
  .pawn-header {
    display: flex;
    gap: 6px;
    align-items: baseline;
    margin-bottom: 2px;
  }
  .pawn-name {
    color: #aaeedd;
    font-weight: bold;
    font-size: 11px;
  }
  .pawn-state {
    color: #559988;
    font-size: 9px;
  }
  .pawn-row {
    display: flex;
    gap: 6px;
    align-items: baseline;
    font-size: 9px;
  }
  .pawn-stat-label {
    color: #4a8878;
  }
  .pawn-stat-val {
    color: #99ddcc;
    min-width: 18px;
  }
  .pawn-warn {
    color: #ee8844 !important;
  }
  .pawn-job {
    color: #669988;
    font-size: 9px;
    margin-top: 1px;
  }
  .tile-hud--selected {
    border-color: #f0c060;
    background: rgba(20, 14, 4, 0.96);
    color: #e8c870;
    min-width: 200px;
  }
  .tile-hud--selected .pawn-name {
    color: #ffe890;
  }
  .tile-hud--selected .pawn-state {
    color: #c0a040;
  }
  .pawn-dismiss {
    margin-left: auto;
    color: #886630;
    font-size: 9px;
  }
  .pawn-idle {
    color: #887040;
  }
  .pawn-pos {
    color: #776040;
    font-size: 9px;
  }
  .tile-hud--item {
    border-color: #c8a020;
    background: rgba(20, 14, 4, 0.94);
    color: #d4a830;
    min-width: 140px;
    display: flex;
    align-items: baseline;
    gap: 5px;
    flex-wrap: wrap;
  }
  .item-glyph {
    color: #f0c030;
    font-size: 11px;
  }
  .item-name {
    color: #ffe870;
    font-weight: bold;
    text-transform: uppercase;
    font-size: 10px;
  }
  .item-qty {
    color: #c8a040;
    font-size: 10px;
  }
  .item-hint {
    width: 100%;
    color: #8a7030;
    font-size: 9px;
  }
  .sel-title {
    color: #8899ff;
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
    color: #ddeeff;
  }
  .sel-buildings {
    color: #aaccff;
  }
  .sel-hint {
    color: #556688;
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
  .building-popup {
    position: absolute;
    background: rgba(0, 10, 25, 0.93);
    border: 1px solid #00aacc;
    color: #88ccee;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    padding: 5px 8px;
    z-index: 25;
    pointer-events: all;
    min-width: 110px;
  }
  .building-popup__name {
    color: #ddeeff;
    font-weight: bold;
    margin-bottom: 2px;
    font-size: 11px;
  }
  .building-popup__status {
    color: #4499bb;
    font-size: 10px;
    margin-bottom: 5px;
  }
  .building-popup__actions {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .building-popup__refund {
    font-size: 9px;
    color: #88aabb;
    margin-bottom: 2px;
  }
  .building-popup__actions button {
    background: #0a1a2a;
    border: 1px solid #00aacc;
    color: #66bbdd;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    padding: 2px 6px;
    cursor: pointer;
  }
  .building-popup__actions button:hover {
    background: #0d2233;
    color: #aaddff;
  }
  .building-popup__actions .cancel-btn {
    border-color: #cc3322;
    color: #ee6655;
  }
  .building-popup__actions .cancel-btn:hover {
    background: #2a0a08;
  }
  .tile-coord {
    color: #e8b86a;
    font-weight: bold;
    margin-right: 5px;
  }
  .tile-layers {
    color: #b08848;
  }
  .tile-res {
    color: #7a9a50;
    font-size: 9px;
  }
  .error {
    color: #c04040;
  }
  .loading {
    background: var(--bg-panel);
    color: #806830;
  }
</style>
