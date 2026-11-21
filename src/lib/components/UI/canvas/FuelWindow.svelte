<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { fuelTarget } from './fuelTarget';
  import BuildingFuelPanel from './BuildingFuelPanel.svelte';

  const building = $derived(($gameState.buildings ?? []).find((b) => b.id === $fuelTarget));
</script>

{#if building}
  <BuildingFuelPanel {building} pawns={$gameState.pawns ?? []} />
{:else}
  <p>Nothing here burns.</p>
{/if}

<style>
  p {
    margin: 0;
    color: var(--text-muted);
    font: 16px/18px var(--font-pixel);
  }
</style>
