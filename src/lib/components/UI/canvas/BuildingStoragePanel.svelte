<script lang="ts">
  import { gameState } from '$lib/stores/gameState.js';
  import type { PlacedBuilding, Item, ZonePriority } from '$lib/game/core/types.js';
  import itemsData from '$lib/game/database/items/items.json';
  import { buildingService } from '$lib/game/services/BuildingService';
  import StoreFilter from './StoreFilter.svelte';

  let { building, held }: { building: PlacedBuilding; held: number } = $props();

  const ALL_ITEMS = (itemsData as unknown as Item[]).filter((i) => !i.hidden);

  const def = $derived(buildingService.getBuildingById(building.type));
  const candidateItems = $derived.by((): Item[] => {
    const filter = def?.storageFilter;
    if (!filter || filter.length === 0) return ALL_ITEMS;
    const set = new Set(filter);
    return ALL_ITEMS.filter((i) => set.has(i.category) || set.has(i.id));
  });
  const candidateIds = $derived(candidateItems.map((i) => i.id));
  const allowed = $derived(new Set(building.storageSettings?.allowedItemIds ?? candidateIds));
  const stacks = $derived(def?.effects?.storageStacks ?? 0);

  function update(updates: { priority?: ZonePriority; allowedItemIds?: string[] }) {
    gameState.command({
      type: 'setBuildingStorageSettings',
      payload: { id: building.id, updates },
      save: true
    });
  }
</script>

<StoreFilter
  priority={building.storageSettings?.priority ?? 'normal'}
  onpriority={(priority) => update({ priority })}
  note={stacks > 0 ? `holds ${held} of ${stacks} stacks` : undefined}
  heading={(def?.storageFilter?.length ?? 0) > 0 ? 'Holds only' : 'Let into this store'}
  items={candidateItems}
  {allowed}
  onChange={(ids) => update({ allowedItemIds: ids })}
  ondefaults={() => update({ allowedItemIds: undefined })}
  onall={() => update({ allowedItemIds: [...candidateIds] })}
  onnone={() => update({ allowedItemIds: [] })}
/>
