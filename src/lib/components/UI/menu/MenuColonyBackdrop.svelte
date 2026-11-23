<script lang="ts">
  import { onMount } from 'svelte';
  import { menuPreviewRendered } from '$lib/stores/gameState';
  import WeatherLayer from '$lib/components/UI/weather/WeatherLayer.svelte';
  import { weatherEffects } from '$lib/stores/uiPrefs';
  import type { ColonyAmbient } from './mainMenuAmbient';
  import {
    COLONY_H,
    COLONY_W,
    colonyDrift,
    colonyImage,
    colonyLayers,
    colonyZoom,
    driftOffset,
    snapToDevice
  } from './menuColony';

  let {
    colony,
    scale,
    viewW,
    viewH
  }: { colony: ColonyAmbient; scale: number; viewW: number; viewH: number } = $props();

  let still = $state(true);
  let revealed = $state(false);
  let offset = $state(0);
  let dpr = $state(1);

  const k = $derived(colonyZoom(scale, viewW, viewH));
  const drift = $derived(colonyDrift(viewW, viewH, k));
  const left = $derived(snapToDevice(still ? drift.rest.left : drift.from.left - offset, dpr));
  const top = $derived(snapToDevice(drift.from.top, dpr));
  const layers = $derived(colonyLayers(colony));

  onMount(() => {
    dpr = window.devicePixelRatio || 1;
    still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (still) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      dpr = window.devicePixelRatio || 1;
      offset = driftOffset(drift.from.left - drift.to.left, (now - start) / 1000);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });

  function shown() {
    revealed = true;
    menuPreviewRendered.set(true);
  }
</script>

<div class="menu-backdrop" class:revealed aria-hidden="true">
  <div
    class="world"
    style:transform="translate({left}px, {top}px)"
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
    <WeatherLayer scale={k} />
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
