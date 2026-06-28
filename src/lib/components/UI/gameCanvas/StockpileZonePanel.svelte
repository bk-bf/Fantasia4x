<!--
  StockpileZonePanel — the per-item haul-filter pop-up for a stockpile zone. The zone's INFO CARD
  itself is the shared SelectedEntityCard (built in GameCanvas, same chrome as pawn/mob/building);
  this is only the FILTER fly-out it opens, mirroring BuildingFuelPanel under the campfire card (same
  absolute-above-the-card layout, `open` toggle owned by the parent, stopPropagation).

  Filter model: per-item checkboxes grouped into the shared nested taxonomy (itemCategoryTree.ts —
  same tree ResourceSidebar/ItemFilterChecklist use). EVERY non-hidden item is listed even at 0 stock
  so you can filter to the single item. Canonical "all allowed" = {allowedCategories:[],
  blockedItems:[]} (what the haul engine treats as no-filter); any restriction is materialized to the
  full category list + an explicit blockedItems set, so a single unchecked item — or a fully unchecked
  zone — is representable without the empty=all overload. Reads use the true engine semantics so a
  filter set from the category-only ZonePanel still displays correctly. This keeps its own row render
  (per-item stock amount + hide-empty) but shares the grouping + copy/paste clipboard with the other
  filter panels.
-->
<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { itemService } from '$lib/game/services/ItemService';
  import itemsData from '$lib/game/database/items.jsonc';
  import type { Item, ZoneFilter, ZonePriority } from '$lib/game/core/types';
  import ScrollArea from '$lib/components/UI/ScrollArea.svelte';
  import { buildCategoryTree, collectItemIds, type TreeNode } from '$lib/utils/itemCategoryTree.js';
  import { filterClipboard } from '$lib/stores/filterClipboard.js';

  let {
    instanceId,
    filter,
    priority = 'normal',
    inventory = {},
    open = false
  }: {
    instanceId: string;
    filter: ZoneFilter;
    priority?: ZonePriority;
    inventory?: Record<string, number>;
    open?: boolean;
  } = $props();

  // Haul-fill priority: pawns top up higher-priority zones before lower ones (and only spill into a
  // lower zone once the higher is full). Drives findNearestDepositPoint / depositInventory ordering.
  const PRIORITIES: { value: ZonePriority; label: string }[] = [
    { value: 'low', label: 'Low' },
    { value: 'normal', label: 'Normal' },
    { value: 'preferred', label: 'Preferred' },
    { value: 'urgent', label: 'Urgent' }
  ];
  function setPriority(value: ZonePriority) {
    gameState.command({
      type: 'setInstancePriority',
      payload: { instanceId, priority: value },
      save: true
    });
  }

  // Static item universe (non-hidden — internal items like natural weapons are never haul targets),
  // grouped into the shared nested taxonomy and sorted exactly like the resource sidebar.
  const ALL_ITEMS = (itemsData as unknown as Item[]).filter((i) => !i.hidden);
  const ALL_IDS = ALL_ITEMS.map((i) => i.id);
  const ALL_CATEGORIES = itemService.getAllCategories();
  const TREE = buildCategoryTree(ALL_ITEMS);

  function allNodeIds(): string[] {
    const ids: string[] = [];
    const visit = (n: TreeNode) => {
      ids.push(n.path.join('/'));
      n.children.forEach(visit);
    };
    TREE.forEach(visit);
    return ids;
  }

  let collapsed = $state<Set<string>>(new Set(allNodeIds())); // start collapsed (it's long)
  let hideEmpty = $state(false);
  const anyExpanded = $derived(allNodeIds().some((id) => !collapsed.has(id)));

  // True engine semantics (matches jobs/filters.itemMatchesFilter + the haul empty-cats short-circuit).
  function isChecked(id: string): boolean {
    if (filter.allowedCategories.length === 0) return true;
    const cat = itemService.getItemById(id)?.category;
    return !!cat && filter.allowedCategories.includes(cat) && !filter.blockedItems.includes(id);
  }

  const checkedCount = $derived(ALL_IDS.reduce((n, id) => n + (isChecked(id) ? 1 : 0), 0));
  const allChecked = $derived(checkedCount === ALL_IDS.length);
  const noneChecked = $derived(checkedCount === 0);

  function currentChecked(): Set<string> {
    const s = new Set<string>();
    for (const id of ALL_IDS) if (isChecked(id)) s.add(id);
    return s;
  }

  /** Serialize a desired checked-set back to the canonical {allowedCategories, blockedItems}. */
  function commit(checked: Set<string>) {
    const next: ZoneFilter =
      checked.size >= ALL_IDS.length
        ? { allowedCategories: [], blockedItems: [] } // canonical "all"
        : {
            allowedCategories: [...ALL_CATEGORIES],
            blockedItems: ALL_IDS.filter((id) => !checked.has(id))
          };
    gameState.command({
      type: 'setInstanceFilter',
      payload: { instanceId, filter: next },
      save: true
    });
  }

  function toggleItem(id: string) {
    const s = currentChecked();
    if (s.has(id)) s.delete(id);
    else s.add(id);
    commit(s);
  }

  /** [checked, total] over a node's whole subtree. */
  function nodeChecked(node: TreeNode): [number, number] {
    const ids = collectItemIds(node);
    return [ids.reduce((n, id) => n + (isChecked(id) ? 1 : 0), 0), ids.length];
  }

  function toggleNode(node: TreeNode) {
    const ids = collectItemIds(node);
    const allOn = ids.every((id) => isChecked(id));
    const s = currentChecked();
    for (const id of ids) {
      if (allOn) s.delete(id);
      else s.add(id);
    }
    commit(s);
  }

  function setAll(on: boolean) {
    commit(on ? new Set(ALL_IDS) : new Set());
  }

  function toggleCat(id: string) {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    collapsed = next;
  }

  function toggleCollapseAll() {
    collapsed = anyExpanded ? new Set(allNodeIds()) : new Set();
  }

  function copyFilter() {
    filterClipboard.copy([...currentChecked()]);
  }

  function pasteFilter() {
    const clip = filterClipboard.peek();
    if (!clip) return;
    const here = new Set(ALL_IDS);
    commit(new Set(clip.filter((id) => here.has(id))));
  }

  /** Visible item ids of a node's subtree under the current hide-empty filter. */
  function visibleItems(node: TreeNode): Item[] {
    return hideEmpty ? node.items.filter((i) => (inventory[i.id] ?? 0) > 0) : node.items;
  }
  function subtreeHasVisible(node: TreeNode): boolean {
    return visibleItems(node).length > 0 || node.children.some(subtreeHasVisible);
  }
</script>

{#snippet catNode(node: TreeNode, depth: number)}
  {#if subtreeHasVisible(node)}
    {@const id = node.path.join('/')}
    {@const isOpen = !collapsed.has(id)}
    {@const [on, total] = nodeChecked(node)}
    <div class="zfp-cat" style="padding-left: {depth * 12 + 2}px">
      <input
        type="checkbox"
        checked={total > 0 && on === total}
        class:partial={on > 0 && on < total}
        onchange={() => toggleNode(node)}
        title="Toggle every item in this category"
      />
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <span
        class="zfp-cat-name"
        class:open={isOpen}
        role="button"
        tabindex="0"
        onclick={() => toggleCat(id)}
      >
        <span class="zfp-caret">{isOpen ? '▾' : '▸'}</span>{node.label}
        <span class="zfp-cat-count">{on}/{total}</span>
      </span>
    </div>
    {#if isOpen}
      {#each node.children as child (child.path.join('/'))}
        {@render catNode(child, depth + 1)}
      {/each}
      {#each visibleItems(node) as item (item.id)}
        {@const amt = Math.floor(inventory[item.id] ?? 0)}
        <label class="zfp-item" style="padding-left: {(depth + 1) * 12 + 4}px">
          <input
            type="checkbox"
            checked={isChecked(item.id)}
            onchange={() => toggleItem(item.id)}
          />
          <span class="zfp-item-name">{item.name}</span>
          <span class="zfp-item-amt" class:zero={amt === 0}>{amt}</span>
        </label>
      {/each}
    {/if}
  {/if}
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="zfp"
  class:open
  onmousedown={(e) => e.stopPropagation()}
  onmouseup={(e) => e.stopPropagation()}
  onwheel={(e) => e.stopPropagation()}
>
  <div class="zfp-hdr">
    stored items
    <span class="zfp-count">{checkedCount}/{ALL_IDS.length} allowed</span>
  </div>
  <div class="zfp-prio">
    <span class="zfp-prio-label" title="Pawns fill higher-priority zones before lower ones">
      fill priority
    </span>
    <select
      class="zfp-prio-select"
      value={priority}
      onchange={(e) => setPriority(e.currentTarget.value as ZonePriority)}
    >
      {#each PRIORITIES as p (p.value)}
        <option value={p.value}>{p.label}</option>
      {/each}
    </select>
  </div>
  <div class="zfp-bar">
    <button class="zfp-mini" disabled={allChecked} onclick={() => setAll(true)}>CHECK ALL</button>
    <button class="zfp-mini" disabled={noneChecked} onclick={() => setAll(false)}
      >UNCHECK ALL</button
    >
    <button
      class="zfp-mini"
      title={anyExpanded ? 'Collapse all' : 'Expand all'}
      onclick={toggleCollapseAll}>{anyExpanded ? '⊟' : '⊞'}</button
    >
    <button class="zfp-mini" title="Copy filter" onclick={copyFilter}>⧉</button>
    <button
      class="zfp-mini"
      title="Paste filter"
      disabled={$filterClipboard === null}
      onclick={pasteFilter}>⎘</button
    >
    <button
      class="zfp-mini"
      class:active={hideEmpty}
      title="Show/hide categories & items with 0 stored here"
      onclick={() => (hideEmpty = !hideEmpty)}>∅</button
    >
  </div>

  <ScrollArea class="zfp-list">
    {#each TREE as root (root.path.join('/'))}
      {@render catNode(root, 0)}
    {/each}
  </ScrollArea>
  <div class="zfp-note">Only checked items are hauled into this stockpile.</div>
</div>

<style>
  /* Fly-out above the zone card — same chrome/positioning as BuildingFuelPanel under the campfire. */
  .zfp {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    width: 100%;
    max-width: 300px;
    opacity: 0;
    transform: translateY(6px);
    overflow: hidden;
    max-height: 0;
    pointer-events: none;
    background: rgba(13, 9, 3, 0.98);
    border: 1px solid #7a5e28;
    color: #d4a860;
    font-family: var(--font-mono);
    font-size: 9px;
    z-index: 20;
    filter: url(#ambient-tint);
    transition:
      opacity 140ms ease,
      transform 140ms ease,
      max-height 200ms ease;
  }
  .zfp.open {
    opacity: 1;
    transform: translateY(0);
    max-height: 360px;
    pointer-events: all;
    padding: 5px 7px;
  }

  .zfp-hdr {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    color: #f0c060;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 4px;
  }
  .zfp-count {
    color: #9c7a3a;
  }
  .zfp-prio {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 5px;
  }
  .zfp-prio-label {
    color: #9c7a3a;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.85em;
  }
  .zfp-prio-select {
    flex: 1;
    background: #160f06;
    border: 1px solid #6b4f22;
    color: #f0c060;
    padding: 2px 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .zfp-bar {
    display: flex;
    gap: 4px;
    margin-bottom: 5px;
  }
  .zfp-mini {
    background: #160f06;
    border: 1px solid #6b4f22;
    color: #d0a858;
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.04em;
    padding: 2px 6px;
    cursor: pointer;
  }
  .zfp-mini:hover:not(:disabled),
  .zfp-mini.active {
    background: #24180a;
    border-color: #b07a28;
    color: #f0c878;
  }
  .zfp-mini:disabled {
    opacity: 0.35;
    cursor: default;
  }

  /* .zfp-list is the ScrollArea viewport (overflow + auto-hiding bar live in ScrollArea). */
  .zfp :global(.zfp-list) {
    max-height: 250px;
    padding-right: 2px;
  }

  .zfp-cat {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 2px 2px;
    border-bottom: 1px solid rgba(122, 94, 40, 0.35);
  }
  .zfp-cat-name {
    display: flex;
    align-items: baseline;
    gap: 4px;
    flex: 1;
    color: #c8a048;
    letter-spacing: 0.05em;
    cursor: pointer;
    user-select: none;
    min-width: 0;
  }
  .zfp-cat-name.open {
    color: #f0c060;
  }
  .zfp-caret {
    width: 8px;
    flex-shrink: 0;
    color: #9c7a3a;
  }
  .zfp-cat-count {
    margin-left: auto;
    color: #9c7a3a;
    flex-shrink: 0;
  }

  .zfp-item {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 1px 2px 1px 16px;
    cursor: pointer;
  }
  .zfp-item:hover {
    background: rgba(224, 168, 72, 0.08);
  }
  .zfp-item-name {
    color: #d4a860;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .zfp-item-amt {
    color: #c8a048;
    font-weight: bold;
    flex-shrink: 0;
  }
  .zfp-item-amt.zero {
    color: #6a5226;
    font-weight: normal;
  }

  .zfp-note {
    color: #8a6c34;
    margin-top: 4px;
    font-style: italic;
  }

  /* Themed checkboxes (match BuildingFuelPanel). */
  .zfp-cat input[type='checkbox'],
  .zfp-item input[type='checkbox'] {
    appearance: none;
    width: 11px;
    height: 11px;
    border: 1px solid #8e6a2a;
    background: #140e04;
    cursor: pointer;
    position: relative;
    margin: 0;
    flex-shrink: 0;
  }
  .zfp-cat input[type='checkbox']:hover,
  .zfp-item input[type='checkbox']:hover {
    border-color: #c88a30;
  }
  .zfp-cat input[type='checkbox']:checked,
  .zfp-item input[type='checkbox']:checked {
    background: #2a1a08;
    border-color: #e0a848;
  }
  .zfp-cat input[type='checkbox']:checked::after,
  .zfp-item input[type='checkbox']:checked::after {
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
  /* Partial (some-but-not-all items in a category checked): a dash instead of a tick. */
  .zfp-cat input[type='checkbox'].partial {
    background: #2a1a08;
    border-color: #c8a048;
  }
  .zfp-cat input[type='checkbox'].partial::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 4px;
    width: 5px;
    border-top: 2px solid #e0b860;
  }
</style>
