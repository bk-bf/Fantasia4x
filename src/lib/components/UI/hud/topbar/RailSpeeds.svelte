<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';

  const paused = gameState.isPaused;
  const speed = gameState.gameSpeed;

  function run(s: number) {
    gameState.setGameSpeed(s);
    if ($paused) gameState.unpauseGame();
  }
</script>

<span class="speeds">
  <ChromeButton
    class="spd ctrl-btn{$paused ? ' is-paused' : ''}"
    on={$paused}
    glyph={$paused ? 'play' : 'pause'}
    label={$paused ? 'Resume' : 'Pause'}
    onclick={gameState.togglePause}
  />
  {#each [1, 2, 4] as s (s)}
    <ChromeButton class="spd" on={!$paused && $speed === s} onclick={() => run(s)}
      >{s}×</ChromeButton
    >
  {/each}
</span>

<style>
  .speeds {
    display: inline-flex;
    gap: 2px;
    margin-left: auto;
  }
  .speeds :global(.spd) {
    width: 24px;
    height: 18px;
    padding: 0;
  }
</style>
