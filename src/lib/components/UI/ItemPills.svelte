<!-- ItemPills.svelte — a row of compact, item-coloured pills (e.g. a resource's harvest yields, or
     a recipe's ingredients/outputs). Each pill shows the item's sprite glyph, an optional quantity,
     and its name, tinted toward the item's own colour. Hovering a pill opens a cursor-following
     floating "item card" (HoverTip) with the item's description, where it's used in crafting/building
     recipes, and its base freshness / condition lifespans. The card view model is built lazily on
     hover via buildItemInfo. -->
<script lang="ts" module>
  export interface ItemPillView {
    /** Item id to resolve name/colour/sprite + the hover card. */
    itemId: string;
    /** Optional quantity label shown before the name (e.g. "×2", "1–3"). */
    qty?: string;
    /** Optional secondary text shown after the name, dimmer (e.g. a "(have)" stock count). */
    sub?: string;
    /** Dim the pill — e.g. a recipe ingredient the colony can't currently afford. */
    dim?: boolean;
  }
</script>

<script lang="ts">
  import SpriteIcon from '$lib/components/UI/SpriteIcon.svelte';
  import HoverTip from '$lib/components/UI/HoverTip.svelte';
  import { buildItemInfo, type ItemInfoView } from '$lib/components/util/itemInfo';
  import { createPinnable } from '$lib/components/util/pinnable.svelte';

  let { pills }: { pills: ItemPillView[] } = $props();

  const pin = createPinnable<ItemInfoView>();
</script>

{#if pills.length > 0}
  <div class="item-pills">
    {#each pills as p, i (p.itemId + ':' + i)}
      {@const info = buildItemInfo(p.itemId)}
      <div
        class="item-pill"
        class:dim={p.dim}
        style="--pill: {info.color}"
        role="button"
        tabindex="0"
        aria-label={info.name}
        onmouseenter={(e) => pin.open(buildItemInfo(p.itemId), p.itemId + ':' + i, e)}
        onmousemove={(e) => pin.move(e)}
        onmouseleave={() => pin.close()}
        onclick={(e) => pin.toggle(buildItemInfo(p.itemId), p.itemId + ':' + i, e)}
        onkeydown={(e) =>
          (e.key === 'Enter' || e.key === ' ') &&
          pin.toggle(buildItemInfo(p.itemId), p.itemId + ':' + i, e)}
      >
        {#if info.charSpans}
          <SpriteIcon charSpans={info.charSpans} tint={info.color} px={9} />
        {/if}
        {#if p.qty}<span class="pill-qty">{p.qty}</span>{/if}
        <span class="pill-name">{info.name}</span>
        {#if p.sub}<span class="pill-sub">{p.sub}</span>{/if}
      </div>
    {/each}
  </div>
{/if}

{#if pin.active}
  {@const h = pin.active}
  <HoverTip x={pin.x} y={pin.y} pinned={pin.pinned}>
    <div class="tip-name" style="color: {h.color}">{h.name.toUpperCase()}</div>
    {#if h.description}
      <div class="tip-desc">{h.description}</div>
    {/if}
    {#if h.freshness || h.condition != null}
      <div class="tip-row tip-life">
        {#if h.freshness}<span>fresh ~{h.freshness}</span>{/if}
        {#if h.condition != null}<span>cond {h.condition}</span>{/if}
      </div>
    {/if}
    {#if h.farming}
      <div class="tip-hdr">FARMING · {h.farming.crop}</div>
      {#each h.farming.rows as r}
        <div class="tip-row tip-farm">
          <span class="tip-dim">{r.label}</span><span>{r.val}</span>
        </div>
      {/each}
    {/if}
    {#if h.craftedInto.length > 0}
      <div class="tip-hdr">CRAFTS INTO</div>
      <div class="tip-row">{h.craftedInto.join(' · ')}</div>
    {/if}
    {#if h.buildsInto.length > 0}
      <div class="tip-hdr">BUILDS</div>
      <div class="tip-row">{h.buildsInto.join(' · ')}</div>
    {/if}
    {#if h.craftedInto.length === 0 && h.buildsInto.length === 0}
      <div class="tip-row tip-dim">— not used in any recipe</div>
    {/if}
  </HoverTip>
{/if}

<style>
  .item-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-top: 1px;
  }
  /* Brown-amber aesthetic, tinted toward the item's own colour. Kept tight so a row of pills is
     no bulkier than the plain "name ×n" text it replaced. */
  .item-pill {
    display: flex;
    align-items: center;
    gap: 2px;
    border: 0;
    background: color-mix(in srgb, var(--pill) 14%, rgba(28, 16, 6, 0.92));
    padding: 0 3px;
    height: 13px;
    font-size: 9px;
    line-height: 1;
    cursor: help;
  }
  /* Unaffordable ingredient — dimmed so it reads as "can't make this yet". */
  .item-pill.dim {
    opacity: 0.4;
  }
  .pill-qty {
    color: color-mix(in srgb, var(--pill) 70%, #e8c870);
    font-weight: bold;
  }
  .pill-name {
    color: color-mix(in srgb, var(--pill) 60%, #c8a060);
    white-space: nowrap;
  }
  .pill-sub {
    color: color-mix(in srgb, var(--pill) 40%, #8a7040);
  }
  .tip-name {
    font-weight: bold;
    letter-spacing: 0.04em;
  }
  .tip-desc {
    color: var(--text-muted);
    font-style: italic;
    margin: 3px 0;
  }
  .tip-hdr {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.08em;
    margin-top: 4px;
  }
  .tip-row {
    color: var(--text);
    font-size: 11px;
  }
  .tip-life {
    color: var(--text-muted);
    display: flex;
    gap: 10px;
    margin-top: 2px;
  }
  .tip-dim {
    color: var(--text-dim);
    font-style: italic;
  }
  /* Farming rows — label (dim) on the left, value on the right, like the env readout. */
  .tip-farm {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .tip-farm .tip-dim {
    font-style: normal;
  }
</style>
