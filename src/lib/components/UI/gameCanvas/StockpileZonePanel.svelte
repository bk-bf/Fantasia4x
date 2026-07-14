<!--
  StockpileZonePanel — the per-item haul-filter pop-up for a stockpile zone. The zone's INFO CARD is
  the shared SelectedEntityCard (built in GameCanvas, same chrome as pawn/mob/building); this is only
  the FILTER fly-out it opens, mirroring BuildingStoragePanel under a storage bin (same
  absolute-above-the-card layout, `open` toggle owned by the parent, stopPropagation).

  Reuses the shared ItemFilterChecklist (nested taxonomy + search + collapse-all + copy/paste) so the
  stockpile-zone and storage-bin filters are the SAME UI — no bespoke duplicate. Filter model: the
  checklist works on a checked-id SET; this converts to/from the canonical ZoneFilter the haul engine
  reads — {allowedCategories:[], blockedItems:[]} = "all" (no filter); any restriction materializes to
  the full category list + an explicit blockedItems set, so a single unchecked item (or a fully
  unchecked zone) is representable without the empty=all overload.
-->
<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { itemService } from '$lib/game/services/ItemService';
  import itemsData from '$lib/game/database/items.jsonc';
  import type { Item, ZoneFilter, ZonePriority } from '$lib/game/core/types';
  import ItemFilterChecklist from '$lib/components/UI/gameCanvas/ItemFilterChecklist.svelte';

  let {
    instanceId,
    filter,
    priority = 'normal',
    open = false
  }: {
    instanceId: string;
    filter: ZoneFilter;
    priority?: ZonePriority;
    open?: boolean;
  } = $props();

  // Haul-fill priority: pawns top up higher-priority zones before lower ones (and only spill into a
  // lower zone once the higher is full). Drives findNearestDepositPoint / depositInventory ordering.
  const PRIORITIES: { value: ZonePriority; label: string }[] = [
    { value: 'low', label: 'Low' },
    { value: 'normal', label: 'Normal' },
    { value: 'preferred', label: 'Preferred' },
    { value: 'urgent', label: 'Urgent' }
  ];
  function setPriority(value: ZonePriority) {
    gameState.command({
      type: 'setInstancePriority',
      payload: { instanceId, priority: value },
      save: true
    });
  }

  // Static item universe (non-hidden — internal items like natural weapons are never haul targets).
  const ALL_ITEMS = (itemsData as unknown as Item[]).filter((i) => !i.hidden);
  const ALL_IDS = ALL_ITEMS.map((i) => i.id);
  const ALL_CATEGORIES = itemService.getAllCategories();

  // True engine semantics (matches jobs/filters.itemMatchesFilter + the haul empty-cats short-circuit).
  function isChecked(id: string): boolean {
    if (filter.allowedCategories.length === 0) return true;
    const cat = itemService.getItemById(id)?.category;
    return !!cat && filter.allowedCategories.includes(cat) && !filter.blockedItems.includes(id);
  }

  const allowed = $derived(new Set(ALL_IDS.filter(isChecked)));
  const checkedCount = $derived(allowed.size);
  const allChecked = $derived(checkedCount === ALL_IDS.length);
  const noneChecked = $derived(checkedCount === 0);

  /** Serialize a desired checked-set back to the canonical {allowedCategories, blockedItems}. */
  function commit(checked: Set<string>) {
    const next: ZoneFilter =
      checked.size >= ALL_IDS.length
        ? { allowedCategories: [], blockedItems: [] } // canonical "all"
        : {
            allowedCategories: [...ALL_CATEGORIES],
            blockedItems: ALL_IDS.filter((id) => !checked.has(id))
          };
    gameState.command({
      type: 'setInstanceFilter',
      payload: { instanceId, filter: next },
      save: true
    });
  }

  function setAll(on: boolean) {
    commit(on ? new Set(ALL_IDS) : new Set());
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="zfp"
  class:open
  onmousedown={(e) => e.stopPropagation()}
  onmouseup={(e) => e.stopPropagation()}
  onwheel={(e) => e.stopPropagation()}
>
  <div class="zfp-hdr">
    stored items
    <span class="zfp-count">{checkedCount}/{ALL_IDS.length} allowed</span>
  </div>
  <div class="zfp-prio">
    <span class="zfp-prio-label" title="Pawns fill higher-priority zones before lower ones">
      fill priority
    </span>
    <select
      class="zfp-prio-select"
      value={priority}
      onchange={(e) => setPriority(e.currentTarget.value as ZonePriority)}
    >
      {#each PRIORITIES as p (p.value)}
        <option value={p.value}>{p.label}</option>
      {/each}
    </select>
  </div>

  <div class="zfp-block">
    <div class="zfp-label">allow into this stockpile:</div>
    <ItemFilterChecklist
      items={ALL_ITEMS}
      {allowed}
      onChange={(ids) => commit(new Set(ids))}
      listMaxHeight="150px"
    />
    <div class="zfp-mini-row">
      <button class="zfp-mini" disabled={allChecked} onclick={() => setAll(true)}>check all</button>
      <button class="zfp-mini" disabled={noneChecked} onclick={() => setAll(false)}
        >uncheck all</button
      >
    </div>
  </div>

  <div class="zfp-note">Only checked items are hauled into this stockpile.</div>
</div>

<style>
  /* Fly-out above the zone card — same chrome/positioning as BuildingStoragePanel under a bin. */
  .zfp {
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
    font-family: var(--font-mono);
    font-size: 10px;
    z-index: 20;
    filter: url(#ambient-tint);
    transition:
      opacity 140ms ease,
      transform 140ms ease,
      max-height 200ms ease;
  }
  .zfp.open {
    opacity: 1;
    transform: translateY(0);
    max-height: 500px;
    pointer-events: all;
    padding: 5px 7px;
  }

  .zfp-hdr {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    color: #f0c060;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 4px;
  }
  .zfp-count {
    color: #9c7a3a;
  }
  .zfp-prio {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 5px;
  }
  .zfp-prio-label {
    color: #9c7a3a;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.85em;
  }
  .zfp-prio-select {
    flex: 1;
    background: #160f06;
    border: 1px solid #6b4f22;
    color: #f0c060;
    padding: 2px 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .zfp-block {
    margin-top: 5px;
    border-top: 1px solid rgba(122, 94, 40, 0.6);
    padding-top: 4px;
  }
  .zfp-label {
    color: #c8a048;
    margin-bottom: 3px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .zfp-mini-row {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .zfp-mini {
    margin-top: 3px;
    background: #160f06;
    border: 1px solid #6b4f22;
    color: #d0a858;
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 1px 5px;
    cursor: pointer;
  }
  .zfp-mini:hover:not(:disabled) {
    background: #24180a;
    border-color: #b07a28;
    color: #f0c878;
  }
  .zfp-mini:disabled {
    opacity: 0.35;
    cursor: default;
  }
</style>
