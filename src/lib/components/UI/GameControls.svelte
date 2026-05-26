<script lang="ts">
  import { browser } from '$app/environment';
  import { gameState, currentTurn } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { gameEngine } from '$lib/game/systems/GameEngineImpl';
  import { onMount, onDestroy } from 'svelte';

  import type { PlacedBuilding } from '$lib/game/core/types';

  let isPaused = false;
  let gameSpeed = 1;
  let currentTurnValue = 0;
  let currentScreen = 'main';
  let buildings: PlacedBuilding[] = [];
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
  const unsubState = gameState.subscribe((s) => (buildings = s.buildings || []));

  $: hasResearch = buildings.some((b) => {
    const bDef = gameEngine.getBuildingById(b.type);
    return bDef?.category === 'knowledge' && b.status === 'complete';
  });

  const TABS = [
    { key: 'main', label: 'WORLD MAP', fkey: 'F1' },
    { key: 'pawns', label: 'PAWNS', fkey: 'F2' },
    { key: 'work', label: 'WORK', fkey: 'F3' },
    { key: 'building', label: 'BUILDINGS', fkey: 'F4' },
    { key: 'crafting', label: 'CRAFTING', fkey: 'F5' },
    { key: 'exploration', label: 'EXPLORE', fkey: 'F6' },
    { key: 'race', label: 'RACE', fkey: 'F7' },
    { key: 'research', label: 'RESEARCH', fkey: 'F8', needsResearch: true }
  ] as const;

  function nav(key: string) {
    if (key === 'research' && !hasResearch) return;
    uiState.setScreen(key as any);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.code === 'Space') {
      e.preventDefault();
      gameState.togglePause();
      return;
    }
    const idx = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'].indexOf(e.code.replace('Key', ''));
    const fIdx = TABS.findIndex((t) => t.fkey === e.key?.toUpperCase() || e.code === `F${e.key}`);
    // Handle F1-F8
    if (e.key && e.key.startsWith('F')) {
      const n = parseInt(e.key.slice(1));
      if (n >= 1 && n <= 8) {
        e.preventDefault();
        const tab = TABS[n - 1];
        if (tab) nav(tab.key);
      }
    }
  }

  onMount(() => {
    if (!browser) return;
    gameState.startAutoTurns();
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    if (browser) {
      gameState.stopAutoTurns();
      window.removeEventListener('keydown', handleKeydown);
    }
    unsubPaused();
    unsubSpeed();
    unsubTurn();
    unsubUI();
    unsubState();
  });

  function wipeSave() {
    if (confirm('Delete save and restart?')) {
      localStorage.removeItem('fantasia4x-save');
      location.reload();
    }
  }
</script>

<div class="topbar">
  <!-- Row 1: thin status strip -->
  <div class="status-bar">
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
    <span class="bi screen"
      >{TABS.find((t) => t.key === currentScreen)?.label ?? currentScreen.toUpperCase()}</span
    >
  </div>

  <!-- Row 2: nav tabs + game controls -->
  <div class="tab-row">
    <nav class="tabs">
      {#each TABS as tab}
        {@const isActive = currentScreen === tab.key}
        {@const disabled = ('needsResearch' in tab ? tab.needsResearch : false) && !hasResearch}
        <button
          class="tab"
          class:active={isActive}
          class:disabled
          on:click={() => nav(tab.key)}
          {disabled}
          title={disabled ? 'Requires a knowledge building' : ''}
        >
          {#if isActive}<span class="active-mark">■</span>{/if}{tab.label}
        </button>
      {/each}
    </nav>

    <div class="controls">
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
          <button
            class="spd"
            class:active={gameSpeed === s}
            on:click={() => gameState.setGameSpeed(s)}>{s}x</button
          >
        {/each}
      </div>
      <button class="ctrl-btn danger" on:click={wipeSave}>WIPE</button>
    </div>
  </div>
</div>

<style>
  .topbar {
    display: flex;
    flex-direction: column;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border-hi);
    font-family: 'Courier New', monospace;
    flex-shrink: 0;
  }

  /* ── Row 1: status bar ── */
  .status-bar {
    height: 20px;
    display: flex;
    align-items: center;
    padding: 0 6px;
    border-bottom: 1px solid var(--border);
    font-size: 11px;
    background: var(--bg);
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
  .bi.turn {
    color: var(--text);
  }
  .bi.running {
    color: var(--pos);
    animation: blink 2s infinite;
  }
  .bi.paused {
    color: var(--neg);
  }
  .bi.screen {
    color: var(--text);
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

  /* ── Row 2: tab bar ── */
  .tab-row {
    height: 32px;
    display: flex;
    align-items: stretch;
  }

  .tabs {
    display: flex;
    align-items: stretch;
    flex: 1;
    overflow: hidden;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0 7px;
    background: var(--bg-panel);
    border: none;
    border-right: 1px solid var(--border);
    color: var(--text);
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    white-space: nowrap;
    transition:
      background 0.1s,
      color 0.1s;
  }

  .tab:hover:not(.disabled) {
    background: var(--bg-hover);
    color: var(--accent-hi);
  }

  .tab.active {
    background: var(--tab-active);
    color: #fff;
  }

  .tab.disabled {
    color: var(--text-muted);
    cursor: not-allowed;
  }

  .active-mark {
    font-size: 7px;
    color: #fff;
    opacity: 0.8;
  }

  .fkey {
    color: inherit;
    opacity: 0.65;
    font-size: 10px;
  }
  .tab.active .fkey {
    opacity: 0.8;
  }

  /* ── Controls ── */
  .controls {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0 6px;
    border-left: 1px solid var(--border);
    flex-shrink: 0;
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
