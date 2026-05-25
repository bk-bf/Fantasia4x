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
  import ResourceSidebar from '$lib/components/UI/ResourceSidebar.svelte';
  import GameControls from '$lib/components/UI/GameControls.svelte';
  import ChroniclePanel from '$lib/components/UI/ChroniclePanel.svelte';
  import { uiState } from '$lib/stores/uiState';
  import { gameState } from '$lib/stores/gameState';

  let currentScreen = 'main';
  uiState.subscribe((state) => {
    currentScreen = state.currentScreen;
  });
</script>

<svelte:head>
  <title>Fantasia4x</title>
</svelte:head>

<div class="game-container">
  <div class="game-header">
    <GameControls />
  </div>

  <div class="game-body">
    <aside class="left-panel">
      <ResourceSidebar />
    </aside>

    <main class="main-content">
      {#if currentScreen === 'main'}
        <MainScreen />
      {:else if currentScreen === 'race'}
        <RaceScreen />
      {:else if currentScreen === 'pawns'}
        <PawnScreen />
      {:else if currentScreen === 'building'}
        <BuildingMenu />
      {:else if currentScreen === 'research'}
        <ResearchScreen />
      {:else if currentScreen === 'crafting'}
        <CraftingScreen />
      {:else if currentScreen === 'exploration'}
        <ExplorationScreen />
      {:else if currentScreen === 'work'}
        <WorkScreen />
      {/if}
    </main>

    <aside class="right-panel">
      <ChroniclePanel />
    </aside>
  </div>
</div>

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

  .right-panel {
    flex-shrink: 0;
    width: 220px;
    border-left: 1px solid var(--border);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
