<script lang="ts">
  import { gameState, currentItem, currentRace } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { onDestroy } from 'svelte';
  import {
    WORK_CATEGORIES,
    getWorkCategory,
    getWorkCategoriesByLocation,
    getAvailableResourcesForWork,
    calculateWorkEfficiency
  } from '$lib/game/core/Work';
  import { getDiscoveredLocations, getLocationInfo } from '$lib/game/core/Locations';
  import { getItemIcon, getItemInfo } from '$lib/game/core/Items';

  let race: any = null;
  let pawns: any[] = [];
  let discoveredLocations: any[] = [];
  let workAssignments: Record<string, any> = {};
  let productionTargets: any[] = [];

  // UI State
  let selectedPawn: string | null = null;
  let selectedLocation: string | null = null;
  let selectedWorkCategory: string | null = null;

  const unsubscribeRace = currentRace.subscribe((value) => {
    race = value;
    // For now, create mock pawns based on population
    if (race) {
      pawns = Array.from({ length: Math.min(race.population, 10) }, (_, i) => ({
        id: `pawn_${i}`,
        name: `Worker ${i + 1}`,
        stats: {
          strength: 8 + Math.floor(Math.random() * 8),
          dexterity: 8 + Math.floor(Math.random() * 8),
          intelligence: 8 + Math.floor(Math.random() * 8),
          wisdom: 8 + Math.floor(Math.random() * 8),
          constitution: 8 + Math.floor(Math.random() * 8),
          charisma: 8 + Math.floor(Math.random() * 8)
        },
        skills: {},
        currentWork: null,
        workLocation: null
      }));
    }
  });

  const unsubscribeGame = gameState.subscribe((state) => {
    discoveredLocations = getDiscoveredLocations();
    workAssignments = state.workAssignments || {};
    productionTargets = state.productionTargets || [];

    // Initialize default production targets for discovered locations
    if (productionTargets.length === 0 && discoveredLocations.length > 0) {
      productionTargets = discoveredLocations.flatMap((location) => {
        const availableWork = getWorkCategoriesByLocation(location.id);
        return availableWork.map((work) => ({
          id: `${location.id}_${work.id}`,
          workCategoryId: work.id,
          locationId: location.id,
          resourceTargets: {},
          assignedPawns: []
        }));
      });
    }
  });

  onDestroy(() => {
    unsubscribeRace();
    unsubscribeGame();
  });

  function updatePawnWorkPriority(pawnId: string, workId: string, priority: number) {
    gameState.update((state) => {
      const newAssignments = { ...state.workAssignments };
      if (!newAssignments[pawnId]) {
        newAssignments[pawnId] = {
          pawnId,
          workPriorities: {},
          authorizedLocations: discoveredLocations.map((loc) => loc.id)
        };
      }
      newAssignments[pawnId].workPriorities[workId] = priority;

      return {
        ...state,
        workAssignments: newAssignments
      };
    });
  }
  function updateProductionTarget(targetId: string, resourceId: string, percentage: number) {
    gameState.update((state) => {
      // Create new productionTargets array (immutable update)
      const newProductionTargets = (state.productionTargets || []).map((target) => {
        if (target.id === targetId) {
          // Create new target object with updated resourceTargets
          return {
            ...target,
            resourceTargets: {
              ...target.resourceTargets,
              [resourceId]: percentage
            }
          };
        }
        return target;
      });

      return {
        ...state,
        productionTargets: newProductionTargets
      };
    });
  }

  function assignPawnToProduction(pawnId: string, targetId: string) {
    gameState.update((state) => {
      const newTargets =
        state.productionTargets?.map((target) => {
          if (target.id === targetId) {
            const assignedPawns = target.assignedPawns.includes(pawnId)
              ? target.assignedPawns.filter((id: string) => id !== pawnId)
              : [...target.assignedPawns, pawnId];
            return { ...target, assignedPawns };
          }
          return target;
        }) || [];

      return {
        ...state,
        productionTargets: newTargets
      };
    });
  }

  function getPawnWorkPriority(pawnId: string, workId: string): number {
    return workAssignments[pawnId]?.workPriorities[workId] || 0;
  }

  function isPawnAssignedToTarget(pawnId: string, targetId: string): boolean {
    const target = productionTargets.find((t) => t.id === targetId);
    return target?.assignedPawns.includes(pawnId) || false;
  }

  function getWorkCategoryColor(workId: string): string {
    const work = getWorkCategory(workId);
    return work?.color || '#9E9E9E';
  }
</script>

<div class="work-screen">
  <div class="work-header">
    <button class="back-btn" on:click={() => uiState.setScreen('main')}>← Back to Map</button>
    <h2>👷 Work Management</h2>
    <p class="work-subtitle">Assign workers and manage production across your civilization</p>
  </div>

  <div class="work-content">
    <!-- Population Overview -->
    <div class="population-overview">
      <h3>👥 Available Workers ({pawns.length})</h3>
      <div class="pawns-grid">
        {#each pawns as pawn}
          <div
            class="pawn-card"
            class:selected={selectedPawn === pawn.id}
            on:click={() => (selectedPawn = selectedPawn === pawn.id ? null : pawn.id)}
          >
            <div class="pawn-header">
              <span class="pawn-icon">👤</span>
              <h4>{pawn.name}</h4>
              {#if pawn.currentWork}
                <span class="current-work" style="color: {getWorkCategoryColor(pawn.currentWork)}">
                  {getWorkCategory(pawn.currentWork)?.emoji}
                </span>
              {/if}
            </div>

            <div class="pawn-stats">
              <div class="stat-row">
                <span>💪 {pawn.stats.strength}</span>
                <span>🤹 {pawn.stats.dexterity}</span>
                <span>🧠 {pawn.stats.intelligence}</span>
              </div>
              <div class="stat-row">
                <span>🦉 {pawn.stats.wisdom}</span>
                <span>❤️ {pawn.stats.constitution}</span>
                <span>😊 {pawn.stats.charisma}</span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Work Categories Overview -->
    <div class="work-categories">
      <h3>🔧 Work Categories</h3>
      <div class="categories-grid">
        {#each WORK_CATEGORIES as workCategory}
          <div
            class="category-card"
            style="--category-color: {workCategory.color}"
            class:selected={selectedWorkCategory === workCategory.id}
            on:click={() =>
              (selectedWorkCategory =
                selectedWorkCategory === workCategory.id ? null : workCategory.id)}
          >
            <div class="category-header">
              <span class="category-icon">{workCategory.emoji}</span>
              <h4>{workCategory.name}</h4>
            </div>
            <p class="category-description">{workCategory.description}</p>

            <div class="category-stats">
              <div class="primary-stat">
                Primary: {workCategory.primaryStat}
              </div>
              {#if workCategory.secondaryStat}
                <div class="secondary-stat">
                  Secondary: {workCategory.secondaryStat}
                </div>
              {/if}
            </div>

            <div class="assigned-workers">
              {pawns.filter((p) => p.currentWork === workCategory.id).length} workers assigned
            </div>
          </div>
        {/each}
      </div>
    </div>
    <!-- Simplified Work Management - Only Pawn Priorities -->
    <div class="pawn-work-management">
      {#if selectedPawn}
        {@const pawn = pawns.find((p) => p.id === selectedPawn)}
        {#if pawn}
          <div class="pawn-work-priorities">
            <h3>👤 {pawn.name} - Work Priorities</h3>
            <div class="priorities-grid">
              {#each WORK_CATEGORIES as workCategory}
                <div class="priority-setting">
                  <div class="work-info">
                    <span class="work-icon" style="color: {workCategory.color}">
                      {workCategory.emoji}
                    </span>
                    <span class="work-name">{workCategory.name}</span>
                  </div>

                  <div class="priority-controls">
                    <button
                      class="priority-btn decrease"
                      class:disabled={getPawnWorkPriority(pawn.id, workCategory.id) <= 0}
                      on:click={() => {
                        const currentPriority = getPawnWorkPriority(pawn.id, workCategory.id);
                        if (currentPriority > 0) {
                          updatePawnWorkPriority(pawn.id, workCategory.id, currentPriority - 1);
                        }
                      }}
                      disabled={getPawnWorkPriority(pawn.id, workCategory.id) <= 0}
                      title="Decrease priority"
                    >
                      ◀
                    </button>

                    <div class="priority-display">
                      <span class="priority-value">
                        {getPawnWorkPriority(pawn.id, workCategory.id)}
                      </span>
                      <div class="priority-bars">
                        {#each Array(10) as _, i}
                          <div
                            class="priority-bar"
                            class:active={i < getPawnWorkPriority(pawn.id, workCategory.id)}
                          ></div>
                        {/each}
                      </div>
                    </div>

                    <button
                      class="priority-btn increase"
                      class:disabled={getPawnWorkPriority(pawn.id, workCategory.id) >= 10}
                      on:click={() => {
                        const currentPriority = getPawnWorkPriority(pawn.id, workCategory.id);
                        if (currentPriority < 10) {
                          updatePawnWorkPriority(pawn.id, workCategory.id, currentPriority + 1);
                        }
                      }}
                      disabled={getPawnWorkPriority(pawn.id, workCategory.id) >= 10}
                      title="Increase priority"
                    >
                      ▶
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {:else}
        <div class="no-pawn-selected">
          <h3>👤 Individual Work Management</h3>
          <div class="selection-prompt">
            <p>
              Select a worker from the list above to configure their individual work priorities.
            </p>
            <p>
              Each worker can specialize in different tasks based on their skills and your
              civilization's needs.
            </p>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .work-screen {
    padding: 20px;
    background: #000000;
    color: #e0e0e0;
    font-family: 'Courier New', monospace;
    height: 100%;
    overflow-y: auto;
  }

  .work-header {
    text-align: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #ff9800;
    position: relative;
  }

  .back-btn {
    position: absolute;
    top: 0;
    right: 0;
    padding: 8px 16px;
    background: #000000;
    border: 1px solid #ff9800;
    color: #ff9800;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
  }

  .back-btn:hover {
    background: #ff9800;
    color: #000;
  }

  .work-header h2 {
    color: #ff9800;
    margin: 0 0 10px 0;
    font-size: 2em;
    text-shadow: 0 0 10px rgba(255, 152, 0, 0.3);
  }

  .work-subtitle {
    color: #888;
    margin: 0;
    font-style: italic;
  }

  .work-content {
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  .population-overview {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #4caf50;
  }
  .pawn-work-management {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #ff9800;
  }

  .pawn-work-priorities {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #ff9800;
  }

  .pawn-work-priorities h3 {
    color: #ff9800;
    margin: 0 0 15px 0;
  }

  .no-pawn-selected {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #666;
  }

  .no-pawn-selected h3 {
    color: #666;
    margin: 0 0 15px 0;
  }

  .selection-prompt {
    color: #888;
    font-style: italic;
  }

  .selection-prompt p {
    margin: 0 0 10px 0;
    line-height: 1.4;
  }

  /* Remove the old two-column styles */
  /* .work-management-columns, .production-management, .pawn-priorities-column styles can be removed */

  .population-overview h3 {
    color: #4caf50;
    margin: 0 0 15px 0;
  }
  .work-management-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
    align-items: start;
  }

  .production-management {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #2196f3;
    height: fit-content;
  }

  .pawn-priorities-column {
    height: fit-content;
  }

  .pawn-work-priorities {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #ff9800;
    height: fit-content;
  }

  .no-pawn-selected {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #666;
    height: fit-content;
  }

  .no-pawn-selected h3 {
    color: #666;
    margin: 0 0 15px 0;
  }

  .selection-prompt {
    color: #888;
    font-style: italic;
  }

  .selection-prompt p {
    margin: 0 0 10px 0;
    line-height: 1.4;
  }

  /* Priority control styles */
  .priority-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .priority-btn {
    width: 32px;
    height: 32px;
    background: #333;
    border: 1px solid #555;
    color: #e0e0e0;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 1.2em;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .priority-btn:hover:not(.disabled) {
    background: #444;
    border-color: #ff9800;
    color: #ff9800;
    transform: scale(1.1);
  }

  .priority-btn:active:not(.disabled) {
    background: #555;
    transform: scale(0.95);
  }

  .priority-btn.disabled {
    background: #222;
    border-color: #333;
    color: #666;
    cursor: not-allowed;
  }

  .priority-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 60px;
  }

  .priority-value {
    color: #ff9800;
    font-weight: bold;
    font-size: 1.1em;
  }

  .priority-bars {
    display: flex;
    gap: 2px;
  }

  .priority-bar {
    width: 4px;
    height: 12px;
    background: #333;
    border-radius: 1px;
    transition: background-color 0.2s ease;
  }

  .priority-bar.active {
    background: #ff9800;
    box-shadow: 0 0 4px rgba(255, 152, 0, 0.3);
  }

  /* Responsive design */
  @media (max-width: 1200px) {
    .work-management-columns {
      grid-template-columns: 1fr;
      gap: 20px;
    }
  }

  .pawns-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
  }

  .pawn-card {
    background: #000000;
    border-radius: 8px;
    padding: 12px;
    border: 2px solid #333;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .pawn-card:hover {
    border-color: #4caf50;
  }

  .pawn-card.selected {
    border-color: #ff9800;
    background: #1a1a1a;
  }

  .pawn-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .priority-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .priority-btn {
    width: 32px;
    height: 32px;
    background: #333;
    border: 1px solid #555;
    color: #e0e0e0;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 1.2em;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .priority-btn:hover:not(.disabled) {
    background: #444;
    border-color: #ff9800;
    color: #ff9800;
    transform: scale(1.1);
  }

  .priority-btn:active:not(.disabled) {
    background: #555;
    transform: scale(0.95);
  }

  .priority-btn.disabled {
    background: #222;
    border-color: #333;
    color: #666;
    cursor: not-allowed;
  }

  .priority-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 60px;
  }

  .priority-value {
    color: #ff9800;
    font-weight: bold;
    font-size: 1.1em;
  }

  .priority-bars {
    display: flex;
    gap: 2px;
  }

  .priority-bar {
    width: 4px;
    height: 12px;
    background: #333;
    border-radius: 1px;
    transition: background-color 0.2s ease;
  }

  .priority-bar.active {
    background: #ff9800;
    box-shadow: 0 0 4px rgba(255, 152, 0, 0.3);
  }

  .pawn-icon {
    font-size: 1.2em;
  }

  .pawn-card h4 {
    color: #e0e0e0;
    margin: 0;
    flex: 1;
  }

  .current-work {
    font-size: 1.2em;
  }

  .pawn-stats {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.8em;
    color: #888;
  }

  .work-categories {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #9c27b0;
  }

  .work-categories h3 {
    color: #9c27b0;
    margin: 0 0 15px 0;
  }

  .categories-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 15px;
  }

  .category-card {
    background: #000000;
    border-radius: 8px;
    padding: 15px;
    border-left: 3px solid var(--category-color);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .category-card:hover {
    background: #1a1a1a;
  }

  .category-card.selected {
    background: #1a1a1a;
    border-left-width: 5px;
  }

  .category-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .category-icon {
    font-size: 1.5em;
  }

  .category-card h4 {
    color: var(--category-color);
    margin: 0;
  }

  .category-description {
    color: #888;
    font-size: 0.9em;
    margin: 0 0 10px 0;
  }

  .category-stats {
    font-size: 0.8em;
    color: #666;
    margin-bottom: 8px;
  }

  .assigned-workers {
    font-size: 0.8em;
    color: #4caf50;
    font-weight: bold;
  }

  .production-management {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #2196f3;
  }

  .production-management h3 {
    color: #2196f3;
    margin: 0 0 20px 0;
  }

  .location-production {
    margin-bottom: 25px;
    background: #000000;
    border-radius: 8px;
    padding: 15px;
  }

  .location-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 1px solid #333;
  }

  .location-icon {
    font-size: 1.5em;
  }

  .location-production h4 {
    color: #2196f3;
    margin: 0;
    flex: 1;
  }

  .location-type {
    background: #333;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.8em;
    text-transform: capitalize;
  }

  .work-production-section {
    margin-bottom: 20px;
    background: #0a0a0a;
    border-radius: 6px;
    padding: 12px;
  }

  .work-section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .work-icon {
    font-size: 1.2em;
  }

  .work-production-section h5 {
    color: #e0e0e0;
    margin: 0;
    flex: 1;
  }

  .assigned-count {
    background: #333;
    padding: 2px 6px;
    border-radius: 8px;
    font-size: 0.8em;
  }

  .worker-assignment h6,
  .resource-targets h6 {
    color: #e0e0e0;
    margin: 0 0 8px 0;
    font-size: 0.9em;
  }

  .worker-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-bottom: 15px;
  }

  .worker-btn {
    padding: 4px 8px;
    background: #333;
    border: 1px solid #555;
    color: #e0e0e0;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8em;
    transition: all 0.2s ease;
  }

  .worker-btn:hover {
    background: #444;
  }

  .worker-btn.assigned {
    background: #4caf50;
    border-color: #4caf50;
    color: #000;
  }

  .resource-targets {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .resource-target {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .resource-icon {
    font-size: 1em;
  }

  .resource-name {
    min-width: 120px;
    font-size: 0.9em;
  }

  .percentage-slider {
    flex: 1;
    margin: 0 10px;
  }

  .percentage-display {
    min-width: 40px;
    text-align: right;
    font-size: 0.9em;
    color: #ff9800;
  }

  .pawn-work-priorities {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #ff9800;
  }

  .pawn-work-priorities h3 {
    color: #ff9800;
    margin: 0 0 15px 0;
  }

  .priorities-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .priority-setting {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px;
    background: #000000;
    border-radius: 4px;
  }

  .work-info {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 150px;
  }

  .work-name {
    font-size: 0.9em;
  }

  .priority-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .priority-slider {
    width: 120px;
  }

  .priority-value {
    min-width: 20px;
    text-align: center;
    color: #ff9800;
    font-weight: bold;
  }

  /* Scrollbar styling */
  .work-screen::-webkit-scrollbar {
    width: 8px;
  }

  .work-screen::-webkit-scrollbar-track {
    background: #000000;
  }

  .work-screen::-webkit-scrollbar-thumb {
    background: #ff9800;
    border-radius: 4px;
  }
</style>
