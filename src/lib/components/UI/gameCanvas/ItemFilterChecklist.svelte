<!--
  ItemFilterChecklist — shared category-grouped item allow-list with a compact search box, used by
  both FoodFilterPanel and BuildingFuelPanel. Items are bucketed by their `category`; each category
  has a tri-state header checkbox that toggles every item in the group at once (collapsible to keep a
  long list short), plus per-item ticks. The search box filters by item name. The component owns no
  policy — it takes the current `allowed` set and emits the full next id list via `onChange`; the
  parent persists it. Category labels are humanized (never a raw category id — AGENTS "never leak ids").
-->
<script lang="ts">
  import type { Item } from '$lib/game/core/types.js';

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

  function humanizeCategory(cat: string): string {
    return cat.replace(/_/g, ' ');
  }

  type Group = { key: string; label: string; items: Item[]; allowedCount: number };

  const groups = $derived.by((): Group[] => {
    const q = query.trim().toLowerCase();
    const byCat = new Map<string, Item[]>();
    for (const item of items) {
      if (q && !item.name.toLowerCase().includes(q)) continue;
      const cat = item.category || 'other';
      const arr = byCat.get(cat);
      if (arr) arr.push(item);
      else byCat.set(cat, [item]);
    }
    return Array.from(byCat.entries())
      .map(([key, list]) => ({
        key,
        label: humanizeCategory(key),
        items: list.sort((a, b) => a.name.localeCompare(b.name)),
        allowedCount: list.reduce((n, i) => n + (allowed.has(i.id) ? 1 : 0), 0)
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  function toggleItem(id: string) {
    const set = new Set(allowed);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange(Array.from(set));
  }

  function toggleCategory(group: Group) {
    const set = new Set(allowed);
    const allOn = group.allowedCount === group.items.length;
    for (const item of group.items) {
      if (allOn) set.delete(item.id);
      else set.add(item.id);
    }
    onChange(Array.from(set));
  }

  // Reflect partial-selection on the category checkbox (DOM-only `indeterminate` property).
  function indet(node: HTMLInputElement, partial: boolean) {
    node.indeterminate = partial;
    return {
      update(p: boolean) {
        node.indeterminate = p;
      }
    };
  }
</script>

<div class="ifc">
  <input
    class="ifc-search"
    type="text"
    placeholder="search…"
    bind:value={query}
    onkeydown={(e) => e.stopPropagation()}
  />
  <div class="ifc-list" style="max-height: {listMaxHeight}">
    {#each groups as group (group.key)}
      {@const allOn = group.allowedCount === group.items.length}
      {@const partial = group.allowedCount > 0 && !allOn}
      <div class="ifc-cat">
        <label class="ifc-row ifc-cat-hdr">
          <input
            type="checkbox"
            checked={allOn}
            use:indet={partial}
            onchange={() => toggleCategory(group)}
          />
          <button
            type="button"
            class="ifc-cat-toggle"
            onclick={(e) => {
              e.preventDefault();
              collapsed[group.key] = !collapsed[group.key];
            }}
          >
            <span class="ifc-caret">{collapsed[group.key] ? '▸' : '▾'}</span>
            <span class="ifc-cat-name">{group.label}</span>
            <span class="ifc-cat-count">{group.allowedCount}/{group.items.length}</span>
          </button>
        </label>
        {#if !collapsed[group.key]}
          {#each group.items as item (item.id)}
            <label class="ifc-row ifc-item-row">
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
    {/each}
    {#if groups.length === 0}
      <div class="ifc-empty">no matches</div>
    {/if}
  </div>
</div>

<style>
  .ifc-search {
    width: 100%;
    box-sizing: border-box;
    background: #140e04;
    border: 1px solid #6a4e20;
    color: #e0b868;
    font-family: var(--font-mono);
    font-size: 9px;
    padding: 2px 4px;
    margin-bottom: 3px;
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
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    color: #f0c060;
    font-family: var(--font-mono);
    font-size: 9px;
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
  .ifc-item-row {
    padding-left: 14px;
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
