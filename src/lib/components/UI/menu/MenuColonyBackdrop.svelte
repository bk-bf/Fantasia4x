<script lang="ts">
  import { onMount } from 'svelte';
  import type { Attachment } from 'svelte/attachments';
  import { menuPreviewRendered } from '$lib/stores/gameState';
  import WeatherCanvas from '$lib/components/UI/canvas/WeatherCanvas.svelte';
  import { weatherEffects } from '$lib/stores/uiPrefs';
  import { cameraTileSize } from '$lib/stores/cameraView';
  import type { ColonyAmbient } from './mainMenuAmbient';
  import {
    COLONY_H,
    COLONY_TILE,
    COLONY_W,
    DRIFT_SECONDS,
    colonyDrift,
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

  let still = $state(true);
  let revealed = $state(false);
  const midway = Number(document.timeline.currentTime ?? 0) - (DRIFT_SECONDS * 1000) / 2;

  const k = $derived(colonyZoom(scale, viewW, viewH));
  const drift = $derived(colonyDrift(viewW, viewH, k));
  const left = $derived(Math.round(drift.from.left));
  const span = $derived(Math.round(drift.from.left - drift.to.left));
  const rest = $derived(Math.round(drift.rest.left - drift.from.left));
  const layers = $derived(colonyLayers(colony));

  $effect(() => cameraTileSize.set(COLONY_TILE * k));

  onMount(() => {
    still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  });

  const drifting: Attachment<HTMLImageElement> = (img) => {
    if (still || !span) return;
    const run = img.animate(
      [{ transform: 'translateX(0)' }, { transform: `translateX(${-span}px)` }],
      {
        duration: DRIFT_SECONDS * 1000,
        easing: 'cubic-bezier(0.37, 0, 0.63, 1)',
        iterations: Infinity,
        direction: 'alternate'
      }
    );
    run.startTime = midway;
    return () => run.cancel();
  };

  function shown() {
    revealed = true;
    menuPreviewRendered.set(true);
  }
</script>

<div class="menu-backdrop" class:revealed aria-hidden="true">
  <div
    class="world"
    style:transform="translate({left}px, {drift.from.top}px)"
    style:width="{COLONY_W * k}px"
    style:height="{COLONY_H * k}px"
    style:filter={colony.filter || null}
    style:--rest="{rest}px"
  >
    {#each layers as layer (layer.time)}
      <div class="layer" style:opacity={layer.opacity}>
        <img
          src={colonyImage(colony.season, layer.time, false)}
          alt=""
          onload={shown}
          {@attach drifting}
        />
        {#if !still}
          <img src={colonyImage(colony.season, layer.time, true)} alt="" {@attach drifting} />
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
    transform: translateX(var(--rest));
  }
</style>
