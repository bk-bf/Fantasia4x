<!-- ItemTreeHeader.svelte — DEV TOOL. The item tree's sticky, sortable header row.
     Its own component because the sort control carries its own styling and ItemTree.svelte is at the
     200-line component budget; the sort MODEL (which columns exist, how a column compares) lives in
     itemTree.ts, so this file only draws the buttons and reports clicks. -->
<script lang="ts">
  import { SORT_COLUMNS, type SortKey } from './itemTree';

  let {
    sortKey,
    sortDir,
    sortBy
  }: {
    sortKey: SortKey | null;
    sortDir: 1 | -1;
    sortBy: (key: SortKey) => void;
  } = $props();

  const arrow = (key: SortKey) => (sortKey !== key ? '' : sortDir === 1 ? ' ▴' : ' ▾');
</script>

<thead>
  <tr>
    {#each SORT_COLUMNS as c (c.key)}
      <th class:l={!c.num}>
        <button
          type="button"
          class="sort"
          class:on={sortKey === c.key}
          title="Sort every shelf by {c.label.toLowerCase()} — again for descending, a third time for the age ladder"
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
