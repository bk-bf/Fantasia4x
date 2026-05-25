<!-- WebGL tile renderer canvas for Fantasia4x world map -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { WebGLRenderer } from '$lib/webgl/renderer.js';
  import { buildGameGrid, generatePlaceholderGrid } from '$lib/webgl/fantasia-world.js';
  import { gameState } from '$lib/stores/gameState.js';
  import type { WorldTile } from '$lib/game/core/types.js';

  export let tileWidth = 14;
  export let tileHeight = 22;

  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let renderer: WebGLRenderer | null = null;
  let animationId = 0;
  let ready = false;
  let errorMsg = '';
  let worldMap: WorldTile[][] = [];

  const unsubState = gameState.subscribe((s) => {
    worldMap = s.worldMap ?? [];
    if (renderer?.isReady()) {
      const grid = worldMap.length > 0 ? buildGameGrid(worldMap) : generatePlaceholderGrid();
      renderer.setGrid(grid);
    }
  });

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

      renderer = new WebGLRenderer({
        canvas,
        tileWidth,
        tileHeight,
        contextAttributes: { alpha: false, antialias: false, powerPreference: 'high-performance' }
      });

      const ok = await renderer.waitForInitialization();
      if (!ok || !renderer.isReady()) throw new Error('Renderer init failed');

      // Inject initial grid
      const grid = worldMap.length > 0 ? buildGameGrid(worldMap) : generatePlaceholderGrid();
      renderer.setGrid(grid);

      ready = true;
      startLoop();

      // Respond to container resize
      new ResizeObserver(() => {
        if (!renderer || !container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        canvas.width = w;
        canvas.height = h;
        renderer.resize(w, h);
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
</script>

<div class="canvas-wrap" bind:this={container}>
  <canvas bind:this={canvas}></canvas>
  {#if errorMsg}
    <div class="error">WebGL unavailable: {errorMsg}</div>
  {:else if !ready}
    <div class="loading">Initializing renderer…</div>
  {/if}
</div>

<style>
  .canvas-wrap {
    position: relative;
    width: 100%;
    height: 100%;
    background: #050706;
    overflow: hidden;
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
  .error {
    color: #c04040;
  }
  .loading {
    color: #806830;
  }
</style>
