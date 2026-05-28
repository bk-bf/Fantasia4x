<!-- PawnInventory.svelte — shows items the pawn is currently carrying -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import ITEMS_DATABASE from '$lib/game/database/items.jsonc';

  export let pawn: Pawn;

  $: carried = Object.entries(pawn.inventory?.items ?? {}).filter(([, qty]) => qty > 0);
  $: maxSlots = pawn.inventory?.maxSlots ?? 20;
  $: usedSlots = pawn.inventory?.currentSlots ?? 0;
  $: isEmpty = carried.length === 0;

  function itemName(id: string): string {
    return ITEMS_DATABASE.find((i) => i.id === id)?.name ?? id;
  }
</script>

<div class="inv-section">
  <div class="section-hdr">
    | CARRYING
    <span class="capacity">[{usedSlots}/{maxSlots}]</span>
  </div>

  {#if isEmpty}
    <div class="empty">nothing carried</div>
  {:else}
    {#each carried as [itemId, qty]}
      <div class="row">
        <span class="item-name">{itemName(itemId)}</span>
        <span class="qty">×{qty}</span>
      </div>
    {/each}
  {/if}
</div>

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

  .capacity {
    color: var(--text-dim, #666);
    font-size: 0.7rem;
  }

  .empty {
    color: var(--text-dim, #666);
    font-size: 0.75rem;
    font-style: italic;
    padding-left: 0.5rem;
  }

  .row {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-mono, monospace);
    font-size: 0.75rem;
    padding: 0.1rem 0.5rem;
  }

  .item-name {
    color: var(--text, #ccc);
    text-transform: uppercase;
  }

  .qty {
    color: var(--accent, #0f0);
    font-weight: bold;
  }
</style>
