<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { storeTarget } from './windowTargets';
  import BuildingStoragePanel from './BuildingStoragePanel.svelte';
  import StockpileZonePanel from './StockpileZonePanel.svelte';

  const building = $derived(
    $storeTarget?.kind === 'building'
      ? ($gameState.buildings ?? []).find((b) => b.id === $storeTarget.id)
      : undefined
  );
  const zone = $derived(
    $storeTarget?.kind === 'zone'
      ? ($gameState.zoneInstances ?? []).find((z) => z.id === $storeTarget.id)
      : undefined
  );
  const held = $derived(
    building
      ? ($gameState.droppedItems ?? []).filter(
          (d) => d.stored && d.x === building.x && d.y === building.y
        ).length
      : 0
  );
</script>

{#if building}
  <BuildingStoragePanel {building} {held} />
{:else if zone}
  <StockpileZonePanel {zone} />
{:else}
  <p>Nothing is kept here.</p>
{/if}

<style>
  p {
    margin: 0;
    color: var(--text-muted);
    font: 16px/18px var(--font-pixel);
  }
</style>
