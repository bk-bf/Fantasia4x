<!-- PawnInventory.svelte — shows items the pawn is currently carrying -->
<script lang="ts">
  import type { Pawn, Item, ItemInstance } from '$lib/game/core/types';
  import ITEMS_DATABASE from '$lib/game/database/items/items.jsonc';
  import { itemService } from '$lib/game/services/ItemService';
  import { gameState } from '$lib/stores/gameState';
  import CarryItemCard from './CarryItemCard.svelte';
  import CarryCapacity from './CarryCapacity.svelte';
  import PawnConsumables from './PawnConsumables.svelte';

  export let pawn: Pawn;

  $: pinned = new Set(pawn.pinnedItems ?? []);
  // Pinned items sort to the top; otherwise stable order.
  $: carried = Object.entries(pawn.inventory?.items ?? {})
    .filter(([, qty]) => qty > 0)
    .sort(([a], [b]) => (pinned.has(b) ? 1 : 0) - (pinned.has(a) ? 1 : 0));
  // Every tracked instance in the pack — a fetched/carried TOOL or weapon (axe, hammer, pick), a
  // hauled carcass, or a rescued colonist being carried as a `carried_pawn` body. Tools live in
  // `inventory.instances` (not the bulk count map), so without listing all instances a carried axe
  // was invisible in the carry UI. Each unit is one row (instances aren't stackable — they have
  // per-unit durability/quality).
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
  <div class="section-hdr">
    | CARRYING
    <CarryCapacity {pawn} />
  </div>

  {#if isEmpty}
    <div class="empty">nothing carried</div>
  {:else}
    <div class="card-grid">
      <!-- Tracked instances: tools/weapons (kept in hand), named carcasses, and carried colonists. -->
      {#each carriedInstances as inst (inst.instanceId)}
        {#if inst.itemId === 'carried_pawn'}
          <!-- A live colonist riding in the pack — no stat card, just a "set down" control. -->
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
            />
          {:else}
            <!-- No def for this id — surface it LOUDLY rather than skipping silently. The raw id is
                 shown on purpose: it's a data bug (a dangling itemId) and the id is the only clue. -->
            <div class="card unknown-card" title="No items.jsonc entry for this id — data bug.">
              ⚠ unknown item<br /><code>{inst.itemId}</code>
            </div>
          {/if}
        {/if}
      {/each}
      <!-- Bulk stackable goods (the count map) — pinnable so they're never auto-deposited. -->
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
          <!-- Loud fallback for a dangling bulk id (see above). Never silently drop carried goods. -->
          <div class="card unknown-card" title="No items.jsonc entry for this id — data bug.">
            ⚠ unknown item<br /><code>{itemId}</code> ×{qty}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<PawnConsumables {pawn} />

<style>
  .inv-section {
    margin-bottom: 1rem;
  }

  .section-hdr {
    font-family: var(--font-mono, monospace);
    color: var(--accent, #0f0);
    font-size: 0.75rem;
    margin-bottom: 0.4rem;
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
  }

  .empty {
    color: var(--text-dim, #666);
    font-size: 0.75rem;
    font-style: italic;
    padding-left: 0.5rem;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 4px;
    padding: 0 2px;
  }

  /* Loud fallback for a carried id with no items.jsonc def — a data bug made visible. */
  .unknown-card {
    border: 1px solid var(--neg, #e05a5a);
    background: var(--bg-panel);
    padding: 4px 6px 5px;
    min-height: 42px;
    font-family: var(--font-mono, monospace);
    font-size: 0.68rem;
    color: var(--neg, #e05a5a);
    line-height: 1.3;
    overflow: hidden;
  }
  .unknown-card code {
    color: var(--text, #ccc);
    word-break: break-all;
  }

  /* The carried-colonist card — a person, not an item, so it shows no stat panel. */
  .pawn-card {
    position: relative;
    border: 1px solid var(--accent-hi, #ffd24a);
    background: var(--bg-panel);
    padding: 4px 6px 5px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-height: 42px;
    overflow: hidden;
  }
  .pawn-name {
    font-family: var(--font-mono, monospace);
    font-size: 0.72rem;
    color: var(--accent-hi, #ffd24a);
    line-height: 1.2;
    padding-right: 16px;
  }
  .pawn-tag {
    font-size: 0.62rem;
    color: var(--neg, #e05a5a);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .setdown {
    position: absolute;
    top: 2px;
    right: 2px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.7rem;
    line-height: 1;
    padding: 1px 2px;
    color: var(--text-dim, #666);
  }
  .setdown:hover {
    color: var(--neg, #e05a5a);
  }
</style>
