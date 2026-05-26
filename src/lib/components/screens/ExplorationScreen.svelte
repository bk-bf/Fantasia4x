<script lang="ts">
  import { gameState, currentItem, currentRace } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { onDestroy } from 'svelte';
  import CurrentTask from '$lib/components/UI/CurrentTask.svelte';
  import TaskContainer from '$lib/components/UI/TaskContainer.svelte';
  import { locationService } from '$lib/game/services/LocationServices';
  import { LOCATION_TEMPLATES } from '$lib/game/core/Locations';
  import { itemService } from '$lib/game/services/ItemService';

  let race: any = null;
  let itemMap: Record<string, number> = {};
  let inventory: Record<string, number> = {};
  let discoveredLocations: any[] = [];
  let activeExplorationMissions: any[] = [];
  let completedResearch: string[] = [];
  let availableBuildings: string[] = [];

  // Available exploration missions
  let availableExplorationMissions: any[] = [];

  // Item fetching methods
  $: getItemAmount = (itemId: string): number => {
    return itemMap[itemId] || 0;
  };

  $: getInventoryAmount = (itemId: string): number => {
    return inventory[itemId] || 0;
  };

  const unsubscribeRace = currentRace.subscribe((value) => {
    race = value;
  });

  const unsubscribeItem = currentItem.subscribe((item) => {
    itemMap = {};
    item.forEach((item) => {
      itemMap[item.id] = Math.floor(item.amount);
    });
  });

  const unsubscribeGame = gameState.subscribe((state) => {
    discoveredLocations = locationService.getDiscoveredLocations();
    activeExplorationMissions = state.activeExplorationMissions || [];
    completedResearch = state.completedResearch || [];

    // Get available buildings from buildings[]
    availableBuildings = (state.buildings ?? [])
      .filter((b) => b.status === 'complete')
      .map((b) => b.type);

    // Generate available exploration missions
    availableExplorationMissions = generateAvailableExplorations(state);
  });

  onDestroy(() => {
    unsubscribeRace();
    unsubscribeItem();
    unsubscribeGame();
  });

  // Get resource richness for discovered locations
  function getLocationResourceRichness(
    location: any
  ): Record<string, { richness: string; availability: any }> {
    const resourceRichness: Record<string, { richness: string; availability: any }> = {};

    if (location.resourceNodes) {
      // For discovered locations with actual resource nodes
      Object.entries(location.resourceNodes).forEach(([resourceId, node]: [string, any]) => {
        const availability = locationService.getResourceAvailability(location.id, resourceId);

        // Calculate richness based on current vs max amounts
        const currentRange: [number, number] = [node.currentAmount, node.currentAmount];
        const maxRange: [number, number] = [node.maxAmount, node.maxAmount];

        const richness = locationService.evaluateResourceRichness(currentRange, maxRange);

        resourceRichness[resourceId] = { richness, availability };
      });
    } else {
      // For locations without resource nodes, use template data
      const template = LOCATION_TEMPLATES.find((t: any) => t.id === location.id);
      if (template?.resourceTemplates) {
        Object.entries(template.resourceTemplates).forEach(
          ([resourceId, template]: [string, any]) => {
            const richness = locationService.evaluateResourceRichness(
              template.currentAmountRange,
              template.maxAmountRange
            );

            resourceRichness[resourceId] = {
              richness,
              availability: {
                available: 'Unknown',
                maxAmount: 'Unknown',
                renewalRate: template.renewalRate,
                isRenewable: template.renewalType !== 'none'
              }
            };
          }
        );
      }
    }

    return resourceRichness;
  }

  function generateAvailableExplorations(state: any): any[] {
    // This would be populated from your exploration missions database
    const allMissions = [
      {
        id: 'nearby_hills_explore',
        name: 'Explore Nearby Hills',
        description: 'Send explorers to investigate the rocky hills visible from your settlement',
        targetLocation: 'nearby_hills',

        explorersRequired: 2,
        toolsRequired: ['stone_tools'],
        suppliesRequired: { food: 5, water: 3 },

        duration: 3,
        successChance: 85,
        riskLevel: 'low',

        requirements: {
          population: 3,
          discoveredLocations: ['plains']
        }
      },
      {
        id: 'old_forest_explore',
        name: 'Explore Ancient Forest',
        description: 'Mount an expedition into the mysterious ancient forest',
        targetLocation: 'old_forest',

        explorersRequired: 4,
        toolsRequired: ['bronze_axe', 'bronze_weapons'],
        suppliesRequired: { food: 15, rope: 5, torches: 10 },

        duration: 7,
        successChance: 65,
        riskLevel: 'medium',

        requirements: {
          population: 8,
          research: ['advanced_forestry'],
          discoveredLocations: ['nearby_hills']
        }
      },
      {
        id: 'mountain_foothills_explore',
        name: 'Explore Mountain Foothills',
        description: 'Venture into the mineral-rich mountain foothills',
        targetLocation: 'mountain_foothills',

        explorersRequired: 5,
        toolsRequired: ['copper_pick', 'bronze_tools'],
        suppliesRequired: { food: 20, rope: 8, climbing_gear: 2 },

        duration: 10,
        successChance: 55,
        riskLevel: 'high',

        requirements: {
          population: 12,
          research: ['basic_metallurgy'],
          buildings: ['smelting_furnace']
        }
      },
      {
        id: 'underground_caverns_explore',
        name: 'Explore Underground Caverns',
        description: 'Brave expedition into the mysterious underground cave system',
        targetLocation: 'underground_caverns',

        explorersRequired: 8,
        toolsRequired: ['iron_tools', 'torches', 'rope'],
        suppliesRequired: { food: 30, rope: 15, torches: 25, climbing_gear: 5 },

        duration: 15,
        successChance: 35,
        riskLevel: 'extreme',

        requirements: {
          population: 20,
          research: ['iron_working', 'underground_exploration'],
          buildings: ['cave_entrance_fortification']
        }
      }
    ];

    // Filter missions based on current game state
    return allMissions.filter((mission) => {
      // Check if target location is already discovered
      const targetLocation = locationService.getLocationById(mission.targetLocation);
      if (targetLocation?.discovered) return false;

      // Check population requirement
      if (mission.requirements.population && race?.population < mission.requirements.population) {
        return false;
      }

      // Check research requirements
      if (mission.requirements.research) {
        const hasRequiredResearch = mission.requirements.research.every((research) =>
          completedResearch.includes(research)
        );
        if (!hasRequiredResearch) return false;
      }

      // Check building requirements
      if (mission.requirements.buildings) {
        const hasRequiredBuildings = mission.requirements.buildings.every((building) =>
          availableBuildings.includes(building)
        );
        if (!hasRequiredBuildings) return false;
      }

      // Check if prerequisite locations are discovered
      if (mission.requirements.discoveredLocations) {
        const hasPrerequisites = mission.requirements.discoveredLocations.every((locId) =>
          discoveredLocations.some((loc) => loc.id === locId)
        );
        if (!hasPrerequisites) return false;
      }

      return true;
    });
  }

  function canLaunchMission(mission: any): boolean {
    // Check population
    if (race?.population < mission.explorersRequired) return false;

    // Check tools
    if (mission.toolsRequired) {
      // This would check against available tools in inventory
      // For now, simplified check
      const hasTools = mission.toolsRequired.every(
        (tool: string) => getInventoryAmount(tool) > 0 || getItemAmount(tool) > 0
      );
      if (!hasTools) return false;
    }

    // Check supplies
    if (mission.suppliesRequired) {
      const hasSupplies = Object.entries(mission.suppliesRequired).every(
        ([item, amount]) => getItemAmount(item) + getInventoryAmount(item) >= (amount as number)
      );
      if (!hasSupplies) return false;
    }

    return true;
  }

  function launchExplorationMission(mission: any) {
    if (!canLaunchMission(mission)) {
      console.log('Cannot launch mission:', mission.name);
      return;
    }

    gameState.update((state) => {
      const newState = { ...state };

      // Deduct supplies
      if (mission.suppliesRequired) {
        newState.item = newState.item.map((item) => {
          const cost = mission.suppliesRequired[item.id] || 0;
          const newAmount = Math.max(0, item.amount - cost);
          return { ...item, amount: newAmount };
        });
      }

      // Add to active missions
      const newMission = {
        ...mission,
        startedAt: state.turn,
        turnsRemaining: mission.duration,
        progress: 0
      };

      newState.activeExplorationMissions = [...(state.activeExplorationMissions || []), newMission];

      return newState;
    });
  }

  function recallExplorers(missionIndex: number) {
    gameState.update((state) => {
      const newMissions = [...(state.activeExplorationMissions || [])];
      const canceledMission = newMissions[missionIndex];

      // Partial refund of supplies (50%)
      if (canceledMission.suppliesRequired) {
        state.item = state.item.map((item) => {
          const refund = Math.floor((canceledMission.suppliesRequired[item.id] || 0) * 0.5);
          return { ...item, amount: item.amount + refund };
        });
      }

      newMissions.splice(missionIndex, 1);

      return {
        ...state,
        activeExplorationMissions: newMissions
      };
    });
  }

  function getRiskColor(riskLevel: string): string {
    switch (riskLevel) {
      case 'low':
        return '#4CAF50';
      case 'medium':
        return '#FF9800';
      case 'high':
        return '#FF5722';
      case 'extreme':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  }

  function getLocationWorkModifiers(location: any): string[] {
    if (!location.workModifiers) return [];

    return Object.entries(location.workModifiers).map(
      ([work, modifier]) => `${work}: +${Math.round(((modifier as number) - 1) * 100)}%`
    );
  }

  function getLocationRarityColor(rarity: string): string {
    switch (rarity) {
      case 'common':
        return '#4CAF50';
      case 'uncommon':
        return '#2196F3';
      case 'rare':
        return '#9C27B0';
      case 'epic':
        return '#FF9800';
      case 'legendary':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  }

  function getRichnessColor(richness: string): string {
    return locationService.getRichnessColor(richness);
  }

  function getRichnessEmoji(richness: string): string {
    return locationService.getRichnessEmoji(richness);
  }
</script>

<div class="exploration-screen">
  <div class="screen-hdr">
    | EXPLORATION
    <button class="hdr-btn" on:click={() => uiState.setScreen('main')}>BACK</button>
  </div>

  <!-- Known Locations -->
  <div class="section-hdr sub">| KNOWN LOCATIONS ({discoveredLocations.length})</div>
  {#each discoveredLocations as location}
    {@const resourceRichness = getLocationResourceRichness(location)}
    <div class="loc-item">
      <div class="loc-name">
        {location.name.toUpperCase()}
        <span class="loc-meta">{location.type || 'location'} T{location.tier}</span>
        <span class="loc-rarity">{location.rarity}</span>
      </div>
      <div class="desc-row">{location.description}</div>

      {#each Object.entries(resourceRichness) as [resourceId, data]}
        {@const item = itemService.getItemById(resourceId)}
        <div class="res-row">
          <span class="lbl">RESOURCE</span>
          <span class="res-name">{item?.name || resourceId}</span>
          <span class="res-avail">
            {data.availability.available !== 'Unknown'
              ? Math.floor(data.availability.available as number)
              : '?'}
            / {data.availability.maxAmount !== 'Unknown' ? data.availability.maxAmount : '?'}
          </span>
          <span class="res-richness" style="color: {getRichnessColor(data.richness)}"
            >{data.richness}</span
          >
        </div>
      {/each}

      {#each getLocationWorkModifiers(location) as modifier}
        <div class="row"><span class="lbl">BONUS</span><span class="val pos">{modifier}</span></div>
      {/each}
    </div>
  {/each}

  <!-- Active Expeditions -->
  <div class="section-hdr sub">| ACTIVE EXPEDITIONS</div>
  {#if activeExplorationMissions.length > 0}
    {#each activeExplorationMissions as mission, index}
      <div class="mission-item">
        <div class="row">
          <span class="lbl">MISSION</span><span class="val">{mission.name.toUpperCase()}</span>
        </div>
        <div class="row">
          <span class="lbl">TARGET</span><span class="val"
            >{mission.targetLocation.replace(/_/g, ' ').toUpperCase()}</span
          >
        </div>
        <div class="need-row">
          <span class="lbl">PROGRESS</span>
          <div class="bar">
            <div
              class="fill"
              style="width: {Math.round(
                ((mission.duration - mission.turnsRemaining) / mission.duration) * 100
              )}%; background: var(--accent-hi)"
            ></div>
          </div>
          <span class="val"
            >{Math.round(
              ((mission.duration - mission.turnsRemaining) / mission.duration) * 100
            )}%</span
          >
          <span class="desc">{mission.turnsRemaining} turns left</span>
        </div>
        <div class="btn-row">
          <button class="act-btn" on:click={() => recallExplorers(index)}
            >RECALL (50% REFUND)</button
          >
        </div>
      </div>
    {/each}
  {:else}
    <div class="row"><span class="muted">no active expeditions</span></div>
  {/if}

  <!-- Available Exploration -->
  <div class="section-hdr">| OPPORTUNITIES ({availableExplorationMissions.length})</div>
  {#if availableExplorationMissions.length === 0}
    <div class="row"><span class="muted">no exploration opportunities available</span></div>
  {:else}
    {#each availableExplorationMissions as mission}
      <div class="mission-item">
        <div class="mission-name">
          {mission.name.toUpperCase()}
          <span class="risk-tag" style="color: {getRiskColor(mission.riskLevel)}"
            >{mission.riskLevel}</span
          >
        </div>
        <div class="desc-row">{mission.description}</div>
        <div class="row">
          <span class="lbl">EXPLORERS</span><span class="val">{mission.explorersRequired}</span>
        </div>
        <div class="row">
          <span class="lbl">DURATION</span><span class="val">{mission.duration} turns</span>
        </div>
        <div class="row">
          <span class="lbl">SUCCESS</span><span class="val">{mission.successChance}%</span>
        </div>
        <div class="row">
          <span class="lbl">TARGET</span><span class="val"
            >{mission.targetLocation
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (l: string) => l.toUpperCase())}</span
          >
        </div>

        {#if mission.toolsRequired && mission.toolsRequired.length > 0}
          {#each mission.toolsRequired as tool}
            {@const item = itemService.getItemById(tool)}
            <div class="row">
              <span class="lbl">TOOL</span><span class="val">{item?.name || tool}</span>
            </div>
          {/each}
        {/if}

        {#if mission.suppliesRequired}
          {#each Object.entries(mission.suppliesRequired) as [itemId, amount]}
            {@const item = itemService.getItemById(itemId)}
            {@const have = getItemAmount(itemId) + getInventoryAmount(itemId)}
            <div class="row" class:insufficient={have < (amount as number)}>
              <span class="lbl">SUPPLY</span>
              <span class="val" class:neg={have < (amount as number)}>
                {item?.name || itemId}: {amount} (have {have})
              </span>
            </div>
          {/each}
        {/if}

        <div class="btn-row">
          <button
            class="act-btn"
            class:active={canLaunchMission(mission)}
            on:click={() => launchExplorationMission(mission)}
            disabled={!canLaunchMission(mission)}
          >
            {#if race?.population < mission.explorersRequired}NEED MORE POPULATION
            {:else if !canLaunchMission(mission)}MISSING REQUIREMENTS
            {:else}LAUNCH EXPEDITION
            {/if}
          </button>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .exploration-screen {
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
  .pos {
    color: var(--pos);
  }
  .neg {
    color: var(--neg);
  }

  /* Location items */
  .loc-item {
    border-bottom: 1px solid var(--border);
    padding-bottom: 2px;
    margin-bottom: 1px;
  }

  .loc-name {
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
  .loc-meta {
    color: var(--text-muted);
    font-size: 10px;
  }
  .loc-rarity {
    color: var(--text-dim);
    font-size: 10px;
    margin-left: auto;
  }

  .desc-row {
    padding: 2px 8px 3px 16px;
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
    border-bottom: 1px solid var(--border);
  }

  .res-row {
    display: flex;
    padding: 2px 8px;
    align-items: baseline;
    gap: 6px;
    border-bottom: 1px solid var(--border);
  }
  .res-row:hover {
    background: var(--bg-hover);
  }
  .res-name {
    color: var(--text);
    font-size: 11px;
    flex: 1;
  }
  .res-avail {
    color: var(--text-dim);
    font-size: 11px;
  }
  .res-richness {
    font-size: 10px;
    text-align: right;
    width: 60px;
  }

  /* Mission items */
  .mission-item {
    border-bottom: 1px solid var(--border);
    padding-bottom: 2px;
    margin-bottom: 1px;
  }

  .mission-name {
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

  .risk-tag {
    font-size: 10px;
    margin-left: auto;
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
