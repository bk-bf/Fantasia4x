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
  import SkinBar from '../widget/SkinBar.svelte';
  import ColumnScrim from './ColumnScrim.svelte';
  import './hudColumns.css';
  import type { Item } from '$lib/game/core/types.js';
  import {
    buildCategoryTree,
    categoryKeyPath,
    collectItemIds
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
        itemChanges = { ...itemChanges, [ni.id]: ni.amount - old };
        clearTimeout(timers[ni.id]);
        timers[ni.id] = setTimeout(() => {
          const { [ni.id]: _, ...rest } = itemChanges;
          itemChanges = rest;
        }, 2500);
      }
      prevAmounts[ni.id] = ni.amount;
    }
  });

  const amountById = $derived(new Map(stockpile.map((s) => [s.id, s.amount])));
  const groups = $derived.by(() => {
    const defs: Item[] = [];
    for (const s of stockpile) {
      const def = itemService.getItemById(s.id);
      if (def && !def.hidden) defs.push(def);
    }
    const seedLeaves = $hideEmptyResourceCategories
      ? []
      : itemService.getAllCategories().map(categoryKeyPath);
    return buildCategoryTree(defs, { seedLeaves }).map((root) => ({
      id: root.path.join('/'),
      label: root.label,
      items: collectItemIds(root)
        .flatMap((id) => itemService.getItemById(id) ?? [])
        .sort((a, b) => a.name.localeCompare(b.name))
    }));
  });

  const collapsed = $derived(new Set($collapsedResourceCategories));
  const allExpanded = $derived(groups.length > 0 && groups.every((g) => !collapsed.has(g.id)));

  function toggleAll() {
    if (allExpanded) collapsedResourceCategories.setAll(groups.map((g) => g.id));
    else collapsedResourceCategories.clear();
  }

  const keys = (fn: () => void) => (e: KeyboardEvent) =>
    (e.key === 'Enter' || e.key === ' ') && fn();
</script>

<aside
  class="sidebar hud-col"
  class:transparent={$hideSidebars}
  class:collapsed={$resourcesMinimized}
>
  {#if $hideSidebars}<ColumnScrim />{/if}
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
        disabled={groups.length === 0}
        onclick={toggleAll}>{allExpanded ? '−' : '+'}</ChromeButton
      >
    </div>

    <ScrollArea class="res-area">
      {#each groups as g (g.id)}
        {@const open = !collapsed.has(g.id)}
        <button
          class="grp"
          class:shut={!open}
          onclick={() => collapsedResourceCategories.toggle(g.id)}>{g.label}</button
        >
        {#if open}
          {#each g.items as item (item.id)}
            {@const n = Math.floor(amountById.get(item.id) ?? 0)}
            {@const jump = () => jumpToItemStack(item.id)}
            <div
              class="row"
              onclick={jump}
              role="button"
              tabindex="0"
              onkeydown={keys(jump)}
            >
              {#if itemChanges[item.id]}
                <span class="delta" class:neg={itemChanges[item.id] < 0}>
                  {itemChanges[item.id] > 0 ? '+' : ''}{Math.floor(itemChanges[item.id])}
                </span>
              {/if}
              <SpriteIcon item={item.id} px={16} />
              <span class="name">{item.name}</span>
              {#if item.isCarcass}
                {@const pct = Math.round(carcassIntactness[item.id] ?? 100)}
                <SkinBar
                  value={pct / 100}
                  thin
                  ramp={pct >= 70 ? 'leaf' : pct >= 35 ? 'honey' : 'blood'}
                />
              {/if}
              <b>{n}</b>
            </div>
          {/each}
        {/if}
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
  .sidebar.transparent {
    overflow: visible;
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
    padding: 0 8px 8px 10px;
  }
  .grp {
    display: block;
    margin: 5px 0 0;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    letter-spacing: 1.6px;
    text-transform: uppercase;
    color: var(--col-hot);
    cursor: pointer;
    user-select: none;
  }
  .grp:first-child {
    margin-top: 0;
  }
  .grp.shut {
    color: var(--col-mute);
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 5px;
    height: 17px;
    cursor: pointer;
  }
  .name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
  }
  .row :global(.skin-bar) {
    flex: 0 0 28px;
    min-width: 0;
  }
  b {
    flex-shrink: 0;
    font-weight: normal;
  }
  .delta {
    position: absolute;
    left: -8px;
    pointer-events: none;
    color: var(--col-pos);
    animation: fadeout 2.5s ease-out forwards;
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
</style>
