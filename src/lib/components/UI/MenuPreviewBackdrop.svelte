<!--
  MenuPreviewBackdrop — the live, atmospheric map shown BEHIND the main menu (MainMenu.svelte).

  It mounts a single GameCanvas in `menuPreview` mode: a non-interactive, HUD-less render of a gutted
  preview world (fixed seed, prey-only grazing, weather + day/night rolling, no pawns / predators /
  environmental-consequence systems). The preview world + worker are booted by `startMenuPreview` in
  gameState.ts; this component only renders it. Full-screen, click-through, and behind the menu text.
-->
<script lang="ts">
  import GameCanvas from '$lib/components/UI/GameCanvas.svelte';
</script>

<div class="menu-backdrop" aria-hidden="true">
  <GameCanvas menuPreview />
</div>

<style>
  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    /* Click-through: the menu buttons sit above and own all interaction. */
    pointer-events: none;
  }
</style>
