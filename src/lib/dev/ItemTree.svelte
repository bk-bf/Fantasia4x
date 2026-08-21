<!-- ItemTree.svelte — DEV TOOL. Every item in items.jsonc as one nested, foldable table.

     The flat catalogue could not answer what an audit asks — "what does this age offer for this slot,
     and what sits empty beside it". Nesting answers it by position: Armour ▸ Bronze ▸ jackal_hide ▸
     light ▸ head. A tier with one child instead of six IS the hole, visible without reading a row.

     Taxonomy lives in itemTree.ts so a new item files itself; this file only draws it. -->
<script lang="ts">
  import ItemTreeNode from './ItemTreeNode.svelte';
  import { ITEM_TREE, TREE_ITEMS, buildTree, type TreeNode } from './itemTree';

  let q = $state('');
  let open = $state<Record<string, boolean>>({});
  let sel = $state<Record<string, boolean>>({});

  const toggle = (key: string) => (open[key] = !open[key]);
  const select = (id: string) => (sel[id] ? delete sel[id] : (sel[id] = true));

  // Filtering rebuilds the tree from the surviving rows rather than hiding cells: a branch that keeps
  // nothing disappears with its heading, so the counts on screen are always true.
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
  // A search with nothing unfolded shows only headings; open everything it kept.
  $effect(() => {
    if (needle) expandAll();
  });
</script>

<div class="wrap">
  <div class="controls">
    <input class="search" type="search" placeholder="filter items, categories, ages…" bind:value={q} />
    <button class="btn" onclick={expandAll}>expand all</button>
    <button class="btn" onclick={collapseAll}>collapse all</button>
    <span class="count"
      >{tree.count} / {TREE_ITEMS.length} items{#if Object.keys(sel).length}
        · {Object.keys(sel).length} open{/if}</span
    >
  </div>
  <p class="hint">
    Every entry in <code>items.jsonc</code>, filed by what it IS. Armour nests age ▸ set ▸ class ▸
    what it covers; consumables split food, drink, medicine and coatings, and perishables sit apart
    from what keeps. <b>Gated by</b> is the latest station in an item's whole ingredient chain — the
    thing that really decides which age it belongs to. Click a row for its description.
  </p>
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th class="l">Item</th>
          <th>Tier</th>
          <th class="l">Age</th>
          <th class="l">Stat</th>
          <th>kg</th>
          <th class="l">Made at</th>
          <th class="l">Gated by</th>
        </tr>
      </thead>
      <tbody>
        {#each tree.children as root (root.key)}
          <ItemTreeNode node={root} {open} {sel} {toggle} {select} />
        {/each}
        {#if !tree.count}
          <tr><td colspan="7" class="none">nothing matches “{q}”</td></tr>
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
  .none {
    padding: 12px;
    color: #7f7a66;
  }
</style>
