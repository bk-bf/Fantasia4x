<!--
  TradeColumn.svelte — one side of the barter table (KINGDOMS-TRADE §4): the caravan's wares or
  the colony's stock. Each row shows what's there, its unit price in this deal, and the counter
  for how many are in the current offer. Selection is not commitment — the TRADE button commits.
-->
<script lang="ts">
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

<div class="col">
  <div class="col-hdr">| {title}</div>
  <div class="rows">
    {#if rows.length === 0}
      <div class="empty">nothing to offer</div>
    {/if}
    {#each rows as row (row.itemId)}
      <div class="row" class:active={row.offered > 0}>
        <span class="name" title={row.name}>{row.name}</span>
        <span class="have">×{row.have}</span>
        <span class="price">{row.price}</span>
        <span class="ctrl">
          <button class="btn" disabled={row.offered <= 0} onclick={() => onAdjust(row.itemId, -1)}
            >−</button
          >
          <span class="offered">{row.offered}</span>
          <button
            class="btn"
            disabled={row.offered >= row.have}
            onclick={() => onAdjust(row.itemId, 1)}>+</button
          >
          <button
            class="btn all"
            disabled={row.offered >= row.have}
            onclick={() => onAdjust(row.itemId, row.have - row.offered)}>all</button
          >
        </span>
      </div>
    {/each}
  </div>
</div>

<style>
  .col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    background: var(--bg);
  }
  .col-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    letter-spacing: 0.08em;
    font-size: 11px;
    border-bottom: 1px solid var(--border-hi);
    flex-shrink: 0;
  }
  .rows {
    overflow-y: auto;
    min-height: 0;
    flex: 1;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-bottom: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-dim);
  }
  .row.active {
    background: var(--bg-active);
    color: var(--accent-hi);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .have {
    color: var(--text-muted);
    width: 42px;
    text-align: right;
  }
  .price {
    color: var(--text);
    width: 36px;
    text-align: right;
  }
  .row.active .price {
    color: var(--accent-hi);
  }
  .ctrl {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: 11px;
    width: 20px;
    padding: 0;
    cursor: pointer;
    line-height: 16px;
  }
  .btn.all {
    width: 28px;
    font-size: 9px;
  }
  .btn:hover:enabled {
    color: var(--accent-hi);
    border-color: var(--border-hi);
  }
  .btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .offered {
    width: 26px;
    text-align: center;
    color: var(--text);
  }
  .empty {
    padding: 12px;
    color: var(--text-muted);
    font-style: italic;
    font-size: 11px;
  }
</style>
