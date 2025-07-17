<!--
  PawnScreen.svelte - Main Pawn Management Interface
  
  This component serves as the main coordinator for viewing and managing individual pawns.
  It handles pawn selection and orchestrates the display of all pawn-related information
  through modular sub-components.
  
  Responsibilities:
  - Pawn selection and navigation logic
  - Game state subscription and updates
  - Component orchestration and layout
  - Main screen navigation (back to map)
  
  All specific pawn functionality (stats, abilities, equipment, etc.) is delegated 
  to specialized components for maintainability and reusability.
-->

<script lang="ts">
  // Core Svelte imports
  import { onMount } from 'svelte';
  import { onDestroy } from 'svelte';

  // Game state and UI imports
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';

  // Type imports
  import type { Pawn } from '$lib/game/core/types';

  // Extracted Pawn components
  import PawnSelector from '../pawn/PawnSelector.svelte';
  import PawnOverview from '../pawn/PawnOverview.svelte';
  import PawnStats from '../pawn/PawnStats.svelte';
  import PawnNeeds from '../pawn/PawnNeeds.svelte';
  import PawnTraits from '../pawn/PawnTraits.svelte';
  import PawnAbilities from '../pawn/PawnAbilities.svelte';
  import PawnEquipment from '../pawn/PawnEquipment.svelte';

  // Component state - only pawn selection and navigation logic
  let pawns: Pawn[] = [];
  let selectedPawn: Pawn | null = null;
  let selectedPawnId: string | null = null;
  let pawnScreenElement: HTMLElement;

  // Game state subscription and automatic pawn management
  const unsubscribe = gameState.subscribe((state) => {
    pawns = state.pawns || [];

    // Update selected pawn when game state changes
    if (selectedPawnId && pawns.length > 0) {
      const updatedPawn = pawns.find((p) => p.id === selectedPawnId);
      if (updatedPawn) {
        selectedPawn = updatedPawn;
      }
    } else if (!selectedPawn && pawns.length > 0) {
      // Auto-select first pawn if none selected
      selectedPawn = pawns[0];
      selectedPawnId = pawns[0].id;
    }
  });

  // Lifecycle management
  onMount(() => {
    if (pawnScreenElement) {
      pawnScreenElement.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  onDestroy(() => {
    unsubscribe();
  });

  // Pawn selection handler
  function selectPawn(pawn: Pawn) {
    selectedPawn = pawn;
    selectedPawnId = pawn.id;
  }
</script>

<div class="pawn-screen" bind:this={pawnScreenElement}>
  <!-- Header: Navigation and Pawn Selection -->
  <div class="pawn-header">
    <button class="back-btn" on:click={() => uiState.setScreen('main')}>← Back to Map</button>
    <h2>👥 Your People</h2>
    <p class="pawn-subtitle">Individual colonists and their traits</p>

    <!-- Pawn Selection Component -->
    <PawnSelector {pawns} {selectedPawn} onSelect={selectPawn} />
  </div>

  <!-- Main Content: All Pawn Details -->
  {#if selectedPawn}
    <div class="pawn-content">
      <!-- Basic Information -->
      <PawnOverview pawn={selectedPawn} />

      <!-- Core Statistics -->
      <PawnStats pawn={selectedPawn} />

      <!-- Current Needs and Activities -->
      <PawnNeeds pawn={selectedPawn} />

      <!-- Racial Heritage -->
      <PawnTraits pawn={selectedPawn} />

      <!-- Skills and Abilities -->
      <PawnAbilities pawn={selectedPawn} gameState={$gameState} />

      <!-- Equipment and Inventory -->
      <PawnEquipment pawn={selectedPawn} />
    </div>
  {:else}
    <!-- Empty State -->
    <div class="no-pawn-selected">
      <p>Select a pawn to view their details.</p>
    </div>
  {/if}
</div>

<style>
  /* Main Layout - Keep Only Core Styles */
  .pawn-screen {
    padding: 20px;
    background: #000000;
    color: #e0e0e0;
    font-family: 'Courier New', monospace;
    flex: 1;
    overflow-y: auto;
    box-sizing: border-box;
    padding-bottom: 40px;
  }

  /* Header Section */
  .pawn-header {
    text-align: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #4caf50;
    position: relative;
  }

  .pawn-header h2 {
    color: #4caf50;
    margin: 0 0 10px 0;
    font-size: 2em;
    text-shadow: 0 0 10px rgba(76, 175, 80, 0.3);
  }

  .pawn-subtitle {
    color: #888;
    margin: 0 0 20px 0;
    font-style: italic;
  }

  .back-btn {
    position: absolute;
    top: 0;
    right: 0;
    padding: 8px 16px;
    background: #000000;
    border: 1px solid #4caf50;
    color: #4caf50;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
  }

  .back-btn:hover {
    background: #4caf50;
    color: #000;
  }

  /* Content Layout */
  .pawn-content {
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  /* General States */
  .no-pawn-selected {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 60px;
    text-align: center;
    color: #888;
    border: 2px dashed #333;
    margin-top: 50px;
    font-style: italic;
  }

  /* Scrollbar */
  .pawn-screen::-webkit-scrollbar {
    width: 8px;
  }

  .pawn-screen::-webkit-scrollbar-track {
    background: #000000;
  }

  .pawn-screen::-webkit-scrollbar-thumb {
    background: #4caf50;
    border-radius: 4px;
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .pawn-screen {
      padding: 15px;
    }

    .back-btn {
      position: static;
      margin-bottom: 15px;
    }
  }
</style>
