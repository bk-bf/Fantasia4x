<!-- ItemTreeNode.svelte — DEV TOOL. One level of the item tree: a group header row that folds, then
     its child groups, then its own leaf items. Recursive; ItemTree.svelte owns the open/selected
     state so folding is consistent across the whole tree and survives a filter. -->
<script lang="ts">
  import Self from './ItemTreeNode.svelte';
  import type { TreeNode } from './itemTree';
  import type { GearRow } from './gearDb';

  let {
    node,
    open,
    sel,
    toggle,
    select,
    onhover,
    onout
  }: {
    node: TreeNode;
    open: Record<string, boolean>;
    sel: Record<string, boolean>;
    toggle: (key: string) => void;
    select: (id: string) => void;
    onhover: (row: GearRow, e: MouseEvent) => void;
    onout: () => void;
  } = $props();

  const shut = $derived(!open[node.key]);
  // The indent is the whole point of the thing — depth reads as position, not as decoration.
  const pad = $derived(6 + node.depth * 13);
</script>

<tr class="grp d{Math.min(node.depth, 4)}">
  <td colspan="9">
    <button
      type="button"
      class="head"
      style="margin-left:{pad}px"
      onclick={() => toggle(node.key)}
      title={shut ? `expand ${node.label}` : `collapse ${node.label}`}
      >{shut ? '▸' : '▾'}&nbsp;{node.label}<i>{node.count}</i></button
    >
    <!-- Same marker the build grid uses: what this kit does NOT cover, spelled out rather than left
         for the reader to count six children and work out which one is absent. -->
    {#each node.missing as m (m)}<span class="miss">– {m}</span>{/each}
  </td>
</tr>
{#if !shut}
  {#each node.children as child (child.key)}
    <Self node={child} {open} {sel} {toggle} {select} {onhover} {onout} />
  {/each}
  {#each node.items as it (it.id)}
    <tr
      class="leaf"
      class:sel={sel[it.id]}
      onclick={() => select(it.id)}
      onmouseenter={(e) => onhover(it.row, e)}
      onmousemove={(e) => onhover(it.row, e)}
      onmouseleave={onout}
    >
      <td class="nm" style="padding-left:{pad + 20}px">{it.name}</td>
      <td class="num">{it.tier ?? '—'}</td>
      <td class="cls">{it.cls}</td>
      <td class="age">{it.age}</td>
      <td class="stat">{it.stat}</td>
      <td class="fx" title={it.effects}>{it.effects}</td>
      <td class="num">{it.weightKg || ''}</td>
      <td class="src">{it.source}</td>
      <td class="gate">{it.gatedBy}</td>
    </tr>
    {#if sel[it.id]}
      <tr class="detail">
        <td colspan="9" style="padding-left:{pad + 20}px">
          {#if it.desc}<p>{it.desc}</p>{/if}
          <span class="id">{it.id}</span>
        </td>
      </tr>
    {/if}
  {/each}
{/if}

<style>
  .grp > td {
    padding: 0;
  }
  .head {
    display: inline-block;
    font: inherit;
    cursor: pointer;
    margin: 1px 0;
    padding: 0 6px;
    font-size: 10px;
    font-weight: 700;
    color: #d8c48a;
    background: #2b2415;
    border: 1px solid #4a3d1f;
    border-radius: 2px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .head:hover {
    border-color: #6d5a2c;
    color: #f0dda0;
  }
  .head i {
    font-style: normal;
    opacity: 0.55;
    margin-left: 6px;
  }
  /* Each level cools off, so depth is readable at a glance without counting indents. */
  .d1 .head {
    color: #a8c8b0;
    background: #1b2620;
    border-color: #2f4438;
  }
  .d2 .head {
    color: #9fb6c8;
    background: #1a2027;
    border-color: #2e3c48;
  }
  .d3 .head {
    color: #b3a6c4;
    background: #201c28;
    border-color: #3b3348;
  }
  .d4 .head {
    color: #c2a68f;
    background: #241d18;
    border-color: #45362b;
  }
  .miss {
    display: inline-block;
    margin-left: 6px;
    font-size: 10px;
    color: #8a564a;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .leaf {
    cursor: pointer;
  }
  .leaf:hover td {
    background: #1c1a14;
  }
  .leaf.sel td {
    background: #2a2418;
    color: #f0dda0;
  }
  .leaf td {
    padding: 1px 6px;
    border-bottom: 1px solid #1a180f;
    white-space: nowrap;
  }
  .nm {
    color: #cfc39a;
  }
  .num {
    text-align: right;
    color: #8f8a70;
  }
  .age {
    color: #8fb0c8;
  }
  .cls {
    color: #9a8fb0;
  }
  .stat {
    color: #b8a06a;
  }
  /* Everything the sim reads off the item. Long by design — the tooltip carries the full string when
     it is clipped, because an audit needs to see the whole thing. */
  .fx {
    color: #7fa88c;
    font-size: 10px;
    max-width: 34ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .src {
    color: #7f8a92;
  }
  .gate {
    color: #6f6a58;
    font-size: 10px;
  }
  .detail td {
    padding: 3px 6px 6px;
    color: #9b9478;
    font-size: 11px;
    white-space: normal;
  }
  .detail p {
    margin: 0 0 3px;
    max-width: 70ch;
  }
  .id {
    color: #5f5a48;
    font-size: 10px;
  }
</style>
