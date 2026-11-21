<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { gameState } from '$lib/stores/gameState';
  import Well from '$lib/components/UI/widget/Well.svelte';
  import PawnOverview from './PawnOverview.svelte';
  import PawnBodyWell from './PawnBodyWell.svelte';
  import PawnNeeds from './PawnNeeds.svelte';

  let { pawn }: { pawn: Pawn } = $props();
</script>

<div class="g3">
  <Well title="Status"><PawnOverview {pawn} gameState={$gameState} /></Well>
  <PawnBodyWell {pawn} />
  <Well title="Needs"><PawnNeeds {pawn} /></Well>
</div>

<style>
  .g3 {
    display: grid;
    grid-template-columns: 1.1fr 1fr 1fr;
    gap: 6px;
    align-items: start;
  }
</style>
