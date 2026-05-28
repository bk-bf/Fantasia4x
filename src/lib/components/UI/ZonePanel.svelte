<!-- ZonePanel.svelte — Zone designation controls shown in the Building tab -->
<script lang="ts">
  import { uiState } from '$lib/stores/uiState';
  import { gameState } from '$lib/stores/gameState';
  import type { FilterableZoneType, ZoneFilter, Item } from '$lib/game/core/types';
  import itemsData from '$lib/game/database/items.jsonc';

  const ITEMS_DATABASE = itemsData as unknown as Item[];

  /** All unique item categories derived from the items database, sorted alphabetically. */
  const ALL_CATEGORIES: string[] = [
    ...new Set(ITEMS_DATABASE.map((i) => i.category).filter(Boolean))
  ].sort();

  const ZONES: { type: FilterableZoneType; label: string; icon: string; desc: string; color: string }[] =
    [
      {
        type: 'forage',
        label: 'FORAGE',
        icon: '[F]',
        desc: 'Pawns gather berries, twigs, bark and plant fiber',
        color: '#3aaa60'
      },
      {
        type: 'scavenge',
        label: 'SCAVENGE',
        icon: '[S]',
        desc: 'Pawns collect surface stone, flint and clay',
        color: '#a07840'
      },
      {
        type: 'stockpile',
        label: 'STOCKPILE',
        icon: '[P]',
        desc: 'Haulers deposit carried resources here',
        color: '#e8a020'
      }
    ];

  let activeType = $derived($uiState.designationType);
  let designationActive = $derived($uiState.designationActive);
  /** Which zone type currently has its filter panel open (null = none). */
  let openFilterZone = $state<FilterableZoneType | null>(null);

  let designationCounts = $derived(
    (() => {
      const counts: Record<string, number> = {};
      for (const type of Object.values($gameState.designations ?? {})) {
        counts[type] = (counts[type] ?? 0) + 1;
      }
      return counts;
    })()
  );

  function toggle(type: string) {
    if (designationActive && activeType === type) {
      uiState.deactivateDesignation();
    } else {
      uiState.activateDesignation(type);
    }
  }

  function clearZone(type: string) {
    gameState.updateWithSave((state) => {
      const newDesignations = { ...(state.designations ?? {}) };
      for (const key of Object.keys(newDesignations)) {
        if (newDesignations[key] === type) delete newDesignations[key];
      }
      return { ...state, designations: newDesignations };
    });
  }

  function toggleFilterPanel(zoneType: FilterableZoneType) {
    openFilterZone = openFilterZone === zoneType ? null : zoneType;
  }

  function getFilter(zoneType: FilterableZoneType): ZoneFilter {
    return $gameState.zoneFilters?.[zoneType] ?? { allowedCategories: [], blockedItems: [] };
  }

  function toggleCategory(zoneType: FilterableZoneType, category: string) {
    gameState.updateWithSave((state) => {
      const current = state.zoneFilters?.[zoneType] ?? {
        allowedCategories: [],
        blockedItems: []
      };
      const allowed = current.allowedCategories.includes(category)
        ? current.allowedCategories.filter((c) => c !== category)
        : [...current.allowedCategories, category];
      return {
        ...state,
        zoneFilters: {
          ...(state.zoneFilters ?? {}),
          [zoneType]: { ...current, allowedCategories: allowed }
        }
      };
    });
  }

  function clearFilter(zoneType: FilterableZoneType) {
    gameState.updateWithSave((state) => {
      const next = { ...(state.zoneFilters ?? {}) };
      delete next[zoneType];
      return { ...state, zoneFilters: next };
    });
  }
</script>

<div class="zone-panel">
  <div class="panel-hdr">| ZONES</div>
  <div class="hint">
    {#if designationActive}
      <span class="hint-active">
        PAINTING [{activeType?.toUpperCase()}] — drag to fill · X erase · click again to stop
      </span>
    {:else}
      click a zone type to start painting on the map
    {/if}
  </div>

  {#each ZONES as zone}
    {@const count = designationCounts[zone.type] ?? 0}
    {@const isActive = designationActive && activeType === zone.type}
    {@const filter = getFilter(zone.type)}
    {@const hasFilter = filter.allowedCategories.length > 0}
    {@const isFilterOpen = openFilterZone === zone.type}

    <div class="zone-row" class:active={isActive}>
      <button
        class="zone-btn"
        class:active={isActive}
        style="--zcolor: {zone.color}"
        onclick={() => toggle(zone.type)}
      >
        <span class="zone-icon">{zone.icon}</span>
        <span class="zone-label">{zone.label}</span>
        {#if count > 0}<span class="zone-count">{count}t</span>{/if}
      </button>
      <span class="zone-desc">
        {zone.desc}
        {#if hasFilter}
          <span class="filter-badge">[{filter.allowedCategories.length} cat]</span>
        {/if}
      </span>
      <button
        class="filter-btn"
        class:active={isFilterOpen}
        title="Configure {zone.label} filter"
        onclick={() => toggleFilterPanel(zone.type)}>[F]</button
      >
      {#if count > 0}
        <button
          class="clear-btn"
          onclick={() => clearZone(zone.type)}
          title="Clear all {zone.label} zones">X</button
        >
      {/if}
    </div>

    {#if isFilterOpen}
      <div class="filter-panel" style="--zcolor: {zone.color}">
        <div class="filter-hdr">
          FILTER: {zone.label}
          <span class="filter-hint">
            {hasFilter
              ? `${filter.allowedCategories.length}/${ALL_CATEGORIES.length} categories`
              : 'no filter (all allowed)'}
          </span>
          {#if hasFilter}
            <button class="filter-clear-all" onclick={() => clearFilter(zone.type)}>clear</button>
          {/if}
        </div>
        <div class="category-grid">
          {#each ALL_CATEGORIES as cat}
            {@const checked = filter.allowedCategories.includes(cat)}
            <label class="cat-label" class:checked>
              <input
                type="checkbox"
                {checked}
                onchange={() => toggleCategory(zone.type, cat)}
              />
              {cat}
            </label>
          {/each}
        </div>
        <div class="filter-note">
          {hasFilter ? 'Only checked categories will be worked.' : 'Check categories to restrict this zone.'}
        </div>
      </div>
    {/if}
  {/each}
</div>

<style>
  .zone-panel {
    border-bottom: 1px solid #2a2010;
    padding-bottom: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .panel-hdr {
    font-family: var(--font-mono, monospace);
    color: var(--accent, #0f0);
    font-size: 0.75rem;
    margin-bottom: 0.35rem;
  }

  .hint {
    font-family: var(--font-mono, monospace);
    font-size: 0.65rem;
    color: #555;
    margin-bottom: 0.5rem;
  }

  .hint-active {
    color: #e8a020;
    animation: blink 1s step-end infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0.5;
    }
  }

  .zone-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.3rem;
  }

  .zone-btn {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    background: #0d0d08;
    border: 1px solid #333;
    color: #888;
    font-family: var(--font-mono, monospace);
    font-size: 0.7rem;
    padding: 2px 7px;
    cursor: pointer;
    min-width: 110px;
    transition:
      border-color 0.15s,
      color 0.15s;
  }

  .zone-btn:hover {
    border-color: var(--zcolor);
    color: var(--zcolor);
  }

  .zone-btn.active {
    border-color: var(--zcolor);
    color: var(--zcolor);
    background: color-mix(in srgb, var(--zcolor) 12%, #000);
    box-shadow: 0 0 4px color-mix(in srgb, var(--zcolor) 40%, transparent);
  }

  .zone-icon {
    font-size: 0.75rem;
    font-family: var(--font-mono, monospace);
  }

  .zone-label {
    font-weight: bold;
    letter-spacing: 0.05em;
  }

  .zone-count {
    margin-left: auto;
    font-size: 0.65rem;
    color: inherit;
    opacity: 0.7;
  }

  .zone-desc {
    font-family: var(--font-mono, monospace);
    font-size: 0.65rem;
    color: #555;
    flex: 1;
  }

  .filter-badge {
    color: #e8a020;
  }

  .filter-btn {
    background: none;
    border: 1px solid #333;
    color: #555;
    cursor: pointer;
    font-family: var(--font-mono, monospace);
    font-size: 0.65rem;
    padding: 1px 4px;
    line-height: 1;
    transition:
      border-color 0.15s,
      color 0.15s;
  }

  .filter-btn:hover,
  .filter-btn.active {
    border-color: var(--zcolor);
    color: var(--zcolor);
  }

  .clear-btn {
    background: none;
    border: none;
    color: #555;
    cursor: pointer;
    font-size: 0.65rem;
    padding: 0 3px;
    line-height: 1;
  }

  /* ── Filter panel ─────────────────────────────────────── */

  .filter-panel {
    margin: 0 0 0.5rem 0;
    padding: 0.5rem;
    border: 1px solid color-mix(in srgb, var(--zcolor) 35%, #222);
    background: #08080a;
    font-family: var(--font-mono, monospace);
  }

  .filter-hdr {
    font-size: 0.65rem;
    color: var(--zcolor);
    margin-bottom: 0.4rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .filter-hint {
    color: #555;
    font-size: 0.6rem;
  }

  .filter-clear-all {
    background: none;
    border: 1px solid #555;
    color: #888;
    cursor: pointer;
    font-family: var(--font-mono, monospace);
    font-size: 0.6rem;
    padding: 0 4px;
    margin-left: auto;
  }

  .filter-clear-all:hover {
    border-color: #c44;
    color: #c44;
  }

  .category-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.6rem;
    margin-bottom: 0.35rem;
  }

  .cat-label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.65rem;
    color: #666;
    cursor: pointer;
    user-select: none;
    transition: color 0.1s;
  }

  .cat-label.checked {
    color: var(--zcolor);
  }

  .cat-label input[type='checkbox'] {
    accent-color: var(--zcolor);
    width: 10px;
    height: 10px;
    cursor: pointer;
  }

  .filter-note {
    font-size: 0.58rem;
    color: #444;
    margin-top: 0.15rem;
  }
</style>
