<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import type { Pawn } from '$lib/game/core/types';
  import EquipmentDoll from './EquipmentDoll.svelte';
  import PawnInventory from './PawnInventory.svelte';

  export let pawn: Pawn;

  let equipmentLoading = false;

  function unequipPawnItem(pawnId: string, slot: string) {
    equipmentLoading = true;
    gameState.command({ type: 'unequipPawnItem', payload: { pawnId, slot } });
    equipmentLoading = false;
  }
</script>

<!-- Equipment and Inventory -->
<div class="equipment-section" id="equipment">
  <h3>| EQUIPMENT &amp; INVENTORY</h3>

  <div class="gear-columns">
    <!-- Currently Equipped -->
    <div class="equipped-items">
      <h4>Currently Equipped:</h4>
      <EquipmentDoll
        {pawn}
        loading={equipmentLoading}
        onUnequip={(slot) => unequipPawnItem(pawn.id, slot)}
        onTogglePin={(itemId) =>
          gameState.command({
            type: 'togglePinItem',
            payload: { pawnId: pawn.id, itemId },
            save: true
          })}
      />
    </div>

    <!-- Carried Items -->
    <div class="inventory-items">
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
    font-size: 12px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    margin: 1px 0 0 0;
    font-weight: normal;
  }

  .gear-columns {
    display: grid;
    grid-template-columns: minmax(220px, 340px) 1fr;
    align-items: start;
  }

  .gear-columns .inventory-items {
    border-left: 1px solid var(--border);
  }

  .equipped-items h4 {
    padding: 3px 8px;
    color: var(--text-dim);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
    font-weight: normal;
    margin: 0;
  }
</style>
