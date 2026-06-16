<!-- PawnInventory.svelte — shows items the pawn is currently carrying -->
<script lang="ts">
  import type { Pawn, Item } from '$lib/game/core/types';
  import ITEMS_DATABASE from '$lib/game/database/items.jsonc';
  import { itemService } from '$lib/game/services/ItemService';
  import { gameState } from '$lib/stores/gameState';

  export let pawn: Pawn;

  $: pinned = new Set(pawn.pinnedItems ?? []);
  // Pinned items sort to the top; otherwise stable order.
  $: carried = Object.entries(pawn.inventory?.items ?? {})
    .filter(([, qty]) => qty > 0)
    .sort(([a], [b]) => (pinned.has(b) ? 1 : 0) - (pinned.has(a) ? 1 : 0));

  function togglePin(itemId: string) {
    gameState.command({ type: 'togglePinItem', payload: { pawnId: pawn.id, itemId }, save: true });
  }
  // Derive load + budget from the service (single source of truth = item defs). The cached
  // pawn.inventory.weightKg is a write-only initial-shape field that is never updated on
  // inventory mutation, so reading it showed a stale 0.0 (review R5 / playtest 2026-06-13).
  $: maxWeightKg = itemService.getCarryBudget(pawn, $gameState).maxWeightKg;
  $: weightKg = itemService.getCurrentCarryLoad(pawn, $gameState).weightKg;
  $: isEmpty = carried.length === 0;

  function itemName(id: string): string {
    return (ITEMS_DATABASE as Item[]).find((i) => i.id === id)?.name ?? id;
  }
</script>

<div class="inv-section">
  <div class="section-hdr">
    | CARRYING
    <span class="capacity">[{weightKg.toFixed(1)}/{maxWeightKg.toFixed(1)} kg]</span>
  </div>

  {#if isEmpty}
    <div class="empty">nothing carried</div>
  {:else}
    {#each carried as [itemId, qty]}
      <div class="row" class:pinned={pinned.has(itemId)}>
        <button
          class="pin-btn"
          class:active={pinned.has(itemId)}
          title={pinned.has(itemId)
            ? 'Pinned — kept in hand, never deposited. Click to unpin.'
            : 'Pin — keep this item (the pawn never deposits it).'}
          on:click={() => togglePin(itemId)}>{pinned.has(itemId) ? '★' : '☆'}</button
        >
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
    align-items: baseline;
    gap: 0.4rem;
    font-family: var(--font-mono, monospace);
    font-size: 0.75rem;
    padding: 0.1rem 0.5rem;
  }

  .pin-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    font-size: 0.8rem;
    line-height: 1;
    color: var(--text-dim, #666);
  }
  .pin-btn:hover {
    color: var(--text, #ccc);
  }
  .pin-btn.active {
    color: var(--accent-hi, #ffd24a);
  }

  .row.pinned .item-name {
    color: var(--accent-hi, #ffd24a);
  }

  .item-name {
    color: var(--text, #ccc);
    text-transform: uppercase;
  }

  .qty {
    color: var(--accent, #0f0);
    font-weight: bold;
    margin-left: auto;
  }
</style>
