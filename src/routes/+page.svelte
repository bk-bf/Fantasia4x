<script lang="ts">
  import '../app.css';
  import MainScreen from '$lib/components/UI/MainScreen.svelte';
  import TradeModal from '$lib/components/UI/trade/TradeModal.svelte';
  import ResourceSidebar from '$lib/components/UI/hud/ResourceSidebar.svelte';
  import HudTopBar from '$lib/components/UI/hud/topbar/HudTopBar.svelte';
  import CustomMapMenu from '$lib/components/UI/menu/CustomMapMenu.svelte';
  import ChroniclePanel from '$lib/components/UI/hud/ChroniclePanel.svelte';
  import WorldEffectsLayer from '$lib/components/UI/canvas/WorldEffectsLayer.svelte';
  import LoadingScreen from '$lib/components/UI/menu/LoadingScreen.svelte';
  import GameOverScreen from '$lib/components/UI/menu/GameOverScreen.svelte';
  import MainMenu from '$lib/components/UI/menu/MainMenu.svelte';
  import EventModalHost from '$lib/components/UI/modal/EventModalHost.svelte';
  import AudioController from '$lib/components/UI/audio/AudioController.svelte';
  import AmbientFilters from '$lib/components/UI/theme/AmbientFilters.svelte';
  import WindowLayer from '$lib/components/UI/window/WindowLayer.svelte';
  import { holdPauseWhileMenuOpen } from '$lib/components/UI/window/pauseWindow';
  import { handleHudKey } from '$lib/components/UI/hud/topbar/hudKeys';
  import { onMount } from 'svelte';
  import { uiState } from '$lib/stores/uiState';
  import {
    hideSidebars,
    debugMode,
    resourcesMinimized,
    chronicleMinimized,
    resourcesHidden,
    chronicleHidden
  } from '$lib/stores/uiPrefs';
  import {
    storeReady,
    bootReveal,
    isGameOver,
    appPhase,
    menuPreviewReady,
    menuPreviewRendered
  } from '$lib/stores/gameState';
  import '$lib/stores/discoveredResources';
  import '$lib/components/UI/theme/applyTheme';
  import { panelAmbient } from '$lib/components/UI/theme/ambientStore';

  const LEFT_COLUMN = 180;
  const RIGHT_COLUMN = 220;
  const MINIMIZED_COLUMN = 26;

  $: customMapOpen = $uiState.customMapOpen;
  $: ambientPanelVars = $panelAmbient.vars;

  const DEBUG_BUILD_FLAG =
    import.meta.env.VITE_DEBUG_MODE === 'true' || import.meta.env.VITE_DEBUG_LOG === 'true';
  $: debugEnabled = DEBUG_BUILD_FLAG || $debugMode;

  $: leftInset = $resourcesHidden ? 0 : $resourcesMinimized ? MINIMIZED_COLUMN : LEFT_COLUMN;
  $: rightInset = $chronicleHidden ? 0 : $chronicleMinimized ? MINIMIZED_COLUMN : RIGHT_COLUMN;
  let flagsUnder = false;

  let menuRevealed = false;
  $: if ($menuPreviewRendered) menuRevealed = true;
  onMount(() => {
    const t = setTimeout(() => (menuRevealed = true), 8000);
    const stopPause = holdPauseWhileMenuOpen();
    return () => {
      clearTimeout(t);
      stopPause();
    };
  });
  $: menuLoading = $appPhase === 'menu' && $menuPreviewReady && !menuRevealed;

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
    if ($bootReveal && $appPhase === 'game') handleHudKey(e, debugEnabled);
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

<AmbientFilters />

{#if $appPhase === 'menu'}
  <MainMenu />
{/if}

{#if menuLoading}
  <LoadingScreen />
{/if}

{#if $appPhase === 'game' && $storeReady}
  <div class="game-container" class:map-locked={customMapOpen}>
    <div class="game-header" style={ambientPanelVars}>
      <HudTopBar
        mapGen={customMapOpen}
        debug={debugEnabled}
        left={leftInset}
        right={rightInset}
        bind:under={flagsUnder}
      />
    </div>

    <div class="game-body" class:sidebars-hidden={$hideSidebars} class:under={flagsUnder}>
      {#if !$resourcesHidden}
        <aside class="left-panel" class:minimized={$resourcesMinimized} style={ambientPanelVars}>
          <ResourceSidebar />
        </aside>
      {/if}

      <main class="main-content">
        <div class="map-area" style:--hud-left-inset="{$hideSidebars ? leftInset : 0}px">
          <MainScreen />

          {#if !customMapOpen}
            <WorldEffectsLayer />
          {/if}
        </div>
      </main>

      {#if !$chronicleHidden}
        <aside class="right-panel" class:minimized={$chronicleMinimized} style={ambientPanelVars}>
          <ChroniclePanel />
        </aside>
      {/if}
    </div>

    {#if $bootReveal && !customMapOpen}
      <WindowLayer left={leftInset} right={rightInset} top={84} />
    {/if}

    {#if customMapOpen && $bootReveal}
      <CustomMapMenu onClose={() => uiState.setCustomMap(false)} />
    {/if}
  </div>
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
    position: relative;
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

  .map-locked .left-panel,
  .map-locked .right-panel {
    display: none;
  }

  .right-panel {
    flex-shrink: 0;
    width: 220px;
    border-left: 1px solid var(--border);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .under .left-panel,
  .under .right-panel {
    padding-top: 44px;
  }

  .sidebars-hidden .left-panel,
  .sidebars-hidden .right-panel {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 6;
    border: none;
    background: transparent;
    pointer-events: none;
  }
  .sidebars-hidden .left-panel {
    left: 0;
    filter: url(#ambient-tint) brightness(1.3);
  }
  .sidebars-hidden .right-panel {
    right: 0;
  }
</style>
