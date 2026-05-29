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
  import { environmentService } from '$lib/game/services/EnvironmentService.js';
  import { glyph, SHEET } from '$lib/webgl/tilesets.js';
  import { uiState } from '$lib/stores/uiState.js';
  import { worldEffects } from '$lib/stores/worldEffects.js';
  import { buildingService } from '$lib/game/services/BuildingService.js';
  import { resolveCharSpans } from '$lib/game/core/Terrains.js';
  import { resourceObjectService } from '$lib/game/services/ResourceObjectService.js';

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
  let designCanvas: HTMLCanvasElement;
  // Pre-processed tileset canvases for Canvas2D designation overlay (magenta stripped)
  let _tilesSheetCanvas: HTMLCanvasElement | null = null;
  let _itemsSheetCanvas: HTMLCanvasElement | null = null;
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

  // Campfire fire animation: only lit + complete campfires.
  $: worldEffects.setCampfireOverlays(
    buildings
      .filter((b) => b.type === 'campfire' && b.status === 'complete' && b.lit === true)
      .map((b) => {
        const left = (b.x - viewX + 0.5) * tileWidth;
        const top = (b.y - viewY + 0.5) * tileHeight;
        return { id: b.id, left, top };
      })
      .filter((o) => o.left >= 0 && o.top >= 0 && o.left <= (container?.clientWidth ?? 0))
  );

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

  // Selected building (click-locked, like selectedPawnId)
  let selectedBuildingId: string | null = null;
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
    // Day/night: update ambient uniforms whenever the turn changes
    if (renderer?.isReady()) {
      const { light, tint } = environmentService.getAmbient(s.turn);
      renderer.setAmbient(light, tint);
      _ambientLight = light;
      _ambientTint = tint;
    }
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
      if (worldMap.length > 0) {
        redrawOverlay();
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
        foreground: isSelected ? { r: 1.0, g: 0.9, b: 0.1 } : baseColor,
        background: isSelected
          ? {
              r: (grid.getTile(x, y)?.background.r ?? 0) * 0.2 + 0.38,
              g: (grid.getTile(x, y)?.background.g ?? 0) * 0.2 + 0.3,
              b: (grid.getTile(x, y)?.background.b ?? 0) * 0.1
            }
          : (grid.getTile(x, y)?.background ?? { r: 0, g: 0, b: 0 }),
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

    // Similar-resource drag preview
    if (similarDragActive) {
      const minX = Math.min(similarAnchorX, similarEndX);
      const maxX = Math.max(similarAnchorX, similarEndX);
      const minY = Math.min(similarAnchorY, similarEndY);
      const maxY = Math.max(similarAnchorY, similarEndY);
      for (let ry = minY; ry <= maxY; ry++) {
        for (let rx = minX; rx <= maxX; rx++) {
          const wt = worldMap[ry]?.[rx];
          const t = grid.getTile(rx, ry);
          if (!t) continue;
          if ((wt?.resources?.[similarDragResourceId] ?? 0) > 0) {
            grid.setTile(rx, ry, {
              char: t.char,
              foreground: { r: 0.25, g: 1.0, b: 0.35 },
              background: {
                r: t.background.r * 0.3 + 0.03,
                g: t.background.g * 0.3 + 0.16,
                b: t.background.b * 0.3
              },
              position: { x: rx, y: ry }
            });
          } else {
            grid.setTile(rx, ry, {
              char: t.char,
              foreground: {
                r: t.foreground.r * 0.35,
                g: t.foreground.g * 0.35,
                b: t.foreground.b * 0.35
              },
              background: t.background,
              position: { x: rx, y: ry }
            });
          }
        }
      }
    }

    renderer.setGrid(grid);
    drawDesignations();
  }

  /** Load a BMP tileset, strip magenta background, cache as an HTMLCanvasElement. */
  function _loadSpriteSheet(url: string, target: '_tilesSheetCanvas' | '_itemsSheetCanvas') {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const cx = c.getContext('2d', { willReadFrequently: true });
      if (!cx) return;
      cx.drawImage(img, 0, 0);
      const id = cx.getImageData(0, 0, c.width, c.height);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 255) d[i + 3] = 0;
      }
      cx.putImageData(id, 0, 0);
      if (target === '_tilesSheetCanvas') _tilesSheetCanvas = c;
      else _itemsSheetCanvas = c;
      drawDesignations();
    };
    img.src = url;
  }

  function drawDesignations() {
    if (!designCanvas || !container || !worldMap.length) return;
    const W = container.clientWidth;
    const H = container.clientHeight;
    if (designCanvas.width !== W || designCanvas.height !== H) {
      designCanvas.width = W;
      designCanvas.height = H;
    }
    const ctx = designCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

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

    if (!designations || Object.keys(designations).length === 0) return;

    // Lazy-load sprite sheets on first designation draw
    if (!_tilesSheetCanvas) {
      _loadSpriteSheet('/tilesets/bitlands_tiles.bmp', '_tilesSheetCanvas');
      return;
    }
    if (!_itemsSheetCanvas) {
      _loadSpriteSheet('/tilesets/bitlands_items.bmp', '_itemsSheetCanvas');
      return;
    }

    const SPRITE_W = 12,
      SPRITE_H = 18;
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
        sheet = _itemsSheetCanvas;
        spriteId = 207;
      } else if (dtype === 'woodcut') {
        sheet = _tilesSheetCanvas;
        spriteId = 246;
      } else if (dtype === 'forage') {
        sheet = _tilesSheetCanvas;
        spriteId = 241;
      } else if (dtype === 'harvest') {
        const tile = worldMap[wy]?.[wx];
        const resourceId = tile?.resources
          ? Object.keys(tile.resources).find((id) => (tile.resources![id] ?? 0) > 0)
          : undefined;
        const resDef = resourceId ? resourceObjectService.getById(resourceId) : undefined;
        if (resDef?.interaction.workCategory === 'mining') {
          sheet = _itemsSheetCanvas;
          spriteId = 207;
        } else {
          sheet = _tilesSheetCanvas;
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

    // Click on any building at this tile → select it, deselect pawn
    const clickedBuilding = buildings.find((b) => b.x === hoverTileX && b.y === hoverTileY);
    if (clickedBuilding) {
      selectedBuildingId = clickedBuilding.id;
      selectedPawnId = null;
      showShelterAssign = false;
      uiState.selectPawn(null);
      redrawOverlay();
      return;
    }

    // Click on a pawn → select it, deselect building
    const clickedPawn = pawns.find(
      (p) => p.position?.x === hoverTileX && p.position?.y === hoverTileY
    );
    if (clickedPawn) {
      selectedPawnId = clickedPawn.id;
      selectedBuildingId = null;
      selectedResourceTile = null;
      highlightedResourceTiles = new Set();
      uiState.selectPawn(clickedPawn.id);
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
      uiState.selectPawn(null);
      redrawOverlay();
      return;
    }

    // Click on empty tile → deselect all
    selectedBuildingId = null;
    selectedResourceTile = null;
    highlightedResourceTiles = new Set();
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
      // Initialise ambient from current turn so the first frame is correctly lit
      {
        const { light, tint } = environmentService.getAmbient($gameState?.turn ?? 0);
        renderer.setAmbient(light, tint);
        _ambientLight = light;
        _ambientTint = tint;
      }

      ready = true;
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
    if (similarDragMode) {
      similarDragActive = true;
      similarAnchorX = hoverTileX;
      similarAnchorY = hoverTileY;
      similarEndX = hoverTileX;
      similarEndY = hoverTileY;
      redrawOverlay();
      return;
    }
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
    if (similarDragActive) {
      similarEndX = hoverTileX;
      similarEndY = hoverTileY;
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
    if (!selectedBuilding) return;
    const id = selectedBuilding.id;
    gameState.updateWithSave((state) => buildingService.cancelBuilding(id, state));
    selectedBuildingId = null;
    redrawOverlay();
  }

  function deconstructBuilding() {
    if (!selectedBuilding) return;
    const id = selectedBuilding.id;
    gameState.updateWithSave((state) => buildingService.deconstructBuilding(id, state));
    redrawOverlay();
  }

  function cancelDeconstructBuilding() {
    if (!selectedBuilding) return;
    const id = selectedBuilding.id;
    gameState.updateWithSave((state) => buildingService.cancelDeconstructBuilding(id, state));
    redrawOverlay();
  }

  function designateResource(dtype?: DesignationType) {
    if (!selectedResourceTile || !selectedResourceDef) return;
    const resolvedType =
      dtype ?? ((selectedResourceDef.designationTypes?.[0] ?? 'harvest') as DesignationType);
    if (highlightedResourceTiles.size > 0) {
      // Designate all tiles from the drag selection.
      gameState.updateWithSave((state) => {
        let current = state;
        for (const key of highlightedResourceTiles) {
          const [tx, ty] = key.split(',').map(Number);
          current = designationService.designate(tx, ty, resolvedType, current);
        }
        return current;
      });
      highlightedResourceTiles = new Set();
    } else {
      const { x, y } = selectedResourceTile;
      gameState.updateWithSave((state) => designationService.designate(x, y, resolvedType, state));
    }
    redrawOverlay();
  }

  function cancelResourceDesignation() {
    if (!selectedResourceTile) return;
    const { x, y } = selectedResourceTile;
    gameState.updateWithSave((state) => designationService.clearDesignation(x, y, state));
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
  function assignShelterPawn(pawnId: string | null) {
    if (!selectedBuilding) return;
    const id = selectedBuilding.id;
    gameState.updateWithSave((state) => buildingService.assignShelterPawn(id, pawnId, state));
    showShelterAssign = false;
  }

  function togglePauseBlueprintBuilding() {
    if (!selectedBuilding) return;
    const id = selectedBuilding.id;
    gameState.updateWithSave((state) => buildingService.togglePausedBuilding(id, state));
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
  <canvas bind:this={designCanvas} class="desig-layer"></canvas>

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
  {:else if selectedBuilding}
    {@const bDef = buildingService.getBuildingById(selectedBuilding.type)}
    {@const isBlueprint = selectedBuilding.status !== 'complete'}
    {@const workDone = selectedBuilding.workDone ?? 0}
    {@const workReq = selectedBuilding.workRequired ?? bDef?.workAmount ?? 1}
    <div class="bld-row" on:mousedown|stopPropagation on:mouseup|stopPropagation>
      <div class="tile-hud tile-hud--building tile-hud--selected-building">
        <div class="bld-header">
          <span class="bld-name">{bDef?.name ?? selectedBuilding.type}</span>
          <span class="bld-status">
            [{isBlueprint
              ? selectedBuilding.paused
                ? 'paused'
                : 'building'
              : 'complete'}{selectedBuilding.deconstructQueued ? ' ⊢ demolish' : ''}]
          </span>
        </div>
        {#if bDef?.description}
          <div class="bld-desc">{bDef.description}</div>
        {/if}
        {#if isBlueprint}
          <div class="bld-progress">
            [{jobProgressBar(workReq > 0 ? workDone / workReq : 0)}] {workDone}/{workReq} work
          </div>
        {:else if selectedBuilding.deconstructQueued}
          {@const dDone = selectedBuilding.deconstructWorkDone ?? 0}
          {@const dReq = selectedBuilding.deconstructWorkRequired ?? 1}
          <div class="bld-progress">
            [{jobProgressBar(dReq > 0 ? dDone / dReq : 0)}] {dDone}/{dReq} work
          </div>
          <div class="bld-note">⊢ demolishing…</div>
        {:else}
          {@const cost = bDef?.buildingCost ?? {}}
          {#if Object.keys(cost).length > 0}
            <div class="bld-refund">
              refund ½: {Object.entries(cost)
                .map(([id, n]) => `${Math.floor(Number(n) * 0.5)}×${id.replace(/_/g, ' ')}`)
                .join(' ')}
            </div>
          {/if}
          {#if bDef?.maxFuel !== undefined}
            {@const fuelMax = bDef.maxFuel}
            {@const fuelCurr = selectedBuilding.fuel ?? 0}
            <div class="bld-fuel">
              FUEL [{jobProgressBar(fuelMax > 0 ? fuelCurr / fuelMax : 0)}] {fuelCurr}/{fuelMax}
              {#if selectedBuilding.lit}<span class="fuel-lit">● lit</span>{:else}<span
                  class="fuel-dark">○ unlit</span
                >{/if}
            </div>
          {/if}
        {/if}
      </div>
      <div class="bld-side-actions">
        {#if isBlueprint}
          <button
            class="bld-btn bld-btn--sq"
            title={selectedBuilding.paused ? 'Resume' : 'Pause'}
            on:click={togglePauseBlueprintBuilding}>{selectedBuilding.paused ? '▶' : '⏸'}</button
          >
          <button
            class="bld-btn bld-btn--danger bld-btn--sq"
            title="Abort"
            on:click={cancelBlueprintBuilding}>✕</button
          >
        {:else if selectedBuilding.deconstructQueued}
          <button
            class="bld-btn bld-btn--sq"
            title="Cancel demolition"
            on:click={cancelDeconstructBuilding}>↩</button
          >
        {:else}
          <button
            class="bld-btn bld-btn--danger bld-btn--sq"
            title="Deconstruct"
            on:click={deconstructBuilding}>&#x2692;</button
          >
        {/if}
      </div>
    </div>
  {:else if selectedResourceTile && selectedResourceDef}
    {@const activeInteractions = selectedResourceDef.interactions ?? [
      selectedResourceDef.interaction
    ]}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="res-row" on:mousedown|stopPropagation on:mouseup|stopPropagation>
      <div class="tile-hud tile-hud--resource tile-hud--selected-resource">
        <div class="bld-header">
          <span class="bld-name">{selectedResourceDef.displayName}</span>
          <span class="bld-status"
            >[{selectedResourceDesignation ??
              activeInteractions[0]?.designationType ??
              activeInteractions[0]?.action ??
              'harvest'}{selectedResourceDesignation ? ' ✓' : ''}]</span
          >
        </div>
        <div class="bld-desc">
          {selectedResourceTile.resourceId.replace(/_/g, ' ')} — ×{selectedResourceAmount} nodes
        </div>
        {#if selectedResourceDesignation}
          <div class="bld-note">⊢ {selectedResourceDesignation}…</div>
        {:else}
          {#each activeInteractions as iact}
            {#if iact.yields.length > 0}
              <div class="bld-desc">
                {iact.action}: {iact.yields
                  .filter((y) => y.max > 0)
                  .map((y) => `${y.min}–${y.max}×${y.itemId.replace(/_/g, ' ')}`)
                  .join(' ')}
              </div>
            {/if}
          {/each}
        {/if}
      </div>
      <div class="bld-side-actions">
        {#if selectedResourceDesignation}
          <button
            class="bld-btn bld-btn--sq"
            title="Cancel designation"
            on:click={cancelResourceDesignation}>↩</button
          >
        {:else}
          {#each activeInteractions as iact}
            <button
              class="bld-btn bld-btn--danger bld-btn--sq"
              title={iact.action}
              on:click={() => designateResource(iact.designationType)}
              >{iact.designationType === 'woodcut'
                ? '\u00F7'
                : iact.designationType === 'forage'
                  ? '\u00B1'
                  : iact.designationType === 'mine'
                    ? '\u26CF'
                    : '\u00B1'}</button
            >
          {/each}
        {/if}
        <button
          class="bld-btn bld-btn--sq"
          title="Drag to select similar tiles, then click above to designate"
          on:click={startSimilarSelect}>⊞</button
        >
      </div>
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
          [{jobProgressBar(workReq > 0 ? workDone / workReq : 0)}] {workDone}/{workReq} work
        </div>
      {:else if hoverBuilding.deconstructQueued}
        {@const dDone = hoverBuilding.deconstructWorkDone ?? 0}
        {@const dReq = hoverBuilding.deconstructWorkRequired ?? 1}
        <div class="bld-progress">
          [{jobProgressBar(dReq > 0 ? dDone / dReq : 0)}] {dDone}/{dReq} work
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
          FUEL [{jobProgressBar(fuelMax > 0 ? fuelCurr / fuelMax : 0)}] {fuelCurr}/{fuelMax}
          {#if hoverBuilding.lit}<span class="fuel-lit">● lit</span>{:else}<span class="fuel-dark"
              >○ unlit</span
            >{/if}
        </div>
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
    max-width: 340px;
    white-space: normal;
  }
  .tile-hud--pawn {
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
    color: #c8a060;
    font-weight: bold;
    font-size: 11px;
  }
  .pawn-state {
    color: #7a6030;
    font-size: 9px;
  }
  .pawn-row {
    display: flex;
    gap: 6px;
    align-items: baseline;
    font-size: 9px;
  }
  .pawn-stat-label {
    color: #7a6030;
  }
  .pawn-stat-val {
    color: #c08040;
    min-width: 18px;
  }
  .pawn-warn {
    color: #ee8844 !important;
  }
  .pawn-job {
    color: #8a7040;
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
    min-width: 140px;
    display: flex;
    align-items: baseline;
    gap: 5px;
    flex-wrap: wrap;
  }
  .item-glyph {
    color: #c08030;
    font-size: 11px;
  }
  .item-name {
    color: #c8a060;
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
    display: none; /* removed — building info now lives in the tile-hud */
  }
  /* ── Building HUD card ─────────────────────────── */
  .tile-hud--building {
    min-width: 160px;
    max-width: 300px;
    white-space: normal;
    pointer-events: none;
  }
  .bld-row {
    position: absolute;
    bottom: 6px;
    left: 6px;
    display: flex;
    align-items: flex-start;
    gap: 4px;
    pointer-events: all;
  }
  .tile-hud--selected-building {
    position: static;
    border-color: #f0c060;
    background: rgba(20, 14, 4, 0.96);
    color: #e8c870;
    pointer-events: all;
  }
  .bld-side-actions {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    gap: 3px;
  }
  .bld-side-actions .bld-btn--sq {
    flex: 1;
    height: auto;
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
  .bld-actions {
    display: none; /* actions moved to bld-side-actions */
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
  .bld-refund {
    color: #7a6030;
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
  .bld-actions {
    display: flex;
    gap: 4px;
    margin-top: 4px;
  }
  .bld-btn {
    background: #140e04;
    border: 1px solid #7a5820;
    color: #c08030;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    padding: 2px 7px;
    cursor: pointer;
    line-height: 1.3;
  }
  .bld-btn:hover {
    background: #1e1608;
    color: #e8a040;
  }
  .bld-btn--danger {
    border-color: #aa3322;
    color: #dd6655;
  }
  .bld-btn--danger:hover {
    background: #200806;
    color: #ff8877;
  }
  .bld-btn--sq {
    padding: 2px 6px;
    font-size: 13px;
    line-height: 1;
    min-width: 24px;
    text-align: center;
  }
  /* ── Resource tile HUD ────────────────────────── */
  .res-row {
    position: absolute;
    bottom: 6px;
    left: 6px;
    display: flex;
    align-items: flex-start;
    gap: 4px;
    pointer-events: all;
  }
  .tile-hud--resource {
    min-width: 160px;
  }
  .tile-hud--selected-resource {
    position: static;
    border-color: #f0c060;
    background: rgba(20, 14, 4, 0.96);
    color: #e8c870;
    pointer-events: all;
  }
  /* bright gold text inside selected building/resource cards */
  .tile-hud--selected-building .bld-name,
  .tile-hud--selected-resource .bld-name {
    color: #ffe890;
  }
  .tile-hud--selected-building .bld-status,
  .tile-hud--selected-resource .bld-status {
    color: #c0a040;
  }
  .tile-hud--selected-building .bld-desc,
  .tile-hud--selected-resource .bld-desc,
  .tile-hud--selected-building .bld-progress,
  .tile-hud--selected-resource .bld-progress,
  .tile-hud--selected-building .bld-refund,
  .tile-hud--selected-resource .bld-refund {
    color: #c0a040;
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
