<!-- ZonePanel.svelte — Per-instance zone designation controls shown in the Building tab -->
<script lang="ts">
  import { uiState } from '$lib/stores/uiState';
  import { gameState } from '$lib/stores/gameState';
  import type { FilterableZoneType, ZoneInstanceType, Item } from '$lib/game/core/types';
  import itemsData from '$lib/game/database/items/items.jsonc';
  import { resourceObjectService } from '$lib/game/services/ResourceObjectService';
  import BuildCard from './BuildCard.svelte';
  import SpriteIcon from './SpriteIcon.svelte';

  type CharSpan = { sheet?: string; id?: number; literal?: string };

  const ITEMS_DATABASE = itemsData as unknown as Item[];

  const ALL_CATEGORIES: string[] = [
    ...new Set(ITEMS_DATABASE.map((i) => i.category).filter(Boolean))
  ].sort();

  // Sowable crops drive the GROW zone's picker — a seed/crop list, NOT the stockpile category grid.
  // The zone filter still stores the seed's `category` in `allowedCategories` (the sow logic in
  // jobs/plant.ts matches a seed by category), so a grow zone restricts which crops get sown. We show
  // the crop's human `displayName` and feed the toggle only the SEED categories (not every item
  // category) as its universe, so clear/invert math operates on the crop set alone.
  const CROP_SEEDS: { name: string; category: string }[] = (() => {
    const byCat = new Map<string, string>();
    for (const d of resourceObjectService.getAll()) {
      if (!d.crop) continue;
      const seedId = d.crop.seedItem;
      const cat = ITEMS_DATABASE.find((i) => i.id === seedId)?.category ?? seedId;
      if (!byCat.has(cat)) byCat.set(cat, d.displayName);
    }
    return [...byCat.entries()]
      .map(([category, name]) => ({ category, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  })();
  const SEED_CATEGORIES: string[] = CROP_SEEDS.map((c) => c.category);

  /** A grow zone filters by crop seed; everything else (stockpile) filters by item category. */
  const filterUniverse = (type: string) => (type === 'grow' ? SEED_CATEGORIES : ALL_CATEGORIES);

  const ZONE_DEFS: {
    type: ZoneInstanceType;
    label: string;
    charSpans: CharSpan[];
    desc: string;
    color: string;
    filterable?: boolean;
    /** Restriction zone: carries a pawn assignment (the PAWNS panel) instead of an item filter. */
    pawnAssignable?: boolean;
    /** Renders a tile-background tint on the map (so the "color" toggle is meaningful). */
    tinted?: boolean;
  }[] = [
    {
      type: 'stockpile',
      label: 'STOCKPILE',
      charSpans: [{ literal: 'P' }],
      desc: 'Haulers deposit carried resources here',
      color: '#e8a020',
      filterable: true,
      tinted: true
    },
    {
      type: 'drink',
      label: 'DRINK',
      charSpans: [{ literal: '~' }],
      desc: 'Thirsty pawns come here to drink (clean upstream water / urns)',
      color: '#4fc3f7',
      tinted: true
    },
    {
      type: 'wash',
      label: 'WASH',
      charSpans: [{ literal: '≈' }],
      desc: 'Dirty pawns come here to wash',
      color: '#80d8c0',
      tinted: true
    },
    {
      type: 'restrict',
      label: 'RESTRICT',
      charSpans: [{ literal: '#' }],
      desc: 'Assigned pawns stay inside this zone and never wander out',
      color: '#b06cd0',
      pawnAssignable: true,
      tinted: true
    },
    {
      type: 'grow',
      label: 'GROW',
      charSpans: [{ literal: '"' }],
      desc: 'Farmers sow the chosen seed on fertile soil in this zone',
      color: '#6fae3a',
      filterable: true,
      tinted: true
    }
  ];

  const defOf = (type: string) => ZONE_DEFS.find((d) => d.type === type);

  let activeType = $derived($uiState.designationType);
  let activeInstId = $derived($uiState.activeZoneInstanceId);
  let designationActive = $derived($uiState.designationActive);

  /** Which zone instance currently has its filter panel open (null = none). */
  let openFilterInstance = $state<string | null>(null);
  /** Which restriction zone currently has its PAWNS-assignment panel open (null = none). */
  let openPawnsInstance = $state<string | null>(null);

  /** Count tiles per zone instance. */
  let instanceTileCounts = $derived(
    (() => {
      const counts: Record<string, number> = {};
      // Each tile holds one instance id per zone layer (type); count every layer toward its instance.
      for (const layers of Object.values($gameState.designationZoneId ?? {})) {
        for (const instId of Object.values(layers ?? {})) {
          counts[instId] = (counts[instId] ?? 0) + 1;
        }
      }
      return counts;
    })()
  );

  /** Create a new zone instance and immediately enter painting mode. */
  function newZone(type: ZoneInstanceType) {
    const existing = ($gameState.zoneInstances ?? []).filter((z) => z.type === type).length;
    const def = ZONE_DEFS.find((d) => d.type === type)!;
    const label = `${def.label[0]}${def.label.slice(1).toLowerCase()} ${existing + 1}`;
    // The id is generated here so paint mode can activate immediately (the worker command is
    // fire-and-forget — no round-trip to read back a worker-assigned id).
    const id = `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    gameState.command({ type: 'createZoneInstance', payload: { type, label, id }, save: true });
    // Inherit the surrounding hidden state: if every existing tinted zone is currently hidden, the new
    // zone is born hidden too. Otherwise it would default to visible and, since drawing reveals ALL
    // zones regardless of colorHidden, it'd be the one zone that stays revealed after you exit the tool
    // while the rest re-hide. The colour stays revealed during drawing either way (the map gates the
    // tint on designation mode), then re-hides on exit alongside the others.
    if (allColorsHidden) {
      gameState.command({ type: 'setZoneColorHidden', payload: { instanceId: id, hidden: true }, save: true });
    }
    uiState.activateDesignation(type, id);
  }

  /** Toggle painting mode for an existing instance. */
  function paintZone(type: string, instanceId: string) {
    if (designationActive && activeInstId === instanceId) {
      uiState.deactivateDesignation();
    } else {
      // All zones reveal while a drawing tool is active (the map gates the tint on designation mode),
      // then auto-restore their hidden state on exit — so no colour flag is touched here.
      uiState.activateDesignation(type, instanceId);
    }
  }

  /** Delete a zone instance and all its tiles. */
  function removeZone(instanceId: string) {
    gameState.command({ type: 'removeZoneInstance', payload: { instanceId }, save: true });
    if (openFilterInstance === instanceId) openFilterInstance = null;
    if (openPawnsInstance === instanceId) openPawnsInstance = null;
    if (designationActive && activeInstId === instanceId) uiState.deactivateDesignation();
  }

  function toggleFilterPanel(instanceId: string) {
    openFilterInstance = openFilterInstance === instanceId ? null : instanceId;
  }

  function togglePawnsPanel(instanceId: string) {
    openPawnsInstance = openPawnsInstance === instanceId ? null : instanceId;
  }

  /** Assign / unassign a pawn to a restriction zone (reuses the filter-panel UX, pawns instead of items). */
  function toggleZonePawn(instanceId: string, pawnId: string) {
    gameState.command({ type: 'toggleZonePawn', payload: { instanceId, pawnId }, save: true });
  }

  function toggleCategory(instanceId: string, type: string, category: string) {
    gameState.command({
      type: 'toggleInstanceCategory',
      payload: { instanceId, category, allCategories: filterUniverse(type) },
      save: true
    });
  }

  function clearFilter(instanceId: string) {
    gameState.command({ type: 'clearInstanceFilter', payload: { instanceId }, save: true });
  }

  /** Tinted (map-colored) zone instances — the ones the color toggles apply to. */
  let tintedInstances = $derived(
    ($gameState.zoneInstances ?? []).filter((z) => defOf(z.type)?.tinted)
  );
  /** True only when every tinted zone is currently hidden (drives the master button label). */
  let allColorsHidden = $derived(
    tintedInstances.length > 0 && tintedInstances.every((z) => z.colorHidden)
  );

  function toggleZoneColor(instanceId: string, hidden: boolean) {
    gameState.command({
      type: 'setZoneColorHidden',
      payload: { instanceId, hidden },
      save: true
    });
  }

  function toggleAllColors() {
    gameState.command({
      type: 'setAllZoneColorHidden',
      payload: { hidden: !allColorsHidden },
      save: true
    });
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
    <div class="section-sub zones-hdr">
      <span>| ACTIVE ZONES</span>
      {#if tintedInstances.length > 0}
        <button
          class="zbtn allcolor"
          class:active={allColorsHidden}
          title="Hide or show every zone's overlay color on the map"
          onclick={toggleAllColors}
        >
          {allColorsHidden ? 'SHOW ALL COLORS' : 'HIDE ALL COLORS'}
        </button>
      {/if}
    </div>
    {#each $gameState.zoneInstances ?? [] as inst}
      {@const def = defOf(inst.type)}
      {@const tileCount = instanceTileCounts[inst.id] ?? 0}
      {@const isPainting = designationActive && activeInstId === inst.id}
      {@const hasFilter = inst.filter.allowedCategories.length > 0}
      {@const isFilterOpen = openFilterInstance === inst.id}
      {@const isPawnsOpen = openPawnsInstance === inst.id}
      {@const assignedCount = inst.assignedPawnIds?.length ?? 0}
      {@const colorHidden = inst.colorHidden ?? false}

      <div class="zone-card" class:painting={isPainting} style="--zcolor: {def?.color ?? '#888'}">
        <div class="card-accent"></div>
        <div class="card-body">
          <div class="card-header">
            <SpriteIcon charSpans={def?.charSpans} tint={def?.color} px={16} />
            <span class="card-name">{inst.label}</span>
            {#if tileCount > 0}
              <span class="zc-badge">{tileCount} tiles</span>
            {/if}
            {#if def?.filterable && hasFilter}
              <span class="zc-badge filtered"
                >{inst.filter.allowedCategories.length}
                {inst.type === 'grow' ? 'crops' : 'filtered'}</span
              >
            {/if}
            {#if def?.pawnAssignable}
              <span class="zc-badge filtered"
                >{assignedCount} pawn{assignedCount === 1 ? '' : 's'}</span
              >
            {/if}
          </div>
          <div class="card-actions">
            <button
              class="zbtn"
              class:active={isPainting}
              onclick={() => paintZone(inst.type, inst.id)}
            >
              {isPainting ? 'STOP' : 'PAINT'}
            </button>
            {#if def?.filterable}
              <button
                class="zbtn"
                class:active={isFilterOpen}
                onclick={() => toggleFilterPanel(inst.id)}
              >
                {inst.type === 'grow' ? 'SEEDS' : 'FILTER'}
              </button>
            {/if}
            {#if def?.pawnAssignable}
              <button
                class="zbtn"
                class:active={isPawnsOpen}
                onclick={() => togglePawnsPanel(inst.id)}
              >
                PAWNS
              </button>
            {/if}
            {#if def?.tinted}
              <button
                class="zbtn"
                class:active={!colorHidden}
                title="Show or hide this zone's color on the map"
                onclick={() => toggleZoneColor(inst.id, !colorHidden)}
              >
                {colorHidden ? 'COLOR ✕' : 'COLOR ✓'}
              </button>
            {/if}
            <button class="zbtn del" onclick={() => removeZone(inst.id)}>DELETE</button>
          </div>
        </div>
      </div>

      {#if isFilterOpen}
        {@const isGrow = inst.type === 'grow'}
        <div class="filter-panel" style="--zcolor: {def?.color ?? '#888'}">
          <div class="filter-hdr">
            {isGrow ? 'SEEDS' : 'FILTER'}: {inst.label}
            <span class="filter-hint">
              {#if isGrow}
                {hasFilter
                  ? `${inst.filter.allowedCategories.length}/${CROP_SEEDS.length} crops`
                  : 'no seed chosen (sows any in stock)'}
              {:else}
                {hasFilter
                  ? `${inst.filter.allowedCategories.length}/${ALL_CATEGORIES.length} categories`
                  : 'no filter (all allowed)'}
              {/if}
            </span>
            {#if hasFilter}
              <button class="filter-clear-all" onclick={() => clearFilter(inst.id)}>CLEAR</button>
            {/if}
          </div>
          <div class="category-grid">
            {#if isGrow}
              {#each CROP_SEEDS as crop}
                {@const checked = !hasFilter || inst.filter.allowedCategories.includes(crop.category)}
                <label class="cat-label" class:checked>
                  <input
                    type="checkbox"
                    {checked}
                    onchange={() => toggleCategory(inst.id, inst.type, crop.category)}
                  />
                  {crop.name}
                </label>
              {/each}
            {:else}
              {#each ALL_CATEGORIES as cat}
                {@const checked = !hasFilter || inst.filter.allowedCategories.includes(cat)}
                <label class="cat-label" class:checked>
                  <input
                    type="checkbox"
                    {checked}
                    onchange={() => toggleCategory(inst.id, inst.type, cat)}
                  />
                  {cat}
                </label>
              {/each}
            {/if}
          </div>
          <div class="filter-note">
            {#if isGrow}
              {hasFilter
                ? 'Only checked crops will be sown here (soil & season permitting).'
                : 'No crop chosen — farmers sow the first seed in stock. Check crops to restrict.'}
            {:else}
              {hasFilter
                ? 'Only checked categories will be hauled here.'
                : 'All categories allowed — uncheck to restrict this zone.'}
            {/if}
          </div>
        </div>
      {/if}

      {#if isPawnsOpen}
        <div class="filter-panel" style="--zcolor: {def?.color ?? '#888'}">
          <div class="filter-hdr">
            PAWNS: {inst.label}
            <span class="filter-hint">
              {assignedCount > 0
                ? `${assignedCount}/${($gameState.pawns ?? []).length} confined`
                : 'none assigned (roam freely)'}
            </span>
          </div>
          <div class="category-grid">
            {#each $gameState.pawns ?? [] as p}
              {@const checked = inst.assignedPawnIds?.includes(p.id) ?? false}
              <label class="cat-label" class:checked>
                <input type="checkbox" {checked} onchange={() => toggleZonePawn(inst.id, p.id)} />
                {p.name}
              </label>
            {/each}
          </div>
          <div class="filter-note">
            Checked pawns may only walk inside this zone (and any other zone they're assigned to).
            Drafted pawns ignore it.
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

  .zones-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .zbtn.allcolor {
    border-color: var(--accent-hi);
    color: var(--accent-hi);
  }

  .zbtn.allcolor:hover,
  .zbtn.allcolor.active {
    background: color-mix(in srgb, var(--accent-hi) 20%, transparent);
  }

  .cost-item {
    color: var(--text-dim);
    font-size: 11px;
  }

  .muted-text {
    color: var(--text-muted, #777);
    font-size: 11px;
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

  /* ── Instance cards (match the build cards above) ── */

  .zone-card {
    display: flex;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 5px;
    transition: border-color 0.15s ease;
  }

  .zone-card:hover {
    border-color: var(--border-hi);
  }

  .zone-card.painting {
    border-color: var(--zcolor);
    background: color-mix(in srgb, var(--zcolor) 7%, var(--bg-panel));
  }

  .zone-card .card-accent {
    width: 3px;
    flex-shrink: 0;
    background: var(--zcolor);
  }

  .zone-card .card-body {
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .zone-card .card-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .zone-card .card-name {
    color: var(--zcolor);
    font-size: 12px;
    letter-spacing: 0.04em;
    font-weight: 600;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .zc-badge {
    font-size: 10px;
    color: var(--text-dim);
    flex-shrink: 0;
  }

  .zc-badge.filtered {
    color: var(--zcolor);
  }

  .card-actions {
    display: flex;
    gap: 5px;
  }

  .zbtn {
    padding: 3px 12px;
    background: transparent;
    border: 1px solid var(--zcolor);
    color: var(--zcolor);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.05em;
    cursor: pointer;
    transition: background 0.12s;
  }

  .zbtn:hover,
  .zbtn.active {
    background: color-mix(in srgb, var(--zcolor) 20%, transparent);
  }

  .zbtn.del {
    border-color: #8a4a3a;
    color: #c46a55;
  }

  .zbtn.del:hover {
    background: color-mix(in srgb, #c44 20%, transparent);
  }

  /* ── Filter panel ───────────────────────────────── */

  .filter-panel {
    margin: -2px 0 0.6rem 0.75rem;
    padding: 0.75rem 0.9rem;
    border: 1px solid color-mix(in srgb, var(--zcolor) 40%, var(--border));
    border-radius: 2px;
    background: var(--bg-panel);
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
    background: transparent;
    border: 1px solid var(--zcolor);
    color: var(--zcolor);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.05em;
    padding: 2px 10px;
    margin-left: auto;
    transition: background 0.12s;
  }

  .filter-clear-all:hover {
    background: color-mix(in srgb, var(--zcolor) 20%, transparent);
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
