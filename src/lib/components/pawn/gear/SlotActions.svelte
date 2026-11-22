<script lang="ts">
  import type { EquipmentSlot, Item, ItemInstance } from '$lib/game/core/types';

  let {
    slot,
    inst,
    def,
    pinned,
    loading = false,
    onPin,
    onDrop
  }: {
    slot: EquipmentSlot;
    inst: ItemInstance;
    def: Item;
    pinned: boolean;
    loading?: boolean;
    onPin?: (itemId: string) => void;
    onDrop: (slot: EquipmentSlot) => void;
  } = $props();
</script>

<span class="acts">
  {#if onPin}
    <button
      class:on={pinned}
      title={pinned
        ? 'Pinned: kept, never deposited. Click to unpin.'
        : 'Pin: the pawn keeps this, never deposited.'}
      onclick={(e) => (e.stopPropagation(), onPin?.(inst.itemId))}>{pinned ? '★' : '☆'}</button
    >
  {/if}
  <button
    title="Unequip {def.name}"
    disabled={loading}
    onclick={(e) => (e.stopPropagation(), onDrop(slot))}>✕</button
  >
</span>

<style>
  .acts {
    display: flex;
    gap: 2px;
  }
  button {
    padding: 0 1px;
    border: 0;
    background: none;
    font: 16px/16px var(--font-pixel);
    color: var(--text-muted);
    cursor: pointer;
  }
  button:hover,
  button.on {
    color: var(--accent-hi);
  }
  button:disabled {
    opacity: 0.4;
  }
</style>
