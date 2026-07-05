<!-- EquipmentDoll.svelte — paper-doll grid of equipment slots (RPG-style boxes) -->
<script lang="ts">
  import type { Pawn, EquipmentSlot, Item } from '$lib/game/core/types';
  import { gameCoordinator } from '$lib/game/systems/GameCoordinator';
  import ItemStatTooltip from '$lib/components/UI/ItemStatTooltip.svelte';
  import SpriteIcon from '$lib/components/UI/SpriteIcon.svelte';
  import { qualityPrefix, qualityColor } from '$lib/game/core/itemQuality';

  let {
    pawn,
    onUnequip,
    onTogglePin,
    loading = false
  }: {
    pawn: Pawn;
    onUnequip: (slot: EquipmentSlot) => void;
    onTogglePin?: (itemId: string) => void;
    loading?: boolean;
  } = $props();

  const isPinned = (itemId: string) => (pawn.pinnedItems ?? []).includes(itemId);

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
    { slot: 'amulet', label: 'Amulet' },
    { slot: 'ring', label: 'Ring' },
    { slot: 'ring2', label: 'Ring' }
  ];

  function inst(slot: EquipmentSlot) {
    return pawn.equipment?.[slot];
  }

  // Hover popup — the same stat/ability breakdown shown on craftable cards (ItemStatTooltip),
  // portaled to the cursor while hovering a filled slot.
  let statTip: { item: Item; x: number; y: number } | null = $state(null);
  function showTip(def: Item, e: MouseEvent) {
    statTip = { item: def, x: e.clientX, y: e.clientY };
  }
  function moveTip(e: MouseEvent) {
    if (statTip) statTip = { ...statTip, x: e.clientX, y: e.clientY };
  }
  function hideTip() {
    statTip = null;
  }
</script>

<div class="doll">
  {#each SLOTS as { slot, label } (slot)}
    {@const it = inst(slot)}
    {@const def = it ? gameCoordinator.getItemById(it.itemId) : null}
    {@const maxDur = def?.maxDurability ?? 100}
    {@const qColor = it ? qualityColor(it.quality) : undefined}
    <div
      class="slot-box"
      class:filled={!!it}
      class:empty={!it}
      style="grid-area: {slot}"
      onmouseenter={(e) => def && showTip(def, e)}
      onmousemove={moveTip}
      onmouseleave={hideTip}
      role="presentation"
    >
      <span class="slot-lbl">{label}</span>
      {#if it && def}
        {#if onTogglePin}
          <button
            class="pin"
            class:active={isPinned(it.itemId)}
            title={isPinned(it.itemId)
              ? 'Pinned — kept, never deposited. Click to unpin.'
              : 'Pin — the pawn keeps this item (never deposited).'}
            onclick={() => onTogglePin?.(it.itemId)}>{isPinned(it.itemId) ? '★' : '☆'}</button
          >
        {/if}
        {#if def.charSpans}
          <div class="icon-wrap">
            <SpriteIcon charSpans={def.charSpans} tint={qColor ?? def.color ?? null} px={34} />
          </div>
        {/if}
        {@const prefix = qualityPrefix(it.quality)}
        <span class="it-name" title={prefix ? `${prefix} ${def.name}` : def.name}
          >{#if prefix && qColor}<span class="rarity" style="color:{qColor}">{prefix}</span
            >&nbsp;{/if}{def.name}</span
        >
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

{#if statTip}
  <ItemStatTooltip item={statTip.item} x={statTip.x} y={statTip.y} />
{/if}

<style>
  .doll {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-areas:
      'headOuter headBase  gorget'
      'mainHand  bodyOuter offHand'
      'mainHand  bodyMid   offHand'
      'gloves    bodyBase  belt'
      'boots     back      amulet'
      'ring      ring2     .';
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
    font-size: 10px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  /* Filled slots show the pin (top-left) + unequip (top-right) — clear the label past the pin. */
  .slot-box.filled .slot-lbl {
    padding: 0 12px;
  }

  /* The item tile fills the slot's body so the sprite — not dead space — is the focus. */
  .icon-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding: 2px 0;
  }

  .it-name {
    font-size: 12px;
    color: var(--text);
    line-height: 1.15;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dur-bar {
    height: 3px;
    background: var(--bg-active);
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
    font-size: 11px;
    margin: auto;
  }

  .pin {
    position: absolute;
    top: 2px;
    left: 3px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    line-height: 1;
    padding: 1px 2px;
  }
  .pin:hover {
    color: var(--text);
  }
  .pin.active {
    color: var(--accent-hi, #ffd24a);
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
    font-size: 11px;
    line-height: 1;
    padding: 1px 2px;
  }
  .unequip:hover {
    color: var(--neg);
  }
  .unequip:disabled {
    opacity: 0.4;
  }
</style>
