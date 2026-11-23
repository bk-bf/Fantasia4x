<script lang="ts">
  import type { EquipmentSlot, Pawn } from '$lib/game/core/types';
  import { gameState } from '$lib/stores/gameState';
  import Well from '$lib/components/UI/widget/Well.svelte';
  import LayeredGear from './gear/LayeredGear.svelte';
  import PawnInventory from './PawnInventory.svelte';
  import PawnProtection from './PawnProtection.svelte';

  let { pawn }: { pawn: Pawn } = $props();

  const unequip = (slot: EquipmentSlot) =>
    gameState.command({ type: 'unequipPawnItem', payload: { pawnId: pawn.id, slot } });
  const togglePin = (itemId: string) =>
    gameState.command({ type: 'togglePinItem', payload: { pawnId: pawn.id, itemId }, save: true });
</script>

<div class="gear">
  <Well title="Worn" scroll><LayeredGear {pawn} onUnequip={unequip} onTogglePin={togglePin} /></Well
  >
  <Well title="Pack" scroll><PawnInventory {pawn} /></Well>
  <Well title="Protection" scroll><PawnProtection {pawn} /></Well>
</div>

<style>
  .gear {
    display: grid;
    grid-template-columns: max-content 1fr 0.9fr;
    grid-template-rows: 290px;
    gap: 6px;
  }
</style>
