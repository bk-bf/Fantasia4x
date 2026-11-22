<script lang="ts">
  import { onMount } from 'svelte';
  import { menuPreviewRendered } from '$lib/stores/gameState';
  import WeatherCanvas from '$lib/components/UI/canvas/WeatherCanvas.svelte';
  import { weatherEffects } from '$lib/stores/uiPrefs';
  import { cameraTileSize } from '$lib/stores/cameraView';
  import type { ColonyAmbient } from './mainMenuAmbient';
  import {
    COLONY_H,
    COLONY_TILE,
    COLONY_W,
    colonyCamera,
    colonyImage,
    colonyLayers,
    colonyZoom
  } from './menuColony';

  let {
    colony,
    scale,
    viewW,
    viewH
  }: { colony: ColonyAmbient; scale: number; viewW: number; viewH: number } = $props();

  let seconds = $state(0);
  let still = $state(true);
  let revealed = $state(false);

  const k = $derived(colonyZoom(scale, viewW, viewH));
  const cam = $derived(colonyCamera(viewW, viewH, k, seconds));
  const layers = $derived(colonyLayers(colony));

  $effect(() => cameraTileSize.set(COLONY_TILE * k));

  onMount(() => {
    still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (still) return;
    const t0 = performance.now();
    const id = setInterval(() => (seconds = (performance.now() - t0) / 1000), 100);
    return () => clearInterval(id);
  });

  function shown() {
    revealed = true;
    menuPreviewRendered.set(true);
  }
</script>

<div class="menu-backdrop" class:revealed aria-hidden="true">
  <div
    class="world"
    style:transform="translate({cam.left}px, {cam.top}px)"
    style:width="{COLONY_W * k}px"
    style:height="{COLONY_H * k}px"
    style:filter={colony.filter || null}
  >
    {#each layers as layer (layer.time)}
      <div class="layer" style:opacity={layer.opacity}>
        <img src={colonyImage(colony.season, layer.time, false)} alt="" onload={shown} />
        {#if !still}
          <img src={colonyImage(colony.season, layer.time, true)} alt="" />
        {/if}
      </div>
    {/each}
  </div>
  {#if $weatherEffects}
    <WeatherCanvas />
  {/if}
</div>

<style>
  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    background: #08060a;
    opacity: 0;
    transition: opacity 0.3s ease-out;
  }
  .menu-backdrop.revealed {
    opacity: 1;
  }
  .world {
    position: absolute;
    left: 0;
    top: 0;
    will-change: transform;
  }
  .layer,
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  img {
    image-rendering: pixelated;
  }
</style>
