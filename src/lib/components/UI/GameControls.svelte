<script lang="ts">
  import { browser } from '$app/environment';
  import { gameState, currentTurn, savedStateReady } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { wasmPathfinderService } from '$lib/game/services/WasmPathfinderService';
  import { onMount, onDestroy } from 'svelte';

  let isPaused = false;
  let gameSpeed = 1;
  let currentTurnValue = 0;
  let currentScreen = 'main';
  let mapSeedInput = String(Date.now() >>> 0);

  // ===== IN-GAME CALENDAR =====
  const TURNS_PER_DAY = 300; // 1 in-game day = 300 turns ≈ 5 real min at 1 turn/sec
  const DAYS_PER_MONTH = 30;
  const MONTHS_PER_YEAR = 12;

  const MONTH_NAMES = [
    'Deepwinter',
    'Thawing',
    'Seedtime',
    'Budding',
    'Flowering',
    'Midsummer',
    'Hightide',
    'Harvest',
    'Goldfall',
    'Frostfall',
    'Snowfall',
    'Midwinter'
  ];
  const MONTH_ABBR = [
    'DWN',
    'THW',
    'SEE',
    'BUD',
    'FLW',
    'MDS',
    'HTD',
    'HRV',
    'GOL',
    'FRO',
    'SNO',
    'MDW'
  ];

  function turnToGameDate(turn: number) {
    const totalDays = Math.floor(turn / TURNS_PER_DAY);
    const hour = Math.floor(((turn % TURNS_PER_DAY) / TURNS_PER_DAY) * 24);
    const totalMonths = Math.floor(totalDays / DAYS_PER_MONTH);
    const year = Math.floor(totalMonths / MONTHS_PER_YEAR) + 1;
    const monthIdx = totalMonths % MONTHS_PER_YEAR;
    const day = (totalDays % DAYS_PER_MONTH) + 1;
    return {
      year,
      day,
      monthIdx,
      monthAbbr: MONTH_ABBR[monthIdx],
      monthName: MONTH_NAMES[monthIdx],
      hour,
      hourStr: String(hour).padStart(2, '0'),
      dayStr: String(day).padStart(2, '0'),
      monthStr: String(monthIdx + 1).padStart(2, '0'),
      yearStr: String(year).padStart(4, '0')
    };
  }

  $: gameDate = turnToGameDate(currentTurnValue);

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
    // Wait for the IndexedDB save to be loaded and applied before advancing turns.
    await savedStateReady;
    // Start turns; WASM pathfinder loads in the background.
    // wasmPathfinderService.findPath returns [] when not ready — handled gracefully.
    gameState.startAutoTurns();
    wasmPathfinderService.init().catch((err) => {
      console.warn('[WASM] Pathfinder failed to load — pawns will stay idle until resolved:', err);
    });
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
      gameState.wipeAndReload();
    }
  }

  let devSeedQty = 500;
  function applyDevSeed() {
    gameState.applyDevSeed(devSeedQty);
  }
</script>

<div class="topbar">
  <span class="bi title">FANTASIA4X</span>
  <span class="bi date" title="{gameDate.monthName} {gameDate.day}, Year {gameDate.year}"
    >{gameDate.dayStr}/{gameDate.monthStr}/{gameDate.yearStr} {gameDate.hourStr}:00</span
  >
  <span class="bi turn" title="Turn {currentTurnValue}">T{currentTurnValue}</span>
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
  <span class="dev-sep">|</span>
  <input
    class="seed-input qty-input"
    type="number"
    bind:value={devSeedQty}
    min="1"
    max="99999"
    title="Item quantity for dev seed"
  />
  <button
    class="ctrl-btn dev"
    on:click={applyDevSeed}
    title="Unlock all items, locations & research">DEV SEED</button
  >
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
  .bi.date {
    color: var(--text-dim);
    letter-spacing: 0.02em;
  }
  .bi.turn {
    color: var(--text-muted);
    font-size: 10px;
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
  .ctrl-btn.dev {
    border-color: var(--accent);
    color: var(--accent);
  }
  .ctrl-btn.dev:hover {
    background: var(--accent);
    color: var(--bg);
  }
  .dev-sep {
    color: var(--border-hi);
    padding: 0 2px;
  }
  .qty-input {
    width: 46px;
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
