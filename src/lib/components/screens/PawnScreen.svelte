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
  import PawnInventory from '../pawn/PawnInventory.svelte';

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
  <div class="screen-hdr">| PAWNS</div>
  <PawnSelector {pawns} {selectedPawn} onSelect={selectPawn} />

  {#if selectedPawn}
    <div class="pawn-content">
      <PawnOverview pawn={selectedPawn} />
      <PawnStats pawn={selectedPawn} />
      <PawnNeeds pawn={selectedPawn} />
      <PawnTraits pawn={selectedPawn} />
      <PawnAbilities pawn={selectedPawn} gameState={$gameState} />
      <PawnEquipment pawn={selectedPawn} />
      <PawnInventory pawn={selectedPawn} />
    </div>
  {:else}
    <div class="empty">select a pawn to view details</div>
  {/if}
</div>

<style>
  .pawn-screen {
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    display: flex;
    flex-direction: column;
  }

  .screen-hdr {
    padding: 5px 10px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--border-hi);
    flex-shrink: 0;
  }

  .pawn-content {
    display: flex;
    flex-direction: column;
  }

  .empty {
    padding: 20px;
    color: var(--text-muted);
    font-style: italic;
  }
</style>
