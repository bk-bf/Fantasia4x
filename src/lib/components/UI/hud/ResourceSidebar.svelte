<script lang="ts">
  import { currentStockpile, currentCulture, gameState } from '$lib/stores/gameState';
  import {
    collapsedResourceCategories,
    hideEmptyResourceCategories,
    hideSidebars,
    resourcesMinimized
  } from '$lib/stores/uiPrefs';
  import { itemService } from '$lib/game/services/ItemService';
  import { uiState } from '$lib/stores/uiState';
  import ScrollArea from '../widget/ScrollArea.svelte';
  import SpriteIcon from '../widget/SpriteIcon.svelte';
  import ChromeButton from '../widget/ChromeButton.svelte';
  import './hudColumns.css';
  import type { Item } from '$lib/game/core/types.js';
  import {
    buildCategoryTree,
    categoryKeyPath,
    collectItemIds,
    type TreeNode
  } from '$lib/components/util/itemCategoryTree.js';

  type StockItem = { id: string; name: string; amount: number; color?: string };

  const lastJumpIdx: Record<string, number> = {};
  function jumpToItemStack(itemId: string) {
    const stacks = ($gameState?.droppedItems ?? []).filter((d) => d.resourceId === itemId);
    if (stacks.length === 0) return;
    stacks.sort((a, b) => a.y - b.y || a.x - b.x);
    const idx = ((lastJumpIdx[itemId] ?? -1) + 1) % stacks.length;
    lastJumpIdx[itemId] = idx;
    const s = stacks[idx];
    uiState.focusMapOn(s.x, s.y, true);
  }

  const stockpile = $derived($currentStockpile as StockItem[]);
  const culture = $derived($currentCulture);
  const carcassIntactness = $derived($gameState?._carcassCondition ?? {});

  let itemChanges = $state<Record<string, number>>({});
  const prevAmounts: Record<string, number> = {};
  const timers: Record<string, ReturnType<typeof setTimeout>> = {};

  $effect(() => {
    for (const ni of stockpile) {
      const old = prevAmounts[ni.id];
      if (old !== undefined && old !== ni.amount) {
        const delta = ni.amount - old;
        if (delta !== 0) {
          itemChanges = { ...itemChanges, [ni.id]: delta };
          clearTimeout(timers[ni.id]);
          timers[ni.id] = setTimeout(() => {
            const { [ni.id]: _, ...rest } = itemChanges;
            itemChanges = rest;
          }, 2500);
        }
      }
      prevAmounts[ni.id] = ni.amount;
    }
  });

  const amountById = $derived(new Map(stockpile.map((s) => [s.id, s])));
  const tree = $derived.by((): TreeNode[] => {
    const defs: Item[] = [];
    for (const s of stockpile) {
      const def = itemService.getItemById(s.id);
      if (!def || def.hidden) continue;
      defs.push(def);
    }
    const seedLeaves = $hideEmptyResourceCategories
      ? []
      : itemService.getAllCategories().map(categoryKeyPath);
    return buildCategoryTree(defs, { seedLeaves });
  });

  function allNodeIds(): string[] {
    const ids: string[] = [];
    const visit = (n: TreeNode) => {
      ids.push(n.path.join('/'));
      n.children.forEach(visit);
    };
    tree.forEach(visit);
    return ids;
  }

  const collapsed = $derived(new Set($collapsedResourceCategories));
  const allExpanded = $derived(tree.length > 0 && allNodeIds().every((id) => !collapsed.has(id)));

  function toggleCat(id: string) {
    collapsedResourceCategories.toggle(id);
  }

  function toggleAll() {
    if (allExpanded) collapsedResourceCategories.setAll(allNodeIds());
    else collapsedResourceCategories.clear();
  }

  function intactnessColor(pct: number): string {
    if (pct >= 70) return 'var(--col-pos)';
    if (pct >= 35) return 'var(--col-hot)';
    return 'var(--col-neg)';
  }
</script>

{#snippet resNode(node: TreeNode, depth: number)}
  {@const id = node.path.join('/')}
  {@const open = !collapsed.has(id)}
  {@const count = collectItemIds(node).length}
  <div
    class="cat-hdr"
    class:open
    style="padding-left: {8 + depth * 10}px"
    onclick={() => toggleCat(id)}
    role="button"
    tabindex="0"
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleCat(id)}
  >
    <span class="caret">{open ? '▾' : '▸'}</span>
    <span class="cat-name">{node.label}</span>
    <span class="cat-count">{count}</span>
  </div>
  {#if open}
    {#if node.children.length === 0 && node.items.length === 0}
      <div class="cat-empty" style="padding-left: {24 + depth * 10}px">none</div>
    {/if}
    {#each node.children as child (child.path.join('/'))}
      {@render resNode(child, depth + 1)}
    {/each}
    {#each node.items as item (item.id)}
      {@const stock = amountById.get(item.id)}
      <div
        class="res-row"
        style="padding-left: {24 + depth * 10}px"
        onclick={() => jumpToItemStack(item.id)}
        role="button"
        tabindex="0"
        title="jump to a stack on the map"
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && jumpToItemStack(item.id)}
      >
        {#if itemChanges[item.id]}
          <span
            class="delta"
            class:pos={itemChanges[item.id] > 0}
            class:neg={itemChanges[item.id] < 0}
          >
            {itemChanges[item.id] > 0 ? '+' : ''}{Math.floor(itemChanges[item.id])}
          </span>
        {/if}
        <SpriteIcon item={item.id} px={16} />
        <span class="res-name">{item.name}</span>
        <span class="res-amt">
          {Math.floor(stock?.amount ?? 0)}
        </span>
      </div>
      {#if itemService.getItemById(item.id)?.isCarcass}
        {@const pct = Math.round(carcassIntactness[item.id] ?? 100)}
        <div class="carcass-row" style="padding-left: {24 + depth * 10}px">
          <span class="intactness-lbl" style="color:{intactnessColor(pct)}">INTACT</span>
          <span class="intactness-bar">
            {#each Array(10) as _, i}
              <span style="color:{intactnessColor(pct)}"
                >{i < Math.round(pct / 10) ? '█' : '░'}</span
              >
            {/each}
          </span>
          <span class="intactness-pct" style="color:{intactnessColor(pct)}">{pct}%</span>
        </div>
      {/if}
    {/each}
  {/if}
{/snippet}

<aside
  class="sidebar hud-col"
  class:transparent={$hideSidebars}
  class:collapsed={$resourcesMinimized}
>
  {#if $resourcesMinimized}
    <button
      class="restore-btn"
      title="Expand resources"
      aria-label="Expand resources"
      onclick={() => resourcesMinimized.set(false)}>›</button
    >
  {:else if culture}
    <div class="tools">
      <ChromeButton
        mini
        on={$hideEmptyResourceCategories}
        label="Toggle empty categories"
        title={$hideEmptyResourceCategories ? 'Only kinds in store' : 'Every kind'}
        onclick={() => hideEmptyResourceCategories.toggle()}>∅</ChromeButton
      >
      <ChromeButton
        mini
        label={allExpanded ? 'Collapse all categories' : 'Expand all categories'}
        disabled={tree.length === 0}
        onclick={toggleAll}>{allExpanded ? '−' : '+'}</ChromeButton
      >
    </div>

    <ScrollArea class="res-area">
      {#each tree as root (root.path.join('/'))}
        {@render resNode(root, 0)}
      {/each}
    </ScrollArea>
  {:else}
    <div class="empty">loading...</div>
  {/if}
</aside>

<style>
  .sidebar {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .sidebar.collapsed {
    align-items: center;
    padding-top: 4px;
  }
  .restore-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid var(--col-mute);
    background: none;
    color: var(--col-hot);
    font: inherit;
    cursor: pointer;
  }
  .tools {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    gap: 3px;
    padding: 4px 8px 2px;
  }
  .sidebar :global(.res-area) {
    flex: 1;
    padding: 0 0 8px;
  }
  .cat-hdr {
    display: flex;
    align-items: baseline;
    gap: 5px;
    padding: 5px 8px 0;
    cursor: pointer;
    color: var(--col-dim);
    letter-spacing: 1.6px;
    text-transform: uppercase;
    user-select: none;
  }
  .cat-hdr.open {
    color: var(--col-hot);
  }
  .caret {
    flex-shrink: 0;
    width: 8px;
    color: var(--col-mute);
  }
  .cat-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cat-count {
    margin-left: auto;
    color: var(--col-mute);
    flex-shrink: 0;
  }
  .cat-empty {
    color: var(--col-mute);
  }
  .res-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 5px;
    height: 17px;
    padding-right: 8px;
    cursor: pointer;
  }
  .res-name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .res-amt {
    flex-shrink: 0;
  }
  .delta {
    position: absolute;
    left: 3px;
    pointer-events: none;
    animation: fadeout 2.5s ease-out forwards;
  }
  .delta.pos {
    color: var(--col-pos);
  }
  .delta.neg {
    color: var(--col-neg);
  }
  @keyframes fadeout {
    70% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  .empty {
    padding: 8px;
    color: var(--col-mute);
  }
  .carcass-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 8px;
  }
  .intactness-bar {
    letter-spacing: -1px;
  }
</style>
