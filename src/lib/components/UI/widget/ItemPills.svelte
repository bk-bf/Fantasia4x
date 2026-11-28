<script lang="ts" module>
  export interface ItemPillView {
    itemId: string;
    qty?: string;
    sub?: string;
    dim?: boolean;
  }
</script>

<script lang="ts">
  import SpriteIcon from '$lib/components/UI/widget/SpriteIcon.svelte';
  import ItemInfoTip from './ItemInfoTip.svelte';
  import { buildItemInfo, type ItemInfoView } from '$lib/components/util/itemInfo';
  import { createPinnable } from '$lib/components/util/pinnable.svelte';

  let { pills, rows = false }: { pills: ItemPillView[]; rows?: boolean } = $props();

  const pin = createPinnable<ItemInfoView>();
</script>

{#if pills.length > 0}
  <div class="item-pills" class:rows>
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
        <SpriteIcon item={p.itemId} px={rows ? 16 : 14} />
        {#if rows}
          <span class="pill-name">{info.name}</span>
          {#if p.qty}<b class="pill-qty">{p.qty}</b>{/if}
          {#if p.sub}<em class="pill-sub">{p.sub}</em>{/if}
        {:else}
          {#if p.qty}<span class="pill-qty">{p.qty}</span>{/if}
          <span class="pill-name">{info.name}</span>
          {#if p.sub}<span class="pill-sub">{p.sub}</span>{/if}
        {/if}
      </div>
    {/each}
  </div>
{/if}

{#if pin.active}
  <ItemInfoTip info={pin.active} x={pin.x} y={pin.y} pinned={pin.pinned} />
{/if}

<style>
  .item-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-top: 1px;
  }
  .item-pill {
    display: flex;
    align-items: center;
    gap: 3px;
    background: color-mix(in srgb, var(--pill) 16%, var(--bg-panel));
    padding: 0 4px;
    height: 16px;
    font: 14px/14px var(--font-pixel);
    cursor: help;
  }
  .item-pill.dim {
    opacity: 0.45;
  }
  .pill-qty {
    color: var(--accent-hi);
  }
  .pill-name {
    color: var(--text);
    white-space: nowrap;
  }
  .pill-sub {
    color: var(--text-muted);
  }
  .rows {
    flex-direction: column;
    flex-wrap: nowrap;
    gap: 0;
    margin: 0;
  }
  .rows .item-pill {
    gap: 6px;
    height: 17px;
    padding: 0;
    background: none;
    font: 16px/17px var(--font-pixel);
  }
  .rows .item-pill.dim {
    opacity: 1;
  }
  .rows .pill-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--text-dim);
  }
  .rows .pill-qty {
    font-weight: normal;
    color: var(--text);
  }
  .rows .pill-sub {
    width: 28px;
    text-align: right;
    font-style: normal;
  }
  .rows .dim .pill-qty,
  .rows .dim .pill-sub {
    color: var(--neg);
  }
</style>
