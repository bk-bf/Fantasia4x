<!-- ZonePanel.svelte — Per-instance zone designation controls shown in the Building tab -->
<script lang="ts">
  import { uiState } from '$lib/stores/uiState';
  import { gameState } from '$lib/stores/gameState';
  import { designationService } from '$lib/game/services/DesignationService';
  import type { FilterableZoneType, Item } from '$lib/game/core/types';
  import itemsData from '$lib/game/database/items.jsonc';

  const ITEMS_DATABASE = itemsData as unknown as Item[];

  const ALL_CATEGORIES: string[] = [
    ...new Set(ITEMS_DATABASE.map((i) => i.category).filter(Boolean))
  ].sort();

  const ZONE_DEFS: { type: FilterableZoneType; label: string; icon: string; desc: string; color: string }[] =
    [
      { type: 'stockpile', label: 'STOCKPILE', icon: '[P]', desc: 'Haulers deposit carried resources here',             color: '#e8a020' }
    ];

  let activeType     = $derived($uiState.designationType);
  let activeInstId   = $derived($uiState.activeZoneInstanceId);
  let designationActive = $derived($uiState.designationActive);

  /** Which zone instance currently has its filter panel open (null = none). */
  let openFilterInstance = $state<string | null>(null);

  /** Count tiles per zone instance. */
  let instanceTileCounts = $derived(
    (() => {
      const counts: Record<string, number> = {};
      for (const instId of Object.values($gameState.designationZoneId ?? {})) {
        counts[instId] = (counts[instId] ?? 0) + 1;
      }
      return counts;
    })()
  );

  /** Create a new zone instance and immediately enter painting mode. */
  function newZone(type: FilterableZoneType) {
    let newId: string | undefined;
    const existing = ($gameState.zoneInstances ?? []).filter((z) => z.type === type).length;
    const def = ZONE_DEFS.find((d) => d.type === type)!;
    const label = `${def.label[0]}${def.label.slice(1).toLowerCase()} ${existing + 1}`;
    gameState.updateWithSave((state) => {
      const result = designationService.createZoneInstance(type, label, state);
      newId = result.id;
      return result.state;
    });
    if (newId) uiState.activateDesignation(type, newId);
  }

  /** Toggle painting mode for an existing instance. */
  function paintZone(type: string, instanceId: string) {
    if (designationActive && activeInstId === instanceId) {
      uiState.deactivateDesignation();
    } else {
      uiState.activateDesignation(type, instanceId);
    }
  }

  /** Delete a zone instance and all its tiles. */
  function removeZone(instanceId: string) {
    gameState.updateWithSave((state) => designationService.removeZoneInstance(instanceId, state));
    if (openFilterInstance === instanceId) openFilterInstance = null;
    if (designationActive && activeInstId === instanceId) uiState.deactivateDesignation();
  }

  function toggleFilterPanel(instanceId: string) {
    openFilterInstance = openFilterInstance === instanceId ? null : instanceId;
  }

  function toggleCategory(instanceId: string, category: string) {
    gameState.updateWithSave((state) =>
      designationService.toggleInstanceCategory(instanceId, category, state)
    );
  }

  function clearFilter(instanceId: string) {
    gameState.updateWithSave((state) => designationService.clearInstanceFilter(instanceId, state));
  }
</script>

<div class="zone-panel">
  <div class="panel-hdr">| ZONES</div>
  <div class="hint">
    {#if designationActive}
      <span class="hint-active">
        PAINTING [{activeType?.toUpperCase()}] — drag to fill · X erase · click [■] to stop
      </span>
    {:else}
      create a zone, then drag to paint it on the map
    {/if}
  </div>

  {#each ZONE_DEFS as def}
    {@const instances = ($gameState.zoneInstances ?? []).filter((z) => z.type === def.type)}

    <div class="type-section" style="--zcolor: {def.color}">
      <div class="type-hdr">
        <span class="type-icon">{def.icon}</span>
        <span class="type-label">{def.label}</span>
        <span class="type-desc">{def.desc}</span>
        <button class="new-btn" onclick={() => newZone(def.type)} title="Create new {def.label} zone">
          [+]
        </button>
      </div>

      {#if instances.length === 0}
        <div class="empty-hint">no zones — click [+] to create one</div>
      {:else}
        {#each instances as inst}
          {@const tileCount = instanceTileCounts[inst.id] ?? 0}
          {@const isPainting = designationActive && activeInstId === inst.id}
          {@const hasFilter = inst.filter.allowedCategories.length > 0}
          {@const isFilterOpen = openFilterInstance === inst.id}

          <div class="inst-row" class:painting={isPainting}>
            <button
              class="paint-btn"
              class:active={isPainting}
              onclick={() => paintZone(def.type, inst.id)}
              title={isPainting ? 'Stop painting' : 'Paint this zone on the map'}
            >
              {isPainting ? '[■]' : '[▶]'}
            </button>
            <span class="inst-label">{inst.label}</span>
            {#if tileCount > 0}
              <span class="tile-count">{tileCount}t</span>
            {/if}
            {#if hasFilter}
              <span class="filter-badge">{inst.filter.allowedCategories.length}f</span>
            {/if}
            <button
              class="icon-btn"
              class:active={isFilterOpen}
              onclick={() => toggleFilterPanel(inst.id)}
              title="Configure filter">[F]</button
            >
            <button
              class="icon-btn del"
              onclick={() => removeZone(inst.id)}
              title="Delete zone and tiles">[X]</button
            >
          </div>

          {#if isFilterOpen}
            <div class="filter-panel">
              <div class="filter-hdr">
                FILTER: {inst.label}
                <span class="filter-hint">
                  {hasFilter
                    ? `${inst.filter.allowedCategories.length}/${ALL_CATEGORIES.length} categories`
                    : 'no filter (all allowed)'}
                </span>
                {#if hasFilter}
                  <button class="filter-clear-all" onclick={() => clearFilter(inst.id)}>clear</button>
                {/if}
              </div>
              <div class="category-grid">
                {#each ALL_CATEGORIES as cat}
                  {@const checked = inst.filter.allowedCategories.includes(cat)}
                  <label class="cat-label" class:checked>
                    <input
                      type="checkbox"
                      {checked}
                      onchange={() => toggleCategory(inst.id, cat)}
                    />
                    {cat}
                  </label>
                {/each}
              </div>
              <div class="filter-note">
                {hasFilter
                  ? 'Only checked categories will be worked.'
                  : 'Check categories to restrict this zone.'}
              </div>
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  {/each}
</div>

<style>
  .zone-panel {
    border-bottom: 1px solid #2a2010;
    padding-bottom: 0.75rem;
    margin-bottom: 0.5rem;
    font-family: var(--font-mono, monospace);
  }

  .panel-hdr {
    color: var(--accent, #0f0);
    font-size: 0.75rem;
    margin-bottom: 0.35rem;
  }

  .hint {
    font-size: 0.65rem;
    color: #555;
    margin-bottom: 0.5rem;
  }

  .hint-active {
    color: #e8a020;
    animation: blink 1s step-end infinite;
  }

  @keyframes blink {
    50% { opacity: 0.5; }
  }

  /* ── Type section ───────────────────────────────── */

  .type-section {
    margin-bottom: 0.6rem;
  }

  .type-hdr {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-bottom: 0.2rem;
  }

  .type-icon {
    color: var(--zcolor);
    font-size: 0.7rem;
    min-width: 2ch;
  }

  .type-label {
    color: var(--zcolor);
    font-size: 0.7rem;
    font-weight: bold;
    letter-spacing: 0.05em;
    min-width: 7ch;
  }

  .type-desc {
    font-size: 0.6rem;
    color: #555;
    flex: 1;
  }

  .new-btn {
    background: none;
    border: 1px solid #444;
    color: var(--zcolor);
    cursor: pointer;
    font-family: var(--font-mono, monospace);
    font-size: 0.65rem;
    padding: 1px 5px;
    line-height: 1;
    opacity: 0.7;
    transition: opacity 0.15s, border-color 0.15s;
  }

  .new-btn:hover {
    opacity: 1;
    border-color: var(--zcolor);
  }

  /* ── Instance rows ──────────────────────────────── */

  .empty-hint {
    font-size: 0.6rem;
    color: #444;
    padding: 0.1rem 0 0.15rem 1.5rem;
  }

  .inst-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 2px 0 2px 0.5rem;
    margin-bottom: 0.1rem;
    border-left: 2px solid transparent;
  }

  .inst-row.painting {
    border-left-color: var(--zcolor);
    background: color-mix(in srgb, var(--zcolor) 6%, transparent);
  }

  .paint-btn {
    background: none;
    border: 1px solid #333;
    color: #555;
    cursor: pointer;
    font-family: var(--font-mono, monospace);
    font-size: 0.65rem;
    padding: 1px 4px;
    line-height: 1;
    min-width: 3ch;
    transition: border-color 0.15s, color 0.15s;
  }

  .paint-btn:hover,
  .paint-btn.active {
    border-color: var(--zcolor);
    color: var(--zcolor);
  }

  .inst-label {
    font-size: 0.68rem;
    color: #aaa;
    flex: 1;
  }

  .tile-count {
    font-size: 0.6rem;
    color: #555;
  }

  .filter-badge {
    font-size: 0.58rem;
    color: #e8a020;
    background: #1a1200;
    padding: 0 3px;
    border: 1px solid #4a3000;
  }

  .icon-btn {
    background: none;
    border: 1px solid #333;
    color: #555;
    cursor: pointer;
    font-family: var(--font-mono, monospace);
    font-size: 0.6rem;
    padding: 1px 3px;
    line-height: 1;
    transition: border-color 0.15s, color 0.15s;
  }

  .icon-btn:hover,
  .icon-btn.active {
    border-color: var(--zcolor);
    color: var(--zcolor);
  }

  .icon-btn.del:hover {
    border-color: #c44;
    color: #c44;
  }

  /* ── Filter panel ───────────────────────────────── */

  .filter-panel {
    margin: 0.1rem 0 0.4rem 1.5rem;
    padding: 0.4rem;
    border: 1px solid color-mix(in srgb, var(--zcolor) 35%, #222);
    background: #08080a;
  }

  .filter-hdr {
    font-size: 0.65rem;
    color: var(--zcolor);
    margin-bottom: 0.4rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
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
    gap: 0.2rem 0.5rem;
    margin-bottom: 0.3rem;
  }

  .cat-label {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    font-size: 0.62rem;
    color: #555;
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
    margin-top: 0.1rem;
  }
</style>
