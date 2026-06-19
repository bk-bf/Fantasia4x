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
  import { buildItemInfo, type ItemInfoView } from '$lib/utils/itemInfo';

  let { pills }: { pills: ItemPillView[] } = $props();

  let hovered = $state<ItemInfoView | null>(null);
  let mx = $state(0);
  let my = $state(0);

  function enter(itemId: string, e: MouseEvent) {
    hovered = buildItemInfo(itemId);
    mx = e.clientX;
    my = e.clientY;
  }
  function move(e: MouseEvent) {
    mx = e.clientX;
    my = e.clientY;
  }
</script>

{#if pills.length > 0}
  <div class="item-pills">
    {#each pills as p, i (p.itemId + ':' + i)}
      {@const info = buildItemInfo(p.itemId)}
      <div
        class="item-pill"
        class:dim={p.dim}
        style="--pill: {info.color}"
        role="img"
        aria-label={info.name}
        onmouseenter={(e) => enter(p.itemId, e)}
        onmousemove={move}
        onmouseleave={() => (hovered = null)}
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

{#if hovered}
  <HoverTip x={mx} y={my}>
    <div class="tip-name" style="color: {hovered.color}">{hovered.name.toUpperCase()}</div>
    {#if hovered.description}
      <div class="tip-desc">{hovered.description}</div>
    {/if}
    {#if hovered.freshness || hovered.condition != null}
      <div class="tip-row tip-life">
        {#if hovered.freshness}<span>fresh ~{hovered.freshness}</span>{/if}
        {#if hovered.condition != null}<span>cond {hovered.condition}</span>{/if}
      </div>
    {/if}
    {#if hovered.craftedInto.length > 0}
      <div class="tip-hdr">CRAFTS INTO</div>
      <div class="tip-row">{hovered.craftedInto.join(' · ')}</div>
    {/if}
    {#if hovered.buildsInto.length > 0}
      <div class="tip-hdr">BUILDS</div>
      <div class="tip-row">{hovered.buildsInto.join(' · ')}</div>
    {/if}
    {#if hovered.craftedInto.length === 0 && hovered.buildsInto.length === 0}
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
    font-size: 8px;
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
    font-size: 9px;
    letter-spacing: 0.08em;
    margin-top: 4px;
  }
  .tip-row {
    color: var(--text);
    font-size: 10px;
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
</style>
