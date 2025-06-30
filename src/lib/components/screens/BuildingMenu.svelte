<script lang="ts">
  import { gameState, currentItem, currentRace, currentTurn } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import {
    AVAILABLE_BUILDINGS,
    canAffordBuilding,
    canBuildWithPopulation
  } from '$lib/game/core/Buildings';
  import { getItemIcon, getItemColor } from '$lib/game/core/Items';
  import { onDestroy } from 'svelte';
  import CurrentTask from '../UI/CurrentTask.svelte';
  import type { BuildingInProgress } from '$lib/game/core/types';

  let itemsMap: Record<string, number> = {};
  let race: any = null;
  let buildingCounts: Record<string, number> = {};
  let buildingQueue: BuildingInProgress[] = [];
  let maxPopulation = 0;
  let currentTurnValue = 0;
  let completedResearch: string[] = []; // Add this

  // The first building in progress, or a default object if none
  $: firstBuildingInProgress = buildingQueue.length > 0 ? buildingQueue[0] : null;

  // Filter buildings based on completed research
  $: availableBuildings = AVAILABLE_BUILDINGS.filter((building) => {
    // Always show buildings with no research requirement
    if (!building.researchRequired) return true;

    // Only show if research is completed
    return completedResearch.includes(building.researchRequired);
  });

  $: getItemAmount = (itemId: string): number => {
    return itemsMap[itemId] || 0;
  };

  $: getItemsObject = (): Record<string, number> => {
    return { ...itemsMap };
  };

  $: getBuildingCount = (buildingId: string): number => {
    return buildingCounts[buildingId] || 0;
  };

  // Make these functions reactive so they update when items change
  $: canAfford = (building: any): boolean => {
    const canAffordResult = Object.entries(building.cost).every(([itemId, cost]) => {
      const available = itemsMap[itemId] || 0;
      return available >= Number(cost);
    });
    return canAffordResult;
  };

  $: canBuild = (building: any): boolean => {
    if (!race) return false;
    return canBuildWithPopulation(building, race.population, maxPopulation) && canAfford(building);
  };

  // Subscribe to turn changes to force reactivity
  const unsubscribeTurn = currentTurn.subscribe((turn) => {
    currentTurnValue = turn;
  });

  const unsubscribeitems = currentItem.subscribe((item) => {
    itemsMap = {};
    item.forEach((item) => {
      itemsMap[item.id] = Math.floor(item.amount);
    });
  });

  const unsubscribeRace = currentRace.subscribe((value) => {
    race = value;
  });

  const unsubscribeGame = gameState.subscribe((state) => {
    buildingCounts = state.buildingCounts || {};
    buildingQueue = state.buildingQueue || [];
    maxPopulation = state.maxPopulation;
    completedResearch = state.completedResearch || []; // Add this line
  });

  onDestroy(() => {
    unsubscribeitems();
    unsubscribeRace();
    unsubscribeGame();
    unsubscribeTurn();
  });

  function startBuilding(building: any) {
    if (!canBuild(building)) {
      console.log('Cannot build:', building.name);
      return;
    }

    gameState.update((state) => {
      // Deduct items more carefully
      const newitems = state.item.map((item) => {
        const cost = building.cost[item.id] || 0;
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
        items: newitems,
        buildingQueue: [...(state.buildingQueue || []), newBuildingInProgress]
      };
    });
  }

  function cancelBuilding(queueIndex: number) {
    if (queueIndex < 0 || queueIndex >= buildingQueue.length) return;

    const canceledItem = buildingQueue[queueIndex];
    const building = canceledItem.building;

    gameState.update((state) => {
      // Calculate refund (full refund since construction hasn't started yet)
      const refundeditems = state.item.map((item) => {
        const refund = building.cost[item.id] || 0;
        return { ...item, amount: item.amount + refund };
      });

      // Remove from queue
      const newQueue = [...(state.buildingQueue || [])];
      newQueue.splice(queueIndex, 1);

      return {
        ...state,
        items: refundeditems,
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
      case 'research':
        return '📚';
      case 'military':
        return '⚔️';
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
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .replace(/^./, (match) => match.toUpperCase()) // Capitalize first letter
      .trim(); // Remove any leading/trailing spaces
  }
</script>

<div class="building-menu">
  <div class="building-header">
    <button class="back-btn" on:click={() => uiState.setScreen('main')}>← Back to Map</button>
    <h2>🏗️ Construction Planning</h2>
    <p class="building-subtitle">Expand your civilization</p>
  </div>
  <div class="building-content">
    <!-- Population Status -->
    <div class="population-status">
      <h3>👥 Population Status</h3>
      <div class="pop-info">
        <span>Current: {race?.population || 0}</span>
        <span>Maximum: {maxPopulation}</span>
        <span class="pop-warning" class:visible={race?.population >= maxPopulation}>
          ⚠️ At capacity! Build housing to expand.
        </span>
      </div>
    </div>
    <!-- Building Queue (Current Construction Only, Single Card) -->
    {#if firstBuildingInProgress}
      <CurrentTask
        title="🏗️ Current Construction"
        icon={getCategoryIcon(firstBuildingInProgress.building.category)}
        name={firstBuildingInProgress.building.name}
        description={firstBuildingInProgress.building.description}
        progress={(firstBuildingInProgress.building.buildTime -
          firstBuildingInProgress.turnsRemaining) /
          firstBuildingInProgress.building.buildTime}
        timeRemaining="{firstBuildingInProgress.turnsRemaining} days remaining"
        onCancel={() => cancelBuilding(0)}
        cancelTitle="Cancel construction and refund items"
      />
    {:else}
      <div class="empty-queue">No buildings are currently under construction.</div>
    {/if}

    <!-- Available Buildings -->
    <div class="available-buildings">
      <h3>🏗️ Available Buildings</h3>
      <div class="buildings-grid">
        {#each availableBuildings as building}
          <div
            class="building-card"
            class:affordable={canAfford(building)}
            class:buildable={canBuild(building)}
          >
            <div class="building-card-header">
              <span class="building-icon">{getCategoryIcon(building.category)}</span>
              <h4>{building.name}</h4>
              {#if getBuildingCount(building.id) > 0}
                <div class="building-count">
                  {getBuildingCount(building.id)}
                </div>
              {/if}
            </div>

            <p class="building-description">{building.description}</p>

            <div class="building-requirements">
              <div class="build-time">⏳ {building.buildTime} days</div>
              {#if building.populationRequired > 0}
                <div class="pop-required">👥 Requires {building.populationRequired} population</div>
              {/if}
            </div>
            <div class="building-costs">
              <h5>Cost:</h5>
              <div class="cost-list">
                {#each Object.entries(building.cost) as [itemId, cost]}
                  <div class="cost-item" class:insufficient={getItemAmount(itemId) < cost}>
                    <span class="cost-icon">{getItemIcon(itemId)}</span>
                    <span class="cost-amount">{cost}</span>
                    <span class="cost-item">{itemId}</span>
                    <span class="cost-available">({getItemAmount(itemId)} available)</span>
                  </div>
                {/each}
              </div>
            </div>

            <div class="building-effects">
              <h5>Effects:</h5>
              <div class="effects-list">
                {#each Object.entries(building.effects) as [effect, value]}
                  <div class="effect-item">
                    {#if effect === 'maxPopulation'}
                      +{value} population capacity
                    {:else if effect.includes('Production')}
                      +{value} {formatEffectName(effect.replace('Production', ''))} per day
                    {:else if effect.includes('Multiplier')}
                      +{Math.round((value - 1) * 100)}% {formatEffectName(
                        effect.replace('Multiplier', '')
                      )}
                    {:else if effect.includes('Level')}
                      +{value} {formatEffectName(effect.replace('Level', ''))} level
                    {:else if effect.includes('Bonus')}
                      +{Math.round((value - 1) * 100)}% {formatEffectName(
                        effect.replace('Bonus', '')
                      )} bonus
                    {:else}
                      +{value} {formatEffectName(effect)}
                    {/if}
                  </div>
                {/each}
              </div>
            </div>

            <button
              class="build-btn"
              class:disabled={!canBuild(building)}
              on:click={() => startBuilding(building)}
              disabled={!canBuild(building)}
            >
              {#if !canAfford(building)}
                Insufficient items
              {:else if !canBuildWithPopulation(building, race?.population || 0, maxPopulation)}
                Population Requirements Not Met
              {:else}
                Begin Construction
              {/if}
            </button>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .building-menu {
    padding: 20px;
    background: #000000;
    color: #e0e0e0;
    font-family: 'Courier New', monospace;
    height: 100%;
    overflow-y: auto;
  }

  .building-header {
    text-align: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #4caf50;
    position: relative;
  }

  .back-btn {
    position: absolute;
    top: 0;
    right: 0;
    padding: 8px 16px;
    background: #000000;
    border: 1px solid #4caf50;
    color: #4caf50;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
  }

  .back-btn:hover {
    background: #4caf50;
    color: #000;
  }

  .building-header h2 {
    color: #4caf50;
    margin: 0 0 10px 0;
    font-size: 2em;
    text-shadow: 0 0 10px rgba(76, 175, 80, 0.3);
  }

  .building-subtitle {
    color: #888;
    margin: 0;
    font-style: italic;
  }

  .empty-queue {
    padding: 20px;
    text-align: center;
    color: #888;
    font-style: italic;
    background: #000000;
    border-radius: 4px;
    border: 2px dashed #555;
  }

  .building-content {
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  .population-status {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #4caf50;
  }

  .population-status h3 {
    color: #4caf50;
    margin: 0 0 15px 0;
  }

  .pop-info {
    display: flex;
    gap: 20px;
    align-items: center;
  }

  .pop-warning {
    color: #f44336;
    font-weight: bold;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .pop-warning.visible {
    opacity: 1;
  }

  .building-queue {
    background: #000000;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #ffa726;
  }

  .building-queue h3 {
    color: #ffa726;
    margin: 0 0 15px 0;
  }

  .queue-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .queue-progress-card {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #ffa726;
    margin-bottom: 0;
  }

  .progress-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    position: relative;
  }

  .progress-icon {
    font-size: 1.5em;
  }

  .progress-name {
    flex: 1;
    font-weight: bold;
    color: #ffa726;
  }

  .progress-time {
    color: #ffa726;
    font-size: 0.9em;
  }

  .progress-bar {
    height: 8px;
    background: #555;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 10px;
  }

  .progress-fill {
    height: 100%;
    background: #ffa726;
    transition: width 0.5s ease;
  }

  .progress-description {
    color: #888;
    font-style: italic;
    margin: 0;
  }

  .queue-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    background: #000000;
    border-radius: 4px;
  }

  .queue-progress {
    color: #ffa726;
    font-weight: bold;
  }

  .available-buildings h3 {
    color: #4caf50;
    margin: 0 0 20px 0;
  }

  .buildings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(375.5px, 0px));
    gap: 20px;
    justify-items: start; /* Align cards to the left */
  }

  .building-card {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #555;
    transition: all 0.3s ease;
    max-width: 375.5px; /* Set a fixed max width */
    /* Remove any margin: 0 auto; if present */
  }

  .building-card.affordable {
    border-left-color: #ffa726;
  }

  .building-card.buildable {
    border-left-color: #4caf50;
  }

  .building-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    position: relative;
  }

  .building-count {
    position: absolute;
    top: -5px;
    right: -5px;
    background: #4caf50;
    color: #000;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8em;
    font-weight: bold;
    border: 2px solid #000000;
  }

  .building-icon {
    font-size: 1.5em;
  }

  .building-card h4 {
    color: #4caf50;
    margin: 0;
    font-size: 1.2em;
  }

  .building-description {
    color: #888;
    font-style: italic;
    margin: 0 0 15px 0;
  }

  .building-requirements {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 15px;
    font-size: 0.9em;
    color: #888;
  }

  .building-costs h5,
  .building-effects h5 {
    color: #e0e0e0;
    margin: 0 0 8px 0;
    font-size: 1em;
  }

  .cost-list,
  .effects-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 15px;
  }

  .cost-item {
    display: flex;
    gap: 8px;
    font-size: 0.9em;
  }

  .cost-item.insufficient {
    color: #f44336;
  }

  .cost-amount {
    font-weight: bold;
  }

  .cost-available {
    color: #888;
    font-size: 0.8em;
  }

  .effect-item {
    color: #4caf50;
    font-size: 0.9em;
  }

  .build-btn {
    width: 100%;
    padding: 12px;
    background: #4caf50;
    border: none;
    color: #000;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-weight: bold;
    transition: all 0.3s ease;
  }

  .build-btn:hover:not(.disabled) {
    background: #66bb6a;
    transform: translateY(-1px);
  }

  .build-btn.disabled {
    background: #555;
    color: #888;
    cursor: not-allowed;
  }

  /* Scrollbar styling */
  .building-menu::-webkit-scrollbar {
    width: 8px;
  }

  .building-menu::-webkit-scrollbar-track {
    background: #000000;
  }

  .building-menu::-webkit-scrollbar-thumb {
    background: #4caf50;
    border-radius: 4px;
  }
</style>
