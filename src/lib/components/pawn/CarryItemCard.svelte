<!-- CarryItemCard.svelte — one carried item rendered as a stat card. Hovering the name shows the full
     ItemStatTooltip (the same stat/ability panel used on crafting cards and the equipment doll), so
     every carried item — bulk good or tracked tool/weapon — surfaces its info. Used by PawnInventory. -->
<script lang="ts">
  import type { Item } from '$lib/game/core/types';
  import ItemStatTooltip from '$lib/components/UI/ItemStatTooltip.svelte';
  import SpriteIcon from '$lib/components/UI/SpriteIcon.svelte';

  let {
    def,
    name,
    qty = null,
    durability = null,
    maxDurability = null,
    pinned = false,
    onPin = null,
    onDrop,
    dropTitle = "Drop now — put this item down on the pawn's tile.",
    pinTitle = ''
  }: {
    def: Item;
    name: string;
    qty?: number | null;
    durability?: number | null;
    maxDurability?: number | null;
    pinned?: boolean;
    onPin?: (() => void) | null;
    onDrop: () => void;
    dropTitle?: string;
    pinTitle?: string;
  } = $props();

  // Stat panel portaled to the cursor while hovering the name (same UX as EquipmentDoll).
  let tip: { x: number; y: number } | null = $state(null);
  const show = (e: MouseEvent) => (tip = { x: e.clientX, y: e.clientY });
  const move = (e: MouseEvent) => {
    if (tip) tip = { x: e.clientX, y: e.clientY };
  };
  const hide = () => (tip = null);

  let durPct = $derived(
    durability != null && maxDurability
      ? Math.max(0, Math.min(100, (durability / maxDurability) * 100))
      : null
  );
</script>

<div class="card" class:pinned>
  {#if onPin}
    <button class="corner pin" class:active={pinned} title={pinTitle} onclick={onPin}
      >{pinned ? '★' : '☆'}</button
    >
  {/if}
  <button class="corner drop" title={dropTitle} onclick={onDrop}>↓</button>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span class="name" onmouseenter={show} onmousemove={move} onmouseleave={hide}>
    {#if def.charSpans}
      <SpriteIcon charSpans={def.charSpans} tint={def.color ?? null} px={16} />
    {/if}
    <span class="name-text">{name}</span>
  </span>

  <div class="meta">
    {#if qty != null}<span class="qty">×{qty}</span>{/if}
    {#if durPct != null}
      <div class="dur-bar" title="{durability}/{maxDurability}">
        <div class="dur-fill" class:low={durPct < 30} style="width:{durPct}%"></div>
      </div>
    {/if}
  </div>
</div>

{#if tip}
  <ItemStatTooltip item={def} x={tip.x} y={tip.y} />
{/if}

<style>
  .card {
    position: relative;
    border: 1px solid var(--border);
    background: var(--bg-panel);
    padding: 4px 6px 5px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-height: 42px;
    overflow: hidden;
  }
  .card.pinned {
    border-color: var(--accent-hi, #ffd24a);
  }

  .name {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-mono, monospace);
    font-size: 0.72rem;
    color: var(--text, #ccc);
    text-transform: uppercase;
    line-height: 1.2;
    /* leave room for the two corner buttons */
    padding-right: 26px;
    cursor: help;
  }
  .name:hover {
    color: var(--accent, #0f0);
  }
  .card.pinned .name {
    color: var(--accent-hi, #ffd24a);
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: auto;
  }
  .qty {
    font-family: var(--font-mono, monospace);
    font-size: 0.72rem;
    color: var(--accent, #0f0);
    font-weight: bold;
  }
  .dur-bar {
    flex: 1;
    height: 3px;
    background: var(--bg-active, #1a1f28);
  }
  .dur-fill {
    height: 100%;
    background: var(--pos, #4caf50);
  }
  .dur-fill.low {
    background: var(--neg, #e05a5a);
  }

  .corner {
    position: absolute;
    top: 2px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.7rem;
    line-height: 1;
    padding: 1px 2px;
    color: var(--text-dim, #666);
  }
  .pin {
    right: 16px;
  }
  .pin:hover {
    color: var(--text, #ccc);
  }
  .pin.active {
    color: var(--accent-hi, #ffd24a);
  }
  .drop {
    right: 2px;
  }
  .drop:hover {
    color: var(--neg, #e05a5a);
  }
</style>
