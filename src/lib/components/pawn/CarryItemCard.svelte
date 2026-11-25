<script lang="ts">
  import type { Item, ItemQuality, VesselContent } from '$lib/game/core/types';
  import { usedCapacityL } from '$lib/game/core/rules/gear/vessels';
  import { itemService } from '$lib/game/services/ItemService';
  import ItemStatTooltip from '$lib/components/UI/tooltip/ItemStatTooltip.svelte';
  import SpriteIcon from '$lib/components/UI/widget/SpriteIcon.svelte';
  import { qualityColor, qualityPrefix } from '$lib/game/core/rules/gear/itemQuality';
  import SkinBar from '$lib/components/UI/widget/SkinBar.svelte';

  let {
    def,
    name,
    quality = undefined,
    qty = null,
    durability = null,
    maxDurability = null,
    contents = null,
    famed = false,
    famedHistory = null,
    famedEnchants = null,
    pinned = false,
    onPin = null,
    onDrop,
    onConfigure = null,
    dropTitle = "Drop now — put this item down on the pawn's tile.",
    pinTitle = ''
  }: {
    def: Item;
    name: string;
    quality?: ItemQuality;
    qty?: number | null;
    durability?: number | null;
    maxDurability?: number | null;
    contents?: VesselContent[] | null;
    famed?: boolean;
    famedHistory?: string | null;
    famedEnchants?: string[] | null;
    pinned?: boolean;
    onPin?: (() => void) | null;
    onDrop: () => void;
    onConfigure?: (() => void) | null;
    dropTitle?: string;
    pinTitle?: string;
  } = $props();

  let qColor = $derived(qualityColor(quality));
  let prefix = $derived(qualityPrefix(quality));
  let hasPrefix = $derived(!!prefix && !!qColor && name.startsWith(`${prefix} `));
  let baseName = $derived(hasPrefix ? name.slice(prefix.length + 1) : name);

  const humanize = (id: string) => id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  let enchantLabels = $derived((famedEnchants ?? []).map(humanize).join(', '));

  let tip: { x: number; y: number } | null = $state(null);
  const show = (e: MouseEvent) => (tip = { x: e.clientX, y: e.clientY });
  const move = (e: MouseEvent) => {
    if (tip) tip = { x: e.clientX, y: e.clientY };
  };
  const hide = () => (tip = null);

  let weight = $derived(Math.round((def.weightKg ?? 0) * (qty ?? 1) * 10) / 10);
  let durPct = $derived(
    durability != null && maxDurability
      ? Math.max(0, Math.min(100, (durability / maxDurability) * 100))
      : null
  );

  let container = $derived(def.container ?? null);
  let held = $derived(contents ?? []);
  let usedL = $derived(usedCapacityL({ contents: held }));
  let fillPct = $derived(
    container && held.length
      ? Math.max(0, Math.min(100, (usedL / container.capacityL) * 100))
      : null
  );
  let fillTitle = $derived(
    held
      .map((e) =>
        e.litres != null
          ? `${itemService.getItemById(e.itemId)?.name ?? e.itemId} ${e.litres} L`
          : `${itemService.getItemById(e.itemId)?.name ?? e.itemId} ×${e.amount}`
      )
      .join(', ')
  );
</script>

<div class="row" class:pinned>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span class="name" onmouseenter={show} onmousemove={move} onmouseleave={hide}>
    <SpriteIcon item={def.id} tint={qColor} px={16} />
    <span class="name-text" class:famed
      >{#if hasPrefix}<span style:color={qColor}>{prefix}</span>&nbsp;{/if}{baseName}</span
    >
  </span>
  <b>{qty != null ? `×${qty}` : ''}</b>
  <em>{weight}</em>
  <span class="acts">
    {#if onConfigure}
      <button title="What this may be filled with" onclick={onConfigure}>⚙</button>
    {/if}
    {#if onPin}
      <button class:on={pinned} title={pinTitle} onclick={onPin}>{pinned ? '★' : '☆'}</button>
    {/if}
    <button title={dropTitle} onclick={onDrop}>↓</button>
  </span>
  {#if famed || durPct != null || (fillPct != null && container)}
    <div class="extra">
      {#if famed}
        {#if famedHistory}<p>{famedHistory}</p>{/if}
        {#if enchantLabels}<p class="ench">✦ {enchantLabels}</p>{/if}
      {/if}
      {#if durPct != null}
        <SkinBar
          value={durPct / 100}
          ramp={durPct < 30 ? 'ember' : 'leaf'}
          thin
          title="{durability}/{maxDurability}"
        />
      {/if}
      {#if fillPct != null && container}
        <SkinBar
          value={fillPct / 100}
          ramp="water"
          thin
          title="{fillTitle} — {usedL}/{container.capacityL} L"
        />
      {/if}
    </div>
  {/if}
</div>

{#if tip}
  <ItemStatTooltip item={def} x={tip.x} y={tip.y} />
{/if}

<style>
  .row {
    display: grid;
    grid-template-columns: 1fr 40px 44px 46px;
    gap: 6px;
    align-items: center;
    min-height: 18px;
  }
  .name {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    cursor: help;
  }
  .name-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .famed,
  .pinned .name-text {
    color: var(--accent-hi);
  }
  b,
  em {
    font-weight: normal;
    font-style: normal;
    text-align: right;
  }
  em {
    color: var(--text-dim);
  }
  .acts {
    display: flex;
    justify-content: flex-end;
    gap: 2px;
  }
  .acts button {
    padding: 0 2px;
    border: 0;
    background: none;
    font: inherit;
    color: var(--text-muted);
    cursor: pointer;
  }
  .acts button:hover,
  .acts button.on {
    color: var(--accent-hi);
  }
  .extra {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-left: 21px;
  }
  .extra p {
    margin: 0;
    color: var(--text-dim);
  }
  .extra .ench {
    color: var(--accent-hi);
  }
</style>
