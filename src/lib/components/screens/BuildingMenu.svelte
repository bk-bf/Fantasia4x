<script lang="ts">
  import { gameState, currentItem, currentRace, currentTurn } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { itemService } from '$lib/game/services/ItemService';
  import { buildingService } from '$lib/game/services/BuildingService';
  import { onDestroy } from 'svelte';
  import CurrentTask from '../UI/CurrentTask.svelte';
  import type { BuildingInProgress, PlacedBuilding } from '$lib/game/core/types';
  import type { Building } from '$lib/game/core/types';

  let itemsMap: Record<string, number> = {};
  let race: any = null;
  let buildings: PlacedBuilding[] = [];
  let buildingQueue: BuildingInProgress[] = [];
  let maxPopulation = 0;
  let currentTurnValue = 0;
  let completedResearch: string[] = [];
  let currentToolLevel = 0;

  // Building category filter
  let selectedCategory = 'all';
  let buildingCategories = [
    'all',
    'housing',
    'production',
    'knowledge',
    'military',
    'food',
    'commerce',
    'magical',
    'exploration',
    'social'
  ];

  // The first building in progress, or a default object if none
  $: firstBuildingInProgress = buildingQueue.length > 0 ? buildingQueue[0] : null;

  // Enhanced building filtering with category and requirements
  $: availableBuildings = (
    selectedCategory === 'all'
      ? buildingService
          .getBuildingsByCategory('housing')
          .concat(buildingService.getBuildingsByCategory('production'))
          .concat(buildingService.getBuildingsByCategory('knowledge'))
          .concat(buildingService.getBuildingsByCategory('military'))
          .concat(buildingService.getBuildingsByCategory('food'))
          .concat(buildingService.getBuildingsByCategory('commerce'))
          .concat(buildingService.getBuildingsByCategory('magical'))
          .concat(buildingService.getBuildingsByCategory('exploration'))
          .concat(buildingService.getBuildingsByCategory('social'))
      : buildingService.getBuildingsByCategory(selectedCategory)
  ).filter((building) => {
    // Research requirements
    if (building.researchRequired && !completedResearch.includes(building.researchRequired))
      return false;

    return true;
  });

  $: getItemAmount = (itemId: string): number => {
    return itemsMap[itemId] || 0;
  };

  $: getBuildingCount = (buildingId: string): number => {
    return buildings.filter((b) => b.type === buildingId && b.status === 'complete').length;
  };

  // Enhanced affordability check using new interface
  $: canAfford = (building: Building): boolean => {
    if (!building.buildingCost) return false;
    return Object.entries(building.buildingCost).every(([itemId, cost]) => {
      const available = itemsMap[itemId] || 0;
      return available >= Number(cost);
    });
  };

  // Enhanced build check with new requirements
  $: canBuild = (building: Building): boolean => {
    if (!race) return false;

    const gameStateForCheck = {
      pawns: Array(race.population).fill({}),
      maxPopulation,
      currentToolLevel,
      completedResearch,
      item: Object.entries(itemsMap)
        .map(([id, amount]) => {
          const itemObj = itemService.getItemById(id);
          if (!itemObj) return null;
          return { ...itemObj, amount };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
      buildingCounts: {},
      buildings,
      stockpile: {},
      designations: {},
      turn: currentTurnValue,
      race: race,
      buildingQueue: buildingQueue,
      // Required properties with default values
      worldMap: [],
      discoveredLocations: [],
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
      activeExplorationMissions: [],
      workAssignments: {},
      productionTargets: [],
      currentJobIndex: {},
      pawnAbilities: {}
    };

    return buildingService.canBuildBuilding(building.id, gameStateForCheck) && canAfford(building);
  };

  // Subscribe to turn changes to force reactivity
  const unsubscribeTurn = currentTurn.subscribe((turn) => {
    currentTurnValue = turn;
  });

  const unsubscribeItems = currentItem.subscribe((item) => {
    itemsMap = {};
    item.forEach((item) => {
      itemsMap[item.id] = Math.floor(item.amount);
    });
  });

  const unsubscribeRace = currentRace.subscribe((value) => {
    race = value;
  });

  const unsubscribeGame = gameState.subscribe((state) => {
    buildings = state.buildings || [];
    buildingQueue = state.buildingQueue || [];
    maxPopulation = state.maxPopulation;
    completedResearch = state.completedResearch || [];
    currentToolLevel = state.currentToolLevel || 0;
  });

  onDestroy(() => {
    unsubscribeItems();
    unsubscribeRace();
    unsubscribeGame();
    unsubscribeTurn();
  });

  function startBuilding(building: Building) {
    if (!canBuild(building)) {
      console.log('Cannot build:', building.name);
      return;
    }

    gameState.update((state) => {
      // Deduct items using new buildingCost property
      const newItems = state.item.map((item) => {
        const cost = building.buildingCost[item.id] || 0;
        const newAmount = Math.max(0, item.amount - cost);
        return { ...item, amount: newAmount };
      });

      // Add to building queue
      const newBuildingInProgress = {
        building,
        turnsRemaining: building.buildTime,
        startedAt: state.turn
      };

      return {
        ...state,
        item: newItems,
        buildingQueue: [...(state.buildingQueue || []), newBuildingInProgress]
      };
    });
  }

  function cancelBuilding(queueIndex: number) {
    if (queueIndex < 0 || queueIndex >= buildingQueue.length) return;

    const canceledItem = buildingQueue[queueIndex];
    const building = canceledItem.building;

    gameState.update((state) => {
      // Calculate refund using buildingCost
      const refundedItems = state.item.map((item) => {
        const refund = building.buildingCost[item.id] || 0;
        return { ...item, amount: item.amount + refund };
      });

      // Remove from queue
      const newQueue = [...(state.buildingQueue || [])];
      newQueue.splice(queueIndex, 1);

      return {
        ...state,
        item: refundedItems,
        buildingQueue: newQueue
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

  <!-- Category filter -->
  <div class="filter-bar">
    {#each buildingCategories as category}
      <button
        class="filter-btn"
        class:active={selectedCategory === category}
        on:click={() => (selectedCategory = category)}
      >
        {category === 'all' ? 'ALL' : category.toUpperCase()}
      </button>
    {/each}
  </div>

  <!-- Status -->
  <div class="section-hdr sub">| STATUS</div>
  <div class="row">
    <span class="lbl">POPULATION</span><span class="val"
      >{race?.population || 0} / {maxPopulation}</span
    >
  </div>
  <div class="row">
    <span class="lbl">TOOL LEVEL</span><span class="val">{currentToolLevel}</span>
  </div>
  {#if race?.population >= maxPopulation}
    <div class="row"><span class="warn">AT CAPACITY — build housing to expand</span></div>
  {/if}

  <!-- Construction Queue -->
  <div class="section-hdr sub">| ACTIVE CONSTRUCTION</div>
  {#if firstBuildingInProgress}
    <div class="row">
      <span class="lbl">PROJECT</span><span class="val"
        >{firstBuildingInProgress.building.name.toUpperCase()}</span
      >
    </div>
    <div class="row">
      <span class="lbl">CATEGORY</span><span class="val"
        >{firstBuildingInProgress.building.category}</span
      >
    </div>
    {@const prog = Math.round(
      ((firstBuildingInProgress.building.buildTime - firstBuildingInProgress.turnsRemaining) /
        firstBuildingInProgress.building.buildTime) *
        100
    )}
    <div class="need-row">
      <span class="lbl">PROGRESS</span>
      <div class="bar">
        <div class="fill" style="width: {prog}%; background: var(--accent-hi)"></div>
      </div>
      <span class="val">{prog}%</span>
      <span class="desc">{firstBuildingInProgress.turnsRemaining} turns left</span>
    </div>
    <div class="btn-row">
      <button class="act-btn" on:click={() => cancelBuilding(0)}>CANCEL CONSTRUCTION</button>
    </div>
  {:else}
    <div class="row"><span class="muted">no active construction</span></div>
  {/if}

  <!-- Available Buildings -->
  <div class="section-hdr">| AVAILABLE ({availableBuildings.length})</div>
  {#each availableBuildings as building}
    <div class="building-item">
      <div class="building-name">
        {building.name.toUpperCase()}
        <span class="bmeta">{building.category} T{building.tier}</span>
        {#if getBuildingCount(building.id) > 0}
          <span class="bcount">[x{getBuildingCount(building.id)}]</span>
        {/if}
      </div>
      <div class="desc-row">{building.description}</div>
      <div class="row">
        <span class="lbl">BUILD TIME</span><span class="val">{building.buildTime} turns</span>
      </div>

      {#each getBuildingRequirements(building) as req}
        <div class="row"><span class="lbl">REQUIRE</span><span class="val dim">{req}</span></div>
      {/each}

      {#each Object.entries(building.buildingCost) as [itemId, cost]}
        {@const item = itemService.getItemById(itemId)}
        {@const have = getItemAmount(itemId)}
        <div class="row" class:insufficient={have < (cost as number)}>
          <span class="lbl">COST</span>
          <span class="val" class:neg={have < (cost as number)}>
            {item?.name || itemId}: {cost} (have {have})
          </span>
        </div>
      {/each}

      {#each getUpkeepInfo(building) as upkeep}
        <div class="row"><span class="lbl">UPKEEP</span><span class="val warn">{upkeep}</span></div>
      {/each}

      {#each Object.entries(building.effects) as [effect, value]}
        <div class="row">
          <span class="lbl">EFFECT</span>
          <span class="val pos">
            {#if effect === 'populationCapacity'}+{value} pop cap
            {:else if effect.includes('Production')}+{value}
              {formatEffectName(effect.replace('Production', ''))}/turn
            {:else if effect.includes('Multiplier')}+{Math.round(((value as number) - 1) * 100)}% {formatEffectName(
                effect.replace('Multiplier', '')
              )}
            {:else if effect.includes('Bonus')}+{Math.round(((value as number) - 1) * 100)}% {formatEffectName(
                effect.replace('Bonus', '')
              )} bonus
            {:else}+{value} {formatEffectName(effect)}
            {/if}
          </span>
        </div>
      {/each}

      {#if building.storageCapacity && Object.keys(building.storageCapacity).length > 0}
        {#each Object.entries(building.storageCapacity) as [cat, cap]}
          <div class="row">
            <span class="lbl">STORAGE</span><span class="val">{cat}: {cap}</span>
          </div>
        {/each}
      {/if}

      {#each getBuildingSpecialProperties(building) as prop}
        <div class="row"><span class="lbl">SPECIAL</span><span class="val dim">{prop}</span></div>
      {/each}

      <div class="btn-row">
        <button
          class="act-btn"
          class:active={canBuild(building)}
          on:click={() => startBuilding(building)}
          disabled={!canBuild(building)}
        >
          {#if !canAfford(building)}INSUFFICIENT MATERIALS
          {:else if !canBuild(building)}REQUIREMENTS NOT MET
          {:else}BEGIN CONSTRUCTION
          {/if}
        </button>
      </div>
    </div>
  {/each}

  {#if availableBuildings.length === 0}
    <div class="row"><span class="muted">no buildings available</span></div>
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

  .screen-hdr {
    padding: 5px 10px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--border-hi);
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .hdr-btn {
    margin-left: auto;
    padding: 2px 8px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    cursor: pointer;
    letter-spacing: 0.04em;
  }
  .hdr-btn:hover {
    color: var(--text);
    border-color: var(--border-hi);
  }

  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    margin-top: 1px;
    flex-shrink: 0;
  }
  .section-hdr.sub {
    background: var(--bg);
    color: var(--text-dim);
  }

  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 4px 8px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .filter-btn {
    padding: 2px 8px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    cursor: pointer;
    letter-spacing: 0.04em;
  }
  .filter-btn.active {
    background: var(--tab-active);
    color: #fff;
    border-color: var(--tab-active);
  }
  .filter-btn:hover:not(.active) {
    color: var(--text);
    border-color: var(--border-hi);
  }

  .row {
    display: flex;
    padding: 2px 8px;
    align-items: baseline;
    gap: 6px;
  }
  .row:hover {
    background: var(--bg-hover);
  }
  .row.insufficient {
    background: rgba(200, 48, 24, 0.05);
  }

  .need-row {
    display: flex;
    align-items: center;
    padding: 3px 8px;
    gap: 8px;
  }

  .lbl {
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 11px;
    width: 70px;
    flex-shrink: 0;
  }

  .val {
    color: var(--text);
    font-size: 11px;
    margin-left: auto;
    text-align: right;
  }
  .val.pos {
    color: var(--pos);
  }
  .val.neg {
    color: var(--neg);
  }
  .val.dim {
    color: var(--text-muted);
  }
  .val.warn {
    color: var(--accent);
  }

  .desc {
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
    flex: 1;
  }
  .bar {
    flex: 1;
    height: 4px;
    background: var(--bg-active);
  }
  .fill {
    height: 100%;
  }
  .muted {
    color: var(--text-muted);
    font-style: italic;
    font-size: 11px;
    padding: 4px 8px;
  }
  .warn {
    color: var(--accent);
  }
  .pos {
    color: var(--pos);
  }
  .neg {
    color: var(--neg);
  }

  /* Building items */
  .building-item {
    border-bottom: 1px solid var(--border);
    padding-bottom: 2px;
    margin-bottom: 1px;
  }

  .building-name {
    padding: 4px 8px;
    color: var(--text);
    font-size: 11px;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
    background: var(--bg-panel);
    display: flex;
    gap: 8px;
    align-items: baseline;
  }

  .bmeta {
    color: var(--text-muted);
    font-size: 10px;
    margin-left: auto;
  }

  .bcount {
    color: var(--pos);
    font-size: 10px;
  }

  .desc-row {
    padding: 2px 8px 3px 16px;
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
    border-bottom: 1px solid var(--border);
  }

  .btn-row {
    display: flex;
    gap: 4px;
    padding: 4px 8px;
  }

  .act-btn {
    padding: 3px 10px;
    background: var(--bg-hover);
    border: 1px solid var(--border-hi);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    cursor: pointer;
    letter-spacing: 0.04em;
  }
  .act-btn.active {
    background: var(--tab-active);
    color: #fff;
    border-color: var(--tab-active);
  }
  .act-btn:hover:not(:disabled) {
    color: var(--accent-hi);
    background: var(--bg-active);
  }
  .act-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
