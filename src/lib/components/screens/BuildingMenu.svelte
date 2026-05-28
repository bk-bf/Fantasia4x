<script lang="ts">
  import { gameState, currentItem, currentRace, currentTurn } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { itemService } from '$lib/game/services/ItemService';
  import { buildingService } from '$lib/game/services/BuildingService';
  import { onDestroy } from 'svelte';
  import CurrentTask from '../UI/CurrentTask.svelte';
  import ZonePanel from '../UI/ZonePanel.svelte';
  import type { PlacedBuilding } from '$lib/game/core/types';
  import type { Building } from '$lib/game/core/types';

  let itemsMap: Record<string, number> = {};
  let race: any = null;
  let buildings: PlacedBuilding[] = [];
  let maxPopulation = 0;
  let currentTurnValue = 0;
  let completedResearch: string[] = [];
  let currentToolLevel = 0;

  // Building category groups defined below (no per-screen filter needed)
  const WALL_IDS = ['twig_wall', 'wicker_wall', 'daub_wall', 'mud_brick_wall', 'twig_door'];
  const WORKSHOP_IDS = [
    'campfire',
    'craft_spot',
    'makers_bench',
    'craftsmens_workshop',
    'tannery',
    'advanced_kiln',
    'smelting_furnace'
  ];
  const FURNITURE_IDS = ['sleeping_mat', 'storage_rack', 'carved_bench'];
  const KNOWLEDGE_IDS = ['scroll_hut', 'study_hall', 'scholars_workshop'];

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
    'furniture'
  ].flatMap((cat) => buildingService.getBuildingsByCategory(cat));

  $: firstBuildingInProgress = buildings.find((b) => b.status !== 'complete') ?? null;
  $: allBuildingsInProgress = buildings.filter((b) => b.status !== 'complete');

  // Only show unlocked buildings — locked buildings are hidden entirely
  $: unlockedDefs = ALL_BUILDING_DEFS.filter(
    (b) => !b.researchRequired || completedResearch.includes(b.researchRequired as string)
  );

  // Grouped unlocked buildings (no SHELTER — removed; no LOCKED section)
  $: workshopDefs = unlockedDefs.filter((b) => WORKSHOP_IDS.includes(b.id));
  $: furnitureDefs = unlockedDefs.filter(
    (b) => FURNITURE_IDS.includes(b.id) || b.category === 'furniture'
  );
  $: wallDefs = unlockedDefs.filter((b) => WALL_IDS.includes(b.id));
  $: knowledgeDefs = unlockedDefs.filter(
    (b) => KNOWLEDGE_IDS.includes(b.id) || b.category === 'knowledge'
  );
  $: foodDefs = unlockedDefs.filter((b) => b.category === 'food' && !WORKSHOP_IDS.includes(b.id));
  $: otherDefs = unlockedDefs.filter(
    (b) =>
      !WORKSHOP_IDS.includes(b.id) &&
      !FURNITURE_IDS.includes(b.id) &&
      !WALL_IDS.includes(b.id) &&
      !KNOWLEDGE_IDS.includes(b.id) &&
      b.category !== 'food' &&
      b.category !== 'housing' &&
      b.category !== 'furniture'
  );

  // Legacy compat
  $: availableBuildings = unlockedDefs;

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
      jobs: [],
      turn: currentTurnValue,
      race: race,
      buildingQueue: [],
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
      pawnAbilities: {},
      stockpileZones: []
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

    gameState.updateWithSave((state) => {
      // Deduct materials
      const newItems = state.item.map((item) => {
        const cost = building.buildingCost[item.id] || 0;
        return { ...item, amount: Math.max(0, item.amount - cost) };
      });
      // Place building at (0,0) — abstract/off-map; JobService generates a construct job
      return buildingService.placeBuilding(building.id, 0, 0, { ...state, item: newItems });
    });
  }

  function cancelBuilding(buildingId: string) {
    const placed = buildings.find((b) => b.id === buildingId);
    if (!placed) return;
    const buildingDef = buildingService.getBuildingById(placed.type);
    if (!buildingDef) return;

    gameState.updateWithSave((state) => {
      // Refund materials for cancelled build
      const refundedItems = state.item.map((item) => {
        const refund = buildingDef.buildingCost[item.id] || 0;
        return { ...item, amount: item.amount + refund };
      });
      return {
        ...state,
        item: refundedItems,
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

  <!-- Status bar -->
  <div class="status-row">
    <span class="stat-lbl">POP</span><span class="stat-val"
      >{race?.population || 0}/{maxPopulation}</span
    >
    <span class="stat-sep">|</span>
    <span class="stat-lbl">TOOL TIER</span><span class="stat-val">{currentToolLevel}</span>
    {#if race?.population >= maxPopulation}
      <span class="warn-inline">AT CAPACITY</span>
    {/if}
  </div>

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
  {#each buildings.filter((b) => b.type === 'campfire' && b.status === 'complete') as cf}
    {@const fuelPct = Math.round(((cf.fuel ?? 0) / 60) * 100)}
    <div class="bldg-row">
      <span class="bldg-name" style="color:{cf.lit ? '#fa0' : '#555'}"
        >{cf.lit ? '🔥' : '⬛'} CAMPFIRE</span
      >
      <span class="fuel-bar">
        FUEL <span class="bar-ascii"
          >{'█'.repeat(Math.round(fuelPct / 10)) + '░'.repeat(10 - Math.round(fuelPct / 10))}</span
        >
        {cf.fuel ?? 0}/60
      </span>
    </div>
  {/each}

  <!-- Building groups -->
  {#each [{ label: 'WORKSHOPS', defs: workshopDefs }, { label: 'PRIMITIVE FURNITURE', defs: furnitureDefs }, { label: 'FORTIFICATIONS', defs: wallDefs }, { label: 'KNOWLEDGE', defs: knowledgeDefs }, { label: 'FOOD & FORAGING', defs: foodDefs }, { label: 'OTHER', defs: otherDefs }] as grp}
    {#if grp.defs.length > 0}
      <div class="section-hdr">| {grp.label}</div>
      {#each grp.defs as building}
        {@const placed = getBuildingCount(building.id)}
        {@const affordable = canAfford(building)}
        {@const buildable = canBuild(building)}
        <div class="bldg-row">
          <span class="bldg-name">
            {building.name.toUpperCase()}
            {#if placed > 0}<span class="built-badge">[x{placed}]</span>{/if}
          </span>
          <span class="bldg-cost">
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
          </span>
          <button
            class="act-btn-sm"
            class:active={buildable}
            on:click={() => startBuilding(building)}
            disabled={!buildable}
          >
            {#if !affordable}MISSING
            {:else if !buildable}BLOCKED
            {:else}BUILD{/if}
          </button>
        </div>
      {/each}
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

  .status-row {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 4px 10px;
    background: var(--bg-panel);
    font-size: 10px;
    border-bottom: 1px solid var(--border);
  }

  .stat-lbl {
    color: var(--text-dim);
  }
  .stat-val {
    color: var(--accent-hi);
    margin-right: 4px;
  }
  .stat-sep {
    color: var(--border);
  }
  .warn-inline {
    color: var(--neg);
    margin-left: 8px;
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

  .built-badge {
    color: var(--pos);
    font-size: 10px;
    margin-left: 4px;
  }

  .bldg-cost {
    flex: 1;
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    align-items: center;
    font-size: 10px;
    color: var(--text-dim);
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

  .lock-req {
    flex: 1;
    font-size: 10px;
    color: var(--warn);
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
  .act-btn-sm.active,
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
