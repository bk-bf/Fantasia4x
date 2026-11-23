<script lang="ts">
  import type { Item } from '$lib/game/core/types.js';
  import {
    buildCategoryTree,
    collectItemIds,
    type TreeNode
  } from '$lib/components/util/itemCategoryTree.js';
  import { filterClipboard } from '$lib/stores/filterClipboard.js';
  import SpriteIcon from '$lib/components/UI/widget/SpriteIcon.svelte';
  import ItemFilterRow from './ItemFilterRow.svelte';
  import PixelGlyph from '$lib/components/UI/widget/PixelGlyph.svelte';
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

  const FLAT_UP_TO = 12;
  let query = $state('');
  let collapsed = $state<Record<string, boolean>>({});

  const flat = $derived(items.length <= FLAT_UP_TO);
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
</script>

{#snippet itemRow(item: Item)}
  <ItemFilterRow indent={!flat} checked={allowed.has(item.id)} onchange={() => toggleItem(item.id)}
    >{#if icons}<SpriteIcon item={item.id} px={16} />{/if}<b>{item.name}</b>{#if stock}<em
        >{stock[item.id] ?? 0}</em
      >{/if}</ItemFilterRow
  >
{/snippet}

{#snippet nodeRow(node: TreeNode, depth: number)}
  {@const id = node.path.join('/')}
  {@const c = counts.get(id) ?? { allowed: 0, total: 0 }}
  {@const allOn = c.total > 0 && c.allowed === c.total}
  <div class="ifc-cat">
    <ItemFilterRow
      group
      checked={allOn}
      partial={c.allowed > 0 && !allOn}
      onchange={() => toggleNode(node)}
    >
      {#snippet lead()}
        <button
          type="button"
          class="ifc-caret"
          class:open={!collapsed[id]}
          aria-label={collapsed[id] ? `Open ${node.label}` : `Close ${node.label}`}
          onclick={() => (collapsed[id] = !collapsed[id])}><PixelGlyph name="right" /></button
        >
      {/snippet}
      {node.label}<em>{c.allowed}/{c.total}</em>
    </ItemFilterRow>
    {#if !collapsed[id]}
      {#each node.children as child (child.path.join('/'))}
        {@render nodeRow(child, depth + 1)}
      {/each}
      {#each node.items as item (item.id)}
        {@render itemRow(item)}
      {/each}
    {/if}
  </div>
{/snippet}

<div class="ifc" class:fill class:flat>
  {#if !flat}
    <ItemFilterToolbar bind:query {anyExpanded} {toggleCollapseAll} {copyFilter} {pasteFilter} />
  {/if}
  <div class="ifc-list" style:max-height={fill ? null : listMaxHeight}>
    {#if flat}
      {#each items as item (item.id)}
        {@render itemRow(item)}
      {/each}
    {:else}
      {#each tree as root (root.path.join('/'))}
        {@render nodeRow(root, 0)}
      {/each}
      {#if tree.length === 0}
        <div class="ifc-empty">Nothing by that name.</div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .ifc {
    font: 16px/18px var(--font-pixel);
    color: var(--text);
  }
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
  .ifc-list {
    overflow-y: auto;
    scrollbar-width: thin;
    padding-right: 2px;
  }
  .ifc-cat .ifc-cat {
    padding-left: 12px;
  }
  .ifc-caret {
    display: grid;
    place-items: center;
    flex: none;
    width: 14px;
    height: 19px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .ifc-caret.open :global(.glyph) {
    transform: rotate(90deg);
  }
  .ifc-empty {
    color: var(--text-muted);
    padding: 4px 2px;
  }
</style>
