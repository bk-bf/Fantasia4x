<script lang="ts">
  import type { Item } from '$lib/game/core/types.js';
  import {
    buildCategoryTree,
    collectItemIds,
    type TreeNode
  } from '$lib/components/util/itemCategoryTree.js';
  import { filterClipboard } from '$lib/stores/filterClipboard.js';
  import SpriteIcon from '$lib/components/UI/widget/SpriteIcon.svelte';
  import ItemFilterToolbar from './ItemFilterToolbar.svelte';

  let {
    items,
    allowed,
    onChange,
    listMaxHeight = '168px',
    fill = false,
    icons = false,
    stock
  }: {
    items: Item[];
    allowed: Set<string>;
    onChange: (ids: string[]) => void;
    listMaxHeight?: string;
    fill?: boolean;
    icons?: boolean;
    stock?: Record<string, number>;
  } = $props();

  let query = $state('');
  let collapsed = $state<Record<string, boolean>>({});

  const tree = $derived(buildCategoryTree(items, { query }));

  const counts = $derived.by(() => {
    const m = new Map<string, { allowed: number; total: number }>();
    const visit = (node: TreeNode) => {
      const ids = collectItemIds(node);
      m.set(node.path.join('/'), {
        allowed: ids.reduce((n, id) => n + (allowed.has(id) ? 1 : 0), 0),
        total: ids.length
      });
      node.children.forEach(visit);
    };
    tree.forEach(visit);
    return m;
  });

  function allNodeIds(): string[] {
    const ids: string[] = [];
    const visit = (node: TreeNode) => {
      ids.push(node.path.join('/'));
      node.children.forEach(visit);
    };
    tree.forEach(visit);
    return ids;
  }

  const anyExpanded = $derived(allNodeIds().some((id) => !collapsed[id]));

  function toggleItem(id: string) {
    const set = new Set(allowed);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange(Array.from(set));
  }

  function toggleNode(node: TreeNode) {
    const ids = collectItemIds(node);
    const set = new Set(allowed);
    const allOn = ids.every((id) => set.has(id));
    for (const id of ids) {
      if (allOn) set.delete(id);
      else set.add(id);
    }
    onChange(Array.from(set));
  }

  function toggleCollapseAll() {
    const next: Record<string, boolean> = {};
    if (anyExpanded) for (const id of allNodeIds()) next[id] = true;
    collapsed = next;
  }

  function copyFilter() {
    filterClipboard.copy(Array.from(allowed));
  }

  function pasteFilter() {
    const clip = filterClipboard.peek();
    if (!clip) return;
    const here = new Set(items.map((i) => i.id));
    onChange(clip.filter((id) => here.has(id)));
  }

  function indet(node: HTMLInputElement, partial: boolean) {
    node.indeterminate = partial;
    return {
      update(p: boolean) {
        node.indeterminate = p;
      }
    };
  }
</script>

{#snippet nodeRow(node: TreeNode, depth: number)}
  {@const id = node.path.join('/')}
  {@const c = counts.get(id) ?? { allowed: 0, total: 0 }}
  {@const allOn = c.total > 0 && c.allowed === c.total}
  {@const partial = c.allowed > 0 && !allOn}
  <div class="ifc-cat">
    <label class="ifc-row ifc-cat-hdr" style="padding-left: {depth * 12}px">
      <input
        type="checkbox"
        checked={allOn}
        use:indet={partial}
        onchange={() => toggleNode(node)}
      />
      <button
        type="button"
        class="ifc-cat-toggle"
        onclick={(e) => {
          e.preventDefault();
          collapsed[id] = !collapsed[id];
        }}
      >
        <span class="ifc-caret">{collapsed[id] ? '▸' : '▾'}</span>
        <span class="ifc-cat-name">{node.label}</span>
        <span class="ifc-cat-count">{c.allowed}/{c.total}</span>
      </button>
    </label>
    {#if !collapsed[id]}
      {#each node.children as child (child.path.join('/'))}
        {@render nodeRow(child, depth + 1)}
      {/each}
      {#each node.items as item (item.id)}
        <label class="ifc-row ifc-item-row" style="padding-left: {(depth + 1) * 12 + 2}px">
          <input
            type="checkbox"
            checked={allowed.has(item.id)}
            onchange={() => toggleItem(item.id)}
          />
          {#if icons}<SpriteIcon item={item.id} px={16} />{/if}
          <span class="ifc-name">{item.name}</span>
          {#if stock}<em class="ifc-stock">{stock[item.id] ?? 0}</em>{/if}
        </label>
      {/each}
    {/if}
  </div>
{/snippet}

<div class="ifc" class:fill>
  <ItemFilterToolbar bind:query {anyExpanded} {toggleCollapseAll} {copyFilter} {pasteFilter} />
  <div class="ifc-list" style:max-height={fill ? null : listMaxHeight}>
    {#each tree as root (root.path.join('/'))}
      {@render nodeRow(root, 0)}
    {/each}
    {#if tree.length === 0}
      <div class="ifc-empty">no matches</div>
    {/if}
  </div>
</div>

<style>
  .ifc.fill {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .fill .ifc-list {
    flex: 1;
    min-height: 0;
  }
  .ifc-name {
    flex: 1;
    min-width: 0;
  }
  .ifc-stock {
    font-style: normal;
    color: var(--text-dim);
  }
  .ifc-list {
    overflow-y: auto;
    padding-right: 2px;
  }
  .ifc-cat {
    margin-top: 2px;
  }
  .ifc-row {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 1px;
  }
  .ifc-cat-hdr {
    margin-top: 3px;
  }
  .ifc-cat-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    color: var(--accent-hi);
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .ifc-caret {
    width: 8px;
    flex: 0 0 auto;
  }
  .ifc-cat-name {
    flex: 1;
    text-align: left;
  }
  .ifc-cat-count {
    color: var(--text-dim);
  }
  .ifc-empty {
    color: var(--text-muted);
    padding: 4px 2px;
  }
  .ifc-row input[type='checkbox'] {
    appearance: none;
    width: 11px;
    height: 11px;
    border: 1px solid var(--border);
    background: var(--bg);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.2);
    cursor: pointer;
    position: relative;
    margin: 0;
    flex: 0 0 auto;
  }
  .ifc-row input[type='checkbox']:hover {
    border-color: var(--border-hi);
    background: var(--bg);
  }
  .ifc-row input[type='checkbox']:checked {
    background: var(--bg-active);
    border-color: var(--border-hi);
  }
  .ifc-row input[type='checkbox']:checked::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 0px;
    width: 4px;
    height: 7px;
    border: solid var(--accent-hi);
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  .ifc-row input[type='checkbox']:indeterminate {
    background: var(--bg-active);
    border-color: var(--border-hi);
  }
  .ifc-row input[type='checkbox']:indeterminate::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 4px;
    width: 5px;
    height: 0;
    border-top: 2px solid var(--accent-hi);
  }
</style>
