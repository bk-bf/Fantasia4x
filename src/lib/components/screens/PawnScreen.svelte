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
  import { onMount, onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';

  // Game state and UI imports
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';

  // Type imports
  import type { Pawn } from '$lib/game/core/types';

  // Extracted Pawn components
  import PawnSelector from '../pawn/PawnSelector.svelte';
  import PawnOverview from '../pawn/PawnOverview.svelte';
  import PawnHealth from '../pawn/PawnHealth.svelte';
  import PawnAttributes from '../pawn/PawnAttributes.svelte';
  import PawnNeeds from '../pawn/PawnNeeds.svelte';
  import PawnTraits from '../pawn/PawnTraits.svelte';
  import PawnEquipment from '../pawn/PawnEquipment.svelte';
  import PawnInventory from '../pawn/PawnInventory.svelte';
  import FollowButton from '../UI/FollowButton.svelte';

  // Component state - only pawn selection and navigation logic
  let pawns: Pawn[] = [];
  let selectedPawn: Pawn | null = null;
  // Seed from the current uiState selection so opening this screen via VIEW/GEAR shows
  // the pawn that was clicked. Without this seed the gameState subscription (which fires
  // first on mount) would see a null id, auto-select pawns[0], and clobber the real
  // selection — which is why it always opened the first pawn.
  let selectedPawnId: string | null = get(uiState).selectedPawnId;
  let pawnScreenElement: HTMLElement;

  // Tab state. Declared BEFORE the store subscriptions below: a Svelte store emits
  // its current value synchronously on subscribe, and the uiState callback assigns
  // `activeTab` — if it were declared later it would be in its temporal dead zone
  // and navigating in with a tab set (e.g. the GEAR button) would throw.
  type PawnTab = 'status' | 'attributes' | 'gear';
  let activeTab: PawnTab = 'status';

  const TABS: { id: PawnTab; label: string }[] = [
    { id: 'status', label: 'STATUS' },
    { id: 'attributes', label: 'ATTRIBUTES' },
    { id: 'gear', label: 'GEAR' }
  ];

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
      uiState.selectPawn(pawns[0].id);
    }
  });

  // Sync selection and active tab when navigating here from the map canvas (VIEW/GEAR buttons)
  const unsubscribeUI = uiState.subscribe((ui) => {
    if (ui.selectedPawnId && ui.selectedPawnId !== selectedPawnId) {
      selectedPawnId = ui.selectedPawnId;
      const pawn = pawns.find((p) => p.id === ui.selectedPawnId);
      if (pawn) selectedPawn = pawn;
    }
    if (ui.pawnScreenTab) {
      const tab = ui.pawnScreenTab;
      activeTab = tab;
      // Defer the clear to avoid calling store.update() inside a subscriber callback,
      // which would synchronously re-invoke all subscribers and cause cascading updates.
      tick().then(() => uiState.setPawnTab(null));
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
    unsubscribeUI();
  });

  // Pawn selection handler
  function selectPawn(pawn: Pawn) {
    selectedPawn = pawn;
    selectedPawnId = pawn.id;
    uiState.selectPawn(pawn.id);
    if (pawn.position) {
      uiState.focusMapOn(pawn.position.x, pawn.position.y);
    }
  }

</script>

<div class="pawn-screen" bind:this={pawnScreenElement}>
  <div class="screen-hdr">
    <span>| PAWNS</span>
    {#if selectedPawn}
      <FollowButton
        isActive={$uiState.cameraFollowPawnId === selectedPawn.id}
        onToggle={() => {
          const isFollowing = $uiState.cameraFollowPawnId === selectedPawn?.id;
          uiState.setFollowPawn(isFollowing ? null : (selectedPawn?.id ?? null));
        }}
      />
    {/if}
  </div>

  <!-- Section tabs — which info panel to show -->
  <nav class="pawn-tabs">
    {#each TABS as tab}
      <button
        class="pawn-tab"
        class:active={activeTab === tab.id}
        on:click={() => (activeTab = tab.id)}>{tab.label}</button
      >
    {/each}
  </nav>

  <!-- Pawn selector — which pawn to inspect -->
  <PawnSelector {pawns} {selectedPawn} onSelect={selectPawn} />

  {#if selectedPawn}
    <!-- Tab panels — only the active one is rendered -->
    <div class="pawn-content">
      {#if activeTab === 'status'}
        <PawnOverview pawn={selectedPawn} gameState={$gameState} />
        <PawnHealth pawn={selectedPawn} />
        <PawnNeeds pawn={selectedPawn} />
        <PawnTraits pawn={selectedPawn} />
      {:else if activeTab === 'attributes'}
        <PawnAttributes pawn={selectedPawn} />
      {:else if activeTab === 'gear'}
        <PawnEquipment pawn={selectedPawn} />
        <PawnInventory pawn={selectedPawn} />
      {/if}
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
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  /* ── Section tabs (STATUS / ATTRIBUTES / GEAR) ── */
  /* Underline-indicator style — reads as chapter navigation, not
     item selection. Visually separated from the pawn selector below. */
  .pawn-tabs {
    display: flex;
    flex-shrink: 0;
    background: var(--bg);
    border-bottom: 2px solid var(--border-hi);
  }

  .pawn-tab {
    flex: 1;
    padding: 6px 0 5px;
    background: transparent;
    border: none;
    border-right: 1px solid var(--border);
    color: var(--text-muted);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    cursor: pointer;
    text-transform: uppercase;
    transition: color 0.12s;
    position: relative;
  }
  .pawn-tab:last-child {
    border-right: none;
  }
  .pawn-tab:hover {
    color: var(--text);
  }
  /* Active: bright amber text + thick bottom line indicator */
  .pawn-tab.active {
    color: var(--accent-hi);
  }
  .pawn-tab.active::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent-hi);
  }

  /* ── Content area ─────────────────────────────────────── */
  .pawn-content {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .empty {
    padding: 20px;
    color: var(--text-muted);
    font-style: italic;
  }
</style>
