<!-- src/routes/+page.svelte -->
<script lang="ts">
  import '../app.css';
  import MainScreen from '$lib/components/UI/MainScreen.svelte';
  import RaceScreen from '$lib/components/screens/RaceScreen.svelte';
  import PawnScreen from '$lib/components/screens/PawnScreen.svelte';
  import BuildingMenu from '$lib/components/screens/BuildingMenu.svelte';
  import ResearchScreen from '$lib/components/screens/ResearchScreen.svelte';
  import CraftingScreen from '$lib/components/screens/CraftingScreen.svelte';
  import ExplorationScreen from '$lib/components/screens/ExplorationScreen.svelte';
  import WorkScreen from '$lib/components/screens/WorkScreen.svelte';
  import EntityScreen from '$lib/components/screens/EntityScreen.svelte';
  import DebugLogScreen from '$lib/components/screens/DebugLogScreen.svelte';
  import ResourceSidebar from '$lib/components/UI/ResourceSidebar.svelte';
  import GameControls from '$lib/components/UI/GameControls.svelte';
  import ChroniclePanel from '$lib/components/UI/ChroniclePanel.svelte';
  import WorldEffectsLayer from '$lib/components/UI/WorldEffectsLayer.svelte';
  import LoadingScreen from '$lib/components/UI/LoadingScreen.svelte';
  import { uiState } from '$lib/stores/uiState';
  import { gameState, storeReady, rendererReady } from '$lib/stores/gameState';
  import { gameCoordinator } from '$lib/game/systems/GameCoordinator';
  import { environmentService } from '$lib/game/services/EnvironmentService.js';
  import type { PlacedBuilding } from '$lib/game/core/types';

  let currentScreen = 'main';
  let buildings: PlacedBuilding[] = [];

  // Ambient panel tint — updated reactively on every turn via the gameState store.
  // panelTint is a per-channel RGB multiplier fed into an SVG feColorMatrix so
  // panels are tinted by exactly the same hue as the map (no pink hue-rotate bug).
  $: panelTint = environmentService.getAmbient($gameState.turn).panelTint;
  $: ambientMatrix =
    `${panelTint[0].toFixed(3)} 0 0 0 0 ` +
    `0 ${panelTint[1].toFixed(3)} 0 0 0 ` +
    `0 0 ${panelTint[2].toFixed(3)} 0 0 ` +
    `0 0 0 1 0`;

  uiState.subscribe((s) => (currentScreen = s.currentScreen));
  gameState.subscribe((s) => (buildings = s.buildings ?? []));

  $: hasResearch = buildings.some((b) => {
    const bDef = gameCoordinator.getBuildingById(b.type);
    return bDef?.category === 'knowledge' && b.status === 'complete';
  });

  // DEBUG tab is only present when launched via dev.sh/launch.sh --debug.
  const DEBUG_ENABLED = import.meta.env.VITE_DEBUG_MODE === 'true';

  const NAV_TABS = [
    { key: 'pawns', label: 'PAWNS', fkey: 'F2' },
    { key: 'work', label: 'WORK', fkey: 'F3' },
    { key: 'building', label: 'BUILDINGS', fkey: 'F4' },
    { key: 'crafting', label: 'CRAFTING', fkey: 'F5' },
    { key: 'exploration', label: 'EXPLORE', fkey: 'F6' },
    { key: 'race', label: 'RACE', fkey: 'F7' },
    { key: 'research', label: 'RESEARCH', fkey: 'F8', needsResearch: true },
    { key: 'entities', label: 'ENTITIES', fkey: 'F9' },
    ...(DEBUG_ENABLED ? [{ key: 'debug', label: 'DEBUG', fkey: 'F10' }] : [])
  ];

  function toggle(key: string) {
    if (key === 'research' && !hasResearch) return;
    uiState.toggleScreen(key as any);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.code === 'Space') {
      e.preventDefault();
      gameState.togglePause();
      return;
    }
    if (e.key === 'Escape') {
      if ($uiState.blueprintBuildingId) {
        uiState.deactivateBlueprint();
      } else if ($uiState.designationActive) {
        uiState.deactivateDesignation(); // restores _screenBeforeDesignation (e.g. 'building')
      } else {
        uiState.setScreen('main');
      }
      return;
    }
    if (e.key?.startsWith('F')) {
      const n = parseInt(e.key.slice(1));
      if (n === 1) {
        e.preventDefault();
        uiState.setScreen('main');
        return;
      }
      if (n >= 2 && n <= 10) {
        e.preventDefault();
        const tab = NAV_TABS[n - 2];
        if (tab) toggle(tab.key);
      }
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<svelte:head>
  <title>Fantasia4x</title>
</svelte:head>

<!-- Ambient day/night colour tint for panels — multiplies each RGB channel.
     Updated reactively each turn; identity matrix (all 1.0) at noon = no change. -->
<svg width="0" height="0" style="position: absolute" aria-hidden="true" focusable="false">
  <filter id="ambient-tint" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values={ambientMatrix} />
  </filter>
</svg>

{#if $storeReady}
  <div class="game-container">
    <div class="game-header">
      <GameControls />
    </div>

    <div class="game-body">
      <aside class="left-panel">
        <ResourceSidebar />
      </aside>

      <main class="main-content">
        <!-- Map is always visible -->
        <div class="map-area">
          <MainScreen />

          <!-- World effects layer: above tiles (z-index 5), below popup panels (z-index 10) -->
          <WorldEffectsLayer />

          <!-- Overlay panel: slides up from bottom, covers 50% of map -->
          {#if currentScreen !== 'main'}
            <div class="overlay-panel">
              {#if currentScreen === 'pawns'}
                <PawnScreen />
              {:else if currentScreen === 'work'}
                <WorkScreen />
              {:else if currentScreen === 'building'}
                <BuildingMenu />
              {:else if currentScreen === 'crafting'}
                <CraftingScreen />
              {:else if currentScreen === 'exploration'}
                <ExplorationScreen />
              {:else if currentScreen === 'race'}
                <RaceScreen />
              {:else if currentScreen === 'research'}
                <ResearchScreen />
              {:else if currentScreen === 'entities'}
                <EntityScreen />
              {:else if currentScreen === 'debug'}
                <DebugLogScreen />
              {/if}
            </div>
          {/if}
        </div>

        <!-- Bottom nav bar -->
        <nav class="bottom-nav">
          {#each NAV_TABS as tab}
            {@const isActive = currentScreen === tab.key}
            {@const disabled = ('needsResearch' in tab ? tab.needsResearch : false) && !hasResearch}
            <button
              class="nav-tab"
              class:active={isActive}
              class:disabled
              on:click={() => toggle(tab.key)}
              {disabled}
              title={disabled ? 'Requires a knowledge building' : tab.fkey}
            >
              {#if isActive}<span class="active-mark">■</span>{/if}{tab.label}
            </button>
          {/each}
        </nav>
      </main>

      <aside class="right-panel">
        <ChroniclePanel />
      </aside>
    </div>
  </div>
{/if}

<!-- Single loading screen: held until BOTH the sim worker is warmed (storeReady) AND the WebGL
     renderer has initialised (rendererReady) — so the game-container mounts and inits WebGL BEHIND
     this overlay, and there's no separate "Initializing renderer…" screen. -->
{#if !$storeReady || !$rendererReady}
  <LoadingScreen />
{/if}

<style>
  .game-container {
    height: 100vh;
    width: 100vw;
    background: var(--bg);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Day/night ambient tint — SVG feColorMatrix multiplies each panel's RGB
     channels by the same hue the map uses (cool blue night, warm dawn/dusk).
     The matrix values are updated reactively from EnvironmentService.panelTint. */
  .game-header,
  .left-panel,
  .right-panel,
  .bottom-nav,
  .overlay-panel {
    filter: url(#ambient-tint);
  }

  .game-header {
    flex-shrink: 0;
  }

  .game-body {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }

  .left-panel {
    flex-shrink: 0;
    width: 180px;
    border-right: 1px solid var(--border);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .main-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* Map fills all available space above the bottom nav */
  .map-area {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  /* Overlay panel: bottom 50% of the map area, semi-transparent so map shows above */
  .overlay-panel {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 50%;
    background: rgba(6, 4, 2, 0.94);
    border-top: 1px solid var(--border-hi);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    z-index: 10;
  }

  /* Bottom navigation bar */
  .bottom-nav {
    flex-shrink: 0;
    height: 30px;
    display: flex;
    align-items: stretch;
    background: var(--bg-panel);
    border-top: 1px solid var(--border-hi);
  }

  .nav-tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    background: transparent;
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
  .nav-tab:last-child {
    border-right: none;
  }
  .nav-tab:hover:not(.disabled) {
    background: var(--bg-hover);
    color: var(--accent-hi);
  }
  .nav-tab.active {
    background: var(--tab-active);
    color: #fff;
    box-shadow: inset 0 2px 0 var(--accent-hi);
  }
  .nav-tab.disabled {
    color: var(--text-muted);
    cursor: not-allowed;
  }

  .active-mark {
    font-size: 7px;
    color: var(--accent-hi);
    opacity: 0.9;
    margin-right: 2px;
  }

  .right-panel {
    flex-shrink: 0;
    width: 220px;
    border-left: 1px solid var(--border);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
