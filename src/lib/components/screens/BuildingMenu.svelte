<script lang="ts">
  import { gameState, currentRace } from '$lib/stores/gameState';
  import { addToStockpileZone } from '$lib/game/core/GameState';
  import { uiState } from '$lib/stores/uiState';
  import { itemService } from '$lib/game/services/ItemService';
  import { buildingService } from '$lib/game/services/BuildingService';
  import { onDestroy } from 'svelte';
  import CurrentTask from '../UI/CurrentTask.svelte';
  import ZonePanel from '../UI/ZonePanel.svelte';
  import BuildCard from '../UI/BuildCard.svelte';
  import FilterTabs from '../UI/FilterTabs.svelte';
  import SearchBar from '../UI/SearchBar.svelte';
  import type { PlacedBuilding } from '$lib/game/core/types';
  import type { Building } from '$lib/game/core/types';

  let race: any = null;
  let buildings: PlacedBuilding[] = [];
  let completedResearch: string[] = [];

  // UI section grouping. Derived from each building's id/effects/category via classify()
  // below — kept here so the engine `category` field (read by ModifierSystem/BuildingService
  // for work bonuses) is never repurposed just to drive the menu layout.
  const SECTION_ORDER = [
    'FIRE & COOKING',
    'WORKSHOPS',
    'SMELTING & FORGE',
    'FOOD & HIDES',
    'TRAPS & WATER',
    'BEDS & SHELTER',
    'FURNITURE & STORAGE',
    'WALLS & DOORS',
    'ROOFS & WINDOWS',
    'KNOWLEDGE',
    'OTHER'
  ];

  function classify(b: Building): string {
    const e = (b.effects ?? {}) as Record<string, number | boolean>;
    if (b.id === 'campfire' || b.id === 'hearth' || e.isFire) return 'FIRE & COOKING';
    if (e.smeltingEnabled || e.smithingEnabled) return 'SMELTING & FORGE';
    if (
      e.butcheringEnabled ||
      e.leatherworkingEnabled ||
      b.id === 'drying_rack' ||
      b.id === 'hide_rack'
    )
      return 'FOOD & HIDES';
    if (e.trapEnabled || e.waterSource) return 'TRAPS & WATER';
    if (e.roof || e.window || b.id.includes('roof') || b.id === 'window') return 'ROOFS & WINDOWS';
    if (e.movementCost === 99 || b.id.includes('wall') || b.id.includes('door'))
      return 'WALLS & DOORS';
    if (e.sleepQuality || e.fatigueRecovery || b.category === 'shelter') return 'BEDS & SHELTER';
    if (e.comfort || b.isStorage || b.category === 'furniture') return 'FURNITURE & STORAGE';
    if (b.category === 'knowledge') return 'KNOWLEDGE';
    if (e.craftingEnabled) return 'WORKSHOPS';
    return 'OTHER';
  }

  // All building defs from every category (no research filter — show all, lock none)
  const ALL_BUILDING_DEFS: Building[] = [
    'housing',
    'production',
    'knowledge',
    'military',
    'food',
    'commerce',
    'magical',
    'exploration',
    'social',
    'furniture',
    'structure',
    'shelter'
  ].flatMap((cat) => buildingService.getBuildingsByCategory(cat));

  $: firstBuildingInProgress = buildings.find((b) => b.status !== 'complete') ?? null;
  $: allBuildingsInProgress = buildings.filter((b) => b.status !== 'complete');
  $: campfires = buildings.filter((b) => b.type === 'campfire' && b.status === 'complete');

  // Only show unlocked buildings — locked buildings are hidden entirely
  $: unlockedDefs = ALL_BUILDING_DEFS.filter(
    (b) => !b.researchRequired || completedResearch.includes(b.researchRequired as string)
  );

  // Grouped unlocked buildings — one pass via classify(), ordered by SECTION_ORDER,
  // empty sections dropped.
  $: sections = SECTION_ORDER.map((label) => ({
    label,
    defs: unlockedDefs.filter((b) => classify(b) === label)
  })).filter((s) => s.defs.length > 0);

  // Which tab is active ('ZONES' or a category; default to the first category).
  let selectedSection = '';
  $: if (
    selectedSection !== 'ZONES' &&
    sections.length &&
    !sections.some((s) => s.label === selectedSection)
  ) {
    selectedSection = sections[0].label;
  }
  $: activeSection = sections.find((s) => s.label === selectedSection) ?? sections[0];

  // Live search across every section (bypasses tabs/ZONES while a query is present).
  let searchQuery = '';
  $: searchTerm = searchQuery.trim().toLowerCase();
  $: displayedDefs = searchTerm
    ? unlockedDefs.filter((b) => b.name.toLowerCase().includes(searchTerm))
    : (activeSection?.defs ?? []);

  // Legacy compat
  $: availableBuildings = unlockedDefs;

  $: getItemAmount = (itemId: string): number => $gameState?.stockpile?.[itemId] ?? 0;

  $: getBuildingCount = (buildingId: string): number => {
    return buildings.filter((b) => b.type === buildingId && b.status === 'complete').length;
  };

  // A `category:<cat>` slot accepts any item of that category, so it has no single
  // stock count — sum the stockpile across every item in the category.
  $: getCostHave = (id: string): number => {
    if (id.startsWith('category:')) {
      const cat = id.slice('category:'.length);
      return itemService
        .getItemsByCategory(cat)
        .reduce((sum, it) => sum + ($gameState?.stockpile?.[it.id] ?? 0), 0);
    }
    return getItemAmount(id);
  };

  // `category:stone` is an engine cost key, not an item id — render it as "any stone".
  function formatCostLabel(id: string): string {
    return id.startsWith('category:')
      ? `any ${id.slice('category:'.length)}`
      : id.replace(/_/g, ' ');
  }

  // Player's material pick per building def for `category:` cost slots: buildingId → costKey → itemId.
  // Eventually these picks will drive durability/beauty; for now they just choose which stock is spent.
  let selectedMaterials: Record<string, Record<string, string>> = {};
  function setMaterial(buildingId: string, costKey: string, itemId: string) {
    const forBuilding = { ...(selectedMaterials[buildingId] ?? {}) };
    if (itemId) forBuilding[costKey] = itemId;
    else delete forBuilding[costKey];
    selectedMaterials = { ...selectedMaterials, [buildingId]: forBuilding };
  }
  // Candidate items for a `category:<cat>` slot — in-stock first, then the rest of the category.
  function categoryItemsFor(costKey: string) {
    const cat = costKey.slice('category:'.length);
    return itemService
      .getItemsByCategory(cat)
      .slice()
      .sort((a, b) => (getItemAmount(b.id) > 0 ? 1 : 0) - (getItemAmount(a.id) > 0 ? 1 : 0));
  }

  // MISSING vs BLOCKED: resolveBuildingCost handles concrete + `category:*` slots and reads
  // physical AVAILABLE stock (ADR-016 droppedItems), so it's the real affordability signal —
  // the stockpile mirror double-counts reserved stacks and can't resolve category slots.
  $: canAfford = (building: Building): boolean =>
    !!$gameState && buildingService.resolveBuildingCost(building.id, $gameState) !== null;

  // Full build check (affordability + research/tools/population/uniqueness) against real state.
  $: canBuild = (building: Building): boolean =>
    !!$gameState && !!race && buildingService.canBuildBuilding(building.id, $gameState);

  const unsubscribeRace = currentRace.subscribe((value) => {
    race = value;
  });

  const unsubscribeGame = gameState.subscribe((state) => {
    buildings = state.buildings || [];
    completedResearch = state.completedResearch || [];
  });

  onDestroy(() => {
    unsubscribeRace();
    unsubscribeGame();
  });

  function startBuilding(building: Building) {
    if (!canBuild(building)) {
      console.log('Cannot build:', building.name);
      return;
    }

    // ADR-016: placeBuilding RESERVES the cost (pawns fetch it to the site); consumed on
    // construction completion, not here. (0,0) — abstract/off-map.
    gameState.command({
      type: 'placeBuilding',
      payload: { bid: building.id, x: 0, y: 0 },
      save: true
    });
  }

  function cancelBuilding(buildingId: string) {
    gameState.command({ type: 'cancelBuildingRefund', payload: { buildingId }, save: true });
  }

  function formatEffectName(camelCaseStr: string): string {
    return camelCaseStr
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (match) => match.toUpperCase())
      .trim();
  }

  function getBuildingRequirements(building: Building): string[] {
    const requirements = [];

    if (building.toolTierRequired && building.toolTierRequired > 0) {
      requirements.push(`🔧 Tool Level ${building.toolTierRequired}`);
    }

    if (building.researchRequired) {
      requirements.push(`📚 ${building.researchRequired}`);
    }

    if (building.populationRequired > 0) {
      requirements.push(`👥 ${building.populationRequired} population`);
    }

    return requirements;
  }

  // Buildings special properties
  function getBuildingSpecialProperties(building: Building): string[] {
    const properties = [];

    if (building.buildingProperties) {
      const props = building.buildingProperties;

      if (props.populationCapacity) properties.push(`🏠 +${props.populationCapacity} housing`);
      if (props.knowledgeGeneration)
        properties.push(`📚 +${props.knowledgeGeneration} knowledge/hour`);
      if (props.foodProduction) properties.push(`🍖 +${props.foodProduction} food/hour`);
      if (props.defensiveStrength) properties.push(`🛡️ +${props.defensiveStrength} defense`);
      if (props.craftingSpeed)
        properties.push(`⚡ +${Math.round((props.craftingSpeed - 1) * 100)}% crafting speed`);
      if (props.tradeBonus)
        properties.push(`💰 +${Math.round((props.tradeBonus - 1) * 100)}% trade value`);
      if (props.magicalPower) properties.push(`🔮 +${props.magicalPower} magical power`);
    }

    return properties;
  }

  function getUpkeepInfo(building: Building): string[] {
    if (!building.upkeepCost || Object.keys(building.upkeepCost).length === 0) {
      return ['No upkeep required'];
    }

    return Object.entries(building.upkeepCost).map(([itemId, amount]) => {
      const item = itemService.getItemById(itemId);
      return `${item?.name || itemId}: ${amount}/hour`;
    });
  }
</script>

<div class="building-menu">
  <div class="screen-hdr">
    | CONSTRUCTION
    <button class="hdr-btn" on:click={() => uiState.setScreen('main')}>BACK</button>
  </div>

  <!-- Building groups + ZONES as a tab. Sticky filter bar so tabs/search stay reachable on scroll. -->
  {#if sections.length > 0}
    <div class="filter-bar">
      <div class="filter-bar-tabs">
        <FilterTabs
          tabs={[
            { id: 'ZONES', label: 'ZONES' },
            ...sections.map((s) => ({ id: s.label, label: s.label }))
          ]}
          selected={selectedSection}
          onSelect={(id) => (selectedSection = id)}
        />
      </div>
      <SearchBar
        variant="inline"
        placeholder="search buildings…"
        bind:value={searchQuery}
        cacheKey="building"
      />
    </div>
    {#if selectedSection === 'ZONES' && !searchTerm}
      <ZonePanel />
    {:else if displayedDefs.length > 0}
      <div class="card-grid">
        {#each displayedDefs as building}
          {@const placed = getBuildingCount(building.id)}
          {@const affordable = canAfford(building)}
          {@const buildable = canBuild(building)}
          <BuildCard
            name={building.name.toUpperCase()}
            charSpans={building.charSpans}
            description={building.description ?? null}
            buildingDef={building}
            tint={building.color ?? 'var(--accent)'}
            workAmount={building.workAmount ?? null}
            badge={placed > 0 ? `×${placed}` : null}
            actionLabel={!affordable ? 'MISSING' : !buildable ? 'BLOCKED' : 'BUILD'}
            actionEnabled={buildable}
            variant={!affordable ? 'missing' : !buildable ? 'blocked' : 'ok'}
            onAction={() =>
              uiState.activateBlueprint(building.id, selectedMaterials[building.id] ?? null)}
          >
            {#if Object.keys(building.buildingCost).length === 0}
              <span class="muted-text">free</span>
            {:else}
              {#each Object.entries(building.buildingCost) as [id, n], ci}
                {@const have = getCostHave(id)}
                {#if ci > 0}<span class="cost-sep">·</span>{/if}
                {#if id.startsWith('category:')}
                  <!-- svelte-ignore a11y_no_onchange -->
                  <span class="cost-item" class:neg-text={have < (n as number)}>
                    <select
                      class="mat-select"
                      value={selectedMaterials[building.id]?.[id] ?? ''}
                      on:change={(e) => setMaterial(building.id, id, e.currentTarget.value)}
                      title="choose {id.slice('category:'.length)} to spend"
                    >
                      <option value="">any {id.slice('category:'.length)}</option>
                      {#each categoryItemsFor(id) as opt}
                        <option value={opt.id}>{opt.name} ({getItemAmount(opt.id)})</option>
                      {/each}
                    </select>
                    <span class="cost-qty">×{n}</span>
                    <span class="cost-have" class:neg-text={have < (n as number)}>({have})</span>
                  </span>
                {:else}
                  <span class="cost-item" class:neg-text={have < (n as number)}>
                    {formatCostLabel(id)} <span class="cost-qty">×{n}</span>
                    <span class="cost-have" class:neg-text={have < (n as number)}>({have})</span>
                  </span>
                {/if}
              {/each}
            {/if}
          </BuildCard>
        {/each}
      </div>
    {:else if searchTerm}
      <div class="muted-row">no buildings match "{searchQuery}"</div>
    {/if}
  {/if}

  <!-- Campfire fuel — compact chips, same footer as the build jobs -->
  {#if campfires.length > 0}
    <div class="build-jobs">
      <div class="jobs-hdr">| FIRES ({campfires.length})</div>
      <div class="jobs-grid">
        {#each campfires as cf (cf.id)}
          {@const fuelPct = Math.round(((cf.fuel ?? 0) / 60) * 100)}
          <div class="job-chip" title="Campfire fuel {Math.floor(cf.fuel ?? 0)}/60">
            <span class="job-fill" class:lit={cf.lit} style="width:{fuelPct}%"></span>
            <span class="job-name" style="color:{cf.lit ? '#fa0' : '#555'}"
              >{cf.lit ? '🔥' : '⬛'} CAMPFIRE</span
            >
            <span class="job-pct">{Math.floor(cf.fuel ?? 0)}/60</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Active construction queue — compact chips, kept below the build/zone tabs -->
  {#if allBuildingsInProgress.length > 0}
    <div class="build-jobs">
      <div class="jobs-hdr">| ACTIVE BUILD JOBS ({allBuildingsInProgress.length})</div>
      <div class="jobs-grid">
        {#each allBuildingsInProgress as bp (bp.id)}
          {@const bDef = buildingService.getBuildingById(bp.type)}
          {@const prog = Math.round(((bp.workDone ?? 0) / (bp.workRequired ?? 50)) * 100)}
          <div class="job-chip" title="{bDef?.name ?? bp.type} — {prog}%">
            <span class="job-fill" style="width:{prog}%"></span>
            <span class="job-name">{bDef?.name.toUpperCase() ?? bp.type}</span>
            <span class="job-pct">{prog}%</span>
            <button class="job-x" title="Cancel" on:click={() => cancelBuilding(bp.id)}>✕</button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .building-menu {
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    display: flex;
    flex-direction: column;
  }
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 5px;
    padding: 5px 8px;
  }

  /* Sticky filter + search bar — stays pinned while the card grid scrolls under it. */
  .filter-bar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: stretch;
    background: var(--bg);
    border-bottom: 2px solid var(--border-hi);
  }
  .filter-bar-tabs {
    flex: 1 1 auto;
    min-width: 0;
  }
  .filter-bar-tabs :global(.filter-tabs) {
    border-bottom: none;
  }
  .muted-row {
    padding: 4px 10px;
    font-size: 10px;
    color: var(--text-dim);
  }

  .screen-hdr {
    padding: 5px 10px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
  }

  .hdr-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--accent);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    padding: 2px 6px;
    cursor: pointer;
  }

  .cost-sep {
    color: var(--text-dim);
    opacity: 0.4;
    margin: 0 1px;
  }

  .cost-item {
    display: inline-flex;
    gap: 2px;
    align-items: center;
  }

  .cost-qty {
    color: var(--accent);
  }

  /* Material picker for `category:` cost slots — retro terminal select (fuel-panel concept). */
  .mat-select {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--accent-hi);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    padding: 0 2px;
    max-width: 110px;
    cursor: pointer;
    outline: none;
  }
  .mat-select:hover {
    border-color: var(--border-hi);
  }
  .mat-select:focus {
    border-color: var(--accent-hi);
  }

  .cost-have {
    opacity: 0.6;
  }

  .muted-text {
    color: var(--text-dim);
  }

  .neg-text {
    color: var(--neg);
  }

  /* ── Active build jobs / fires (compact chips, below the tabs) ── */
  .build-jobs {
    padding: 4px 8px 8px;
    border-top: 1px solid var(--border);
    margin-top: 4px;
  }
  .jobs-hdr {
    color: var(--accent);
    font-size: 10px;
    letter-spacing: 0.08em;
    padding: 2px 0 5px;
  }
  .jobs-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .job-chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 170px;
    padding: 2px 5px;
    border: 1px solid var(--border);
    background: var(--bg-panel);
    overflow: hidden;
    font-size: 10px;
  }
  .job-fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    pointer-events: none;
    z-index: 0;
  }
  .job-fill.lit {
    background: color-mix(in srgb, #ff8800 32%, transparent);
  }
  .job-name {
    position: relative;
    z-index: 1;
    max-width: 100px;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .job-pct {
    position: relative;
    z-index: 1;
    color: var(--accent);
    font-size: 9px;
  }
  .job-x {
    position: relative;
    z-index: 1;
    background: none;
    border: none;
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    line-height: 1;
    padding: 0 1px;
    cursor: pointer;
  }
  .job-x:hover {
    color: var(--neg);
  }
</style>
