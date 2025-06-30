<script lang="ts">
  import { gameState, currentResources, currentRace } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import {
    getAvailableResearch,
    canUnlockWithLore,
    RESEARCH_DATABASE
  } from '$lib/game/core/Research';
  import { onDestroy } from 'svelte';
  import CancelButton from '$lib/components/UI/CancelButton.svelte';
  import CurrentTask from '$lib/components/UI/CurrentTask.svelte';
  import { AVAILABLE_BUILDINGS } from '$lib/game/core/Buildings';
  import { getResourceIcon, getResourceColor } from '$lib/game/core/Resources'; // Add this import

  let race: any = null;
  let knowledge = 0;
  let knowledgeGeneration = 0;
  let availableResearch: any[] = [];
  let completedResearch: string[] = [];
  let currentResearch: any = null;
  let discoveredLore: any[] = [];
  let resourcesMap: Record<string, number> = {}; // Add this

  // Add the resource fetching methods from BuildingMenu
  $: getResourceAmount = (resourceId: string): number => {
    return resourcesMap[resourceId] || 0;
  };

  $: getResourcesObject = (): Record<string, number> => {
    return { ...resourcesMap };
  };

  const unsubscribeRace = currentRace.subscribe((value) => {
    race = value;
  });

  // Add the resources subscription from BuildingMenu
  const unsubscribeResources = currentResources.subscribe((resources) => {
    resourcesMap = {};
    resources.forEach((resource) => {
      resourcesMap[resource.id] = Math.floor(resource.amount);
    });
  });

  const unsubscribeGame = gameState.subscribe((state) => {
    knowledge = state.knowledge || 0;
    knowledgeGeneration = state.knowledgeGeneration || 0;
    completedResearch = state.completedResearch || [];
    currentResearch = state.currentResearch || null;
    discoveredLore = state.discoveredLore || [];

    // Gather current stats from race
    const currentStats = state.race?.baseStats || {};

    // Gather current population
    const currentPopulation = state.race?.population || 0;

    // Gather current resources as a map
    const currentResources: Record<string, number> = {};
    (state.resources || []).forEach((resource) => {
      currentResources[resource.id] = resource.amount;
    });

    // Gather available buildings
    const availableBuildings = Object.keys(state.buildingCounts || {}).filter(
      (buildingId) => (state.buildingCounts || {})[buildingId] > 0
    );

    // Gather available tools - placeholder implementation
    const availableTools: any[] = []; // TODO: Replace with actual tools when implemented

    if (race) {
      availableResearch = getAvailableResearch(
        completedResearch,
        currentStats,
        currentPopulation,
        currentResources,
        availableBuildings,
        availableTools,
        discoveredLore
      );
    }
  });

  onDestroy(() => {
    unsubscribeRace();
    unsubscribeResources(); // Add this cleanup
    unsubscribeGame();
  });

  function startResearch(research: any) {
    const canAfford = knowledge >= research.knowledgeCost;
    const hasLoreBypass = canUnlockWithLore(research.id, discoveredLore);

    // Check resource requirements
    let hasResources = true;
    if (research.resourceRequirement) {
      hasResources = Object.entries(research.resourceRequirement).every(
        ([resourceId, amount]) => getResourceAmount(resourceId) >= (amount as number)
      );
    }

    if (!canAfford && !hasLoreBypass) return;
    if (!hasResources && !hasLoreBypass) return;

    gameState.update((state) => {
      const newState = { ...state };

      // Deduct knowledge cost (unless bypassed with lore)
      if (!hasLoreBypass) {
        newState.knowledge -= research.knowledgeCost;

        // NEW: Deduct resource costs
        if (research.resourceRequirement) {
          newState.resources = newState.resources.map((resource) => {
            const cost = research.resourceRequirement[resource.id] || 0;
            return { ...resource, amount: resource.amount - cost };
          });
        }
      }

      // Start research
      newState.currentResearch = {
        ...research,
        currentProgress: 0
      };

      return newState;
    });
  }

  function getCategoryIcon(category: string): string {
    switch (category) {
      case 'crafting':
        return '⚒️';
      case 'building':
        return '🏗️';
      case 'military':
        return '⚔️';
      case 'exploration':
        return '🗺️';
      case 'social':
        return '👥';
      default:
        return '📚';
    }
  }

  function getTierColor(tier: number): string {
    switch (tier) {
      case 0:
        return '#4CAF50'; // Green - basic
      case 1:
        return '#2196F3'; // Blue - advanced
      case 2:
        return '#9C27B0'; // Purple - expert
      case 3:
        return '#FF9800'; // Orange - master
      default:
        return '#607D8B'; // Grey - unknown
    }
  }

  function formatStatRequirement(statReqs: any): string {
    if (!statReqs) return '';

    const parts: string[] = [];
    if (statReqs.minStats) {
      Object.entries(statReqs.minStats).forEach(([stat, min]) => {
        parts.push(`${stat} ≥ ${min}`);
      });
    }
    if (statReqs.maxStats) {
      Object.entries(statReqs.maxStats).forEach(([stat, max]) => {
        parts.push(`${stat} ≤ ${max}`);
      });
    }
    return parts.join(', ');
  }
  function cancelCurrentResearch() {
    if (!currentResearch) return;
    gameState.update((state) => {
      // Refund knowledge cost
      const refund = currentResearch.knowledgeCost || 0;
      return {
        ...state,
        knowledge: (state.knowledge || 0) + refund,
        currentResearch: undefined
      };
    });
  }

  function getBuildingName(buildingId: string): string {
    const building = AVAILABLE_BUILDINGS.find((b) => b.id === buildingId);
    return building ? building.name : buildingId;
  }
</script>

<div class="research-screen">
  <div class="research-header">
    <button class="back-btn" on:click={() => uiState.setScreen('main')}>← Back to Map</button>
    <h2>📚 Research & Development</h2>
    <p class="research-subtitle">Advance your civilization through knowledge</p>
  </div>

  <div class="research-content">
    <!-- Knowledge Status -->
    <div class="knowledge-status">
      <h3>🧠 Knowledge Status</h3>
      <div class="knowledge-info">
        <div class="knowledge-item">
          <span class="knowledge-label">Current Knowledge:</span>
          <span class="knowledge-value">{Math.floor(knowledge)}</span>
        </div>
        <div class="knowledge-item">
          <span class="knowledge-label">Generation per Turn:</span>
          <span class="knowledge-value">+{knowledgeGeneration}</span>
        </div>
      </div>
    </div>

    <!-- Current Research -->
    {#if currentResearch}
      <CurrentTask
        title="🔬 Current Research"
        icon={getCategoryIcon(currentResearch.category)}
        name={currentResearch.name}
        description={currentResearch.description}
        progress={(currentResearch.currentProgress || 0) / currentResearch.researchTime}
        timeRemaining="{currentResearch.researchTime -
          (currentResearch.currentProgress || 0)} turns remaining"
        onCancel={cancelCurrentResearch}
        cancelTitle="Cancel research and refund knowledge"
        accentColor="#2196f3"
      />
    {:else}
      <div class="empty-queue">No research in progress. Select a project below to begin.</div>
    {/if}

    <!-- Discovered Lore -->
    {#if discoveredLore.length > 0}
      <div class="discovered-lore">
        <h3>📜 Discovered Lore</h3>
        <div class="lore-grid">
          {#each discoveredLore as lore}
            <div class="lore-item">
              <span class="lore-icon">
                {#if lore.type === 'scroll'}📜
                {:else if lore.type === 'tome'}📖
                {:else if lore.type === 'artifact'}🏺
                {:else if lore.type === 'manual'}📋
                {:else}🔍{/if}
              </span>
              <div class="lore-details">
                <h4>{lore.name}</h4>
                <p>{lore.description}</p>
                <small>Unlocks: {lore.researchUnlocks.join(', ')}</small>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Available Research -->
    <div class="available-research">
      <h3>🔬 Available Research Projects</h3>
      <div class="research-grid">
        {#each availableResearch as research}
          <div class="research-card" style="--tier-color: {getTierColor(research.tier)}">
            <div class="research-card-header">
              <span class="research-icon">{getCategoryIcon(research.category)}</span>
              <h4>{research.name}</h4>
              <div class="research-tier">Tier {research.tier}</div>
            </div>

            <p class="research-description">{research.description}</p>

            <div class="research-requirements">
              <div class="research-cost">💡 {research.knowledgeCost} Knowledge</div>
              <div class="research-time">⏰ {research.researchTime} turns</div>

              <!-- Resource requirements display -->
              {#if research.resourceRequirement}
                <div class="resource-requirements">
                  📦 Resources needed:
                  {#each Object.entries(research.resourceRequirement) as [resourceId, amount]}
                    <div
                      class="resource-req-item"
                      class:insufficient={getResourceAmount(resourceId) < (amount as number)}
                    >
                      {getResourceIcon(resourceId)}
                      {amount}
                      {resourceId}
                      ({getResourceAmount(resourceId)} available)
                    </div>
                  {/each}
                </div>
              {/if}

              {#if research.populationRequired}
                <div class="pop-requirements">
                  👥 Requires: {research.populationRequired} population
                </div>
              {/if}

              {#if research.statRequirements}
                <div class="stat-requirements">
                  📊 Requires: {formatStatRequirement(research.statRequirements)}
                </div>
              {/if}

              {#if research.prerequisites.length > 0}
                <div class="prerequisites">
                  🔗 Requires: {research.prerequisites.join(', ')}
                </div>
              {/if}
            </div>

            <div class="research-unlocks">
              <h5>Unlocks:</h5>
              <div class="unlocks-list">
                {#if research.unlocks.toolLevel}
                  <div class="unlock-item">⚒️ Tool Level {research.unlocks.toolLevel}</div>
                {/if}
                {#if research.unlocks.buildingLevel}
                  <div class="unlock-item">🏗️ Building Level {research.unlocks.buildingLevel}</div>
                {/if}
                {#if research.unlocks.buildings}
                  <div class="unlock-item">
                    🏠 Buildings: {research.unlocks.buildings
                      .map((id: string) => getBuildingName(id))
                      .join(', ')}
                  </div>
                {/if}
                {#if research.unlocks.screens}
                  <div class="unlock-item">✨ Abiltiy: {research.unlocks.screens.join(', ')}</div>
                {/if}
                {#if research.unlocks.effects}
                  {#each Object.entries(research.unlocks.effects) as [effect, value]}
                    <div class="unlock-item">✨ {effect}: +{value}</div>
                  {/each}
                {/if}
              </div>
            </div>

            <button
              class="research-btn"
              class:affordable={knowledge >= research.knowledgeCost}
              class:lore-bypass={canUnlockWithLore(research.id, discoveredLore)}
              class:disabled={!currentResearch &&
                knowledge < research.knowledgeCost &&
                !canUnlockWithLore(research.id, discoveredLore)}
              on:click={() => startResearch(research)}
              disabled={currentResearch ||
                (knowledge < research.knowledgeCost &&
                  !canUnlockWithLore(research.id, discoveredLore))}
            >
              {#if currentResearch}
                Research in Progress
              {:else if canUnlockWithLore(research.id, discoveredLore)}
                Unlock with Lore
              {:else if knowledge >= research.knowledgeCost}
                Begin Research
              {:else}
                Insufficient Knowledge
              {/if}
            </button>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .research-screen {
    padding: 20px;
    background: #000000;
    color: #e0e0e0;
    font-family: 'Courier New', monospace;
    height: 100%;
    overflow-y: auto;
  }

  .research-header {
    text-align: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #9c27b0;
    position: relative;
  }

  .back-btn {
    position: absolute;
    top: 0;
    right: 0;
    padding: 8px 16px;
    background: #000000;
    border: 1px solid #9c27b0;
    color: #9c27b0;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
  }

  .back-btn:hover {
    background: #9c27b0;
    color: #000;
  }

  .research-header h2 {
    color: #9c27b0;
    margin: 0 0 10px 0;
    font-size: 2em;
    text-shadow: 0 0 10px rgba(156, 39, 176, 0.3);
  }

  .research-subtitle {
    color: #888;
    margin: 0;
    font-style: italic;
  }

  .research-content {
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  .knowledge-status {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #9c27b0;
  }

  .knowledge-status h3 {
    color: #9c27b0;
    margin: 0 0 15px 0;
  }

  .knowledge-info {
    display: flex;
    gap: 30px;
  }

  .knowledge-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .knowledge-label {
    color: #888;
    font-size: 0.9em;
  }

  .knowledge-value {
    color: #9c27b0;
    font-weight: bold;
    font-size: 1.2em;
  }

  .empty-queue {
    padding: 20px;
    text-align: center;
    color: #888;
    font-style: italic;
    background: #000000;
    border-radius: 4px;
    border: 2px dashed #555;
    margin-bottom: 20px;
  }

  .progress-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .progress-name {
    flex: 1;
    font-weight: bold;
  }

  .progress-time {
    color: #2196f3;
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
    background: #2196f3;
    transition: width 0.5s ease;
  }

  .progress-description {
    color: #888;
    font-style: italic;
    margin: 0;
  }

  .discovered-lore {
    background: #000000;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #ff9800;
  }

  .discovered-lore h3 {
    color: #ff9800;
    margin: 0 0 15px 0;
  }

  .lore-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 15px;
  }

  .lore-item {
    display: flex;
    gap: 10px;
    padding: 10px;
    background: #0c0c0c;
    border-radius: 4px;
  }

  .lore-icon {
    font-size: 1.5em;
  }

  .lore-details h4 {
    color: #ff9800;
    margin: 0 0 5px 0;
    font-size: 1em;
  }

  .lore-details p {
    color: #888;
    margin: 0 0 5px 0;
    font-size: 0.9em;
  }

  .lore-details small {
    color: #666;
    font-size: 0.8em;
  }

  .available-research h3 {
    color: #9c27b0;
    margin: 0 0 20px 0;
  }

  .research-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(375.5px, 0px));
    gap: 20px;
    justify-items: start;
  }

  .research-card {
    background: #0c0c0c;
    max-width: 375.5px; /* Keep this for safety */
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid var(--tier-color);
    transition: all 0.3s ease;
  }

  .research-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .research-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    position: relative;
  }

  .research-icon {
    font-size: 1.5em;
  }

  .research-card h4 {
    color: var(--tier-color);
    margin: 0;
    font-size: 1.2em;
    flex: 1;
  }

  .research-tier {
    background: var(--tier-color);
    color: #000;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.8em;
    font-weight: bold;
  }

  .research-description {
    color: #888;
    font-style: italic;
    margin: 0 0 15px 0;
  }

  .research-requirements {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 15px;
    font-size: 0.9em;
  }

  .research-cost {
    color: #9c27b0;
    font-weight: bold;
  }

  .research-time {
    color: #888;
  }

  .stat-requirements,
  .prerequisites {
    color: #666;
    font-size: 0.8em;
  }

  .research-unlocks h5 {
    color: #e0e0e0;
    margin: 0 0 8px 0;
    font-size: 1em;
  }

  .unlocks-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-bottom: 15px;
  }

  .unlock-item {
    color: #4caf50;
    font-size: 0.9em;
  }

  .research-btn {
    width: 100%;
    padding: 12px;
    background: #555;
    border: none;
    color: #888;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-weight: bold;
    transition: all 0.3s ease;
  }

  .research-btn.affordable {
    background: #9c27b0;
    color: #000;
  }

  .research-btn.lore-bypass {
    background: #ff9800;
    color: #000;
  }

  .research-btn:hover:not(.disabled) {
    transform: translateY(-1px);
  }

  .research-btn.disabled {
    cursor: not-allowed;
  }

  /* Scrollbar styling */
  .research-screen::-webkit-scrollbar {
    width: 8px;
  }

  .research-screen::-webkit-scrollbar-track {
    background: #000000;
  }

  .research-screen::-webkit-scrollbar-thumb {
    background: #9c27b0;
    border-radius: 4px;
  }
</style>
