<script lang="ts">
  import { buildingService } from '$lib/game/services/BuildingService';
  import { itemService } from '$lib/game/services/ItemService';
  import { labelFor } from '$lib/components/util/itemCategoryTree';
  import type { PlacedBuilding, DroppedItem } from '$lib/game/core/types';
  import TileTip from './TileTip.svelte';
  import type { TileFact } from './tileFacts';

  let {
    building,
    binContents = [],
    env = []
  }: { building: PlacedBuilding; binContents?: DroppedItem[]; env?: TileFact[] } = $props();

  const def = $derived(buildingService.getBuildingById(building.type));
  const standing = $derived(building.status === 'complete' && !building.deconstructQueued);
  const rows = $derived.by((): TileFact[] => {
    const out: TileFact[] = [];
    if (building.status !== 'complete') {
      const req = building.workRequired ?? def?.workAmount ?? 1;
      out.push({ label: 'Work', value: `${Math.round(building.workDone ?? 0)} of ${req}` });
    } else if (building.deconstructQueued) {
      const req = building.deconstructWorkRequired ?? 1;
      out.push({
        label: 'Work',
        value: `${Math.round(building.deconstructWorkDone ?? 0)} of ${req}`
      });
    }
    if (standing && buildingService.deterioratingRate(building.type) > 0)
      out.push({ label: 'Sound', value: `${Math.round(building.condition ?? 100)}%` });
    if (standing && def?.maxFuel !== undefined) {
      const burning = (building.fuelItemIds ?? [])[0];
      out.push({
        label: 'Fuel',
        value: `${Math.floor(building.fuel ?? 0)} of ${Math.floor(def.maxFuel)}, ${building.lit ? 'lit' : 'unlit'}`
      });
      if (building.lit && burning)
        out.push({ label: 'Burning', value: itemService.getItemById(burning)?.name ?? '' });
    }
    const stacks = def?.effects?.storageStacks ?? 0;
    if (standing && stacks > 0) {
      out.push({ label: 'Holds', value: `${binContents.length} of ${stacks} stacks` });
      if (def?.storageFilter?.length)
        out.push({ label: 'Only', value: def.storageFilter.map(labelFor).join(', ') });
      for (const d of binContents) {
        const target = itemService.dryingTargetSeconds(d.resourceId);
        out.push({
          label: `${itemService.getItemDisplayName(d)} ×${d.quantity}`,
          value:
            target !== null ? `dry ${Math.round(Math.min(1, (d.drying ?? 0) / target) * 100)}%` : ''
        });
      }
    }
    return [...out, ...env];
  });
  const line = $derived(
    building.status !== 'complete'
      ? building.paused
        ? 'building paused'
        : 'being built'
      : building.deconstructQueued
        ? 'coming down'
        : (def?.description ?? '')
  );
</script>

<TileTip title={def?.name ?? ''} desc={line} {rows} />
