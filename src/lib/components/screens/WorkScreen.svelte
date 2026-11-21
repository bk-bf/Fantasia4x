<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import ScrollArea from '$lib/components/UI/widget/ScrollArea.svelte';
  import WorkPriorities from '$lib/components/screens/work/WorkPriorities.svelte';
  import PopulationOverview from '$lib/components/screens/work/PopulationOverview.svelte';
  import { persisted, persist } from '$lib/stores/uiPersist';

  let pawns = $derived($gameState.pawns ?? []);
  let workAssignments = $derived($gameState.workAssignments ?? {});
  let selectedPawn = $state<string | null>(persisted('work.pawn', null));
  let selectedColumn = $state<string | null>(persisted('work.column', null));
  let selected = $derived(pawns.find((p) => p.id === selectedPawn) ?? pawns[0] ?? null);

  $effect(() => {
    const id = $uiState.selectedPawnId;
    if (id) selectedPawn = id;
  });
  $effect(() => {
    if (selected && selectedPawn !== selected.id) selectedPawn = selected.id;
  });
  $effect(() => persist('work.pawn', selectedPawn));
  $effect(() => persist('work.column', selectedColumn));
</script>

<ScrollArea class="work-screen">
  <WorkPriorities {pawns} {workAssignments} bind:selectedPawn bind:selectedColumn />
  {#if selected}
    <PopulationOverview pawn={selected} highlightCategory={selectedColumn} />
  {/if}
</ScrollArea>

<style>
  :global(.scroll-area.work-screen) {
    flex: 1;
    min-height: 0;
    color: var(--text);
    font: 16px/16px var(--font-pixel);
  }
</style>
