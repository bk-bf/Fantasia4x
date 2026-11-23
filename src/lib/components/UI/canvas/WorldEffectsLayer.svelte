<script lang="ts">
  import {
    weatherEffects,
    uiTheme,
    showDialogBubbles,
    conditionIcons,
    conditionText
  } from '$lib/stores/uiPrefs';
  import { effectToggles } from '$lib/stores/fx/effectToggles';
  import WorldWeather from '$lib/components/UI/weather/WorldWeather.svelte';
  import { worldFx } from './worldFx/layer';

  let canvas: HTMLCanvasElement | undefined = $state();

  $effect(() => {
    const c = canvas;
    if (!c) return;
    worldFx.attach(c);
    return () => worldFx.detach(c);
  });

  $effect(() => {
    worldFx.configure({
      skin: $uiTheme,
      bubbles: $showDialogBubbles,
      floaters: { icons: $conditionIcons, text: $conditionText },
      on: $effectToggles
    });
  });
</script>

<div class="world-effects-layer">
  <canvas bind:this={canvas}></canvas>
</div>
{#if $weatherEffects}
  <WorldWeather />
{/if}

<style>
  .world-effects-layer {
    position: absolute;
    inset: 0;
    z-index: 5;
    pointer-events: none;
    overflow: hidden;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
</style>
