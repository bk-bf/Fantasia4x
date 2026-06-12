<script lang="ts">
  import { gameState, currentRace, currentTurn } from '$lib/stores/gameState';
  import { addToStockpileZone, consumeFromStockpiles } from '$lib/game/core/GameState';
  import { uiState } from '$lib/stores/uiState';
  import { itemService } from '$lib/game/services/ItemService';
  import { buildingService } from '$lib/game/services/BuildingService';
  import { onDestroy } from 'svelte';
  import CurrentTask from '../UI/CurrentTask.svelte';
  import ZonePanel from '../UI/ZonePanel.svelte';
  import BuildCard from '../UI/BuildCard.svelte';
  import type { PlacedBuilding } from '$lib/game/core/types';
  import type { Building } from '$lib/game/core/types';

  let race: any = null;
  let buildings: PlacedBuilding[] = [];
  let maxPopulation = 0;
  let currentTurnValue = 0;
  let completedResearch: string[] = [];
  let currentToolLevel = 0;

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

  // Legacy compat
  $: availableBuildings = unlockedDefs;

  $: getItemAmount = (itemId: string): number => $gameState?.stockpile?.[itemId] ?? 0;

  $: getBuildingCount = (buildingId: string): number => {
    return buildings.filter((b) => b.type === buildingId && b.status === 'complete').length;
  };

  // Enhanced affordability check using new interface
  $: canAfford = (building: Building): boolean => {
    if (!building.buildingCost) return false;
    return Object.entries(building.buildingCost).every(([itemId, cost]) => {
      const available = $gameState?.stockpile?.[itemId] ?? 0;
      return available >= Number(cost);
    });
  };

  // Enhanced build check with new requirements
  $: canBuild = (building: Building): boolean => {
    if (!race) return false;

    const gameStateForCheck = {
      seed: 0,
      pawns: Array(race.population).fill({}),
      maxPopulation,
      currentToolLevel,
      completedResearch,
      item: [],
      buildingCounts: {},
      buildings,
      stockpile: $gameState?.stockpile ?? {},
      designations: {},
      jobs: [],
      turn: currentTurnValue,
      race: race,
      buildingQueue: [],
      // Required properties with default values
      worldMap: [],
      availableResearch: [],
      discoveredLore: [],
      equippedItems: {
        weapon: null,
        head: null,
        chest: null,
        legs: null,
        feet: null,
        hands: null
      },
      craftingQueue: [],
      workAssignments: {},
      pawnStats: {},
      stockpileZones: []
    };

    return buildingService.canBuildBuilding(building.id, gameStateForCheck) && canAfford(building);
  };

  // Subscribe to turn changes to force reactivity
  const unsubscribeTurn = currentTurn.subscribe((turn) => {
    currentTurnValue = turn;
  });

  const unsubscribeRace = currentRace.subscribe((value) => {
    race = value;
  });

  const unsubscribeGame = gameState.subscribe((state) => {
    buildings = state.buildings || [];
    maxPopulation = state.maxPopulation;
    completedResearch = state.completedResearch || [];
    currentToolLevel = state.currentToolLevel || 0;
  });

  onDestroy(() => {
    unsubscribeRace();
    unsubscribeGame();
    unsubscribeTurn();
  });

  function startBuilding(building: Building) {
    if (!canBuild(building)) {
      console.log('Cannot build:', building.name);
      return;
    }

    gameState.updateWithSave((state) => {
      // Resolve category cost slots (e.g. `category:stone` → any stone in stock) to concrete items.
      const cost = buildingService.resolveBuildingCost(building.id, state) ?? building.buildingCost;
      const stateAfterCost = consumeFromStockpiles(state, cost);
      // Place building at (0,0) — abstract/off-map; JobService generates a construct job
      return buildingService.placeBuilding(building.id, 0, 0, stateAfterCost);
    });
  }

  function cancelBuilding(buildingId: string) {
    const placed = buildings.find((b) => b.id === buildingId);
    if (!placed) return;
    const buildingDef = buildingService.getBuildingById(placed.type);
    if (!buildingDef) return;

    gameState.updateWithSave((state) => {
      // Refund concrete costs; category slots (`category:*`) can't be refunded to a specific item, so skip them.
      const refund = Object.fromEntries(
        Object.entries(buildingDef.buildingCost).filter(([k]) => !k.startsWith('category:'))
      );
      const stateWithRefund = addToStockpileZone(state, null, refund);
      return {
        ...stateWithRefund,
        buildings: (state.buildings ?? []).filter((b) => b.id !== buildingId),
        // Also cancel the matching construct job
        jobs: (state.jobs ?? []).filter(
          (j) => !(j.type === 'construct' && j.buildingId === buildingId)
        )
      };
    });
  }

  function getCategoryIcon(category: string): string {
    switch (category) {
      case 'housing':
        return '🏠';
      case 'production':
        return '⚒️';
      case 'knowledge':
        return '📚';
      case 'military':
        return '⚔️';
      case 'food':
        return '🍖';
      case 'commerce':
        return '🏪';
      case 'magical':
        return '🔮';
      case 'exploration':
        return '🗺️';
      case 'social':
        return '👥';
      default:
        return '🏗️';
    }
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

  <ZonePanel />

  <!-- Active construction queue -->
  <div class="section-hdr sub">| ACTIVE BUILD JOBS ({allBuildingsInProgress.length})</div>
  {#if allBuildingsInProgress.length > 0}
    {#each allBuildingsInProgress as bp}
      {@const bDef = buildingService.getBuildingById(bp.type)}
      {@const prog = Math.round(((bp.workDone ?? 0) / (bp.workRequired ?? 50)) * 100)}
      <div class="bldg-row">
        <span class="bldg-name">{bDef?.name.toUpperCase() ?? bp.type}</span>
        <span class="progress-mini">
          <span class="prog-bar-ascii"
            >{'█'.repeat(Math.round(prog / 10)) + '░'.repeat(10 - Math.round(prog / 10))}</span
          >
          {prog}%
        </span>
        <button class="act-btn-sm" on:click={() => cancelBuilding(bp.id)}>CANCEL</button>
      </div>
    {/each}
  {:else}
    <div class="row muted-row">no active construction</div>
  {/if}

  <!-- Campfire status -->
  {#each buildings.filter((b) => b.type === 'campfire' && b.status === 'complete') as cf (cf.id)}
    {@const fuelPct = Math.round(((cf.fuel ?? 0) / 60) * 100)}
    <div class="bldg-row">
      <span class="bldg-name" style="color:{cf.lit ? '#fa0' : '#555'}"
        >{cf.lit ? '🔥' : '⬛'} CAMPFIRE</span
      >
      <span class="fuel-bar">
        FUEL <span class="bar-ascii"
          >{'█'.repeat(Math.round(fuelPct / 10)) + '░'.repeat(10 - Math.round(fuelPct / 10))}</span
        >
        {Math.floor(cf.fuel ?? 0)}/60
      </span>
    </div>
  {/each}

  <!-- Building groups -->
  {#each sections as grp}
    {#if grp.defs.length > 0}
      <div class="section-hdr">| {grp.label}</div>
      <div class="card-grid">
        {#each grp.defs as building}
          {@const placed = getBuildingCount(building.id)}
          {@const affordable = canAfford(building)}
          {@const buildable = canBuild(building)}
          <BuildCard
            icon={getCategoryIcon(building.category)}
            name={building.name.toUpperCase()}
            badge={placed > 0 ? `×${placed}` : null}
            actionLabel={!affordable ? 'MISSING' : !buildable ? 'BLOCKED' : 'BUILD'}
            actionEnabled={buildable}
            variant={!affordable ? 'missing' : !buildable ? 'blocked' : 'ok'}
            onAction={() => uiState.activateBlueprint(building.id)}
          >
            {#if Object.keys(building.buildingCost).length === 0}
              <span class="muted-text">free</span>
            {:else}
              {#each Object.entries(building.buildingCost) as [id, n], ci}
                {@const have = getItemAmount(id)}
                {#if ci > 0}<span class="cost-sep">·</span>{/if}
                <span class="cost-item" class:neg-text={have < (n as number)}>
                  {id.replace(/_/g, ' ')} <span class="cost-qty">×{n}</span>
                  <span class="cost-have" class:neg-text={have < (n as number)}>({have})</span>
                </span>
              {/each}
            {/if}
          </BuildCard>
        {/each}
      </div>
    {/if}
  {/each}
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

  .section-hdr {
    padding: 5px 10px 3px;
    color: var(--accent-hi);
    font-size: 10px;
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--border);
    margin-top: 4px;
  }
  .section-hdr.sub {
    color: var(--accent);
    margin-top: 2px;
  }

  .bldg-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
    flex-wrap: wrap;
  }
  .bldg-row:hover {
    background: var(--bg-hover);
  }

  .bldg-name {
    flex: 0 0 160px;
    font-size: 11px;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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

  .cost-have {
    opacity: 0.6;
  }

  .muted-text {
    color: var(--text-dim);
  }

  .neg-text {
    color: var(--neg);
  }

  .act-btn-sm {
    flex: 0 0 auto;
    background: none;
    border: 1px solid var(--border);
    color: var(--accent);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    padding: 2px 6px;
    cursor: pointer;
    white-space: nowrap;
  }
  .act-btn-sm:hover:not(:disabled) {
    border-color: var(--accent-hi);
    color: var(--accent-hi);
    background: var(--bg-active);
  }
  .act-btn-sm:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .progress-mini {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--text-dim);
  }

  .prog-bar-ascii,
  .bar-ascii {
    color: var(--accent);
    font-size: 9px;
    letter-spacing: -1px;
  }

  .fuel-bar {
    flex: 1;
    display: flex;
    gap: 4px;
    align-items: center;
    font-size: 10px;
    color: var(--text-dim);
  }

  .muted-row {
    padding: 4px 10px;
    font-size: 10px;
    color: var(--text-dim);
  }
</style>
