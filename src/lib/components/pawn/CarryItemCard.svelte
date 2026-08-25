<!-- CarryItemCard.svelte — one carried item rendered as a stat card. Hovering the name shows the full
     ItemStatTooltip (the same stat/ability panel used on crafting cards and the equipment doll), so
     every carried item — bulk good or tracked tool/weapon — surfaces its info. Used by PawnInventory. -->
<script lang="ts">
  import type { Item, ItemQuality, VesselContent } from '$lib/game/core/types';
  import { usedCapacityL } from '$lib/game/core/rules/gear/vessels';
  import { itemService } from '$lib/game/services/ItemService';
  import ItemStatTooltip from '$lib/components/UI/tooltip/ItemStatTooltip.svelte';
  import SpriteIcon from '$lib/components/UI/widget/SpriteIcon.svelte';
  import { qualityColor, qualityPrefix } from '$lib/game/core/rules/gear/itemQuality';

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
    /** What this VESSEL instance is holding (ItemInstance.contents) — fluids in litres, solids in
     *  units. The card draws a fill bar for the fluid part and names the whole lot in its title. */
    contents?: VesselContent[] | null;
    /** §I Famed identity (a named legend above the quality scale) — surfaced on the card face. */
    famed?: boolean;
    famedHistory?: string | null;
    famedEnchants?: string[] | null;
    pinned?: boolean;
    onPin?: (() => void) | null;
    onDrop: () => void;
    /** Vessels only: open the allow-list panel. Null on anything that holds nothing. */
    onConfigure?: (() => void) | null;
    dropTitle?: string;
    pinTitle?: string;
  } = $props();

  // §Q craft-quality tint: a rolled (Fine/Superior/Masterwork/…) item colours its sprite + the
  // RARITY WORD only; Standard/undefined falls back to the def's own colour and a plain name.
  let qColor = $derived(qualityColor(quality));
  // The passed `name` bakes in the quality prefix (getItemDisplayName) — split it back off so just
  // the prefix is coloured, not the whole item name. (Famed/dynamic names carry no prefix → no split.)
  let prefix = $derived(qualityPrefix(quality));
  let hasPrefix = $derived(!!prefix && !!qColor && name.startsWith(`${prefix} `));
  let baseName = $derived(hasPrefix ? name.slice(prefix.length + 1) : name);

  // §I Famed: a legend outshines the quality tint (gold name) and surfaces its history + enchant list.
  // Enchant ids are humanised inline (capitalise, `_`→space) so no backend token leaks into the card.
  const humanize = (id: string) => id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  let enchantLabels = $derived((famedEnchants ?? []).map(humanize).join(', '));

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

  // Vessel fill bar (waterskin/flask/jug/quiver). The bar tracks the VOLUME budget — litres for a
  // fluid, `volumeL × amount` for a solid — against the def's `container.capacityL`.
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

<div class="card" class:pinned>
  {#if onPin}
    <button class="corner pin" class:active={pinned} title={pinTitle} onclick={onPin}
      >{pinned ? '★' : '☆'}</button
    >
  {/if}
  <button class="corner drop" title={dropTitle} onclick={onDrop}>↓</button>
  {#if onConfigure}
    <button class="corner cfg" title="What this may be filled with" onclick={onConfigure}>⚙</button>
  {/if}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span class="name" onmouseenter={show} onmousemove={move} onmouseleave={hide}>
    {#if def.charSpans}
      <SpriteIcon charSpans={def.charSpans} tint={qColor ?? def.color ?? null} px={16} />
    {/if}
    <span class="name-text" class:famed style={famed ? 'color:var(--accent-hi, #ffd24a)' : ''}
      >{#if hasPrefix}<span class="rarity" style="color:{qColor}">{prefix}</span
        >&nbsp;{/if}{baseName}</span
    >
  </span>

  {#if famed}
    <div class="famed-id">
      {#if famedHistory}<div class="famed-hist">{famedHistory}</div>{/if}
      {#if enchantLabels}<div class="famed-ench">✦ {enchantLabels}</div>{/if}
    </div>
  {/if}

  <div class="meta">
    {#if qty != null}<span class="qty">×{qty}</span>{/if}
    {#if durPct != null}
      <div class="dur-bar" title="{durability}/{maxDurability}">
        <div class="dur-fill" class:low={durPct < 30} style="width:{durPct}%"></div>
      </div>
    {/if}
    {#if fillPct != null && container}
      <div class="fill-bar" title="{fillTitle} — {usedL}/{container.capacityL} L">
        <div class="fill-fill" style="width:{fillPct}%"></div>
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
  .name-text.famed {
    font-weight: bold;
    letter-spacing: 0.02em;
  }

  /* §I Famed identity block — the legend's history + enchant list under the name. */
  .famed-id {
    font-family: var(--font-mono, monospace);
    font-size: 0.62rem;
    line-height: 1.25;
    color: var(--text-dim, #888);
  }
  .famed-hist {
    font-style: italic;
  }
  .famed-ench {
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
  /* Liquid-container fill — a blue "water level" bar beside the condition bar. */
  .fill-bar {
    flex: 1;
    height: 3px;
    background: var(--bg-active, #1a1f28);
  }
  .fill-fill {
    height: 100%;
    background: #4fc3f7;
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
  .cfg {
    right: 30px;
  }
  .cfg:hover {
    color: var(--accent-hi, #ffd24a);
  }
</style>
