<!-- src/routes/+page.svelte -->
<script lang="ts">
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
  import { uiState } from '$lib/stores/uiState';
  import { gameState } from '$lib/stores/gameState';
  import { onMount } from 'svelte';

  onMount(() => {
    console.log('Fantasia4x initialized with left sidebar');
  });

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
    <div class="sidebar-container">
      <ResourceSidebar />
    </div>

    <div class="main-content">
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
    </div>
  </div>
</div>

<style>
  .game-container {
    height: 100vh;
    width: 100vw;
    background: #000000;
    color: #e0e0e0;
    font-family: 'Courier New', monospace;
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    border: 0;
    overflow: hidden;
  }

  .game-header {
    flex-shrink: 0;
    border-bottom: 2px solid #4caf50;
  }

  .game-body {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .sidebar-container {
    flex-shrink: 0;
    width: 350px;
    background: #000000;
    border-right: 2px solid #4caf50;
    overflow-y: auto;
  }

  .main-content {
    flex: 1;
    overflow: hidden;
    background: #000000;
    display: flex; /* Add this */
    flex-direction: column; /* Add this */
  }

  /* Ensure no margins or borders anywhere */
  * {
    box-sizing: border-box;
  }
</style>
