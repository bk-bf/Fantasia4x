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

  <!-- Currently Equipped -->
  <div class="equipped-items">
    <h4>Currently Equipped:</h4>
    <div class="equipment-slots">
      {#each (['mainHand','offHand','headBase','headOuter','bodyBase','bodyMid','bodyOuter','gloves','boots','gorget','ring','belt','back'] as const) as slot}
        <div class="equipment-slot">
          <div class="slot-header">
            <span class="slot-name">{slot}</span>
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
            {@const inst = pawn.equipment[slot as EquipmentSlot]}
            {#if inst}
              {@const itemInfo = gameEngine.getItemById(inst.itemId)}
              {@const maxDur = itemInfo?.maxDurability ?? 100}
              <div class="equipped-item">
                <span class="item-icon">{itemInfo?.emoji || '📦'}</span>
                <div class="item-details">
                  <span class="item-name">{itemInfo?.name}</span>
                  <div class="durability-bar">
                    <div
                      class="durability-fill"
                      style="width: {(inst.durability / maxDur) * 100}%"
                    ></div>
                  </div>
                  <span class="durability-text">
                    {inst.durability}/{maxDur}
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

  .equipment-slots {
    display: flex;
    flex-direction: column;
    margin-bottom: 0;
  }

  .equipment-slot {
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    padding: 3px 8px;
  }
  .equipment-slot:hover {
    background: var(--bg-hover);
  }

  .slot-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .slot-name {
    color: var(--text-dim);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .unequip-btn {
    background: var(--bg-hover);
    border: 1px solid var(--border-hi);
    color: var(--text);
    padding: 1px 6px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 10px;
  }
  .unequip-btn:hover {
    color: var(--neg);
    border-color: var(--neg);
  }
  .unequip-btn.loading {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .equipped-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 1px 0;
  }

  .item-icon {
    display: none;
  }

  .item-details {
    flex: 1;
  }

  .item-name {
    color: var(--text);
    font-size: 11px;
    display: block;
  }

  .durability-bar {
    height: 3px;
    background: var(--bg-active);
    margin: 2px 0;
  }

  .durability-fill {
    height: 100%;
    background: var(--pos);
  }

  .durability-text {
    color: var(--text-muted);
    font-size: 10px;
  }

  .empty-slot {
    color: var(--text-muted);
    font-style: italic;
    font-size: 11px;
    padding: 1px 0;
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
