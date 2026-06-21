<!--
  StockpileZonePanel — the click-info card for a stockpile zone tile (the zone analogue of the
  building card + BuildingFuelPanel). Self-contained: given the clicked zone instance it edits that
  instance's item filter directly via gameState.command. The parent (GameCanvas) owns the DRAW/CLEAR
  tools (it holds the designation/erase mode) and passes them in as callbacks.

  Filter model: the per-item checkboxes are grouped by the items.jsonc `category` (same categorical
  sort as ResourceSidebar) and EVERY non-hidden item is listed even at 0 stock, so you can filter to
  the individual item. The canonical "everything allowed" filter is {allowedCategories:[], blocked:[]}
  (cheap, and what the haul engine treats as no-filter); any restriction is materialized to the full
  category list + an explicit blockedItems set, so a single unchecked item — or a fully unchecked zone
  — is representable without the empty=all overload biting. Reads use the true engine semantics so a
  filter set from the category-only ZonePanel still displays correctly.
-->
<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { itemService } from '$lib/game/services/ItemService';
  import itemsData from '$lib/game/database/items.jsonc';
  import type { Item, ZoneFilter } from '$lib/game/core/types';

  let {
    instanceId,
    label,
    filter,
    inventory = {},
    tileCount,
    drawing = false,
    clearing = false,
    onDraw,
    onClear
  }: {
    instanceId: string;
    label: string;
    filter: ZoneFilter;
    inventory?: Record<string, number>;
    tileCount: number;
    drawing?: boolean;
    clearing?: boolean;
    onDraw: () => void;
    onClear: () => void;
  } = $props();

  // Static item universe (non-hidden — internal items like natural weapons are never haul targets),
  // grouped by category and sorted exactly like the resource sidebar.
  const ALL_ITEMS = (itemsData as unknown as Item[]).filter((i) => !i.hidden);
  const ALL_IDS = ALL_ITEMS.map((i) => i.id);
  const ALL_CATEGORIES = itemService.getAllCategories();
  const GROUPS: [string, Item[]][] = (() => {
    const map = new Map<string, Item[]>();
    for (const cat of ALL_CATEGORIES) map.set(cat, []);
    for (const item of ALL_ITEMS) {
      const cat = item.category ?? 'other';
      (map.get(cat) ?? map.set(cat, []).get(cat)!).push(item);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  })();

  const catLabel = (cat: string) => cat.replace(/_/g, ' ').toUpperCase();

  let filterOpen = $state(false);
  let collapsed = $state<Set<string>>(new Set(GROUPS.map(([c]) => c))); // start collapsed (it's long)
  let hideEmpty = $state(false);

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
        : { allowedCategories: [...ALL_CATEGORIES], blockedItems: ALL_IDS.filter((id) => !checked.has(id)) };
    gameState.command({ type: 'setInstanceFilter', payload: { instanceId, filter: next }, save: true });
  }

  function toggleItem(id: string) {
    const s = currentChecked();
    if (s.has(id)) s.delete(id);
    else s.add(id);
    commit(s);
  }

  function catChecked(cat: string): number {
    return GROUPS.find(([c]) => c === cat)?.[1].reduce((n, i) => n + (isChecked(i.id) ? 1 : 0), 0) ?? 0;
  }

  function toggleCategory(cat: string) {
    const ids = GROUPS.find(([c]) => c === cat)?.[1].map((i) => i.id) ?? [];
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

  function toggleCat(cat: string) {
    const next = new Set(collapsed);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    collapsed = next;
  }

  const storedTotal = $derived(Object.values(inventory).reduce((a, b) => a + b, 0));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="sz-panel"
  onmousedown={(e) => e.stopPropagation()}
  onmouseup={(e) => e.stopPropagation()}
  onwheel={(e) => e.stopPropagation()}
>
  <div class="sz-hdr">
    <span class="sz-title">▣ {label}</span>
    <span class="sz-meta">{tileCount} tiles · {Math.floor(storedTotal)} stored</span>
  </div>

  <!-- Action buttons: FILTER (top in order) · DRAW (extend) · CLEAR (reduce) -->
  <div class="sz-actions">
    <button class="sz-btn" class:active={filterOpen} onclick={() => (filterOpen = !filterOpen)}>
      FILTER
    </button>
    <button class="sz-btn" class:active={drawing} title="Extend this zone — drag to paint tiles" onclick={onDraw}>
      DRAW
    </button>
    <button class="sz-btn clear" class:active={clearing} title="Reduce this zone — drag to erase tiles" onclick={onClear}>
      CLEAR
    </button>
  </div>

  {#if filterOpen}
    <div class="sz-filter">
      <div class="sz-filter-hdr">
        <span>STORED ITEMS</span>
        <span class="sz-filter-count">{checkedCount}/{ALL_IDS.length} allowed</span>
      </div>
      <div class="sz-filter-bar">
        <button class="sz-mini" disabled={allChecked} onclick={() => setAll(true)}>CHECK ALL</button>
        <button class="sz-mini" disabled={noneChecked} onclick={() => setAll(false)}>UNCHECK ALL</button>
        <button
          class="sz-mini"
          class:active={hideEmpty}
          title="Show/hide categories & items with 0 stored here"
          onclick={() => (hideEmpty = !hideEmpty)}>∅</button
        >
      </div>

      <div class="sz-list">
        {#each GROUPS as [cat, items] (cat)}
          {@const shown = hideEmpty ? items.filter((i) => (inventory[i.id] ?? 0) > 0) : items}
          {#if shown.length > 0}
            {@const open = !collapsed.has(cat)}
            {@const on = catChecked(cat)}
            <div class="sz-cat">
              <input
                type="checkbox"
                checked={on === items.length}
                class:partial={on > 0 && on < items.length}
                onchange={() => toggleCategory(cat)}
                title="Toggle every item in this category"
              />
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <span class="sz-cat-name" class:open role="button" tabindex="0" onclick={() => toggleCat(cat)}>
                <span class="sz-caret">{open ? '▾' : '▸'}</span>{catLabel(cat)}
                <span class="sz-cat-count">{on}/{items.length}</span>
              </span>
            </div>
            {#if open}
              {#each shown as item (item.id)}
                {@const amt = Math.floor(inventory[item.id] ?? 0)}
                <label class="sz-item">
                  <input type="checkbox" checked={isChecked(item.id)} onchange={() => toggleItem(item.id)} />
                  <span class="sz-item-name">{item.name}</span>
                  <span class="sz-item-amt" class:zero={amt === 0}>{amt}</span>
                </label>
              {/each}
            {/if}
          {/if}
        {/each}
      </div>
      <div class="sz-note">Only checked items are hauled into this stockpile.</div>
    </div>
  {/if}
</div>

<style>
  .sz-panel {
    width: 100%;
    max-width: 320px;
    background: rgba(13, 9, 3, 0.98);
    border: 1px solid #7a5e28;
    color: #d4a860;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    padding: 6px 8px;
    pointer-events: all;
    filter: url(#ambient-tint);
  }

  .sz-hdr {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 5px;
  }
  .sz-title {
    color: #f0c060;
    font-size: 11px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sz-meta {
    color: #9c7a3a;
    font-size: 9px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .sz-actions {
    display: flex;
    gap: 5px;
  }
  .sz-btn {
    flex: 1;
    padding: 3px 6px;
    background: transparent;
    border: 1px solid #7a5e28;
    color: #d4a860;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    letter-spacing: 0.05em;
    cursor: pointer;
    transition: background 0.12s;
  }
  .sz-btn:hover,
  .sz-btn.active {
    background: color-mix(in srgb, #e0a848 22%, transparent);
    border-color: #e0a848;
    color: #f0c878;
  }
  .sz-btn.clear {
    border-color: #8a5a3a;
    color: #c68a60;
  }
  .sz-btn.clear:hover,
  .sz-btn.clear.active {
    background: color-mix(in srgb, #c46a40 22%, transparent);
    border-color: #c46a40;
    color: #e8a070;
  }

  /* ── Filter checklist ───────────────────────────────────── */
  .sz-filter {
    margin-top: 6px;
    border-top: 1px solid rgba(122, 94, 40, 0.6);
    padding-top: 5px;
  }
  .sz-filter-hdr {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    color: #c8a048;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
  }
  .sz-filter-count {
    color: #9c7a3a;
    font-size: 9px;
  }
  .sz-filter-bar {
    display: flex;
    gap: 4px;
    margin-bottom: 5px;
  }
  .sz-mini {
    background: #160f06;
    border: 1px solid #6b4f22;
    color: #d0a858;
    font-family: 'Courier New', monospace;
    font-size: 9px;
    letter-spacing: 0.04em;
    padding: 2px 6px;
    cursor: pointer;
  }
  .sz-mini:hover:not(:disabled),
  .sz-mini.active {
    background: #24180a;
    border-color: #b07a28;
    color: #f0c878;
  }
  .sz-mini:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .sz-list {
    max-height: 220px;
    overflow-y: auto;
    padding-right: 2px;
    scrollbar-width: thin;
    scrollbar-color: #6b4f22 transparent;
  }

  .sz-cat {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 2px 2px;
    border-bottom: 1px solid rgba(122, 94, 40, 0.35);
  }
  .sz-cat-name {
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
  .sz-cat-name.open {
    color: #f0c060;
  }
  .sz-caret {
    width: 8px;
    flex-shrink: 0;
    color: #9c7a3a;
  }
  .sz-cat-count {
    margin-left: auto;
    color: #9c7a3a;
    font-size: 9px;
    flex-shrink: 0;
  }

  .sz-item {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 1px 2px 1px 16px;
    cursor: pointer;
  }
  .sz-item:hover {
    background: rgba(224, 168, 72, 0.08);
  }
  .sz-item-name {
    color: #d4a860;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .sz-item-amt {
    color: #c8a048;
    font-weight: bold;
    flex-shrink: 0;
    font-size: 9px;
  }
  .sz-item-amt.zero {
    color: #6a5226;
    font-weight: normal;
  }

  .sz-note {
    color: #8a6c34;
    font-size: 9px;
    margin-top: 4px;
    font-style: italic;
  }

  /* Themed checkboxes (mirror BuildingFuelPanel). */
  .sz-cat input[type='checkbox'],
  .sz-item input[type='checkbox'] {
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
  .sz-cat input[type='checkbox']:hover,
  .sz-item input[type='checkbox']:hover {
    border-color: #c88a30;
  }
  .sz-cat input[type='checkbox']:checked,
  .sz-item input[type='checkbox']:checked {
    background: #2a1a08;
    border-color: #e0a848;
  }
  .sz-cat input[type='checkbox']:checked::after,
  .sz-item input[type='checkbox']:checked::after {
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
  .sz-cat input[type='checkbox'].partial {
    background: #2a1a08;
    border-color: #c8a048;
  }
  .sz-cat input[type='checkbox'].partial::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 4px;
    width: 5px;
    height: 0;
    border-top: 2px solid #e0b860;
    transform: none;
  }
</style>
