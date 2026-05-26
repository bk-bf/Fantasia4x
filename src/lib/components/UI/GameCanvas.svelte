<!-- WebGL tile renderer canvas for Fantasia4x world map -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { WebGLRenderer } from '$lib/webgl/renderer.js';
  import { buildGameGrid, generatePlaceholderGrid } from '$lib/webgl/fantasia-world.js';
  import { gameState } from '$lib/stores/gameState.js';
  import type { WorldTile, Pawn } from '$lib/game/core/types.js';
  import type { GameGrid } from '$lib/webgl/game-grid.js';
  import { wasmPathfinderService } from '$lib/game/services/WasmPathfinderService.js';
  import { pawnService } from '$lib/game/services/PawnService.js';
  import { buildPathfindingGrids } from '$lib/game/services/PathfinderService.js';

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
    if (renderer?.isReady()) {
      const grid = worldMap.length > 0 ? buildGameGrid(worldMap) : generatePlaceholderGrid();
      overlayPawns(grid, pawns, selectedPawnId);
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

  function overlayPawns(grid: GameGrid, pawnList: Pawn[], selectedId: string | null) {
    for (const pawn of pawnList) {
      if (!pawn.position) continue;
      const { x, y } = pawn.position;
      const isSelected = pawn.id === selectedId;
      grid.setTile(x, y, {
        char: '@',
        foreground: isSelected ? { r: 1, g: 1, b: 0.5 } : { r: 1, g: 0.75, b: 0 },
        background: { r: 0.05, g: 0.04, b: 0.01 },
        position: { x, y }
      });
    }
  }

  function redrawOverlay() {
    if (!renderer?.isReady() || worldMap.length === 0) return;
    const grid = buildGameGrid(worldMap);
    overlayPawns(grid, pawns, selectedPawnId);
    renderer.setGrid(grid);
  }

  async function handleTileClick() {
    if (hoverTileX < 0 || hoverTileY < 0) return;
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
    if (!dragging) return;
    dragDistance += Math.abs(e.movementX) + Math.abs(e.movementY);
    const dx = Math.round((dragStartX - e.clientX) / tileWidth);
    const dy = Math.round((dragStartY - e.clientY) / tileHeight);
    setView(dragViewX + dx, dragViewY + dy);
  }

  function handleMouseUp() {
    if (dragDistance < 3) handleTileClick();
    dragging = false;
  }

  function handleMouseLeave() {
    dragging = false;
    hoverTileX = -1;
    hoverTileY = -1;
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
>
  <canvas bind:this={canvas}></canvas>
  {#if errorMsg}
    <div class="error">WebGL unavailable: {errorMsg}</div>
  {:else if !ready}
    <div class="loading">Initializing renderer…</div>
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
