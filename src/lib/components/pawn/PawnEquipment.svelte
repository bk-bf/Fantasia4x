<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import type { Pawn, EquipmentSlot } from '$lib/game/core/types';
  import {
    equipItem,
    unequipItem,
    useConsumable,
    canEquipItem,
    syncAllPawnInventories
  } from '$lib/game/core/PawnEquipment';
  import { consumeFromStockpiles } from '$lib/game/core/GameState';
  import { gameEngine } from '$lib/game/systems/GameEngineImpl';
  import EquipmentDoll from './EquipmentDoll.svelte';
  import PawnInventory from './PawnInventory.svelte';

  export let pawn: Pawn;

  let equipmentLoading = false;

  // Equipment management functions
  function equipPawnItem(pawnId: string, itemId: string) {
    equipmentLoading = true;
    gameState.update((state) => {
      const pawnIndex = state.pawns.findIndex((p) => p.id === pawnId);
      if (pawnIndex !== -1) {
        state.pawns[pawnIndex] = equipItem(state.pawns[pawnIndex], itemId);
        state = syncAllPawnInventories(state);
      }
      equipmentLoading = false;
      return state;
    });
  }

  function unequipPawnItem(pawnId: string, slot: string) {
    equipmentLoading = true;
    gameState.update((state) => {
      const pawnIndex = state.pawns.findIndex((p) => p.id === pawnId);
      if (pawnIndex !== -1) {
        state.pawns[pawnIndex] = unequipItem(state.pawns[pawnIndex], slot as EquipmentSlot);
        state = syncAllPawnInventories(state);
      }
      equipmentLoading = false;
      return state;
    });
  }

  function useConsumableItem(pawnId: string, itemId: string) {
    gameState.update((state) => {
      const pawnIndex = state.pawns.findIndex((p) => p.id === pawnId);
      if (pawnIndex !== -1) {
        const available = (state.stockpile ?? {})[itemId] ?? 0;
        if (available >= 1) {
          state.pawns[pawnIndex] = useConsumable(state.pawns[pawnIndex], itemId);
          const afterConsume = consumeFromStockpiles(state, { [itemId]: 1 });
          return syncAllPawnInventories(afterConsume);
        }
      }
      return state;
    });
  }

  function canEquipPawnItem(pawn: Pawn, itemId: string): boolean {
    return canEquipItem(pawn, itemId);
  }
</script>

<!-- Equipment and Inventory -->
<div class="equipment-section" id="equipment">
  <h3>| EQUIPMENT &amp; INVENTORY</h3>
  <p class="inventory-note">All items from global storage are automatically available to equip</p>

  <div class="gear-columns">
    <!-- Currently Equipped -->
    <div class="equipped-items">
      <h4>Currently Equipped:</h4>
      <EquipmentDoll
        {pawn}
        loading={equipmentLoading}
        onUnequip={(slot) => unequipPawnItem(pawn.id, slot)}
      />
    </div>

    <!-- Available Items -->
    <div class="inventory-items">
    <h4>Available Items:</h4>
    <div class="inventory-grid">
      {#each Object.entries(pawn.inventory.items || {}) as [itemId, quantity]}
        {@const itemInfo = gameEngine.getItemById(itemId)}
        {#if itemInfo && quantity > 0 && itemInfo.type !== 'material'}
          <div class="inventory-item" data-type={itemInfo.type}>
            <div class="item-header">
              <span class="item-name">{itemInfo.name}</span>
              <span class="item-quantity">x{Math.floor(quantity)}</span>
            </div>

            <p class="item-description">{itemInfo.description}</p>

            <div class="item-actions">
              {#if itemInfo.type === 'consumable'}
                <button class="use-btn" on:click={() => useConsumableItem(pawn.id, itemId)}>
                  Use
                </button>
              {:else if ['weapon', 'armor', 'tool'].includes(itemInfo.type)}
                <button
                  class="equip-btn"
                  class:loading={equipmentLoading}
                  on:click={() => equipPawnItem(pawn.id, itemId)}
                  disabled={!canEquipPawnItem(pawn, itemId) || equipmentLoading}
                >
                  {equipmentLoading ? 'Equipping...' : 'Equip'}
                </button>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    </div>
    <PawnInventory {pawn} />
    </div>
  </div>
</div>

<style>
  .equipment-section {
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    padding: 0;
  }

  .equipment-section h3 {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    margin: 1px 0 0 0;
    font-weight: normal;
  }

  .inventory-note {
    color: var(--text-muted);
    padding: 2px 8px;
    font-style: italic;
    font-size: 11px;
    border-bottom: 1px solid var(--border);
  }

  .gear-columns {
    display: grid;
    grid-template-columns: minmax(220px, 340px) 1fr;
    align-items: start;
  }

  .gear-columns .inventory-items {
    border-left: 1px solid var(--border);
  }

  .equipped-items h4,
  .inventory-items h4 {
    padding: 3px 8px;
    color: var(--text-dim);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
    font-weight: normal;
    margin: 0;
  }

  .inventory-grid {
    display: flex;
    flex-direction: column;
  }

  .inventory-item {
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    padding: 3px 8px;
  }
  .inventory-item:hover {
    background: var(--bg-hover);
  }

  .inventory-item[data-type='weapon'],
  .inventory-item[data-type='armor'],
  .inventory-item[data-type='tool'],
  .inventory-item[data-type='consumable'] {
    border-left: none;
  }

  .item-header {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .item-name {
    color: var(--text);
    font-size: 11px;
  }

  .item-quantity {
    color: var(--text-muted);
    font-size: 11px;
    margin-left: auto;
  }

  .item-description {
    color: var(--text-muted);
    font-size: 11px;
    margin: 0;
    font-style: italic;
  }

  .item-actions {
    display: flex;
    gap: 4px;
    margin-top: 2px;
  }

  .use-btn,
  .equip-btn {
    padding: 2px 8px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    background: var(--bg-hover);
    border: 1px solid var(--border-hi);
    color: var(--text);
  }

  .use-btn:hover {
    color: var(--pos);
  }
  .equip-btn:hover {
    color: var(--accent-hi);
  }

  .equip-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .equip-btn.loading {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
