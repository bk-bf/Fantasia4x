<!-- ZonePanel.svelte — Per-instance zone designation controls shown in the Building tab -->
<script lang="ts">
  import { uiState } from '$lib/stores/uiState';
  import { gameState } from '$lib/stores/gameState';
  import { designationService } from '$lib/game/services/DesignationService';
  import type { FilterableZoneType, Item } from '$lib/game/core/types';
  import itemsData from '$lib/game/database/items.jsonc';
  import BuildCard from './BuildCard.svelte';

  type CharSpan = { sheet?: string; id?: number; literal?: string };

  const ITEMS_DATABASE = itemsData as unknown as Item[];

  const ALL_CATEGORIES: string[] = [
    ...new Set(ITEMS_DATABASE.map((i) => i.category).filter(Boolean))
  ].sort();

  const ZONE_DEFS: {
    type: FilterableZoneType;
    label: string;
    charSpans: CharSpan[];
    desc: string;
    color: string;
    filterable?: boolean;
  }[] = [
    {
      type: 'stockpile',
      label: 'STOCKPILE',
      charSpans: [{ literal: 'P' }],
      desc: 'Haulers deposit carried resources here',
      color: '#e8a020',
      filterable: true
    },
    {
      type: 'drink',
      label: 'DRINK',
      charSpans: [{ literal: '~' }],
      desc: 'Thirsty pawns come here to drink (clean upstream water / urns)',
      color: '#4fc3f7'
    },
    {
      type: 'wash',
      label: 'WASH',
      charSpans: [{ literal: '≈' }],
      desc: 'Dirty pawns come here to wash',
      color: '#80d8c0'
    }
  ];

  const defOf = (type: string) => ZONE_DEFS.find((d) => d.type === type);

  let activeType = $derived($uiState.designationType);
  let activeInstId = $derived($uiState.activeZoneInstanceId);
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
      designationService.toggleInstanceCategory(instanceId, category, ALL_CATEGORIES, state)
    );
  }

  function clearFilter(instanceId: string) {
    gameState.updateWithSave((state) => designationService.clearInstanceFilter(instanceId, state));
  }
</script>

<div class="zone-panel">
  <div class="hint">
    {#if designationActive}
      <span class="hint-active">
        PAINTING [{activeType?.toUpperCase()}] — drag to fill · X erase · click [■] to stop
      </span>
    {:else}
      create a zone, then drag to paint it on the map
    {/if}
  </div>

  <!-- Zone types as build cards: the action spawns a new zone and enters painting mode -->
  <div class="card-grid">
    {#each ZONE_DEFS as def}
      {@const count = ($gameState.zoneInstances ?? []).filter((z) => z.type === def.type).length}
      <BuildCard
        name={def.label}
        charSpans={def.charSpans}
        description={def.desc}
        tint={def.color}
        badge={count > 0 ? `×${count}` : null}
        actionLabel="+ NEW"
        actionEnabled={true}
        variant="ok"
        onAction={() => newZone(def.type)}
      >
        {#if count > 0}
          <span class="cost-item">{count} active</span>
        {:else}
          <span class="muted-text">none yet — add one</span>
        {/if}
      </BuildCard>
    {/each}
  </div>

  <!-- Per-instance management: paint / filter / delete -->
  {#if ($gameState.zoneInstances ?? []).length > 0}
    <div class="section-sub">| ACTIVE ZONES</div>
    {#each $gameState.zoneInstances ?? [] as inst}
      {@const def = defOf(inst.type)}
      {@const tileCount = instanceTileCounts[inst.id] ?? 0}
      {@const isPainting = designationActive && activeInstId === inst.id}
      {@const hasFilter = inst.filter.allowedCategories.length > 0}
      {@const isFilterOpen = openFilterInstance === inst.id}

      <div class="inst-row" class:painting={isPainting} style="--zcolor: {def?.color ?? '#888'}">
        <button
          class="paint-btn"
          class:active={isPainting}
          onclick={() => paintZone(inst.type, inst.id)}
          title={isPainting ? 'Stop painting' : 'Paint this zone on the map'}
        >
          {isPainting ? '[■]' : '[▶]'}
        </button>
        <span class="inst-label">{inst.label}</span>
        {#if tileCount > 0}
          <span class="tile-count">{tileCount}t</span>
        {/if}
        {#if def?.filterable && hasFilter}
          <span class="filter-badge">{inst.filter.allowedCategories.length}f</span>
        {/if}
        {#if def?.filterable}
          <button
            class="icon-btn"
            class:active={isFilterOpen}
            onclick={() => toggleFilterPanel(inst.id)}
            title="Configure filter">[F]</button
          >
        {/if}
        <button
          class="icon-btn del"
          onclick={() => removeZone(inst.id)}
          title="Delete zone and tiles">[X]</button
        >
      </div>

      {#if isFilterOpen}
        <div class="filter-panel" style="--zcolor: {def?.color ?? '#888'}">
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
              {@const checked = !hasFilter || inst.filter.allowedCategories.includes(cat)}
              <label class="cat-label" class:checked>
                <input type="checkbox" {checked} onchange={() => toggleCategory(inst.id, cat)} />
                {cat}
              </label>
            {/each}
          </div>
          <div class="filter-note">
            {hasFilter
              ? 'Only checked categories will be hauled here.'
              : 'All categories allowed — uncheck to restrict this zone.'}
          </div>
        </div>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .zone-panel {
    border-bottom: 1px solid #2a2010;
    padding-bottom: 0.75rem;
    margin-bottom: 0.5rem;
    font-family: var(--font-mono, monospace);
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 5px;
    margin-bottom: 0.6rem;
  }

  .section-sub {
    color: var(--accent-hi);
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    margin: 0.2rem 0 0.3rem;
  }

  .cost-item {
    color: var(--text-dim);
    font-size: 10px;
  }

  .muted-text {
    color: var(--text-muted, #777);
    font-size: 10px;
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
    50% {
      opacity: 0.5;
    }
  }

  /* ── Instance rows ──────────────────────────────── */

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
    transition:
      border-color 0.15s,
      color 0.15s;
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
    transition:
      border-color 0.15s,
      color 0.15s;
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
    margin: 0.15rem 0 0.6rem 1.5rem;
    padding: 0.75rem 0.9rem;
    border: 1px solid color-mix(in srgb, var(--zcolor) 35%, #222);
    background: #08080a;
  }

  .filter-hdr {
    font-size: 0.8rem;
    color: var(--zcolor);
    margin-bottom: 0.65rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .filter-hint {
    color: #777;
    font-size: 0.72rem;
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
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.45rem 0.8rem;
    margin-bottom: 0.55rem;
  }

  .cat-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.78rem;
    color: #777;
    cursor: pointer;
    user-select: none;
    transition: color 0.1s;
  }

  .cat-label.checked {
    color: var(--zcolor);
  }

  .cat-label input[type='checkbox'] {
    accent-color: var(--zcolor);
    width: 15px;
    height: 15px;
    cursor: pointer;
  }

  .filter-note {
    font-size: 0.7rem;
    color: #666;
    margin-top: 0.2rem;
  }
</style>
