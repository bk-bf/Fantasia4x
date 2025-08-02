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
  import { gameEngine } from '$lib/game/systems/GameEngineImpl';

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
        state.pawns[pawnIndex] = useConsumable(state.pawns[pawnIndex], itemId);
        const itemIndex = state.item.findIndex((item) => item.id === itemId);
        if (itemIndex !== -1 && state.item[itemIndex].amount >= 1) {
          const updatedItems = [...state.item];
          updatedItems[itemIndex] = {
            ...updatedItems[itemIndex],
            amount: updatedItems[itemIndex].amount - 1
          };
          if (updatedItems[itemIndex].amount <= 0) {
            updatedItems.splice(itemIndex, 1);
          }
          state.item = updatedItems;
          state = syncAllPawnInventories(state);
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
  <h3>⚔️ Equipment & Inventory</h3>
  <p class="inventory-note">All items from global storage are automatically available to equip</p>

  <!-- Currently Equipped -->
  <div class="equipped-items">
    <h4>Currently Equipped:</h4>
    <div class="equipment-slots">
      {#each ['weapon', 'armor', 'tool', 'accessory'] as slot}
        <div class="equipment-slot">
          <div class="slot-header">
            <span class="slot-name">{slot.charAt(0).toUpperCase() + slot.slice(1)}</span>
            {#if pawn.equipment && pawn.equipment[slot as EquipmentSlot]}
              <button
                class="unequip-btn"
                class:loading={equipmentLoading}
                on:click={() => unequipPawnItem(pawn.id, slot)}
                disabled={equipmentLoading}
              >
                {equipmentLoading ? 'Unequipping...' : 'Unequip'}
              </button>
            {/if}
          </div>

          {#if pawn.equipment && pawn.equipment[slot as EquipmentSlot]}
            {@const equippedItem = pawn.equipment[slot as EquipmentSlot]}
            {#if equippedItem}
              {@const itemInfo = gameEngine.getItemById(equippedItem.itemId)}
              <div class="equipped-item">
                <span class="item-icon">{itemInfo?.emoji || '📦'}</span>
                <div class="item-details">
                  <span class="item-name">{itemInfo?.name}</span>
                  <div class="durability-bar">
                    <div
                      class="durability-fill"
                      style="width: {(equippedItem.durability / equippedItem.maxDurability) * 100}%"
                    ></div>
                  </div>
                  <span class="durability-text">
                    {equippedItem.durability}/{equippedItem.maxDurability}
                  </span>
                </div>
              </div>
            {:else}
              <div class="empty-slot">Empty {slot} slot</div>
            {/if}
          {:else}
            <div class="empty-slot">Empty {slot} slot</div>
          {/if}
        </div>
      {/each}
    </div>
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
              <span class="item-icon">{itemInfo.emoji}</span>
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
  </div>
</div>

<style>
  /* Equipment Section */
  .equipment-section {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 25px;
    border-left: 4px solid #607d8b;
    margin-bottom: 30px;
  }

  .equipment-section h3 {
    color: #607d8b;
    margin: 0 0 15px 0;
    font-size: 1.4em;
    text-shadow: 0 0 10px rgba(96, 125, 139, 0.3);
  }

  .inventory-note {
    color: #888;
    margin: 0 0 25px 0;
    font-style: italic;
    text-align: center;
  }

  .equipped-items h4 {
    color: #607d8b;
    margin: 0 0 20px 0;
    font-size: 1.1em;
  }

  .equipment-slots {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
  }

  .equipment-slot {
    background: #000000;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 15px;
  }

  .slot-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .slot-name {
    color: #607d8b;
    font-weight: bold;
  }

  .unequip-btn {
    background: #ff5722;
    border: 1px solid #ff5722;
    color: white;
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.8em;
  }

  .unequip-btn:hover {
    background: #d84315;
  }

  .unequip-btn.loading {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .equipped-item {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .item-icon {
    font-size: 1.5em;
  }

  .item-details {
    flex: 1;
  }

  .item-name {
    color: #e0e0e0;
    font-weight: bold;
    display: block;
    margin-bottom: 5px;
  }

  .durability-bar {
    height: 6px;
    background: #333;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 3px;
  }

  .durability-fill {
    height: 100%;
    background: #4caf50;
    transition: width 0.3s ease;
  }

  .durability-text {
    color: #888;
    font-size: 0.8em;
  }

  .empty-slot {
    color: #666;
    font-style: italic;
    text-align: center;
    padding: 20px;
  }

  .inventory-items h4 {
    color: #607d8b;
    margin: 0 0 20px 0;
    font-size: 1.1em;
  }

  .inventory-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 15px;
  }

  .inventory-item {
    background: #000000;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 15px;
    transition: all 0.3s ease;
  }

  .inventory-item:hover {
    border-color: #607d8b;
  }

  .inventory-item[data-type='weapon'] {
    border-left: 3px solid #f44336;
  }

  .inventory-item[data-type='armor'] {
    border-left: 3px solid #2196f3;
  }

  .inventory-item[data-type='tool'] {
    border-left: 3px solid #ff9800;
  }

  .inventory-item[data-type='consumable'] {
    border-left: 3px solid #4caf50;
  }

  .item-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .item-quantity {
    color: #888;
    font-weight: bold;
    margin-left: auto;
  }

  .item-description {
    color: #ccc;
    font-size: 0.9em;
    margin: 0 0 15px 0;
    line-height: 1.4;
  }

  .item-actions {
    display: flex;
    gap: 8px;
  }

  .use-btn,
  .equip-btn {
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
    border: 1px solid;
    transition: all 0.3s ease;
  }

  .use-btn {
    background: #4caf50;
    border-color: #4caf50;
    color: white;
  }

  .use-btn:hover {
    background: #388e3c;
  }

  .equip-btn {
    background: #2196f3;
    border-color: #2196f3;
    color: white;
  }

  .equip-btn:hover {
    background: #1976d2;
  }

  .equip-btn:disabled {
    background: #666;
    border-color: #666;
    cursor: not-allowed;
    opacity: 0.6;
  }

  .equip-btn.loading {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .equipment-slots,
    .inventory-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
