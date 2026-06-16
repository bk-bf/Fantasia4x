<script lang="ts">
  import { browser } from '$app/environment';
  import { gameState, currentTurn, savedStateReady } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { renderFps } from '$lib/stores/perfStats';
  import { wasmPathfinderService } from '$lib/game/services/WasmPathfinderService';
  import { TICKS_PER_SECOND } from '$lib/game/core/time';
  import { onMount, onDestroy } from 'svelte';

  let isPaused = false;
  let gameSpeed = 1;
  let currentTurnValue = 0;
  let currentScreen = 'main';
  let mapSeedInput = String(Date.now() >>> 0);

  // ===== PERFORMANCE TRACKERS =====
  let fps = 0; // render frames/sec (from the WebGL canvas)
  let tps = 0; // simulation ticks/sec (measured from the turn counter)

  // ===== IN-GAME CALENDAR =====
  const TURNS_PER_DAY = 300; // 1 in-game day = 300 in-game seconds; turn counts ticks
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
    // turn counts simulation ticks; the calendar is denominated in in-game seconds.
    const seconds = turn / TICKS_PER_SECOND;
    const totalDays = Math.floor(seconds / TURNS_PER_DAY);
    const hour = Math.floor(((seconds % TURNS_PER_DAY) / TURNS_PER_DAY) * 24);
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

  // Dev timesaver: drop 500 of every item into the current stockpile (no regen/wipe).
  const DEV_ITEM_QTY = 500;
  function spawnAllItems() {
    gameState.devSpawnAllItems(DEV_ITEM_QTY);
  }
  function clearAllItems() {
    gameState.devClearAllItems();
  }

  const unsubPaused = gameState.isPaused.subscribe((v) => (isPaused = v));
  const unsubSpeed = gameState.gameSpeed.subscribe((v) => (gameSpeed = v));
  const unsubTurn = currentTurn.subscribe((v) => (currentTurnValue = v));
  const unsubUI = uiState.subscribe((s) => (currentScreen = s.currentScreen));
  const unsubFps = renderFps.subscribe((v) => (fps = v));

  // Measure real simulation throughput by sampling the tick counter. Sampled at 250ms (matching the
  // renderer's FPS push) and EMA-smoothed: the turn counter only advances on a worker flush (~15Hz),
  // so a raw once-per-second delta jittered ±~66ms at each window boundary and lagged the FPS readout.
  let tpsTimer: ReturnType<typeof setInterval> | undefined;
  let lastSampleTurn = 0;
  let lastSampleTime = 0;
  let tpsEma = 0; // smoothed TPS
  const TPS_SAMPLE_MS = 250; // match the FPS push cadence so both numbers update in lockstep
  const TPS_ALPHA = 0.3; // EMA weight — calm, but tracks a speed change in ~1s

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

    lastSampleTurn = currentTurnValue;
    lastSampleTime = performance.now();
    tpsTimer = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - lastSampleTime) / 1000;
      const dTurn = currentTurnValue - lastSampleTurn;
      lastSampleTurn = currentTurnValue;
      lastSampleTime = now;
      // Paused → no throughput; snap to 0 and reset the average so it ramps cleanly on resume.
      if (isPaused) {
        tpsEma = 0;
        tps = 0;
        return;
      }
      if (elapsed > 0) {
        const instantaneous = dTurn / elapsed;
        tpsEma =
          tpsEma === 0 ? instantaneous : tpsEma * (1 - TPS_ALPHA) + instantaneous * TPS_ALPHA;
        tps = Math.round(tpsEma);
      }
    }, TPS_SAMPLE_MS);
  });

  onDestroy(() => {
    if (browser) gameState.stopAutoTurns();
    if (tpsTimer) clearInterval(tpsTimer);
    unsubPaused();
    unsubSpeed();
    unsubTurn();
    unsubUI();
    unsubFps();
  });

  function wipeSave() {
    if (confirm('Delete save and restart?')) {
      gameState.wipeAndReload();
    }
  }
</script>

<svelte:head>
  {#if import.meta.env.VITE_DEV_BRANCH}
    <title>Fantasia4x - {import.meta.env.VITE_DEV_BRANCH.replace(/^feat\//, '')}</title>
  {:else}
    <title>Fantasia4x</title>
  {/if}
</svelte:head>

<div class="topbar">
  <span class="bi title">FANTASIA4X</span>
  {#if import.meta.env.VITE_DEV_BRANCH}
    <span class="bi branch-label" title="branch: {import.meta.env.VITE_DEV_BRANCH}"
      >{import.meta.env.VITE_DEV_BRANCH.replace(/^feat\//, '')}</span
    >
  {/if}
  <span class="bi date" title="{gameDate.monthName} {gameDate.day}, Year {gameDate.year}"
    >{gameDate.dayStr}/{gameDate.monthStr}/{gameDate.yearStr} {gameDate.hourStr}:00</span
  >
  <span class="bi turn" title="Turn {currentTurnValue}">T{currentTurnValue}</span>
  <span
    class="bi perf"
    title="Render {fps} FPS · Simulation {tps} TPS (target {TICKS_PER_SECOND * gameSpeed} at {gameSpeed}×)"
    >{fps}FPS · {tps}TPS</span
  >
  <span class="bi" class:running={!isPaused} class:paused={isPaused}>
    {isPaused ? '■ PAUSED' : '● RUNNING'}
  </span>
  <span class="spacer" />
  {#if currentScreen === 'main' && import.meta.env.VITE_DEBUG_MODE === 'true'}
    <input
      class="seed-input"
      type="text"
      bind:value={mapSeedInput}
      placeholder="SEED"
      title="World seed"
      maxlength="12"
    />
    <button class="ctrl-btn" on:click={regenMap} title="Regenerate map">↺ MAP</button>
    <button
      class="ctrl-btn"
      on:click={spawnAllItems}
      title="Dev: drop 500× of every item as physical piles on the ground around the colony (haul to use)"
    >
      + ITEMS
    </button>
    <button
      class="ctrl-btn"
      on:click={clearAllItems}
      title="Dev: destroy ALL physical items (every drop + carried inventory)"
    >
      − ITEMS
    </button>
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
  .bi.branch-label {
    color: var(--accent-hi);
    background: color-mix(in srgb, var(--accent-hi) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent-hi) 35%, transparent);
    border-radius: 2px;
    padding: 0 4px;
    font-size: 9px;
    letter-spacing: 0.04em;
    opacity: 0.85;
  }
  .bi.date {
    color: var(--text-dim);
    letter-spacing: 0.02em;
  }
  .bi.turn {
    color: var(--text-muted);
    font-size: 10px;
  }
  .bi.perf {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.02em;
    min-width: 17ch;
    display: inline-block;
    text-align: center;
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
