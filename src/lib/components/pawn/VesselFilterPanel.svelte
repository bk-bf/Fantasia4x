<!--
  What one vessel is allowed to be filled with. Built on the same ItemFilterChecklist the fuel and
  stockpile panels use, because a nested container needs the detailed version of this control, not a
  category grid — a waterskin is set to water, not to "drinks".

  A vessel starts allowing nothing. Ticking an item here is what sends a pawn to go and fill it, and
  APPLY TO ALL promotes the list to the default every future vessel of this kind is born with.
-->
<script lang="ts">
  import type { Item, ItemInstance } from '$lib/game/core/types';
  import { gameState } from '$lib/stores/gameState.js';
  import ItemFilterChecklist from '$lib/components/UI/canvas/ItemFilterChecklist.svelte';
  import itemsData from '$lib/game/database/items/items.jsonc';
  import { itemService } from '$lib/game/services/ItemService';
  import {
    contentsLabel,
    orphanedContents,
    usedCapacityL,
    vesselAccepts,
    vesselFilterOf,
    vesselOf
  } from '$lib/game/core/rules/gear/vessels';

  let { inst, onClose }: { inst: ItemInstance; onClose: () => void } = $props();

  const ALL_ITEMS = itemsData as unknown as Item[];

  const def = $derived(itemService.getItemById(inst.itemId));
  const vessel = $derived(vesselOf(inst.itemId));
  // Only what this KIND of vessel can physically hold is offered — the player can widen the list, never
  // make a jug hold logs.
  const candidates = $derived(ALL_ITEMS.filter((i) => vesselAccepts(inst.itemId, i.id)));
  const allowed = $derived(new Set(vesselFilterOf(inst)));
  const usedL = $derived(usedCapacityL(inst));
  const held = $derived(contentsLabel(inst));
  const orphans = $derived(orphanedContents(inst));

  function setFilter(ids: string[]) {
    gameState.command({
      type: 'setVesselFilter',
      payload: { instanceId: inst.instanceId, allowedItemIds: ids },
      save: true
    });
  }

  function applyToAll() {
    gameState.command({
      type: 'setVesselFilterDefault',
      payload: { vesselItemId: inst.itemId, allowedItemIds: [...allowed] },
      save: true
    });
  }

  function tipOut() {
    gameState.command({
      type: 'emptyVessel',
      payload: { instanceId: inst.instanceId },
      save: true
    });
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="vfp" onmousedown={(e) => e.stopPropagation()} onwheel={(e) => e.stopPropagation()}>
  <div class="vfp-hdr">
    <span>{def?.name ?? inst.itemId}</span>
    <button class="vfp-x" title="Close" onclick={onClose}>×</button>
  </div>

  {#if vessel}
    <div class="vfp-line">
      <span class="vfp-dim">holding</span>
      <span>{held ?? 'empty'}</span>
      <span class="vfp-dim">{usedL}/{vessel.capacityL} L</span>
    </div>
  {/if}

  {#if orphans.length}
    <div class="vfp-orphan">
      No longer on the list: {orphans
        .map((e) => itemService.getItemById(e.itemId)?.name ?? e.itemId)
        .join(', ')}. It stays put until something else that takes it has room.
    </div>
  {/if}

  <ItemFilterChecklist items={candidates} {allowed} onChange={setFilter} listMaxHeight="200px" />

  <div class="vfp-actions">
    <button onclick={applyToAll}>default for all {def?.name ?? 'these'}</button>
    <button class="vfp-danger" disabled={!inst.contents?.length} onclick={tipOut}>tip out</button>
  </div>
</div>

<style>
  .vfp {
    background: #0f0a03;
    border: 1px solid #6a4e20;
    padding: 5px;
    font-family: var(--font-mono);
    font-size: 10px;
    color: #d0a858;
    width: 260px;
  }
  .vfp-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #f0c060;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
  }
  .vfp-x {
    background: none;
    border: none;
    color: #a07c38;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
  }
  .vfp-x:hover {
    color: #f0c878;
  }
  .vfp-line {
    display: flex;
    gap: 6px;
    margin-bottom: 4px;
  }
  .vfp-dim {
    color: #8a6a30;
  }
  .vfp-orphan {
    color: #c88a30;
    border-left: 2px solid #6a4e20;
    padding-left: 4px;
    margin-bottom: 4px;
    line-height: 1.3;
  }
  .vfp-actions {
    display: flex;
    gap: 4px;
    margin-top: 5px;
  }
  .vfp-actions button {
    flex: 1;
    background: #160f06;
    border: 1px solid #6b4f22;
    color: #d0a858;
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 2px 4px;
    cursor: pointer;
  }
  .vfp-actions button:hover:not(:disabled) {
    background: #24180a;
    border-color: #b07a28;
    color: #f0c878;
  }
  .vfp-actions button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .vfp-danger:hover:not(:disabled) {
    border-color: #b04a28 !important;
    color: #f0a878 !important;
  }
</style>
