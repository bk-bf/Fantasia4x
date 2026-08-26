<script lang="ts">
  import type { ViewColumn } from './treeView';

  let {
    columns,
    sortKey,
    sortDir,
    sortBy
  }: {
    columns: ViewColumn[];
    sortKey: string | null;
    sortDir: 1 | -1;
    sortBy: (key: string) => void;
  } = $props();

  const arrow = (key: string) => (sortKey !== key ? '' : sortDir === 1 ? ' ▴' : ' ▾');
</script>

<thead>
  <tr>
    {#each columns as c (c.key)}
      <th class:l={!c.num}>
        <button
          type="button"
          class="sort"
          class:on={sortKey === c.key}
          title="Sort every shelf by {c.label.toLowerCase()} — again for descending, a third time for the natural order"
          onclick={() => sortBy(c.key)}>{c.label}{arrow(c.key)}</button
        >
      </th>
    {/each}
  </tr>
</thead>

<style>
  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: #191710;
    color: #8a7f5f;
    text-align: right;
    font-weight: 700;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 4px 6px;
    border-bottom: 1px solid #3a3324;
  }
  thead th.l {
    text-align: left;
  }
  .sort {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-transform: inherit;
    letter-spacing: inherit;
  }
  .sort:hover {
    color: #d8c48a;
  }
  .sort.on {
    color: #f0dda0;
  }
</style>
