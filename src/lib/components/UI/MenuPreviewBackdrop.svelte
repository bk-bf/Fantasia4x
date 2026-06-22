<!--
  MenuPreviewBackdrop — the live, atmospheric map shown BEHIND the main menu (MainMenu.svelte).

  It mounts a single GameCanvas in `menuPreview` mode (a non-interactive, HUD-less render of a gutted
  preview world — fixed seed, prey-only grazing, day/night progressing, no pawns / predators /
  consequence systems) plus the WeatherCanvas particle overlay so the pinned spring breeze (blowing
  leaves) animates over it. The preview world + worker are booted by `startMenuPreview` in gameState.ts.

  The wrapper holds at opacity 0 until GameCanvas reports its first painted frame (`menuPreviewRendered`)
  and then fades in — so the WebGL init (which clears the whole canvas before the first draw) happens
  invisibly behind the menu's dark background instead of flashing the screen. Full-screen, click-through.
-->
<script lang="ts">
  import GameCanvas from '$lib/components/UI/GameCanvas.svelte';
  import WeatherCanvas from '$lib/components/UI/WeatherCanvas.svelte';
  import { menuPreviewRendered } from '$lib/stores/gameState';
</script>

<div class="menu-backdrop" class:revealed={$menuPreviewRendered} aria-hidden="true">
  <GameCanvas menuPreview />
  <WeatherCanvas />
</div>

<style>
  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    /* Click-through: the menu buttons sit above and own all interaction. */
    pointer-events: none;
    /* Hidden until the first terrain frame is painted (see header). The title-screen loader covers the
       whole init and only drops on that same signal, so this just needs a quick fade to align with the
       loader's fade-out — by the time the loader is gone the map is already there, no late "loading in". */
    opacity: 0;
    transition: opacity 0.3s ease-out;
  }
  .menu-backdrop.revealed {
    opacity: 1;
  }
</style>
