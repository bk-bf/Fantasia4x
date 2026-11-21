<script lang="ts">
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import Well from '$lib/components/UI/widget/Well.svelte';
  import SpriteIcon from '$lib/components/UI/widget/SpriteIcon.svelte';

  export interface TradeRow {
    itemId: string;
    name: string;
    have: number;
    price: number;
    offered: number;
  }

  let {
    title,
    rows,
    onAdjust
  }: {
    title: string;
    rows: TradeRow[];
    onAdjust: (itemId: string, delta: number) => void;
  } = $props();
</script>

<Well {title} class="trade-well">
  <div class="trow th">
    <i></i><span>Item</span><em>Have</em><em>Worth</em><span class="c4">Offered</span>
  </div>
  <div class="rows">
    {#if rows.length === 0}
      <p class="empty">nothing to offer</p>
    {/if}
    {#each rows as row (row.itemId)}
      <div class="trow" class:on={row.offered > 0}>
        <SpriteIcon item={row.itemId} px={16} />
        <span title={row.name}>{row.name}</span>
        <em>×{row.have}</em>
        <em>{row.price}</em>
        <ChromeButton
          mini
          label="Less"
          disabled={row.offered <= 0}
          onclick={() => onAdjust(row.itemId, -1)}>−</ChromeButton
        >
        <b>{row.offered}</b>
        <ChromeButton
          mini
          label="More"
          disabled={row.offered >= row.have}
          onclick={() => onAdjust(row.itemId, 1)}>+</ChromeButton
        >
        <ChromeButton
          class="all"
          disabled={row.offered >= row.have}
          onclick={() => onAdjust(row.itemId, row.have - row.offered)}>All</ChromeButton
        >
      </div>
    {/each}
  </div>
</Well>

<style>
  :global(.trade-well) {
    display: flex;
    flex-direction: column;
  }
  .rows {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .trow {
    display: grid;
    grid-template-columns: 16px 1fr 40px 40px 19px 26px 19px 34px;
    gap: 4px;
    align-items: center;
    height: 22px;
    white-space: nowrap;
    color: var(--text);
  }
  .trow > span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .trow em {
    font-style: normal;
    text-align: right;
    color: var(--text-dim);
  }
  .trow b {
    font-weight: normal;
    text-align: center;
    color: var(--text-muted);
  }
  .trow.on > span,
  .trow.on b {
    color: var(--accent-hi);
  }
  .trow.th {
    height: 18px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1.2px;
  }
  .trow.th em {
    color: var(--text-muted);
  }
  .c4 {
    grid-column: 5 / span 4;
    text-align: center;
  }
  .trow :global(.all) {
    height: 19px;
    padding: 0 4px;
  }
  .empty {
    margin: 6px 0;
    color: var(--text-muted);
  }
</style>
