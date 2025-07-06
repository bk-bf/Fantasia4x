<script lang="ts">
  import { gameState, currentItem, currentRace } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { onDestroy } from 'svelte';
  import CurrentTask from '$lib/components/UI/CurrentTask.svelte';
  import TaskContainer from '$lib/components/UI/TaskContainer.svelte';
  import {
    getDiscoveredLocations,
    getLocationInfo,
    canExploreLocation,
    getLocationRarityColor
  } from '$lib/game/core/Locations';
  import { getItemIcon, getItemInfo } from '$lib/game/core/Items';

  let race: any = null;
  let itemMap: Record<string, number> = {};
  let inventory: Record<string, number> = {};
  let discoveredLocations: any[] = [];
  let activeExplorationMissions: any[] = [];
  let completedResearch: string[] = [];
  let availableBuildings: string[] = [];
  let buildingCounts: Record<string, number> = {};

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
    inventory = state.inventory || {};
    discoveredLocations = getDiscoveredLocations();
    activeExplorationMissions = state.activeExplorationMissions || [];
    completedResearch = state.completedResearch || [];
    buildingCounts = state.buildingCounts || {};

    // Get available buildings
    availableBuildings = Object.keys(buildingCounts).filter(
      (buildingId) => buildingCounts[buildingId] > 0
    );

    // Generate available exploration missions
    availableExplorationMissions = generateAvailableExplorations(state);
  });

  onDestroy(() => {
    unsubscribeRace();
    unsubscribeItem();
    unsubscribeGame();
  });

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
          discoveredLocations: ['starting_plains']
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
      const targetLocation = getLocationInfo(mission.targetLocation);
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

        // Also deduct from inventory
        Object.entries(mission.suppliesRequired).forEach(([itemId, amount]) => {
          const inventoryCost = Math.min(newState.inventory[itemId] || 0, amount as number);
          if (inventoryCost > 0) {
            newState.inventory[itemId] = (newState.inventory[itemId] || 0) - inventoryCost;
          }
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
</script>

<div class="exploration-screen">
  <div class="exploration-header">
    <button class="back-btn" on:click={() => uiState.setScreen('main')}>← Back to Map</button>
    <h2>🗺️ Exploration & Discovery</h2>
    <p class="exploration-subtitle">Discover new lands and unlock their resources</p>
  </div>

  <div class="exploration-content">
    <!-- Discovered Locations -->
    <div class="discovered-locations">
      <h3>🏞️ Known Locations ({discoveredLocations.length})</h3>
      <div class="locations-grid">
        {#each discoveredLocations as location}
          <div
            class="location-card discovered"
            style="--rarity-color: {getLocationRarityColor(location.rarity)}"
          >
            <div class="location-header">
              <span class="location-icon">{location.emoji}</span>
              <h4>{location.name}</h4>
              <div class="location-tier">Tier {location.tier}</div>
            </div>

            <p class="location-description">{location.description}</p>

            <div class="location-resources">
              <h5>Available Resources:</h5>
              <div class="resource-list">
                {#each [...location.availableResources.tier0, ...location.availableResources.tier1, ...location.availableResources.tier2] as resourceId}
                  {@const item = getItemInfo(resourceId)}
                  <span class="resource-item">
                    {item?.emoji || getItemIcon(resourceId)}
                    {item?.name || resourceId}
                  </span>
                {/each}
              </div>
            </div>

            {#if getLocationWorkModifiers(location).length > 0}
              <div class="work-modifiers">
                <h5>Work Bonuses:</h5>
                <div class="modifier-list">
                  {#each getLocationWorkModifiers(location) as modifier}
                    <span class="modifier-item">✨ {modifier}</span>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Active Exploration Missions -->
    {#if activeExplorationMissions.length > 0}
      <div class="active-missions">
        <h3>🏃 Expeditions in Progress</h3>
        <TaskContainer layout="horizontal">
          {#each activeExplorationMissions as mission, index}
            <CurrentTask
              title="🔍 Exploration Mission"
              icon="🗺️"
              name={mission.name}
              description="Exploring {mission.targetLocation}"
              progress={(mission.duration - mission.turnsRemaining) / mission.duration}
              timeRemaining="{mission.turnsRemaining} days remaining"
              onCancel={() => recallExplorers(index)}
              cancelTitle="Recall explorers (50% supply refund)"
              accentColor="#2196f3"
              compact={true}
            />
          {/each}
        </TaskContainer>
      </div>
    {:else}
      <div class="empty-missions">
        <p>No exploration missions in progress</p>
      </div>
    {/if}

    <!-- Available Exploration Opportunities -->
    <div class="available-explorations">
      <h3>🔍 Exploration Opportunities ({availableExplorationMissions.length})</h3>

      {#if availableExplorationMissions.length === 0}
        <div class="no-opportunities">
          <p>
            No new exploration opportunities available. Advance your civilization to unlock new
            areas to explore!
          </p>
        </div>
      {:else}
        <div class="missions-grid">
          {#each availableExplorationMissions as mission}
            <div class="mission-card" style="--risk-color: {getRiskColor(mission.riskLevel)}">
              <div class="mission-header">
                <span class="mission-icon">🗺️</span>
                <h4>{mission.name}</h4>
                <div class="risk-badge" style="background-color: {getRiskColor(mission.riskLevel)}">
                  {mission.riskLevel}
                </div>
              </div>

              <p class="mission-description">{mission.description}</p>

              <div class="mission-requirements">
                <div class="explorers-needed">👥 {mission.explorersRequired} explorers</div>
                <div class="mission-duration">⏰ {mission.duration} days</div>
                <div class="success-chance">✅ {mission.successChance}% success chance</div>

                {#if mission.toolsRequired && mission.toolsRequired.length > 0}
                  <div class="tools-required">
                    <h5>🔧 Tools Required:</h5>
                    {#each mission.toolsRequired as tool}
                      {@const item = getItemInfo(tool)}
                      <span class="requirement-item">
                        {item?.emoji || getItemIcon(tool)}
                        {item?.name || tool}
                      </span>
                    {/each}
                  </div>
                {/if}

                {#if mission.suppliesRequired}
                  <div class="supplies-required">
                    <h5>📦 Supplies Required:</h5>
                    {#each Object.entries(mission.suppliesRequired) as [itemId, amount]}
                      {@const item = getItemInfo(itemId)}
                      <div
                        class="requirement-item"
                        class:insufficient={getItemAmount(itemId) + getInventoryAmount(itemId) <
                          (amount as number)}
                      >
                        <span class="req-icon">{item?.emoji || getItemIcon(itemId)}</span>
                        <span class="req-amount">{amount}</span>
                        <span class="req-name">{item?.name || itemId}</span>
                        <span class="req-available"
                          >({getItemAmount(itemId) + getInventoryAmount(itemId)} available)</span
                        >
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

              <div class="mission-rewards">
                <h5>Potential Discovery:</h5>
                <div class="target-location">
                  🎯 {mission.targetLocation
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </div>
              </div>

              <button
                class="launch-mission-btn"
                class:disabled={!canLaunchMission(mission)}
                on:click={() => launchExplorationMission(mission)}
                disabled={!canLaunchMission(mission)}
              >
                {#if race?.population < mission.explorersRequired}
                  Need More Population
                {:else if !canLaunchMission(mission)}
                  Missing Requirements
                {:else}
                  Launch Expedition
                {/if}
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .exploration-screen {
    padding: 20px;
    background: #000000;
    color: #e0e0e0;
    font-family: 'Courier New', monospace;
    height: 100%;
    overflow-y: auto;
  }

  .exploration-header {
    text-align: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #2196f3;
    position: relative;
  }

  .back-btn {
    position: absolute;
    top: 0;
    right: 0;
    padding: 8px 16px;
    background: #000000;
    border: 1px solid #2196f3;
    color: #2196f3;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
  }

  .back-btn:hover {
    background: #2196f3;
    color: #000;
  }

  .exploration-header h2 {
    color: #2196f3;
    margin: 0 0 10px 0;
    font-size: 2em;
    text-shadow: 0 0 10px rgba(33, 150, 243, 0.3);
  }

  .exploration-subtitle {
    color: #888;
    margin: 0;
    font-style: italic;
  }

  .exploration-content {
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  .discovered-locations {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #4caf50;
  }

  .discovered-locations h3 {
    color: #4caf50;
    margin: 0 0 15px 0;
  }

  .locations-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 15px;
  }

  .location-card {
    background: #000000;
    border-radius: 8px;
    padding: 15px;
    border-left: 3px solid var(--rarity-color);
  }

  .location-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .location-icon {
    font-size: 1.5em;
  }

  .location-card h4 {
    color: var(--rarity-color);
    margin: 0;
    flex: 1;
  }

  .location-tier {
    background: var(--rarity-color);
    color: #000;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.8em;
    font-weight: bold;
  }

  .location-description {
    color: #888;
    font-style: italic;
    margin: 0 0 10px 0;
    font-size: 0.9em;
  }

  .location-resources h5,
  .work-modifiers h5 {
    color: #e0e0e0;
    margin: 15px 0 5px 0;
    font-size: 0.9em;
  }

  .resource-list,
  .modifier-list {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .resource-item,
  .modifier-item {
    background: #0c0c0c;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.8em;
    border: 1px solid #333;
  }

  .modifier-item {
    color: #4caf50;
  }

  .active-missions {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #ff9800;
  }

  .active-missions h3 {
    color: #ff9800;
    margin: 0 0 15px 0;
  }

  .empty-missions,
  .no-opportunities {
    padding: 20px;
    text-align: center;
    color: #888;
    font-style: italic;
    background: #000000;
    border-radius: 4px;
    border: 2px dashed #555;
  }

  .available-explorations h3 {
    color: #2196f3;
    margin: 0 0 20px 0;
  }

  .missions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(375px, 1fr));
    gap: 20px;
  }

  .mission-card {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid var(--risk-color);
    transition: all 0.3s ease;
  }

  .mission-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .mission-icon {
    font-size: 1.5em;
  }

  .mission-card h4 {
    color: #2196f3;
    margin: 0;
    flex: 1;
  }

  .risk-badge {
    color: #000;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.8em;
    font-weight: bold;
    text-transform: uppercase;
  }

  .mission-description {
    color: #888;
    font-style: italic;
    margin: 0 0 15px 0;
  }

  .mission-requirements {
    margin-bottom: 15px;
  }

  .explorers-needed,
  .mission-duration,
  .success-chance {
    color: #e0e0e0;
    font-size: 0.9em;
    margin-bottom: 5px;
  }

  .tools-required h5,
  .supplies-required h5 {
    color: #e0e0e0;
    margin: 10px 0 5px 0;
    font-size: 0.9em;
  }

  .requirement-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.8em;
    margin-bottom: 3px;
  }

  .requirement-item.insufficient {
    color: #f44336;
  }

  .req-amount {
    font-weight: bold;
  }

  .req-available {
    color: #888;
    margin-left: auto;
  }

  .mission-rewards h5 {
    color: #e0e0e0;
    margin: 10px 0 5px 0;
    font-size: 0.9em;
  }

  .target-location {
    color: #4caf50;
    font-weight: bold;
  }

  .launch-mission-btn {
    width: 100%;
    padding: 12px;
    background: #2196f3;
    border: none;
    color: #000;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-weight: bold;
    transition: all 0.3s ease;
    margin-top: 15px;
  }

  .launch-mission-btn:hover:not(.disabled) {
    background: #42a5f5;
    transform: translateY(-1px);
  }

  .launch-mission-btn.disabled {
    background: #555;
    color: #888;
    cursor: not-allowed;
  }

  /* Scrollbar styling */
  .exploration-screen::-webkit-scrollbar {
    width: 8px;
  }

  .exploration-screen::-webkit-scrollbar-track {
    background: #000000;
  }

  .exploration-screen::-webkit-scrollbar-thumb {
    background: #2196f3;
    border-radius: 4px;
  }
</style>
