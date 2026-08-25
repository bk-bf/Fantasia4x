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
  const population = $derived($gameState?.pawns?.length ?? 0);
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
    if (pct >= 70) return 'var(--pos)';
    if (pct >= 35) return '#e8b830';
    return 'var(--neg)';
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
        <span class="res-name">{item.name}</span>
        <span class="dots"></span>
        <span class="res-amt" style="color:{stock?.color || 'var(--text)'}">
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

<aside class="sidebar" class:transparent={$hideSidebars} class:collapsed={$resourcesMinimized}>
  {#if $resourcesMinimized}
    <button
      class="restore-btn"
      title="Expand resources"
      aria-label="Expand resources"
      onclick={() => resourcesMinimized.set(false)}>›</button
    >
  {:else if culture}
    <div class="sticky-top">
      <div class="section-hdr">| KINGDOM</div>
      <div class="rows">
        <div class="row">
          <span class="lbl">SETTLEMENT</span>
          <span class="val hi">{culture.name}</span>
        </div>
        <div class="row">
          <span class="lbl">POPULATION</span>
          <span class="val">{population}</span>
        </div>
      </div>

      <div class="section-hdr top-sep res-hdr">
        <span>| RESOURCES</span>
        <span class="hdr-btns">
          <button
            class="hdr-btn"
            class:active={$hideEmptyResourceCategories}
            title={$hideEmptyResourceCategories
              ? 'Showing only non-empty categories — click to show all'
              : 'Showing all categories — click to hide empty ones'}
            aria-label="Toggle empty categories"
            onclick={() => hideEmptyResourceCategories.toggle()}>∅</button
          >
          <button
            class="hdr-btn"
            title={allExpanded ? 'Collapse all categories' : 'Expand all categories'}
            aria-label={allExpanded ? 'Collapse all categories' : 'Expand all categories'}
            disabled={tree.length === 0}
            onclick={toggleAll}>{allExpanded ? '⊟' : '⊞'}</button
          >
          <button
            class="hdr-btn"
            title="Minimise resources panel"
            aria-label="Minimise resources panel"
            onclick={() => resourcesMinimized.set(true)}>‹</button
          >
        </span>
      </div>
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
    background: var(--bg-panel);
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar.collapsed {
    align-items: center;
    padding-top: 4px;
    gap: 6px;
  }
  .restore-btn {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--accent-hi);
    font-family: inherit;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
  }
  .restore-btn:hover {
    border-color: var(--border-hi);
    background: var(--bg-hover);
  }

  .sidebar.transparent {
    background: transparent;
    text-shadow:
      1px 0 0 #000,
      -1px 0 0 #000,
      0 1px 0 #000,
      0 -1px 0 #000,
      0 0 12px rgba(0, 0, 0, 0.95),
      0 0 20px rgba(0, 0, 0, 0.9),
      0 2px 4px rgba(0, 0, 0, 1),
      0 4px 6px rgba(0, 0, 0, 1),
      0 6px 10px rgba(0, 0, 0, 1),
      0 8px 16px rgba(0, 0, 0, 0.95),
      0 10px 24px rgba(0, 0, 0, 0.9);
  }
  .sidebar.transparent .section-hdr {
    background: transparent;
    border-bottom: none;
  }
  .sidebar.transparent .top-sep {
    border-top: none;
  }
  .sidebar.transparent .cat-hdr {
    border-bottom: none;
  }
  .sidebar.transparent .row,
  .sidebar.transparent .res-row,
  .sidebar.transparent .cat-hdr,
  .sidebar.transparent button {
    pointer-events: auto;
  }
  .sidebar.transparent .row,
  .sidebar.transparent .res-row {
    background: linear-gradient(
      to right,
      transparent,
      color-mix(in srgb, var(--bg-hover) 33%, transparent) 10%,
      color-mix(in srgb, var(--bg-hover) 33%, transparent) 90%,
      transparent
    );
  }
  .sidebar.transparent .row:hover,
  .sidebar.transparent .res-row:hover {
    background: var(--bg-hover);
  }

  .sticky-top {
    flex-shrink: 0;
  }

  .section-hdr {
    padding: 4px 8px 3px;
    color: var(--accent-hi);
    font-size: 12px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }

  .res-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .hdr-btns {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .hdr-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 15px;
    height: 15px;
    padding: 0;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-dim);
    font-family: inherit;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
  }
  .hdr-btn:hover:not(:disabled) {
    color: var(--accent-hi);
    border-color: var(--accent-hi);
    background: var(--bg-hover);
  }
  .hdr-btn.active {
    color: var(--accent-hi);
    border-color: var(--accent-hi);
  }
  .hdr-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .top-sep {
    margin-top: 4px;
    border-top: 1px solid var(--border);
  }

  .rows {
    padding: 2px 0;
  }

  .row {
    display: flex;
    align-items: baseline;
    padding: 2px 8px;
    gap: 4px;
  }
  .row:hover {
    background: var(--bg-hover);
  }

  .lbl {
    color: var(--text-dim);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .val {
    margin-left: auto;
    color: var(--text);
    text-align: right;
    white-space: nowrap;
  }
  .val.hi {
    color: var(--accent-hi);
  }

  .sidebar :global(.res-area) {
    flex: 1;
    padding: 2px 0;
  }

  .cat-hdr {
    display: flex;
    align-items: baseline;
    gap: 5px;
    padding: 3px 8px;
    cursor: pointer;
    color: var(--text-dim);
    border-bottom: 1px solid var(--border);
    user-select: none;
  }
  .cat-hdr:hover {
    background: var(--bg-hover);
  }
  .cat-hdr.open {
    color: var(--accent-hi);
  }
  .caret {
    flex-shrink: 0;
    width: 8px;
    color: var(--text-muted);
  }
  .cat-hdr.open .caret {
    color: var(--accent-hi);
  }
  .cat-name {
    letter-spacing: 0.05em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cat-count {
    margin-left: auto;
    color: var(--text-muted);
    font-size: 10px;
    flex-shrink: 0;
  }
  .cat-empty {
    padding: 1px 8px 1px 24px;
    color: var(--text-muted);
    font-size: 10px;
    font-style: italic;
  }

  .res-row {
    position: relative;
    display: flex;
    align-items: baseline;
    padding: 1px 8px 1px 24px;
    gap: 3px;
    cursor: pointer;
  }
  .res-row:hover {
    background: var(--bg-hover);
  }

  .res-name {
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
    font-size: 12px;
  }

  .dots {
    flex: 1;
    border-bottom: 1px dotted var(--text-muted);
    margin: 0 3px 2px;
    min-width: 4px;
  }

  .res-amt {
    font-weight: bold;
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 11px;
  }

  .delta {
    position: absolute;
    left: 3px;
    top: 1px;
    font-size: 10px;
    font-weight: bold;
    white-space: nowrap;
    pointer-events: none;
    animation: fadeout 2.5s ease-out forwards;
  }
  .delta.pos {
    color: var(--pos);
  }
  .delta.neg {
    color: var(--neg);
  }

  @keyframes fadeout {
    0% {
      opacity: 1;
    }
    70% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  .empty {
    padding: 8px;
    color: var(--text-muted);
    font-size: 10px;
    font-style: italic;
  }

  .carcass-row {
    display: flex;
    align-items: center;
    padding: 0 8px 2px 24px;
    gap: 4px;
    font-size: 10px;
    font-family: var(--font-mono);
  }

  .intactness-lbl {
    white-space: nowrap;
    flex-shrink: 0;
    letter-spacing: 0.03em;
  }

  .intactness-bar {
    letter-spacing: -1px;
    flex-shrink: 0;
  }

  .intactness-pct {
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 10px;
  }
</style>
