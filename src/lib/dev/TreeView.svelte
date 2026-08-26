<script lang="ts">
  import TreeViewNode from './TreeViewNode.svelte';
  import TreeViewHeader from './TreeViewHeader.svelte';
  import { everyKey, type TreeSource } from './treeView';

  let {
    source,
    onhover,
    onout
  }: {
    /** items, buildings — the table neither knows nor cares which */
    source: TreeSource;
    onhover?: (row: unknown, e: MouseEvent) => void;
    onout?: () => void;
  } = $props();

  const MIN_W = 44;
  const defaultWidth = (c: { key: string; num?: boolean }): number =>
    c.num ? 62 : c.key === 'name' ? 300 : c.key === 'recipes' ? 380 : 160;
  const storeKey = $derived(`f4x.treeview.cols.${source.noun}`);

  let widths = $state<Record<string, number>>({});
  let loadedFor = '';
  $effect(() => {
    if (loadedFor === storeKey) return;
    loadedFor = storeKey;
    let saved: Record<string, number> = {};
    try {
      saved = JSON.parse(localStorage.getItem(storeKey) ?? '{}');
    } catch {
      saved = {};
    }
    const next: Record<string, number> = {};
    for (const c of source.columns)
      next[c.key] = Math.max(MIN_W, Number(saved[c.key]) || defaultWidth(c));
    widths = next;
  });

  function resize(key: string, px: number) {
    widths[key] = Math.max(MIN_W, Math.round(px));
    try {
      localStorage.setItem(storeKey, JSON.stringify(widths));
    } catch {
      /* a dev tool in a private window still works, it just forgets */
    }
  }
  function resetWidths() {
    const next: Record<string, number> = {};
    for (const c of source.columns) next[c.key] = defaultWidth(c);
    widths = next;
    try {
      localStorage.removeItem(storeKey);
    } catch {
      /* nothing to forget */
    }
  }

  let q = $state('');
  let open = $state<Record<string, boolean>>({});
  let sel = $state<Record<string, boolean>>({});
  let sortKey = $state<string | null>(null);
  let sortDir = $state<1 | -1>(1);

  const toggle = (key: string) => (open[key] = !open[key]);
  const select = (id: string) => (sel[id] ? delete sel[id] : (sel[id] = true));

  function sortBy(key: string) {
    if (sortKey !== key) {
      sortKey = key;
      sortDir = 1;
    } else if (sortDir === 1) sortDir = -1;
    else {
      sortKey = null;
      sortDir = 1;
    }
  }

  const needle = $derived(q.trim().toLowerCase());
  const view = $derived(source.view(needle, sortKey, sortDir));

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const k of everyKey(view)) next[k] = true;
    open = next;
  };
  const collapseAll = () => (open = {});
  $effect(() => {
    if (needle) expandAll();
  });
</script>

<div class="wrap">
  <div class="controls">
    <input
      class="search"
      type="search"
      placeholder="filter {source.noun}, categories, ages…"
      bind:value={q}
    />
    <button class="btn" onclick={expandAll}>expand all</button>
    <button class="btn" onclick={collapseAll}>collapse all</button>
    <button class="btn" onclick={resetWidths}>reset widths</button>
    <span class="count"
      >{view.count} / {source.total}
      {source.noun}{#if Object.keys(sel).length}
        · {Object.keys(sel).length} open{/if}</span
    >
  </div>
  {#if source.hint}<p class="hint">{@html source.hint}</p>{/if}
  <div class="scroll">
    <table>
      <colgroup>
        {#each source.columns as c (c.key)}
          <col style="width:{widths[c.key] ?? defaultWidth(c)}px" />
        {/each}
      </colgroup>
      <TreeViewHeader columns={source.columns} {sortKey} {sortDir} {sortBy} {widths} {resize} />
      <tbody>
        {#each view.children as root (root.key)}
          <TreeViewNode
            node={root}
            {open}
            {sel}
            cols={source.columns.length}
            {toggle}
            {select}
            {onhover}
            {onout}
          />
        {/each}
        {#if !view.count}
          <tr><td colspan={source.columns.length} class="none">nothing matches “{q}”</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>

<style>
  .wrap {
    margin-top: 8px;
  }
  .controls {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 6px;
  }
  .search {
    background: #14120c;
    border: 1px solid #3a3324;
    color: #cfc39a;
    font: inherit;
    font-size: 12px;
    padding: 3px 8px;
    border-radius: 2px;
    min-width: 260px;
  }
  .search:focus {
    outline: none;
    border-color: #6d5a2c;
  }
  .btn {
    font: inherit;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    cursor: pointer;
    padding: 3px 8px;
    color: #b8a06a;
    background: #1b1810;
    border: 1px solid #3a3324;
    border-radius: 2px;
  }
  .btn:hover {
    border-color: #6d5a2c;
    color: #f0dda0;
  }
  .count {
    font-size: 11px;
    color: #7f7a66;
  }
  .hint {
    font-size: 11px;
    color: #8a8470;
    max-width: 100ch;
    margin: 0 0 8px;
  }
  .hint :global(code) {
    color: #9fce8a;
  }
  .hint :global(b) {
    color: #b8a06a;
    font-weight: 700;
  }
  .scroll {
    overflow: auto;
    max-height: 78vh;
    border: 1px solid #2a2519;
  }
  table {
    border-collapse: collapse;
    table-layout: fixed;
    width: max-content;
    min-width: 100%;
    font-size: 11px;
  }
  .none {
    padding: 12px;
    color: #7f7a66;
  }
</style>
