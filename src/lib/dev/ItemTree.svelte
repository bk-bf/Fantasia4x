<script lang="ts">
  import ItemTreeNode from './ItemTreeNode.svelte';
  import ItemTreeHeader from './ItemTreeHeader.svelte';
  import {
    ITEM_TREE,
    TREE_ITEMS,
    buildTree,
    sortTree,
    type SortKey,
    type TreeNode
  } from './itemTree';
  import type { GearRow } from './gearDb';

  let { onhover, onout }: { onhover: (row: GearRow, e: MouseEvent) => void; onout: () => void } =
    $props();

  let q = $state('');
  let open = $state<Record<string, boolean>>({});
  let sel = $state<Record<string, boolean>>({});

  const toggle = (key: string) => (open[key] = !open[key]);
  const select = (id: string) => (sel[id] ? delete sel[id] : (sel[id] = true));

  let sortKey = $state<SortKey | null>(null);
  let sortDir = $state<1 | -1>(1);
  function sortBy(key: SortKey) {
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
  const tree = $derived(
    needle
      ? buildTree(
          TREE_ITEMS.filter(
            (i) =>
              i.name.toLowerCase().includes(needle) ||
              i.id.includes(needle.replace(/ /g, '_')) ||
              i.path.some((p) => p.toLowerCase().includes(needle))
          )
        )
      : ITEM_TREE
  );

  const view = $derived(sortTree(tree, sortKey, sortDir));

  const everyKey = (n: TreeNode, out: string[] = []): string[] => {
    for (const c of n.children) {
      out.push(c.key);
      everyKey(c, out);
    }
    return out;
  };
  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const k of everyKey(tree)) next[k] = true;
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
      placeholder="filter items, categories, ages…"
      bind:value={q}
    />
    <button class="btn" onclick={expandAll}>expand all</button>
    <button class="btn" onclick={collapseAll}>collapse all</button>
    <span class="count"
      >{tree.count} / {TREE_ITEMS.length} items{#if Object.keys(sel).length}
        · {Object.keys(sel).length} open{/if}</span
    >
  </div>
  <p class="hint">
    Every entry in <code>items.jsonc</code>, filed by what it IS and then by <b>age</b> — a level
    with one child instead of six is the hole, visible without reading a row. Armour nests age ▸ set
    ▸
    <b>body layer</b> ▸ what it covers, layers outermost first, because armour is subtractive and
    layers add. <b>Gated by</b> is the latest station in an item's whole ingredient chain, which is what
    really decides its age. Click a row for its description, or a column heading to re-sort every shelf
    and its headings by it — again for descending, a third time back to the natural order.
  </p>
  <div class="scroll">
    <table>
      <ItemTreeHeader {sortKey} {sortDir} {sortBy} />
      <tbody>
        {#each view.children as root (root.key)}
          <ItemTreeNode node={root} {open} {sel} {toggle} {select} {onhover} {onout} />
        {/each}
        {#if !tree.count}
          <tr><td colspan="10" class="none">nothing matches “{q}”</td></tr>
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
  .hint code {
    color: #9fce8a;
  }
  .hint b {
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
    width: 100%;
    font-size: 11px;
  }
  .none {
    padding: 12px;
    color: #7f7a66;
  }
</style>
