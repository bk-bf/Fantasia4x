<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';

  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { persisted, persist } from '$lib/stores/uiPersist';

  import type { Pawn } from '$lib/game/core/types';

  import PawnSelector from '../pawn/PawnSelector.svelte';
  import PawnStatsBar from '../pawn/PawnStatsBar.svelte';
  import PawnOverview from '../pawn/PawnOverview.svelte';
  import PawnHealth from '../pawn/PawnHealth.svelte';
  import PawnAttributes from '../pawn/PawnAttributes.svelte';
  import PawnRelations from '../pawn/PawnRelations.svelte';
  import PawnNeeds from '../pawn/PawnNeeds.svelte';
  import PawnTraits from '../pawn/PawnTraits.svelte';
  import PawnEquipment from '../pawn/PawnEquipment.svelte';
  import FollowButton from '../UI/widget/FollowButton.svelte';

  let pawns: Pawn[] = [];
  let selectedPawn: Pawn | null = null;
  let selectedPawnId: string | null = get(uiState).selectedPawnId;
  let pawnScreenElement: HTMLElement;

  type PawnTab = 'status' | 'attributes' | 'relations' | 'gear';
  let activeTab: PawnTab = persisted<PawnTab>('pawn.tab', 'status');
  $: persist('pawn.tab', activeTab);

  const TABS: { id: PawnTab; label: string }[] = [
    { id: 'status', label: 'STATUS' },
    { id: 'attributes', label: 'ATTRIBUTES' },
    { id: 'relations', label: 'RELATIONS' },
    { id: 'gear', label: 'GEAR' }
  ];

  const unsubscribe = gameState.subscribe((state) => {
    pawns = state.pawns || [];

    const updatedPawn = selectedPawnId ? pawns.find((p) => p.id === selectedPawnId) : undefined;
    if (updatedPawn) {
      selectedPawn = updatedPawn;
    } else if (pawns.length > 0) {
      selectedPawn = pawns[0];
      selectedPawnId = pawns[0].id;
      uiState.selectPawn(pawns[0].id);
    } else {
      selectedPawn = null;
      selectedPawnId = null;
    }
  });

  const unsubscribeUI = uiState.subscribe((ui) => {
    if (ui.selectedPawnId && ui.selectedPawnId !== selectedPawnId) {
      selectedPawnId = ui.selectedPawnId;
      const pawn = pawns.find((p) => p.id === ui.selectedPawnId);
      if (pawn) selectedPawn = pawn;
    }
    if (ui.pawnScreenTab) {
      const tab = ui.pawnScreenTab;
      activeTab = tab;
      tick().then(() => uiState.setPawnTab(null));
    }
  });

  onMount(() => {
    if (pawnScreenElement) {
      pawnScreenElement.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  onDestroy(() => {
    unsubscribe();
    unsubscribeUI();
  });

  function selectPawn(pawn: Pawn) {
    selectedPawn = pawn;
    selectedPawnId = pawn.id;
    uiState.selectPawn(pawn.id);
    if (pawn.position) {
      uiState.focusMapOn(pawn.position.x, pawn.position.y, false);
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

  <nav class="pawn-tabs">
    {#each TABS as tab}
      <button
        class="pawn-tab"
        class:active={activeTab === tab.id}
        on:click={() => (activeTab = tab.id)}>{tab.label}</button
      >
    {/each}
  </nav>

  <PawnSelector {pawns} {selectedPawn} onSelect={selectPawn} />

  {#if selectedPawn}
    <div class="pawn-content">
      {#if activeTab === 'status'}
        <PawnStatsBar pawn={selectedPawn} />
        <div class="status-grid">
          <div class="status-col"><PawnOverview pawn={selectedPawn} gameState={$gameState} /></div>
          <div class="status-col"><PawnHealth pawn={selectedPawn} /></div>
          <div class="status-col"><PawnNeeds pawn={selectedPawn} gameState={$gameState} /></div>
        </div>
        <PawnTraits pawn={selectedPawn} />
      {:else if activeTab === 'attributes'}
        <PawnAttributes
          pawn={selectedPawn}
          categories={['physical', 'capacity', 'combat', 'resistance', 'social']}
        />
      {:else if activeTab === 'relations'}
        <PawnRelations pawn={selectedPawn} gameState={$gameState} onSelect={selectPawn} />
      {:else if activeTab === 'gear'}
        <PawnEquipment pawn={selectedPawn} />
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
    font-family: var(--font-mono);
    font-size: 12px;
    display: flex;
    flex-direction: column;
  }

  .screen-hdr {
    padding: 5px 10px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 12px;
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--border-hi);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pawn-tabs {
    display: flex;
    flex-shrink: 0;
    overflow-x: auto;
    overflow-y: hidden;
    background: var(--bg);
    border-bottom: 2px solid var(--border-hi);
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .pawn-tabs::-webkit-scrollbar {
    display: none;
  }

  .pawn-tab {
    flex: 1 0 auto;
    white-space: nowrap;
    padding: 6px 14px 5px;
    background: transparent;
    border: none;
    border-right: 1px solid var(--border);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
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
  .pawn-tab.active {
    color: var(--accent-hi);
  }
  .pawn-tab.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent-hi);
  }

  .pawn-content {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .status-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: stretch;
  }

  .status-col + .status-col {
    border-left: 1px solid var(--border);
  }

  @media (max-width: 720px) {
    .status-grid {
      grid-template-columns: 1fr;
    }
    .status-col + .status-col {
      border-left: none;
    }
  }

  .empty {
    padding: 20px;
    color: var(--text-muted);
    font-style: italic;
  }
</style>
