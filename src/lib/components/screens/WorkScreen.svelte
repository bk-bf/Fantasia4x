<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import BackButton from '$lib/components/UI/BackButton.svelte';
  import WorkPriorities from '$lib/components/screens/work/WorkPriorities.svelte';
  import PopulationOverview from '$lib/components/screens/work/PopulationOverview.svelte';
  import { persisted, persist } from '$lib/stores/uiPersist';

  let pawns = $derived($gameState.pawns ?? []);
  let workAssignments = $derived($gameState.workAssignments ?? {});
  // Restored across tab toggles; an incoming global pawn selection still overrides below.
  let selectedPawn = $state<string | null>(persisted('work.pawn', null));
  let selected = $derived(pawns.find((p) => p.id === selectedPawn) ?? null);
  // Clicking a work-priority column highlights the related stats in the attributes grid below.
  let selectedColumn = $state<string | null>(persisted('work.column', null));

  $effect(() => {
    const id = $uiState.selectedPawnId;
    if (id) selectedPawn = id;
  });
  $effect(() => persist('work.pawn', selectedPawn));
  $effect(() => persist('work.column', selectedColumn));
</script>

<div class="work-screen">
  <div class="screen-hdr">
    | LABOR ASSIGNMENTS
    <BackButton />
  </div>

  <WorkPriorities {pawns} {workAssignments} bind:selectedPawn bind:selectedColumn />

  {#if selected}
    <PopulationOverview pawn={selected} highlightCategory={selectedColumn} />
  {:else if pawns.length > 0}
    <div class="section-hdr sub">| CLICK A ROW FOR PAWN DETAIL</div>
  {/if}
</div>

<style>
  .work-screen {
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
  }
  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 12px;
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
