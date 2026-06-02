<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import WorkPriorities from '$lib/components/screens/work/WorkPriorities.svelte';
  import PopulationOverview from '$lib/components/screens/work/PopulationOverview.svelte';
  import ProductionManagement from '$lib/components/screens/work/ProductionManagement.svelte';

  let pawns = $derived($gameState.pawns ?? []);
  let workAssignments = $derived($gameState.workAssignments ?? {});
  let productionTargets = $derived($gameState.productionTargets ?? []);
  let selectedPawn = $state<string | null>(null);
  let selected = $derived(pawns.find((p) => p.id === selectedPawn) ?? null);
</script>

<div class="work-screen">
  <div class="screen-hdr">
    | LABOR ASSIGNMENTS
    <button class="hdr-btn" onclick={() => uiState.setScreen('main')}>BACK</button>
  </div>

  <WorkPriorities {pawns} {workAssignments} bind:selectedPawn />

  {#if selected}
    <PopulationOverview pawn={selected} />
  {:else if pawns.length > 0}
    <div class="section-hdr sub">| CLICK A ROW FOR PAWN DETAIL</div>
  {/if}

  <ProductionManagement {productionTargets} {pawns} />
</div>

<style>
  .work-screen {
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
  }
  .hdr-btn {
    margin-left: auto;
    padding: 2px 8px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    cursor: pointer;
  }
  .hdr-btn:hover {
    color: var(--text);
    border-color: var(--border-hi);
  }
  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    margin-top: 1px;
    flex-shrink: 0;
  }
  .section-hdr.sub {
    background: var(--bg);
    color: var(--text-dim);
  }
</style>
