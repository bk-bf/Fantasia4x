<!-- SortableTable.svelte — the gear-db table chrome, as a component.

     Extracted rather than copied: the catalogue's table (sticky uppercase headers, click-to-sort with a
     direction arrow, right-aligned tabular numerics, hover row tint) was inline in `gear-db/+page.svelte`,
     and the audit tab needs exactly the same thing. Column descriptors keep the same shape the catalogue
     already uses — `{ key, label, numeric, get, disp }` — so migrating that page onto this later is a
     swap rather than a rewrite.

     Sorting is on `get(row)`, so a column can sort by a raw number while displaying something formatted. -->
<script lang="ts" generics="T">
  import type { Column } from './sortableTable';

  let {
    columns,
    rows,
    initialSort,
    initialDir = 1,
    caption,
    rowKey,
    onRowClick,
    rowSelected
  }: {
    columns: Column<T>[];
    rows: T[];
    initialSort?: string;
    initialDir?: 1 | -1;
    caption?: string;
    /** Stable key per row. Without it rows are keyed by index, which is fine for a static table but
     *  loses element identity when the list is filtered. */
    rowKey?: (row: T) => string;
    /** Makes rows clickable — the catalogue uses it to select an entry across tables. */
    onRowClick?: (row: T) => void;
    rowSelected?: (row: T) => boolean;
  } = $props();

  let sortKey = $state(initialSort ?? columns[0]?.key ?? '');
  let sortDir = $state<1 | -1>(initialDir);

  function sortBy(key: string) {
    if (sortKey === key) sortDir = sortDir === 1 ? -1 : 1;
    else {
      sortKey = key;
      // A numeric column is nearly always most useful biggest-first on the first click; a text one
      // reads better A–Z. Matches how the catalogue behaves.
      sortDir = columns.find((c) => c.key === key)?.numeric ? -1 : 1;
    }
  }

  const sorted = $derived.by(() => {
    const col = columns.find((c) => c.key === sortKey) ?? columns[0];
    if (!col) return rows;
    return rows.slice().sort((a, b) => {
      const av = col.get(a);
      const bv = col.get(b);
      // Blanks sort LAST whichever way the column is pointing — an empty cell is absent data, not a
      // small value, and letting it lead a descending sort buries the rows that matter.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sortDir;
      return String(av).localeCompare(String(bv)) * sortDir;
    });
  });
</script>

<div class="wrap">
  <table>
    {#if caption}<caption>{caption}</caption>{/if}
    <thead>
      <tr>
        {#each columns as c (c.key)}
          <th
            class:num={c.numeric}
            class:sorted={sortKey === c.key}
            title={c.title}
            onclick={() => sortBy(c.key)}
          >
            {c.label}{#if sortKey === c.key}<span class="arrow">{sortDir === 1 ? '▲' : '▼'}</span
              >{/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each sorted as row, i (rowKey ? rowKey(row) : i)}
        <tr
          class:clickable={!!onRowClick}
          class:sel={rowSelected?.(row)}
          onclick={onRowClick ? () => onRowClick(row) : undefined}
        >
          {#each columns as c (c.key)}
            <td
              class:num={c.numeric}
              class="{c.colCls ?? ''} {c.cls?.(row) ?? ''}"
              {...c.data?.(row) ?? {}}
            >
              {c.disp ? c.disp(row) : (c.get(row) ?? '—')}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .wrap {
    overflow-x: auto;
    border: 1px solid #362f22;
    border-radius: 6px;
    margin-bottom: 1.4rem;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 12.5px;
    white-space: nowrap;
  }
  caption {
    caption-side: top;
    text-align: left;
    padding: 6px 10px;
    color: #9a9279;
    font-size: 11px;
  }
  th,
  td {
    padding: 6px 10px;
    text-align: left;
    border-bottom: 1px solid #2a2519;
  }
  th {
    position: sticky;
    top: 0;
    background: #221e15;
    color: #9a9279;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    user-select: none;
    z-index: 1;
  }
  th.sorted {
    color: #d8ab52;
  }
  th.num,
  td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .arrow {
    font-size: 9px;
    margin-left: 3px;
  }
  tbody tr:hover td {
    background: rgba(216, 171, 82, 0.04);
  }
  td.up {
    color: #7ec98a;
  }
  td.down {
    color: #d08040;
  }
  td.dim {
    color: #8a8069;
  }
  tr.clickable {
    cursor: pointer;
  }
  tr.sel td {
    background: rgba(216, 171, 82, 0.12);
  }
</style>
