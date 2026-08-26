<script lang="ts">
  import Self from './TreeViewNode.svelte';
  import type { ViewNode } from './treeView';

  let {
    node,
    open,
    sel,
    cols,
    shown,
    hiddenRows,
    hideRow,
    toggle,
    select,
    onhover,
    onout
  }: {
    node: ViewNode;
    open: Record<string, boolean>;
    sel: Record<string, boolean>;
    /** how many columns the detail row spans */
    cols: number;
    /** one flag per column index, in the source's column order */
    shown: boolean[];
    hiddenRows: Record<string, boolean>;
    hideRow: (id: string) => void;
    toggle: (key: string) => void;
    select: (id: string) => void;
    /** a view with no hover card (buildings) simply passes neither */
    onhover?: (row: unknown, e: MouseEvent) => void;
    onout?: () => void;
  } = $props();

  const shut = $derived(!open[node.key]);
  const pad = $derived(6 + node.depth * 13);
</script>

<tr class="grp d{Math.min(node.depth, 4)}">
  <td colspan={cols}>
    <button
      type="button"
      class="head"
      style="margin-left:{pad}px"
      onclick={() => toggle(node.key)}
      title={shut ? `expand ${node.label}` : `collapse ${node.label}`}
      >{shut ? '▸' : '▾'}&nbsp;{node.label}<i>{node.count}</i></button
    >

    {#each node.missing as m (m)}<span class="miss">– {m}</span>{/each}
  </td>
</tr>
{#if !shut}
  {#each node.children as child (child.key)}
    <Self
      node={child}
      {open}
      {sel}
      {cols}
      {shown}
      {hiddenRows}
      {hideRow}
      {toggle}
      {select}
      {onhover}
      {onout}
    />
  {/each}
  {#each node.rows.filter((r) => !hiddenRows[r.id]) as r (r.id)}
    <tr
      class="leaf"
      class:sel={sel[r.id]}
      onclick={() => select(r.id)}
      onmouseenter={(e) => onhover?.(r.hover, e)}
      onmousemove={(e) => onhover?.(r.hover, e)}
      onmouseleave={() => onout?.()}
    >
      {#each r.cells as c, i (i)}
        {#if shown[i] !== false}
          <td
            class={c.cls}
            title={c.title}
            style={i === 0 ? `padding-left:${pad + 20}px` : undefined}
            ><span class="v">{c.v}</span></td
          >
        {/if}
      {/each}
    </tr>
    {#if sel[r.id]}
      <tr class="detail">
        <td colspan={cols} style="padding-left:{pad + 20}px">
          {#if r.desc}<p>{r.desc}</p>{/if}
          <span class="id">{r.id}</span>
          <button type="button" class="hide" onclick={() => hideRow(r.id)}>hide this row</button>
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
    overflow: hidden;
    vertical-align: top;
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
  .held {
    color: var(--text-dim, #8a8a8a);
  }
  .fx {
    color: #7fa88c;
    font-size: 10px;
  }
  td .v {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .src {
    color: #7f8a92;
  }
  .recipes {
    color: #7f8a92;
    font-size: 9px;
    line-height: 1.3;
  }
  .recipes .v {
    white-space: normal;
    overflow-wrap: break-word;
    text-overflow: clip;
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
  .hide {
    margin-left: 10px;
    font: inherit;
    font-size: 10px;
    color: #8a7f5f;
    background: none;
    border: 1px solid #3a3324;
    border-radius: 3px;
    padding: 0 5px;
    cursor: pointer;
  }
  .hide:hover {
    color: #d8c48a;
    border-color: #6a5f42;
  }
</style>
