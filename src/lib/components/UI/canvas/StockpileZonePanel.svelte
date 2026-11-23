<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { itemService } from '$lib/game/services/ItemService';
  import itemsData from '$lib/game/database/items/items.json';
  import type { Item, ZoneFilter, ZoneInstance } from '$lib/game/core/types';
  import StoreFilter from './StoreFilter.svelte';
  import KvRow from '../widget/KvRow.svelte';
  import Stepper from '../widget/Stepper.svelte';

  let { zone }: { zone: ZoneInstance } = $props();

  const ALL_ITEMS = (itemsData as unknown as Item[]).filter((i) => !i.hidden);
  const ALL_IDS = ALL_ITEMS.map((i) => i.id);
  const ALL_CATEGORIES = itemService.getAllCategories();

  function isChecked(filter: ZoneFilter, id: string): boolean {
    if (filter.allowedCategories.length === 0) return true;
    const cat = itemService.getItemById(id)?.category;
    return !!cat && filter.allowedCategories.includes(cat) && !filter.blockedItems.includes(id);
  }

  const allowed = $derived(new Set(ALL_IDS.filter((id) => isChecked(zone.filter, id))));
  const send = (type: string, payload: Record<string, unknown>) =>
    gameState.command({ type, payload: { instanceId: zone.id, ...payload }, save: true });

  function commit(checked: Set<string>) {
    const filter: ZoneFilter =
      checked.size >= ALL_IDS.length
        ? { allowedCategories: [], blockedItems: [] }
        : {
            allowedCategories: [...ALL_CATEGORIES],
            blockedItems: ALL_IDS.filter((id) => !checked.has(id))
          };
    send('setInstanceFilter', { filter });
  }
</script>

<StoreFilter
  priority={zone.priority ?? 'normal'}
  onpriority={(priority) => send('setInstancePriority', { priority })}
  note="{allowed.size} of {ALL_IDS.length} kinds allowed"
  heading="Let into this stockpile"
  items={ALL_ITEMS}
  {allowed}
  onChange={(ids) => commit(new Set(ids))}
  onall={() => commit(new Set(ALL_IDS))}
  onnone={() => commit(new Set())}
>
  <KvRow label="Bins and baskets kept">
    <Stepper
      label="Bins and baskets kept"
      value={zone.containerBudget ?? 0}
      max={99}
      onchange={(containerBudget) => send('setInstanceContainerBudget', { containerBudget })}
    />
  </KvRow>
</StoreFilter>
