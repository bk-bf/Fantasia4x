<script lang="ts">
  import { browser } from '$app/environment';
  import { gameState, currentTurn } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { wasmPathfinderService } from '$lib/game/services/WasmPathfinderService';
  import { onMount, onDestroy } from 'svelte';

  let isPaused = false;
  let gameSpeed = 1;
  let currentTurnValue = 0;
  let currentScreen = 'main';
  let mapSeedInput = String(Date.now() >>> 0);

  function regenMap() {
    const parsed = parseInt(mapSeedInput, 10);
    const s = !isNaN(parsed) && parsed > 0 ? parsed : Date.now() >>> 0;
    mapSeedInput = String(s);
    gameState.regenWorld(s);
  }

  const unsubPaused = gameState.isPaused.subscribe((v) => (isPaused = v));
  const unsubSpeed = gameState.gameSpeed.subscribe((v) => (gameSpeed = v));
  const unsubTurn = currentTurn.subscribe((v) => (currentTurnValue = v));
  const unsubUI = uiState.subscribe((s) => (currentScreen = s.currentScreen));

  onMount(async () => {
    if (!browser) return;
    // Ensure pathfinder WASM is loaded before turns start so pawns can navigate immediately
    await wasmPathfinderService.init();
    gameState.startAutoTurns();
  });

  onDestroy(() => {
    if (browser) gameState.stopAutoTurns();
    unsubPaused();
    unsubSpeed();
    unsubTurn();
    unsubUI();
  });

  function wipeSave() {
    if (confirm('Delete save and restart?')) {
      localStorage.removeItem('fantasia4x-save');
      location.reload();
    }
  }
</script>

<div class="topbar">
  <span class="bi title">FANTASIA4X</span>
  <span class="bi turn"
    >{String(Math.floor(currentTurnValue / 24)).padStart(3, '0')}:{String(
      currentTurnValue % 24
    ).padStart(2, '0')}</span
  >
  <span class="bi" class:running={!isPaused} class:paused={isPaused}>
    {isPaused ? '■ PAUSED' : '● RUNNING'}
  </span>
  <span class="spacer" />
  {#if currentScreen === 'main'}
    <input
      class="seed-input"
      type="text"
      bind:value={mapSeedInput}
      placeholder="SEED"
      title="World seed"
      maxlength="12"
    />
    <button class="ctrl-btn" on:click={regenMap} title="Regenerate map">↺ MAP</button>
  {/if}
  <button class="ctrl-btn" class:is-paused={isPaused} on:click={gameState.togglePause}>
    {isPaused ? '▶ RESUME' : '⏸ PAUSE'}
  </button>
  <div class="speed-wrap">
    {#each [1, 2, 4] as s}
      <button class="spd" class:active={gameSpeed === s} on:click={() => gameState.setGameSpeed(s)}
        >{s}x</button
      >
    {/each}
  </div>
  <button class="ctrl-btn danger" on:click={wipeSave}>WIPE</button>
</div>

<style>
  .topbar {
    height: 26px;
    display: flex;
    align-items: center;
    padding: 0 6px;
    gap: 2px;
    background: var(--bg);
    border-bottom: 1px solid var(--border-hi);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    flex-shrink: 0;
  }

  .bi {
    color: var(--text);
    padding: 0 5px;
    white-space: nowrap;
  }
  .bi::before {
    content: '[';
    color: var(--text-muted);
  }
  .bi::after {
    content: ']';
    color: var(--text-muted);
  }
  .bi.title {
    color: var(--accent-hi);
    font-weight: bold;
    letter-spacing: 0.05em;
  }
  .bi.running {
    color: var(--pos);
    animation: blink 2s infinite;
  }
  .bi.paused {
    color: var(--neg);
  }

  @keyframes blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .spacer {
    flex: 1;
  }

  .ctrl-btn {
    padding: 2px 8px;
    background: var(--bg-hover);
    border: 1px solid var(--border-hi);
    color: var(--text);
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 9px;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .ctrl-btn:hover {
    background: var(--bg-active);
    color: var(--accent-hi);
  }
  .ctrl-btn.is-paused {
    border-color: var(--accent-hi);
    color: var(--accent-hi);
  }
  .ctrl-btn.danger {
    border-color: var(--neg);
    color: var(--neg);
  }
  .ctrl-btn.danger:hover {
    background: var(--neg);
    color: #fff;
  }

  .seed-input {
    width: 82px;
    padding: 2px 4px;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 9px;
    text-align: center;
  }
  .seed-input:focus {
    outline: none;
    border-color: var(--border-hi);
    color: var(--text);
  }

  .speed-wrap {
    display: flex;
    gap: 1px;
  }
  .spd {
    padding: 2px 5px;
    background: var(--bg-hover);
    border: 1px solid var(--border);
    color: var(--text-dim);
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 9px;
  }
  .spd:hover {
    background: var(--bg-active);
    color: var(--text);
  }
  .spd.active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
</style>
