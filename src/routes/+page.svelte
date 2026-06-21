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
  import DebugScreen from '$lib/components/screens/DebugScreen.svelte';
  import ResourceSidebar from '$lib/components/UI/ResourceSidebar.svelte';
  import GameControls from '$lib/components/UI/GameControls.svelte';
  import CustomMapMenu from '$lib/components/UI/CustomMapMenu.svelte';
  import ChroniclePanel from '$lib/components/UI/ChroniclePanel.svelte';
  import WorldEffectsLayer from '$lib/components/UI/WorldEffectsLayer.svelte';
  import LoadingScreen from '$lib/components/UI/LoadingScreen.svelte';
  import GameOverScreen from '$lib/components/UI/GameOverScreen.svelte';
  import MainMenu from '$lib/components/UI/MainMenu.svelte';
  import PauseMenu from '$lib/components/UI/PauseMenu.svelte';
  import { get } from 'svelte/store';
  import { autohideScroll } from '$lib/actions/autohideScroll';
  import { uiState } from '$lib/stores/uiState';
  import { hideSidebars, debugMode } from '$lib/stores/uiPrefs';
  import { gameState, storeReady, bootReveal, isGameOver, appPhase } from '$lib/stores/gameState';
  // Side-effect import: starts the EXPLORE tab's background resource-ledger cache from game start, so
  // opening the tab reads a ready list instead of scanning the whole map on the click path.
  import '$lib/stores/discoveredResources';
  import { gameCoordinator } from '$lib/game/systems/GameCoordinator';
  import {
    environmentService,
    effectivePanelSaturation
  } from '$lib/game/services/EnvironmentService.js';
  import type { PlacedBuilding } from '$lib/game/core/types';

  let currentScreen = 'main';
  let buildings: PlacedBuilding[] = [];

  // Ambient panel tint — updated reactively on every turn via the gameState store.
  // panelTint is a per-channel RGB multiplier fed into an SVG feColorMatrix so panels are tinted by
  // exactly the same hue as the map (no pink hue-rotate bug). Weather then DESATURATES the panels —
  // fog drains the colour most (`panelSaturation` in weather.jsonc) for a bleak, washed-out feel.
  $: ambient = environmentService.getAmbient(environmentService.ambientTurn($gameState));
  $: panelTint = ambient.panelTint;

  $: panelSaturation = bleakSaturation(
    effectivePanelSaturation(environmentService.effectiveSeason($gameState), $gameState.weather),
    ambient.light
  );
  $: ambientMatrix = buildPanelMatrix(panelTint, panelSaturation);

  // Low light deepens the bleakness of already-bleak weather. The extra desaturation is weighted by
  // how washed-out the weather already is (1 - baseSat), so clear skies stay untouched and FOG drains
  // hardest, and by darkness (1 - light), so dawn/dusk/night look bleaker than midday under fog.
  // Night exception: now that all of winter + every weather event is bleak by day, piling the full
  // night deepening on top made nights too grey — so it's gentle (NIGHT_BLEAK) and floored
  // (NIGHT_SAT_FLOOR) so panels keep some colour after dark.
  const NIGHT_BLEAK = 0.25;
  const NIGHT_SAT_FLOOR = 0.6;
  function bleakSaturation(baseSat: number, light: number): number {
    const extra = (1 - baseSat) * (1 - light) * NIGHT_BLEAK;
    return Math.max(Math.min(baseSat, NIGHT_SAT_FLOOR), baseSat - extra);
  }

  /**
   * Compose the panel feColorMatrix from the day/night RGB tint and the weather saturation: desaturate
   * by `s` (luminance-weighted) and lift slightly toward grey as it drops, then scale each output row
   * by the tint channel. At s=1 this is exactly the old diagonal tint matrix.
   */
  function buildPanelMatrix(tint: [number, number, number], s: number): string {
    const lr = 0.2126;
    const lg = 0.7152;
    const lb = 0.0722;
    const [tr, tg, tb] = tint;
    const wash = (1 - s) * 0.08; // faded grey lift — more as colour drains
    const f = (n: number) => n.toFixed(4);
    return (
      `${f(tr * ((1 - s) * lr + s))} ${f(tr * (1 - s) * lg)} ${f(tr * (1 - s) * lb)} 0 ${f(wash)} ` +
      `${f(tg * (1 - s) * lr)} ${f(tg * ((1 - s) * lg + s))} ${f(tg * (1 - s) * lb)} 0 ${f(wash)} ` +
      `${f(tb * (1 - s) * lr)} ${f(tb * (1 - s) * lg)} ${f(tb * ((1 - s) * lb + s))} 0 ${f(wash)} ` +
      `0 0 0 1 0`
    );
  }

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

  // DEBUG (log) tab is present under the build flags --debug (VITE_DEBUG_MODE) / --log
  // (VITE_DEBUG_LOG), OR at runtime when the player enables Debug mode in Settings ($debugMode).
  const DEBUG_BUILD_FLAG =
    import.meta.env.VITE_DEBUG_MODE === 'true' || import.meta.env.VITE_DEBUG_LOG === 'true';
  $: debugEnabled = DEBUG_BUILD_FLAG || $debugMode;

  $: NAV_TABS = [
    { key: 'pawns', label: 'PAWNS', fkey: 'F2' },
    { key: 'work', label: 'WORK', fkey: 'F3' },
    { key: 'building', label: 'BUILDINGS', fkey: 'F4' },
    { key: 'crafting', label: 'CRAFTING', fkey: 'F5' },
    { key: 'exploration', label: 'EXPLORE', fkey: 'F6' },
    { key: 'race', label: 'RACE', fkey: 'F7' },
    { key: 'research', label: 'RESEARCH', fkey: 'F8', needsResearch: true },
    { key: 'entities', label: 'ENTITIES', fkey: 'F9' },
    ...(debugEnabled ? [{ key: 'debug', label: 'DEBUG', fkey: 'F10' }] : [])
  ];

  function toggle(key: string) {
    if (key === 'research' && !hasResearch) return;
    uiState.toggleScreen(key as any);
  }

  // ===== PAUSE / ESCAPE MENU =====
  let pauseMenuOpen = false;
  let wasPausedBeforeMenu = false;

  function openPauseMenu() {
    // Pause while the menu is up; restore the player's prior pause state on resume.
    wasPausedBeforeMenu = get(gameState.isPaused);
    if (!wasPausedBeforeMenu) gameState.pauseGame();
    pauseMenuOpen = true;
  }
  function closePauseMenu() {
    pauseMenuOpen = false;
    if (!wasPausedBeforeMenu) gameState.unpauseGame();
  }

  // ===== APP HARDENING (browser + Electron) =====
  // Suppress the browser-chrome behaviours that leak into a game window: the right-click context
  // menu, accidental file drag-drop navigation, and ctrl/⌘+wheel pinch-zoom. Text selection itself
  // is killed in app.css (user-select: none, re-enabled on inputs).
  function blockContextMenu(e: Event) {
    e.preventDefault();
  }
  function blockDragNav(e: DragEvent) {
    e.preventDefault();
  }
  function blockZoom(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  }

  function handleKeydown(e: KeyboardEvent) {
    // Ignore ALL keyboard input while the loading overlay is up — otherwise Space would toggle pause
    // (unpausing the game behind the overlay), defeating the paused-warmup reveal hack.
    if (!$bootReveal) return;
    // While the pause menu is up, swallow everything but ESC (which resumes) so Space/F-keys can't
    // act on the game behind it.
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
      // First ESC cancels the active in-world action / closes an open panel; ESC on the bare map
      // opens the pause menu.
      if ($uiState.blueprintBuildingId) {
        uiState.deactivateBlueprint();
      } else if ($uiState.designationActive) {
        uiState.deactivateDesignation(); // restores _screenBeforeDesignation (e.g. 'building')
      } else if (currentScreen !== 'main') {
        uiState.setScreen('main');
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
      if (n >= 2 && n <= 10) {
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
/>

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

{#if $appPhase === 'menu'}
  <MainMenu />
{/if}

{#if $appPhase === 'game' && $storeReady}
  <div class="game-container" class:map-locked={customMapOpen}>
    <div class="game-header">
      <GameControls />
    </div>

    <div class="game-body" class:sidebars-hidden={$hideSidebars}>
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
            <div class="overlay-panel" use:autohideScroll>
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
                <DebugScreen />
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
            >{tab.label}</button>
          {/each}
        </nav>
      </main>

      <aside class="right-panel">
        <ChroniclePanel />
      </aside>
    </div>

    <!-- Custom Map popup — rendered at the container root (NOT inside the filtered .game-header) so
         its position:fixed escapes that stacking trap and floats above the WebGL canvas. Gated on
         `bootReveal` so the New Game → Custom Map open doesn't paint over the loading overlay during
         the storeReady→reveal warmup window (the popup is fixed-position and would float above it). -->
    {#if customMapOpen && $bootReveal}
      <CustomMapMenu onClose={() => uiState.setCustomMap(false)} />
    {/if}
  </div>
{/if}

<!-- Single loading overlay: the game-container mounts at storeReady and inits WebGL BEHIND this
     overlay (no separate "Initializing renderer…" screen). The overlay is dropped by `bootReveal`,
     which fires a paused warmup beat AFTER the renderer is up — hiding the worker-boot/WebGL-init GC.
     Keyboard input is gated on the same flag (handleKeydown) so Space can't unpause behind it. -->
{#if $appPhase === 'game' && pauseMenuOpen}
  <PauseMenu onResume={closePauseMenu} />
{/if}

{#if $appPhase === 'game' && !$bootReveal}
  <LoadingScreen />
{/if}

<!-- Permadeath: once the colony is wiped (empty roster), the run is over. Gated on the game phase +
     bootReveal so the empty PRE-game roster on the main menu (and any mid-boot transient empty state)
     can't flash it before a real colony exists. -->
{#if $appPhase === 'game' && $bootReveal && $isGameOver}
  <GameOverScreen />
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
    /* Stack above the game body so the settings dropdown (which overflows the 26px header) paints
       over the WebGL canvas instead of behind it. */
    position: relative;
    z-index: 50;
  }

  .game-body {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
    /* Positioning context for the sidebars when they float (see .sidebars-hidden). */
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

  /* Custom Map popup is up (New Game / world shaping): remove the bottom nav entirely so it can't be
     used behind the popup. Pan + zoom on the map stay LIVE so the player can inspect the terrain
     being shaped; only hover tooltips and click-selection are suppressed — that's handled inside
     GameCanvas (it reads uiState.customMapOpen), so the canvas keeps its own drag/wheel handlers. */
  .map-locked .bottom-nav {
    display: none;
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


  .right-panel {
    flex-shrink: 0;
    width: 220px;
    border-left: 1px solid var(--border);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* "Hide sidebars" view toggle (top-bar settings → uiPrefs.hideSidebars).
     The sidebars stay mounted but go transparent and out of flow — floating over the map at their
     original edges — so .main-content (and with it the bottom nav + overlay panel) reflows to fill
     the full viewport width, and the overlay panel left-aligns to the viewport edge.

     Stacking/geometry: z-index 6 keeps them above the map/world-effects but below the overlay info
     panel (z-index 10, hoisted out of the static .main-content), which can cover them. They stop at
     `bottom: 30px` — the bottom-nav height — so they never overlap the nav, keeping the edge tabs
     (PAWNS far-left, DEBUG far-right) clickable.

     Legibility: keep the ambient tint so the text holds the same warm day/night/weather hue as the
     map, but lift brightness so the orange pops against the colourful scene at all hours. The crisp
     white outline + drop shadow that make it readable live in the panel components. */
  .sidebars-hidden .left-panel,
  .sidebars-hidden .right-panel {
    position: absolute;
    top: 0;
    bottom: 30px;
    z-index: 6;
    border: none;
    background: transparent;
    filter: url(#ambient-tint) brightness(1.3);
    /* The floating aside box itself is click-through so its empty regions let clicks + hover reach
       the tiles + condition/yield tooltips beneath. The actual content rows/entries re-enable
       pointer-events (in the panel components) so they stay hoverable. The font sits above the map
       (z 6); the info panel (overlay z 10 / hover cards z 998) and the bottom nav stay above it. */
    pointer-events: none;
  }
  .sidebars-hidden .left-panel {
    left: 0;
  }
  .sidebars-hidden .right-panel {
    right: 0;
  }
</style>
