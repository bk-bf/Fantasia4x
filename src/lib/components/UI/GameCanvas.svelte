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

  // Tile size range for zoom (square cells for CoQ sprite-mode)
  // MAP_W / MAP_H must match the generateWorld() call in gameState.ts
  const MAP_W = 120;
  const MAP_H = 80;
  const MAX_TILE_W = 24;
  const ZOOM_STEP = 2;
  const SCROLL_STEP = 4; // tiles per arrow key press

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

  // Phase 4: buildings and designations overlay
  let buildings: PlacedBuilding[] = [];
  let designations: Record<string, DesignationType> = {};

  // Phase 7: dropped items overlay
  let droppedItems: DroppedItem[] = [];

  // Zone/designation painting — driven by uiState
  let designationMode = false;
  let designationTypeActive: DesignationType = 'harvest';
  const unsubUI = uiState.subscribe((s) => {
    designationMode = s.designationActive;
    if (s.designationType) designationTypeActive = s.designationType as DesignationType;
    redrawOverlay();
  });

  // Zone drag-paint state (drag fills a rectangle)
  let zoneDragActive = false;
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

  const unsubState = gameState.subscribe((s) => {
    worldMap = s.worldMap ?? [];
    pawns = s.pawns ?? [];
    buildings = s.buildings ?? [];
    designations = s.designations ?? {};
    droppedItems = s.droppedItems ?? [];
    if (renderer?.isReady()) {
      const grid =
        worldMap.length > 0
          ? buildGameGrid(worldMap, buildings, designations)
          : generatePlaceholderGrid();
      overlayPawns(grid, pawns, selectedPawnId);
      overlayDroppedItems(grid, droppedItems);
      renderer.setGrid(grid);
      // Re-snap to fit when the real map loads (placeholder vs. actual may differ in size)
      if (worldMap.length > 0 && canvas) {
        const newFit = computeFitTileSize(canvas.width, canvas.height);
        const wasAtFit = Math.abs(tileWidth - fitTileSize) < 0.01;
        fitTileSize = newFit;
        if (wasAtFit) {
          tileWidth = tileHeight = fitTileSize;
          renderer.setTileSize(tileWidth, tileHeight);
          setView(0, 0);
        }
      }
    }
  });

  // Humanoid sprites from bitlands_map.bmp (indices 64,66,69,78,85,103,105,125)
  const PAWN_SPRITES = [64, 66, 69, 78, 85, 103, 105, 125].map((i) => glyph(SHEET.MAP, i));

  /** Deterministic color from a pawn ID: djb2 hash → hue, S=90% L=65% for bright retro look. */
  function pawnIdColor(id: string): { r: number; g: number; b: number } {
    let hash = 5381;
    for (let k = 0; k < id.length; k++) hash = (((hash << 5) + hash) ^ id.charCodeAt(k)) >>> 0;
    const h = (hash % 360) / 360;
    const s = 0.9,
      l = 0.65;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
    const m = l - c / 2;
    let r = 0,
      g = 0,
      b = 0;
    if (h < 1 / 6) {
      r = c;
      g = x;
      b = 0;
    } else if (h < 2 / 6) {
      r = x;
      g = c;
      b = 0;
    } else if (h < 3 / 6) {
      r = 0;
      g = c;
      b = x;
    } else if (h < 4 / 6) {
      r = 0;
      g = x;
      b = c;
    } else if (h < 5 / 6) {
      r = x;
      g = 0;
      b = c;
    } else {
      r = c;
      g = 0;
      b = x;
    }
    return { r: r + m, g: g + m, b: b + m };
  }

  function overlayPawns(grid: GameGrid, pawnList: Pawn[], selectedId: string | null) {
    for (let i = 0; i < pawnList.length; i++) {
      const pawn = pawnList[i];
      if (!pawn.position) continue;
      const { x, y } = pawn.position;
      const isSelected = pawn.id === selectedId;
      const color = pawnIdColor(pawn.id);
      const fg = isSelected
        ? {
            r: Math.min(1, color.r + 0.25),
            g: Math.min(1, color.g + 0.25),
            b: Math.min(1, color.b + 0.25)
          }
        : color;
      grid.setTile(x, y, {
        char: PAWN_SPRITES[i % PAWN_SPRITES.length],
        foreground: fg,
        // Preserve the terrain background so the pawn sprite doesn't black out the tile beneath it.
        // For selected pawns add a faint highlight tint over the terrain color.
        background: (() => {
          const terrain = grid.getTile(x, y);
          const base = terrain?.background ?? { r: 0, g: 0, b: 0 };
          return isSelected
            ? {
                r: Math.min(1, base.r + 0.1),
                g: Math.min(1, base.g + 0.08),
                b: Math.min(1, base.b + 0.04)
              }
            : base;
        })(),
        position: { x, y }
      });
    }
  }

  /** Render dropped items as a yellow/gold '*' glyph on the map. */
  function overlayDroppedItems(grid: GameGrid, drops: DroppedItem[]) {
    // ASCII '*' glyph index in the sprite sheet (glyph 42 in standard CP437)
    const STAR_GLYPH = glyph(SHEET.MAP, 42);
    for (const drop of drops) {
      const existing = grid.getTile(drop.x, drop.y);
      grid.setTile(drop.x, drop.y, {
        char: STAR_GLYPH,
        foreground: { r: 1.0, g: 0.85, b: 0.1 }, // gold
        background: existing?.background ?? { r: 0, g: 0, b: 0 },
        position: { x: drop.x, y: drop.y }
      });
    }
  }

  function redrawOverlay() {
    if (!renderer?.isReady() || worldMap.length === 0) return;
    const grid = buildGameGrid(worldMap, buildings, designations);
    overlayPawns(grid, pawns, selectedPawnId);
    overlayDroppedItems(grid, droppedItems);
    // Show zone drag preview rectangle
    if (zoneDragActive && designationMode) {
      const minX = Math.min(zoneAnchorX, zoneEndX);
      const maxX = Math.max(zoneAnchorX, zoneEndX);
      const minY = Math.min(zoneAnchorY, zoneEndY);
      const maxY = Math.max(zoneAnchorY, zoneEndY);
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const t = grid.getTile(x, y);
          if (!t) continue;
          grid.setTile(x, y, {
            char: t.char,
            foreground: { r: 1.0, g: 1.0, b: 1.0 },
            background: {
              r: t.background.r * 0.4 + 0.4,
              g: t.background.g * 0.4 + 0.3,
              b: t.background.b * 0.4 + 0.0
            },
            position: { x, y }
          });
        }
      }
    }
    renderer.setGrid(grid);
  }

  async function handleTileClick() {
    if (hoverTileX < 0 || hoverTileY < 0) return;

    // Designation mode: handled by drag — single-click still paints one tile
    if (designationMode) {
      gameState.updateWithSave((state) =>
        designationService.designate(hoverTileX, hoverTileY, designationTypeActive, state)
      );
      redrawOverlay();
      return;
    }

    // Click on a pawn → select it
    const clickedPawn = pawns.find(
      (p) => p.position?.x === hoverTileX && p.position?.y === hoverTileY
    );
    if (clickedPawn) {
      selectedPawnId = clickedPawn.id;
      redrawOverlay();
      return;
    }
    // Click-to-move: selected pawn + walkable tile
    if (selectedPawnId && worldMap.length > 0) {
      const targetTile = worldMap[hoverTileY]?.[hoverTileX];
      if (!targetTile?.walkable) return;
      const mover = pawns.find((p) => p.id === selectedPawnId);
      if (!mover?.position) return;
      await wasmPathfinderService.init();
      const { walkable, costs, width, height } = buildPathfindingGrids(worldMap);
      const path = wasmPathfinderService.findPath(
        walkable,
        costs,
        width,
        height,
        mover.position.x,
        mover.position.y,
        hoverTileX,
        hoverTileY
      );
      if (path.length > 0) {
        gameState.updateWithSave((state) => pawnService.assignPath(selectedPawnId!, path, state));
      }
    }
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

      renderer = new WebGLRenderer({
        canvas,
        tileWidth,
        tileHeight,
        contextAttributes: { alpha: false, antialias: false, powerPreference: 'high-performance' }
      });

      const ok = await renderer.waitForInitialization();
      if (!ok || !renderer.isReady()) throw new Error('Renderer init failed');

      const grid = worldMap.length > 0 ? buildGameGrid(worldMap) : generatePlaceholderGrid();
      renderer.setGrid(grid);

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

  function setView(x: number, y: number) {
    [viewX, viewY] = clampView(x, y);
    renderer?.setViewTileOffset(viewX, viewY);
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
        uiState.deactivateDesignation();
        zoneDragActive = false;
        selectedPawnId = null;
        redrawOverlay();
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
    if (!dragging) return;
    dragDistance += Math.abs(e.movementX) + Math.abs(e.movementY);
    const dx = Math.round((dragStartX - e.clientX) / tileWidth);
    const dy = Math.round((dragStartY - e.clientY) / tileHeight);
    setView(dragViewX + dx, dragViewY + dy);
  }

  function handleMouseUp() {
    if (zoneDragActive) {
      // Commit the painted rectangle to game state
      gameState.updateWithSave((state) =>
        designationService.designateRect(
          zoneAnchorX,
          zoneAnchorY,
          zoneEndX,
          zoneEndY,
          designationTypeActive,
          state
        )
      );
      zoneDragActive = false;
      redrawOverlay();
      return;
    }
    if (dragDistance < 3) handleTileClick();
    dragging = false;
  }

  function handleMouseLeave() {
    dragging = false;
    zoneDragActive = false;
    hoverTileX = -1;
    hoverTileY = -1;
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
  {#if errorMsg}
    <div class="error">WebGL unavailable: {errorMsg}</div>
  {:else if !ready}
    <div class="loading">Initializing renderer…</div>
  {/if}
  {#if designationMode}
    <div class="designation-hud">
      [{designationTypeActive.toUpperCase()}] drag to paint · RMB erase · Esc cancel
      {#if zoneDragActive}
        — selecting ({Math.abs(zoneEndX - zoneAnchorX) + 1}×{Math.abs(zoneEndY - zoneAnchorY) + 1})
      {/if}
    </div>
  {/if}
  {#if hoverTile}
    <div class="tile-hud">
      <span class="tile-coord">({hoverTile.x},{hoverTile.y})</span><span class="tile-layers"
        >{hoverTile.type},{hoverTile.terrainType},{hoverTile.subType}</span
      >
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
    color: #806830;
  }
</style>
