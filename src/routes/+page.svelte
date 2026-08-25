<script lang="ts">
  import '../app.css';
  import MainScreen from '$lib/components/UI/MainScreen.svelte';
  import CultureScreen from '$lib/components/screens/CultureScreen.svelte';
  import KingdomScreen from '$lib/components/screens/KingdomScreen.svelte';
  import TradeModal from '$lib/components/UI/trade/TradeModal.svelte';
  import PawnScreen from '$lib/components/screens/PawnScreen.svelte';
  import BuildingMenu from '$lib/components/screens/BuildingMenu.svelte';
  import ResearchScreen from '$lib/components/screens/ResearchScreen.svelte';
  import CraftingScreen from '$lib/components/screens/CraftingScreen.svelte';
  import ExplorationScreen from '$lib/components/screens/ExplorationScreen.svelte';
  import WorkScreen from '$lib/components/screens/WorkScreen.svelte';
  import EntityScreen from '$lib/components/screens/EntityScreen.svelte';
  import DebugScreen from '$lib/components/screens/DebugScreen.svelte';
  import ResourceSidebar from '$lib/components/UI/hud/ResourceSidebar.svelte';
  import GameControls from '$lib/components/UI/hud/GameControls.svelte';
  import CustomMapMenu from '$lib/components/UI/menu/CustomMapMenu.svelte';
  import ChroniclePanel from '$lib/components/UI/hud/ChroniclePanel.svelte';
  import WorldEffectsLayer from '$lib/components/UI/canvas/WorldEffectsLayer.svelte';
  import LoadingScreen from '$lib/components/UI/menu/LoadingScreen.svelte';
  import GameOverScreen from '$lib/components/UI/menu/GameOverScreen.svelte';
  import MainMenu from '$lib/components/UI/menu/MainMenu.svelte';
  import PauseMenu from '$lib/components/UI/menu/PauseMenu.svelte';
  import EventModalHost from '$lib/components/UI/modal/EventModalHost.svelte';
  import AudioController from '$lib/components/UI/audio/AudioController.svelte';
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import { autohideScroll } from '$lib/actions/autohideScroll';
  import { uiState } from '$lib/stores/uiState';
  import {
    hideSidebars,
    debugMode,
    dayNightTint,
    resourcesMinimized,
    chronicleMinimized
  } from '$lib/stores/uiPrefs';
  import {
    gameState,
    storeReady,
    bootReveal,
    isGameOver,
    appPhase,
    menuPreviewReady,
    menuPreviewRendered
  } from '$lib/stores/gameState';
  import '$lib/stores/discoveredResources';
  import { gameCoordinator } from '$lib/game/systems/GameCoordinator';
  import {
    environmentService,
    effectivePanelSaturation
  } from '$lib/game/services/EnvironmentService.js';
  import type { PlacedBuilding } from '$lib/game/core/types';

  let currentScreen = 'main';
  let buildings: PlacedBuilding[] = [];

  $: ambient = environmentService.getAmbient(environmentService.ambientTurn($gameState));
  $: panelTint = ambient.panelTint;

  $: panelSaturation = bleakSaturation(
    effectivePanelSaturation(environmentService.effectiveSeason($gameState), $gameState.weather),
    ambient.light
  );
  const IDENTITY_MATRIX = '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0';
  $: ambientMatrix = $dayNightTint ? buildPanelMatrix(panelTint, panelSaturation) : IDENTITY_MATRIX;

  const LUMA: [number, number, number] = [0.2126, 0.7152, 0.0722];

  $: legibleTint = ((): [number, number, number] => {
    const l = LUMA[0] * panelTint[0] + LUMA[1] * panelTint[1] + LUMA[2] * panelTint[2];
    const k = l > 1e-4 ? 1 / l : 1;
    return [panelTint[0] * k, panelTint[1] * k, panelTint[2] * k];
  })();
  $: ambientLegibleMatrix = $dayNightTint ? buildPanelMatrix(legibleTint, 1) : IDENTITY_MATRIX;

  const NIGHT_BLEAK = 0.25;
  const NIGHT_SAT_FLOOR = 0.6;
  function bleakSaturation(baseSat: number, light: number): number {
    const extra = (1 - baseSat) * (1 - light) * NIGHT_BLEAK;
    return Math.max(Math.min(baseSat, NIGHT_SAT_FLOOR), baseSat - extra);
  }

  function buildPanelMatrix(tint: [number, number, number], s: number): string {
    const lr = 0.2126;
    const lg = 0.7152;
    const lb = 0.0722;
    const [tr, tg, tb] = tint;
    const wash = (1 - s) * 0.08;
    const f = (n: number) => n.toFixed(4);
    return (
      `${f(tr * ((1 - s) * lr + s))} ${f(tr * (1 - s) * lg)} ${f(tr * (1 - s) * lb)} 0 ${f(wash)} ` +
      `${f(tg * (1 - s) * lr)} ${f(tg * ((1 - s) * lg + s))} ${f(tg * (1 - s) * lb)} 0 ${f(wash)} ` +
      `${f(tb * (1 - s) * lr)} ${f(tb * (1 - s) * lg)} ${f(tb * ((1 - s) * lb + s))} 0 ${f(wash)} ` +
      `0 0 0 1 0`
    );
  }

  const BG_TOKENS: Record<string, string> = {
    '--bg': '#0d0b07',
    '--bg-panel': '#150f08',
    '--bg-hover': '#201808',
    '--bg-active': '#2c1e0a',
    '--border': '#4a3818',
    '--border-hi': '#7a5e28',
    '--tab-active': '#c04818'
  };
  const FONT_TOKENS: Record<string, string> = {
    '--text': '#d4a840',
    '--text-dim': '#b09030',
    '--text-muted': '#7a5c20',
    '--accent': '#c84818',
    '--accent-hi': '#f08828',
    '--pos': '#68b030',
    '--neg': '#c83018'
  };

  function tintRGB(
    hex: string,
    tint: [number, number, number],
    s: number
  ): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const [lr, lg, lb] = LUMA;
    const [tr, tg, tb] = tint;
    const wash = (1 - s) * 0.08;
    return [
      tr * (((1 - s) * lr + s) * r + (1 - s) * lg * g + (1 - s) * lb * b) + wash,
      tg * ((1 - s) * lr * r + ((1 - s) * lg + s) * g + (1 - s) * lb * b) + wash,
      tb * ((1 - s) * lr * r + (1 - s) * lg * g + ((1 - s) * lb + s) * b) + wash
    ];
  }
  const toHex = ([r, g, b]: [number, number, number]): string => {
    const h = (n: number) =>
      Math.max(0, Math.min(255, Math.round(n * 255)))
        .toString(16)
        .padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
  };

  function tintTo(hex: string, tint: [number, number, number], s: number): string {
    return toHex(tintRGB(hex, tint, s));
  }

  $: ambientPanelVars = [
    ...Object.entries(BG_TOKENS).map(
      ([k, v]) => `${k}: ${$dayNightTint ? tintTo(v, panelTint, panelSaturation) : v}`
    ),
    ...Object.entries(FONT_TOKENS).map(
      ([k, v]) => `${k}: ${$dayNightTint ? tintTo(v, legibleTint, 1) : v}`
    )
  ].join('; ');

  let customMapOpen = false;
  uiState.subscribe((s) => {
    currentScreen = s.currentScreen;
    customMapOpen = s.customMapOpen;
  });
  gameState.subscribe((s) => (buildings = s.buildings ?? []));

  $: hasResearch = buildings.some((b) => {
    const bDef = gameCoordinator.getBuildingById(b.type);
    return bDef?.category === 'knowledge' && b.status === 'complete';
  });

  const DEBUG_BUILD_FLAG =
    import.meta.env.VITE_DEBUG_MODE === 'true' || import.meta.env.VITE_DEBUG_LOG === 'true';
  $: debugEnabled = DEBUG_BUILD_FLAG || $debugMode;

  $: NAV_TABS = [
    { key: 'pawns', label: 'PAWNS', fkey: 'F2' },
    { key: 'work', label: 'WORK', fkey: 'F3' },
    { key: 'building', label: 'BUILDINGS', fkey: 'F4' },
    { key: 'crafting', label: 'CRAFTING', fkey: 'F5' },
    { key: 'exploration', label: 'EXPLORE', fkey: 'F6' },
    { key: 'culture', label: 'CULTURE', fkey: 'F7' },
    { key: 'kingdoms', label: 'KINGDOMS', fkey: 'F8' },
    { key: 'research', label: 'RESEARCH', fkey: 'F9', needsResearch: true },
    { key: 'entities', label: 'ENTITIES', fkey: 'F10' },
    ...(debugEnabled ? [{ key: 'debug', label: 'DEBUG', fkey: 'F11' }] : [])
  ];

  function toggle(key: string) {
    if (key === 'research' && !hasResearch) return;
    uiState.toggleScreen(key as any);
  }

  let menuRevealed = false;
  $: if ($menuPreviewRendered) menuRevealed = true;
  onMount(() => {
    const t = setTimeout(() => (menuRevealed = true), 8000);
    return () => clearTimeout(t);
  });
  $: menuLoading = $appPhase === 'menu' && $menuPreviewReady && !menuRevealed;

  let pauseMenuOpen = false;
  let wasPausedBeforeMenu = false;

  function openPauseMenu() {
    wasPausedBeforeMenu = get(gameState.isPaused);
    if (!wasPausedBeforeMenu) gameState.pauseGame();
    pauseMenuOpen = true;
  }
  function closePauseMenu() {
    pauseMenuOpen = false;
    if (!wasPausedBeforeMenu) gameState.unpauseGame();
  }

  function blockContextMenu(e: Event) {
    e.preventDefault();
  }
  function blockDragNav(e: DragEvent) {
    e.preventDefault();
  }
  function blockZoom(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  }
  function blockLinkNav(e: MouseEvent) {
    const a = (e.target as Element | null)?.closest?.('a[href]');
    if (a) e.preventDefault();
  }
  function stripNativeTooltip(e: MouseEvent) {
    const el = (e.target as Element | null)?.closest?.('[title]');
    const title = el?.getAttribute('title');
    if (el && title) {
      el.setAttribute('data-title', title);
      el.removeAttribute('title');
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!$bootReveal) return;
    if (pauseMenuOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePauseMenu();
      }
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      gameState.togglePause();
      return;
    }
    if (e.key === 'Escape') {
      if ($uiState.blueprintBuildingId) {
        uiState.deactivateBlueprint();
      } else if ($uiState.designationActive) {
        uiState.deactivateDesignation();
      } else if (currentScreen !== 'main') {
        uiState.setScreen('main');
      } else if (
        $uiState.selectedPawnId ||
        $uiState.selectedMobId ||
        $uiState.cameraFollowPawnId ||
        $uiState.cameraFollowMobId
      ) {
        uiState.selectPawn(null);
        uiState.selectMob(null);
        uiState.setFollowPawn(null);
        uiState.setFollowMob(null);
      } else {
        openPauseMenu();
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
      if (n >= 2 && n <= 11) {
        e.preventDefault();
        const tab = NAV_TABS[n - 2];
        if (tab) toggle(tab.key);
      }
    }
  }
</script>

<svelte:window
  on:keydown={handleKeydown}
  on:contextmenu={blockContextMenu}
  on:dragover={blockDragNav}
  on:drop={blockDragNav}
  on:wheel|nonpassive={blockZoom}
  on:click|capture={blockLinkNav}
  on:auxclick|capture={blockLinkNav}
  on:mouseover|capture={stripNativeTooltip}
/>

<svelte:head>
  <title>Fantasia4x</title>
</svelte:head>

<AudioController
  isMenu={$appPhase === 'menu'}
  playing={$appPhase === 'game' && $bootReveal && !$uiState.customMapOpen}
/>

<svg width="0" height="0" style="position: absolute" aria-hidden="true" focusable="false">
  <filter id="ambient-tint" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values={ambientMatrix} />
  </filter>

  <filter id="ambient-tint-legible" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values={ambientLegibleMatrix} />
  </filter>
</svg>

{#if $appPhase === 'menu'}
  <MainMenu />
{/if}

{#if menuLoading}
  <LoadingScreen />
{/if}

{#if $appPhase === 'game' && $storeReady}
  <div class="game-container" class:map-locked={customMapOpen}>
    <div class="game-header" style={ambientPanelVars}>
      <GameControls mapGen={customMapOpen} />
    </div>

    <div class="game-body" class:sidebars-hidden={$hideSidebars}>
      <aside class="left-panel" class:minimized={$resourcesMinimized} style={ambientPanelVars}>
        <ResourceSidebar />
      </aside>

      <main class="main-content">
        <div class="map-area">
          <MainScreen />

          {#if !customMapOpen}
            <WorldEffectsLayer />
          {/if}

          {#if currentScreen !== 'main'}
            <div class="overlay-panel" use:autohideScroll style={ambientPanelVars}>
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
              {:else if currentScreen === 'culture'}
                <CultureScreen />
              {:else if currentScreen === 'kingdoms'}
                <KingdomScreen />
              {:else if currentScreen === 'research'}
                <ResearchScreen />
              {:else if currentScreen === 'entities'}
                <EntityScreen />
              {:else if currentScreen === 'debug'}
                <DebugScreen />
              {/if}
            </div>
          {/if}
        </div>

        <nav class="bottom-nav" style={ambientPanelVars}>
          {#each NAV_TABS as tab}
            {@const isActive = currentScreen === tab.key}
            {@const disabled = ('needsResearch' in tab ? tab.needsResearch : false) && !hasResearch}
            <button
              class="nav-tab"
              class:active={isActive}
              class:disabled
              on:click={() => toggle(tab.key)}
              {disabled}
              title={disabled ? 'Requires a knowledge building' : tab.fkey}>{tab.label}</button
            >
          {/each}
        </nav>
      </main>

      <aside class="right-panel" class:minimized={$chronicleMinimized} style={ambientPanelVars}>
        <ChroniclePanel />
      </aside>
    </div>

    {#if customMapOpen && $bootReveal}
      <CustomMapMenu onClose={() => uiState.setCustomMap(false)} />
    {/if}
  </div>
{/if}

{#if $appPhase === 'game' && pauseMenuOpen}
  <PauseMenu onResume={closePauseMenu} />
{/if}

{#if $appPhase === 'game' && $bootReveal}
  <EventModalHost />
{/if}

{#if $appPhase === 'game' && $bootReveal}
  <TradeModal />
{/if}

{#if $appPhase === 'game' && !$bootReveal}
  <LoadingScreen />
{/if}

{#if $appPhase === 'game' && $bootReveal && $isGameOver}
  <GameOverScreen />
{/if}

<style>
  .game-container {
    height: 100vh;
    width: 100vw;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .game-header {
    flex-shrink: 0;
    position: relative;
    z-index: 50;
  }

  .game-body {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
    position: relative;
  }

  .left-panel {
    flex-shrink: 0;
    width: 180px;
    border-right: 1px solid var(--border);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .left-panel.minimized,
  .right-panel.minimized {
    width: 26px;
  }

  .main-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .map-area {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  .map-locked .bottom-nav,
  .map-locked .left-panel,
  .map-locked .right-panel {
    display: none;
  }

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

  .bottom-nav {
    flex-shrink: 0;
    height: 30px;
    display: flex;
    align-items: stretch;
    overflow-x: auto;
    overflow-y: hidden;
    background: var(--bg-panel);
    border-top: 1px solid var(--border-hi);
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .bottom-nav::-webkit-scrollbar {
    display: none;
  }

  .nav-tab {
    flex: 1 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 14px;
    background: transparent;
    border: none;
    border-right: 1px solid var(--border);
    color: var(--text);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 12px;
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
  }

  .right-panel {
    flex-shrink: 0;
    width: 220px;
    border-left: 1px solid var(--border);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .sidebars-hidden .left-panel,
  .sidebars-hidden .right-panel {
    position: absolute;
    top: 0;
    bottom: 30px;
    z-index: 6;
    border: none;
    background: transparent;
    filter: url(#ambient-tint) brightness(1.3);
    pointer-events: none;
  }
  .sidebars-hidden .left-panel {
    left: 0;
  }
  .sidebars-hidden .right-panel {
    right: 0;
  }
</style>
