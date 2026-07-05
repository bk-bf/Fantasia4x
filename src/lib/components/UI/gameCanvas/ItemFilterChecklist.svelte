<!--
  ItemFilterChecklist — shared, NESTED category-grouped item allow-list with a compact search box +
  toolbar, used by the fuel / food / repair / storage / stockpile filter panels. Items are bucketed
  into a human-labelled taxonomy tree (itemCategoryTree.ts — Tools / Weapons→Melee→Cutting / … —
  never a raw category id, AGENTS "never leak ids"). Every node has a tri-state header checkbox that
  toggles its whole subtree at once and is collapsible. The toolbar adds collapse/expand-all and
  copy/paste of the current allow-list (shared across panels via filterClipboard). The component owns
  no policy — it takes the current `allowed` set and emits the full next id list via `onChange`.
-->
<script lang="ts">
  import type { Item } from '$lib/game/core/types.js';
  import { buildCategoryTree, collectItemIds, type TreeNode } from '$lib/utils/itemCategoryTree.js';
  import { filterClipboard } from '$lib/stores/filterClipboard.js';

  let {
    items,
    allowed,
    onChange,
    listMaxHeight = '168px'
  }: {
    items: Item[];
    allowed: Set<string>;
    onChange: (ids: string[]) => void;
    listMaxHeight?: string;
  } = $props();

  let query = $state('');
  let collapsed = $state<Record<string, boolean>>({});

  const tree = $derived(buildCategoryTree(items, { query }));

  // Subtree allow-counts, memoized per node path so each row's tri-state is one lookup.
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
    if (anyExpanded) for (const id of allNodeIds()) next[id] = true; // collapse everything
    collapsed = next; // else clears → everything expanded
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

  // Reflect partial-selection on a node checkbox (DOM-only `indeterminate` property).
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
          <span>{item.name}</span>
        </label>
      {/each}
    {/if}
  </div>
{/snippet}

<div class="ifc">
  <div class="ifc-toolbar">
    <input
      class="ifc-search"
      type="text"
      placeholder="search…"
      bind:value={query}
      onkeydown={(e) => e.stopPropagation()}
    />
    <button
      type="button"
      class="ifc-icon-btn"
      title={anyExpanded ? 'Collapse all' : 'Expand all'}
      onclick={toggleCollapseAll}>{anyExpanded ? '⊟' : '⊞'}</button
    >
    <button type="button" class="ifc-icon-btn" title="Copy filter" onclick={copyFilter}>⧉</button>
    <button
      type="button"
      class="ifc-icon-btn"
      title="Paste filter"
      disabled={$filterClipboard === null}
      onclick={pasteFilter}>⎘</button
    >
  </div>
  <div class="ifc-list" style="max-height: {listMaxHeight}">
    {#each tree as root (root.path.join('/'))}
      {@render nodeRow(root, 0)}
    {/each}
    {#if tree.length === 0}
      <div class="ifc-empty">no matches</div>
    {/if}
  </div>
</div>

<style>
  .ifc-toolbar {
    display: flex;
    align-items: stretch;
    gap: 3px;
    margin-bottom: 3px;
  }
  .ifc-search {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    background: #140e04;
    border: 1px solid #6a4e20;
    color: #e0b868;
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 2px 4px;
  }
  .ifc-search::placeholder {
    color: #8a6a30;
  }
  .ifc-search:focus {
    outline: none;
    border-color: #c88a30;
    background: #1c1407;
    color: #f0c878;
  }
  .ifc-icon-btn {
    flex: 0 0 auto;
    background: #160f06;
    border: 1px solid #6b4f22;
    color: #d0a858;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1;
    padding: 0 5px;
    cursor: pointer;
  }
  .ifc-icon-btn:hover:not(:disabled) {
    background: #24180a;
    border-color: #b07a28;
    color: #f0c878;
  }
  .ifc-icon-btn:disabled {
    opacity: 0.4;
    cursor: default;
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
    color: #f0c060;
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
    color: #a07c38;
  }
  .ifc-empty {
    color: #8a6a30;
    padding: 4px 2px;
  }
  .ifc-row input[type='checkbox'] {
    appearance: none;
    width: 11px;
    height: 11px;
    border: 1px solid #8e6a2a;
    background: #140e04;
    box-shadow: inset 0 0 0 1px rgba(12, 8, 2, 0.7);
    cursor: pointer;
    position: relative;
    margin: 0;
    flex: 0 0 auto;
  }
  .ifc-row input[type='checkbox']:hover {
    border-color: #c88a30;
    background: #1a1206;
  }
  .ifc-row input[type='checkbox']:checked {
    background: #2a1a08;
    border-color: #e0a848;
  }
  .ifc-row input[type='checkbox']:checked::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 0px;
    width: 4px;
    height: 7px;
    border: solid #f0c060;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  .ifc-row input[type='checkbox']:indeterminate {
    background: #2a1a08;
    border-color: #e0a848;
  }
  .ifc-row input[type='checkbox']:indeterminate::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 4px;
    width: 5px;
    height: 0;
    border-top: 2px solid #f0c060;
  }
</style>
