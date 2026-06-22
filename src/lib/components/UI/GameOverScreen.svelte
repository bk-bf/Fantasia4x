<!--
  GameOverScreen — full-screen permadeath overlay.

  Shown by +page.svelte when `isGameOver` (the colony roster is empty — every colonist has died).
  The load path never resurrects a wiped save, so this is a terminal state: the only way forward is
  Restart, which discards the dead save and boots a fresh mixed colony (gameState.resetGame).
  Pauses the sim on mount so mobs don't keep wandering an empty colony behind the overlay.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { gameState, currentTurn } from '$lib/stores/gameState';
  import { dayIndexForTurn } from '$lib/game/services/EnvironmentService';

  const lost = $derived($gameState.deadPawns?.length ?? 0);
  // Turns are ticks; surface elapsed in-game days for a human-readable "survived" figure.
  const days = $derived(Math.max(1, dayIndexForTurn($currentTurn ?? 0)));

  onMount(() => {
    gameState.pauseGame();
  });

  function restart() {
    gameState.resetGame();
  }
</script>

<div class="game-over" transition:fade={{ duration: 250 }}>
  <div class="box">
    <div class="title">GAME OVER</div>
    <div class="subtitle">Your colony has perished.</div>
    <div class="stats">
      <span>{lost} colonist{lost === 1 ? '' : 's'} lost</span>
      <span class="sep">·</span>
      <span>survived {days} day{days === 1 ? '' : 's'}</span>
    </div>
    <button class="restart" onclick={restart}>RESTART</button>
  </div>
</div>

<style>
  .game-over {
    position: fixed;
    inset: 0;
    z-index: 1001; /* above the loading overlay (1000) */
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
  }
  .box {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: min(360px, 70vw);
    align-items: center;
    text-align: center;
  }
  .title {
    color: var(--danger, #c0392b);
    font-size: 22px;
    letter-spacing: 0.5em;
    text-indent: 0.5em;
  }
  .subtitle {
    color: var(--text);
    font-size: 13px;
    letter-spacing: 0.1em;
  }
  .stats {
    color: var(--text-muted, #555);
    font-size: 11px;
    letter-spacing: 0.12em;
    display: flex;
    gap: 8px;
  }
  .sep {
    opacity: 0.5;
  }
  .restart {
    margin-top: 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    border: 1px solid var(--border);
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.25em;
    text-indent: 0.25em;
    padding: 8px 24px;
    cursor: pointer;
  }
  .restart:hover {
    background: var(--accent-hi);
    color: var(--bg);
  }
</style>
