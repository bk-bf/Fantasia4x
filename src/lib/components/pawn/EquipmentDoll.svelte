<!-- EquipmentDoll.svelte — paper-doll grid of equipment slots (RPG-style boxes) -->
<script lang="ts">
  import type { Pawn, EquipmentSlot } from '$lib/game/core/types';
  import { gameCoordinator } from '$lib/game/systems/GameCoordinator';

  let {
    pawn,
    onUnequip,
    loading = false
  }: {
    pawn: Pawn;
    onUnequip: (slot: EquipmentSlot) => void;
    loading?: boolean;
  } = $props();

  // Order here drives nothing visually — grid-area placement (CSS) lays out the doll.
  const SLOTS: { slot: EquipmentSlot; label: string }[] = [
    { slot: 'headOuter', label: 'Helm' },
    { slot: 'headBase', label: 'Head' },
    { slot: 'gorget', label: 'Neck' },
    { slot: 'mainHand', label: 'Main Hand' },
    { slot: 'bodyOuter', label: 'Outer' },
    { slot: 'offHand', label: 'Off Hand' },
    { slot: 'bodyMid', label: 'Mid' },
    { slot: 'bodyBase', label: 'Base' },
    { slot: 'gloves', label: 'Hands' },
    { slot: 'belt', label: 'Belt' },
    { slot: 'boots', label: 'Feet' },
    { slot: 'back', label: 'Back' },
    { slot: 'ring', label: 'Ring' }
  ];

  function inst(slot: EquipmentSlot) {
    return pawn.equipment?.[slot];
  }
</script>

<div class="doll">
  {#each SLOTS as { slot, label } (slot)}
    {@const it = inst(slot)}
    {@const def = it ? gameCoordinator.getItemById(it.itemId) : null}
    {@const maxDur = def?.maxDurability ?? 100}
    <div class="slot-box" class:filled={!!it} class:empty={!it} style="grid-area: {slot}">
      <span class="slot-lbl">{label}</span>
      {#if it && def}
        <span class="it-name" title={def.name}>{def.name}</span>
        <div class="dur-bar" title="{it.durability}/{maxDur}">
          <div
            class="dur-fill"
            class:low={it.durability / maxDur < 0.3}
            style="width: {Math.max(0, Math.min(100, (it.durability / maxDur) * 100))}%"
          ></div>
        </div>
        <button
          class="unequip"
          title="Unequip {def.name}"
          disabled={loading}
          onclick={() => onUnequip(slot)}>✕</button
        >
      {:else}
        <span class="empty-mk">—</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .doll {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-areas:
      'headOuter headBase  gorget'
      'mainHand  bodyOuter offHand'
      'mainHand  bodyMid   offHand'
      'gloves    bodyBase  belt'
      'boots     back      ring';
    gap: 4px;
    padding: 8px;
  }

  .slot-box {
    position: relative;
    border: 1px solid var(--border);
    background: var(--bg);
    min-height: 50px;
    padding: 3px 5px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }
  .slot-box.empty {
    border-style: dashed;
    opacity: 0.5;
  }
  .slot-box.filled {
    border-color: var(--accent);
    background: var(--bg-panel);
  }

  .slot-lbl {
    font-size: 9px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  .it-name {
    font-size: 11px;
    color: var(--text);
    line-height: 1.15;
  }

  .dur-bar {
    height: 3px;
    background: var(--bg-active);
    margin-top: auto;
  }
  .dur-fill {
    height: 100%;
    background: var(--pos);
  }
  .dur-fill.low {
    background: var(--neg);
  }

  .empty-mk {
    color: var(--text-muted);
    font-size: 10px;
    margin: auto;
  }

  .unequip {
    position: absolute;
    top: 2px;
    right: 3px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
    font-size: 10px;
    line-height: 1;
    padding: 1px 2px;
  }
  .unequip:hover {
    color: var(--neg);
  }
  .unequip:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
