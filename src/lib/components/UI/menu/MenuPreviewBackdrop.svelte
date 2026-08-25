<script lang="ts">
  import GameCanvas from '$lib/components/UI/canvas/GameCanvas.svelte';
  import WeatherCanvas from '$lib/components/UI/canvas/WeatherCanvas.svelte';
  import { menuPreviewRendered } from '$lib/stores/gameState';
  import { weatherEffects } from '$lib/stores/uiPrefs';
</script>

<div class="menu-backdrop" class:revealed={$menuPreviewRendered} aria-hidden="true">
  <GameCanvas menuPreview />
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
    opacity: 0;
    transition: opacity 0.3s ease-out;
  }
  .menu-backdrop.revealed {
    opacity: 1;
  }
</style>
