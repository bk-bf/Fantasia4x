<!--
  BuildingStoragePanel — §F per-building storage-bin item filter, copied from BuildingFuelPanel's shape.
  Given the selected storage building it edits that building's `storageSettings.allowedItemIds` via a
  command. The candidate universe is the building's DEFAULT scope: a specialized bin (storageFilter)
  lists only the items it can hold; a general store lists every non-hidden item. "Allowed" defaults to
  the whole candidate set (no override); any tick writes an explicit id list, which the haul engine then
  treats as the bin's filter. Reuses the shared ItemFilterChecklist (grouped + searchable). The parent
  owns open/close (the card's FILTER button).
-->
<script lang="ts">
  import { gameState } from '$lib/stores/gameState.js';
  import type { PlacedBuilding, Item, ZonePriority } from '$lib/game/core/types.js';
  import ItemFilterChecklist from '$lib/components/UI/gameCanvas/ItemFilterChecklist.svelte';
  import itemsData from '$lib/game/database/items/items.jsonc';
  import { buildingService } from '$lib/game/services/BuildingService';

  let { building, open = false }: { building: PlacedBuilding; open?: boolean } = $props();

  // Haul-fill priority: pawns top up higher-priority stores before lower ones (same scale as a
  // stockpile zone — see zonePriorityRankAt, which now honours a bin's storageSettings.priority).
  const PRIORITIES: { value: ZonePriority; label: string }[] = [
    { value: 'low', label: 'Low' },
    { value: 'normal', label: 'Normal' },
    { value: 'preferred', label: 'Preferred' },
    { value: 'urgent', label: 'Urgent' }
  ];
  const binPriority = $derived(building.storageSettings?.priority ?? 'normal');
  function setPriority(value: ZonePriority) {
    gameState.command({
      type: 'setBuildingStorageSettings',
      payload: { id: building.id, updates: { priority: value } },
      save: true
    });
  }

  // Non-hidden items only (internal items like natural weapons are never haul targets) — same universe
  // the stockpile-zone filter uses.
  const ALL_ITEMS = (itemsData as unknown as Item[]).filter((i) => !i.hidden);

  // Candidate universe = what this store CAN hold: a specialized bin narrows to its `storageFilter`
  // (categories OR explicit item ids); a general store offers everything.
  const candidateItems = $derived.by((): Item[] => {
    const filter = buildingService.getBuildingById(building.type)?.storageFilter;
    if (!filter || filter.length === 0) return ALL_ITEMS;
    const set = new Set(filter);
    return ALL_ITEMS.filter((i) => set.has(i.category) || set.has(i.id));
  });
  const candidateIds = $derived(candidateItems.map((i) => i.id));

  // Effective allow-set: an explicit override (even empty) wins; otherwise everything in scope is on.
  const allowed = $derived.by((): Set<string> => {
    const override = building.storageSettings?.allowedItemIds;
    return new Set(override ?? candidateIds);
  });

  const isSpecialized = $derived(
    (buildingService.getBuildingById(building.type)?.storageFilter?.length ?? 0) > 0
  );

  function setAllowed(allowedItemIds: string[] | undefined) {
    gameState.command({
      type: 'setBuildingStorageSettings',
      payload: { id: building.id, updates: { allowedItemIds } },
      save: true
    });
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="store-panel"
  class:open
  onmousedown={(e) => e.stopPropagation()}
  onmouseup={(e) => e.stopPropagation()}
  onwheel={(e) => e.stopPropagation()}
>
  <div class="store-hdr">storage filter</div>
  <div class="store-prio">
    <span class="store-prio-label" title="Pawns fill higher-priority stores before lower ones">
      fill priority
    </span>
    <select
      class="store-prio-select"
      value={binPriority}
      onchange={(e) => setPriority(e.currentTarget.value as ZonePriority)}
    >
      {#each PRIORITIES as p (p.value)}
        <option value={p.value}>{p.label}</option>
      {/each}
    </select>
  </div>
  <div class="store-block">
    <div class="store-label">
      {isSpecialized ? 'this store only holds:' : 'allow into this store:'}
    </div>
    <ItemFilterChecklist
      items={candidateItems}
      {allowed}
      onChange={(ids) => setAllowed(ids)}
      listMaxHeight="150px"
    />
    <div class="store-mini-btn-row">
      <button class="store-mini-btn" onclick={() => setAllowed(undefined)}>defaults</button>
      <button class="store-mini-btn" onclick={() => setAllowed([...candidateIds])}>check all</button
      >
      <button class="store-mini-btn" onclick={() => setAllowed([])}>uncheck all</button>
    </div>
  </div>
</div>

<style>
  .store-panel {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    width: 100%;
    max-width: 340px;
    opacity: 0;
    transform: translateY(6px);
    overflow: hidden;
    max-height: 0;
    pointer-events: none;
    background: rgba(13, 9, 3, 0.98);
    border: 1px solid #7a5e28;
    color: #d4a860;
    font-size: 10px;
    z-index: 20;
    filter: url(#ambient-tint);
    transition:
      opacity 140ms ease,
      transform 140ms ease,
      max-height 200ms ease;
  }
  .store-panel.open {
    opacity: 1;
    transform: translateY(0);
    max-height: 500px;
    pointer-events: all;
    padding: 5px 7px;
  }
  .store-hdr {
    color: #f0c060;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-bottom: 4px;
  }
  .store-prio {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-top: 4px;
  }
  .store-prio-label {
    color: #9c7a3a;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.85em;
  }
  .store-prio-select {
    flex: 1;
    background: #160f06;
    border: 1px solid #6b4f22;
    color: #f0c060;
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 2px 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .store-block {
    margin-top: 5px;
    border-top: 1px solid rgba(122, 94, 40, 0.6);
    padding-top: 4px;
  }
  .store-label {
    color: #c8a048;
    margin-bottom: 3px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .store-mini-btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .store-mini-btn {
    margin-top: 3px;
    background: #160f06;
    border: 1px solid #6b4f22;
    color: #d0a858;
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 1px 5px;
    cursor: pointer;
  }
  .store-mini-btn:hover {
    background: #24180a;
    border-color: #b07a28;
    color: #f0c878;
  }
</style>
