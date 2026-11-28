<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { buildingTarget } from './windowTargets';
  import BuildingRepairPanel from './BuildingRepairPanel.svelte';

  const building = $derived(($gameState.buildings ?? []).find((b) => b.id === $buildingTarget));
</script>

{#if building}
  <BuildingRepairPanel {building} pawns={$gameState.pawns ?? []} />
{:else}
  <p>Nothing here wears down.</p>
{/if}

<style>
  p {
    margin: 0;
    color: var(--text-muted);
    font: 16px/18px var(--font-pixel);
  }
</style>
