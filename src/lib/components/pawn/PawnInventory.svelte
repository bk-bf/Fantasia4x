<script lang="ts">
  import type { Pawn, Item, ItemInstance } from '$lib/game/core/types';
  import ITEMS_DATABASE from '$lib/game/database/items/items.json';
  import { itemService } from '$lib/game/services/ItemService';
  import { gameState } from '$lib/stores/gameState';
  import CarryItemCard from './CarryItemCard.svelte';
  import VesselFilterPanel from './VesselFilterPanel.svelte';
  import { vesselOf } from '$lib/game/core/rules/gear/vessels';
  import CarryCapacity from './CarryCapacity.svelte';
  import PawnConsumables from './PawnConsumables.svelte';
  import PawnVesselContents from './PawnVesselContents.svelte';

  export let pawn: Pawn;

  let openVessel: string | null = null;

  $: pinned = new Set(pawn.pinnedItems ?? []);
  $: carried = Object.entries(pawn.inventory?.items ?? {})
    .filter(([, qty]) => qty > 0)
    .sort(([a], [b]) => (pinned.has(b) ? 1 : 0) - (pinned.has(a) ? 1 : 0));
  $: carriedInstances = pawn.inventory?.instances ?? [];

  function instanceLabel(inst: ItemInstance): string {
    if (inst.famed && inst.famedName) return inst.famedName;
    return itemService.getItemDisplayName({
      resourceId: inst.itemId,
      name: inst.name,
      quality: inst.quality
    });
  }

  function dropInstance(inst: ItemInstance) {
    gameState.command({
      type: 'dropCarriedItem',
      payload: { pawnId: pawn.id, itemId: inst.itemId, instanceId: inst.instanceId },
      save: true
    });
  }

  function togglePin(itemId: string) {
    gameState.command({ type: 'togglePinItem', payload: { pawnId: pawn.id, itemId }, save: true });
  }

  function dropItem(itemId: string) {
    gameState.command({
      type: 'dropCarriedItem',
      payload: { pawnId: pawn.id, itemId },
      save: true
    });
  }
  $: isEmpty = carried.length === 0 && carriedInstances.length === 0;

  function itemName(id: string): string {
    return (ITEMS_DATABASE as Item[]).find((i) => i.id === id)?.name ?? id;
  }
</script>

<div class="inv-section">
  {#if isEmpty}
    <p class="empty">Nothing carried.</p>
  {:else}
    <div class="packhead"><span>Item</span><span>Count</span><span>Weight</span><span></span></div>
    <div class="card-grid">
      {#each carriedInstances as inst (inst.instanceId)}
        {#if inst.itemId === 'carried_pawn'}
          <div class="card pawn-card">
            <button
              class="setdown"
              title="Set down — lay the carried colonist on the pawn's tile and end the carry."
              on:click={() => dropItem(inst.itemId)}>↓</button
            >
            <span class="pawn-name">{instanceLabel(inst)}</span>
            <span class="pawn-tag">carried colonist</span>
          </div>
        {:else}
          {@const def = itemService.getItemById(inst.itemId)}
          {#if def}
            <CarryItemCard
              {def}
              name={instanceLabel(inst)}
              quality={inst.quality}
              durability={inst.durability}
              maxDurability={def.maxDurability ?? 100}
              contents={inst.contents ?? null}
              famed={inst.famed ?? false}
              famedHistory={inst.famedHistory ?? null}
              famedEnchants={inst.famedEnchants ?? null}
              onDrop={() => dropInstance(inst)}
              onConfigure={vesselOf(inst.itemId)
                ? () => (openVessel = openVessel === inst.instanceId ? null : inst.instanceId)
                : null}
            />
            {#if openVessel === inst.instanceId}
              <VesselFilterPanel {inst} onClose={() => (openVessel = null)} />
            {/if}
          {:else}
            <div class="card unknown-card" title="No items.json entry for this id — data bug.">
              ⚠ unknown item<br /><code>{inst.itemId}</code>
            </div>
          {/if}
        {/if}
      {/each}

      {#each carried as [itemId, qty]}
        {@const def = itemService.getItemById(itemId)}
        {#if def}
          <CarryItemCard
            {def}
            name={itemName(itemId)}
            {qty}
            pinned={pinned.has(itemId)}
            onPin={() => togglePin(itemId)}
            pinTitle={pinned.has(itemId)
              ? 'Pinned — kept in hand, never deposited. Click to unpin.'
              : 'Pin — keep this item (the pawn never deposits it).'}
            onDrop={() => dropItem(itemId)}
            dropTitle="Drop now — put this stack down on the pawn's tile."
          />
        {:else}
          <div class="card unknown-card" title="No items.json entry for this id — data bug.">
            ⚠ unknown item<br /><code>{itemId}</code> ×{qty}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
  <CarryCapacity {pawn} />
</div>

<PawnVesselContents {pawn} />
<PawnConsumables {pawn} />

<style>
  .packhead {
    display: grid;
    grid-template-columns: 1fr 40px 44px 46px;
    gap: 6px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1.4px;
  }
  .packhead span:not(:first-child) {
    text-align: right;
  }
  .empty {
    margin: 0;
    color: var(--text-muted);
  }
  .card-grid {
    display: flex;
    flex-direction: column;
  }
  .card {
    position: relative;
    display: flex;
    gap: 6px;
    align-items: center;
    min-height: 18px;
  }
  .unknown-card {
    color: var(--neg);
  }
  .pawn-name {
    color: var(--accent-hi);
  }
  .pawn-tag {
    color: var(--neg);
  }
  .setdown {
    margin-left: auto;
    padding: 0 2px;
    border: 0;
    background: none;
    font: inherit;
    color: var(--text-muted);
    cursor: pointer;
  }
  .setdown:hover {
    color: var(--neg);
  }
</style>
