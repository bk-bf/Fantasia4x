<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { gameState, currentItem, currentRace } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import {
    WORK_CATEGORIES,
    getWorkCategory,
    getWorkCategoriesByLocation,
    getAvailableResourcesForWork,
    calculateWorkEfficiency,
    calculateHarvestAmount
  } from '$lib/game/core/Work';
  import { getDiscoveredLocations, getLocationInfo } from '$lib/game/core/Locations';
  import { getItemIcon, getItemInfo } from '$lib/game/core/Items';
  import { get } from 'svelte/store';

  let race: any = null;
  let pawns: any[] = [];
  let discoveredLocations: any[] = [];
  let workAssignments: Record<string, any> = {};
  let productionTargets: any[] = [];
  let currentJobIndex: Record<string, number> = {};
  // Track current job for each pawn (RimWorld-style cycling)
  let pawnCurrentJobs: Record<string, { workId: string; priority: number; startTime: number }> = {};
  let jobCycleInterval: number;

  // UI State
  let selectedPawn: string | null = null;
  let selectedLocation: string | null = null;
  let selectedWorkCategory: string | null = null;
  let priorityWarning: string | null = null;

  const unsubscribeGame = gameState.subscribe((state) => {
    pawns = state.pawns || [];
    race = state.race;
    discoveredLocations = getDiscoveredLocations();
    workAssignments = state.workAssignments || {};
    productionTargets = state.productionTargets || [];
    currentJobIndex = state.currentJobIndex || {};

    // Initialize current jobs for new pawns
    pawns.forEach((pawn) => {
      if (!pawnCurrentJobs[pawn.id]) {
        const nextJob = getNextJobForPawn(pawn.id);
        if (nextJob) {
          pawnCurrentJobs[pawn.id] = {
            workId: nextJob.workId,
            priority: nextJob.priority,
            startTime: Date.now()
          };
        }
      }
    });
  });

  // RimWorld-style job cycling system
  function getNextJobForPawn(pawnId: string): { workId: string; priority: number } | null {
    const assignments = workAssignments[pawnId];
    if (!assignments) return null;

    // Get all assigned work sorted by priority (1 = highest, 12 = lowest)
    const sortedWork = Object.entries(assignments.workPriorities)
      .filter(([_, priority]) => Number(priority) > 0)
      .sort(([_, a], [__, b]) => Number(a) - Number(b)) // Sort by priority ascending (1, 2, 3...)
      .map(([workId, priority]) => ({ workId, priority: Number(priority) }));

    if (sortedWork.length === 0) return null;

    const currentJob = pawnCurrentJobs[pawnId];
    if (!currentJob) {
      // No current job, start with highest priority (lowest number)
      return sortedWork[0];
    }

    // Find current job in sorted list
    const currentIndex = sortedWork.findIndex((work) => work.workId === currentJob.workId);

    if (currentIndex === -1) {
      // Current job no longer assigned, start over
      return sortedWork[0];
    }

    // Move to next job in priority order, cycling back to start
    const nextIndex = (currentIndex + 1) % sortedWork.length;
    return sortedWork[nextIndex];
  }

  function getCurrentJobForPawn(pawnId: string): { workId: string; priority: number } | null {
    const assignments = workAssignments[pawnId];
    if (!assignments) return null;

    const sortedWork = Object.entries(assignments.workPriorities)
      .filter(([_, priority]) => Number(priority) > 0)
      .sort(([_, a], [__, b]) => Number(a) - Number(b))
      .map(([workId, priority]) => ({ workId, priority: Number(priority) }));

    if (sortedWork.length === 0) return null;

    const idx = currentJobIndex[pawnId] ?? 0;
    return sortedWork[idx % sortedWork.length];
  }

  onMount(() => {
    // Job cycling timer - like RimWorld's task switching
    jobCycleInterval = setInterval(() => {
      pawns.forEach((pawn) => {
        const currentJob = pawnCurrentJobs[pawn.id];
        if (currentJob) {
          // Check if job has been running long enough to switch (2-5 seconds based on priority)
          const jobDuration = Date.now() - currentJob.startTime;
          const switchTime = Math.max(2000, 6000 - currentJob.priority * 400); // Higher priority = longer duration

          if (jobDuration >= switchTime) {
            const nextJob = getNextJobForPawn(pawn.id);
            if (nextJob && nextJob.workId !== currentJob.workId) {
              pawnCurrentJobs[pawn.id] = {
                ...nextJob,
                startTime: Date.now()
              };
            } else if (nextJob) {
              // Same job, reset timer
              pawnCurrentJobs[pawn.id] = {
                ...currentJob,
                startTime: Date.now()
              };
            }
          }
        } else {
          // No current job, assign one
          const nextJob = getNextJobForPawn(pawn.id);
          if (nextJob) {
            pawnCurrentJobs[pawn.id] = {
              ...nextJob,
              startTime: Date.now()
            };
          }
        }
      });
    }, 500); // Check every 500ms

    return () => {
      if (jobCycleInterval) clearInterval(jobCycleInterval);
    };
  });

  onDestroy(() => {
    unsubscribeGame();
    if (jobCycleInterval) clearInterval(jobCycleInterval);
  });

  function getNextAvailablePriority(
    pawnId: string,
    currentWorkId: string,
    direction: 1 | -1
  ): number {
    const used = new Set(
      Object.entries(workAssignments[pawnId]?.workPriorities || {})
        .filter(([wid, _]) => wid !== currentWorkId)
        .map(([_, p]) => Number(p))
    );
    let priority = getPawnWorkPriority(pawnId, currentWorkId);
    do {
      priority += direction;
    } while (priority > 0 && priority <= 12 && used.has(priority));
    if (priority < 0) priority = 0;
    if (priority > 12) priority = 12;
    return priority;
  }

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

      // Check for duplicate priority (except 0)
      if (priority > 0) {
        for (const [otherWorkId, otherPriority] of Object.entries(
          newAssignments[pawnId].workPriorities
        )) {
          if (otherWorkId !== workId && otherPriority === priority) {
            priorityWarning = `Priority ${priority} is already assigned to another work.`;
            return state;
          }
        }
      }

      priorityWarning = null;
      newAssignments[pawnId].workPriorities[workId] = priority;

      // Reset current job when priorities change
      if (pawnCurrentJobs[pawnId]) {
        const nextJob = getNextJobForPawn(pawnId);
        if (nextJob) {
          pawnCurrentJobs[pawnId] = {
            ...nextJob,
            startTime: Date.now()
          };
        } else {
          delete pawnCurrentJobs[pawnId];
        }
      }

      return {
        ...state,
        workAssignments: newAssignments
      };
    });
  }

  function getExpectedHarvest(pawnId: string, workType: string): number {
    const pawn = pawns.find((p) => p.id === pawnId);
    if (!pawn) return 0;
    const priority = getPawnWorkPriority(pawnId, workType);
    const state = get(gameState);
    return calculateHarvestAmount(pawn, workType, priority, state);
  }

  function getPawnWorkPriority(pawnId: string, workId: string): number {
    return workAssignments[pawnId]?.workPriorities[workId] || 0;
  }

  function getWorkCategoryColor(workId: string): string {
    const work = getWorkCategory(workId);
    return work?.color || '#9E9E9E';
  }

  function getWorkProgress(pawnId: string, workType: string): number {
    const priority = getPawnWorkPriority(pawnId, workType);
    return (priority / 12) * 100; // Convert 0-12 priority to 0-100 percentage
  }

  function getWorkEfficiencyColor(efficiency: number): string {
    if (efficiency >= 8) return 'green';
    if (efficiency >= 6) return 'blue';
    if (efficiency >= 4) return 'yellow';
    if (efficiency >= 2) return 'orange';
    return 'red';
  }

  function getPawnWorkEfficiency(pawnId: string, workType: string): number {
    const pawn = pawns.find((p) => p.id === pawnId);
    const workCategory = getWorkCategory(workType);

    if (!pawn || !workCategory) return 0;

    const primaryStat = pawn.stats[workCategory.primaryStat] || 10;
    return Math.round(primaryStat);
  }

  // Get all assigned work for a pawn in priority order
  function getPawnWorkQueue(
    pawnId: string
  ): Array<{ workId: string; priority: number; workCategory: any }> {
    const assignments = workAssignments[pawnId];
    if (!assignments) return [];

    return Object.entries(assignments.workPriorities)
      .filter(([_, priority]) => Number(priority) > 0)
      .sort(([_, a], [__, b]) => Number(a) - Number(b))
      .map(([workId, priority]) => ({
        workId,
        priority: Number(priority),
        workCategory: getWorkCategory(workId)
      }));
  }
</script>

<div class="work-screen">
  <div class="work-header">
    <button class="back-btn" on:click={() => uiState.setScreen('main')}>← Back to Map</button>
    <h2>👷 Work Management</h2>
    <p class="work-subtitle">Assign workers and manage production across your civilization</p>
  </div>

  <div class="work-content">
    <!-- Population Overview with Progress Bars -->
    <div class="population-overview">
      <h3>👥 Available Workers ({pawns.length})</h3>
      <div class="pawns-grid">
        {#each pawns as pawn}
          {@const topWork = Object.entries(workAssignments[pawn.id]?.workPriorities || {})
            .filter(([_, priority]) => Number(priority) > 0)
            .sort(([_, a], [__, b]) => Number(b) - Number(a))[0]}
          <button
            type="button"
            class="pawn-card"
            class:selected={selectedPawn === pawn.id}
            aria-pressed={selectedPawn === pawn.id}
            aria-label="Select worker {pawn.name}"
            on:click={() => (selectedPawn = selectedPawn === pawn.id ? null : pawn.id)}
            on:keydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                selectedPawn = selectedPawn === pawn.id ? null : pawn.id;
              }
            }}
            role="button"
            tabindex="0"
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

            <!-- Work Progress Indicator -->
            {#if getCurrentJobForPawn(pawn.id)}
              {@const currentJob = getCurrentJobForPawn(pawn.id)}
              {#if currentJob}
                {@const workCategory = getWorkCategory(currentJob.workId)}
                {@const efficiency = getPawnWorkEfficiency(pawn.id, currentJob.workId)}
                {@const expectedHarvest = getExpectedHarvest(pawn.id, currentJob.workId)}
                {@const workQueue = getPawnWorkQueue(pawn.id)}

                <div class="work-progress-section">
                  <div class="work-progress-header">
                    <span class="work-emoji">{workCategory?.emoji}</span>
                    <span class="work-label"
                      >{workCategory?.name} (Priority {currentJob.priority})</span
                    >
                  </div>

                  <!-- Show work queue like RimWorld -->
                  <div class="work-queue">
                    {#each workQueue as queuedWork}
                      <div
                        class="queue-item"
                        class:active={queuedWork.workId === currentJob.workId}
                        style="--work-color: {queuedWork.workCategory?.color || '#9E9E9E'}"
                      >
                        <span class="queue-emoji">{queuedWork.workCategory?.emoji}</span>
                        <span class="queue-priority">{queuedWork.priority}</span>
                      </div>
                    {/each}
                  </div>

                  <div class="harvest-info">
                    <span class="harvest-rate">+{expectedHarvest}/turn</span>
                    <span class="efficiency-rating">Efficiency: {efficiency}</span>
                  </div>
                </div>
              {:else}
                <div class="no-work-assigned">
                  <span class="idle-indicator">💤 Idle</span>
                </div>
              {/if}
            {:else}
              <div class="no-work-assigned">
                <span class="idle-indicator">💤 Idle</span>
              </div>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <!-- Work Categories Overview -->
    <div class="work-categories">
      <h3>🔧 Work Categories</h3>
      <div class="categories-grid">
        {#each WORK_CATEGORIES as workCategory}
          {@const assignedPawns = pawns.filter((p) => {
            const topWork = Object.entries(workAssignments[p.id]?.workPriorities || {})
              .filter(([_, priority]) => Number(priority) > 0)
              .sort(([_, a], [__, b]) => Number(b) - Number(a))[0];
            return topWork && topWork[0] === workCategory.id;
          })}

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

            <!-- Category Progress Overview -->
            <div class="category-progress">
              <div class="assigned-workers">
                {assignedPawns.length} workers assigned
              </div>

              {#if assignedPawns.length > 0}
                {@const totalHarvest = assignedPawns.reduce(
                  (sum, pawn) => sum + getExpectedHarvest(pawn.id, workCategory.id),
                  0
                )}

                <div class="category-production">
                  <span class="total-harvest">Total: +{totalHarvest}/turn</span>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Individual Pawn Work Priorities with Enhanced Progress -->
    <div class="pawn-work-management">
      {#if selectedPawn}
        {@const pawn = pawns.find((p) => p.id === selectedPawn)}
        {#if pawn}
          <div class="pawn-work-priorities">
            <h3>👤 {pawn.name} - Work Priorities</h3>
            <div class="priorities-grid">
              {#each WORK_CATEGORIES as workCategory}
                {@const priority = getPawnWorkPriority(pawn.id, workCategory.id)}
                {@const efficiency = getPawnWorkEfficiency(pawn.id, workCategory.id)}
                {@const expectedHarvest = getExpectedHarvest(pawn.id, workCategory.id)}

                <div class="priority-setting">
                  <div class="work-info">
                    <span class="work-icon" style="color: {workCategory.color}">
                      {workCategory.emoji}
                    </span>
                    <span class="work-name">{workCategory.name}</span>
                  </div>

                  <div class="priority-controls">
                    <!-- Harvest Information -->
                    {#if priority > 0}
                      <div class="work-feedback">
                        <div class="harvest-prediction">
                          <span class="harvest-amount">+{expectedHarvest}/turn</span>
                          <span
                            class="efficiency-indicator"
                            style="color: {getWorkEfficiencyColor(efficiency)}"
                          >
                            {efficiency >= 12
                              ? 'Excellent'
                              : efficiency >= 10
                                ? 'Good'
                                : efficiency >= 8
                                  ? 'Average'
                                  : 'Poor'} efficiency
                          </span>
                        </div>
                      </div>
                    {/if}
                    <button
                      class="priority-btn decrease"
                      class:disabled={priority <= 0}
                      on:click={() => {
                        if (priority > 0) {
                          const next = getNextAvailablePriority(pawn.id, workCategory.id, -1);
                          updatePawnWorkPriority(pawn.id, workCategory.id, next);
                        }
                      }}
                      disabled={priority <= 0}
                      title="Decrease priority"
                    >
                      ◀
                    </button>

                    <div class="priority-display">
                      <span class="priority-value">{priority}</span>

                      <!-- Enhanced Progress Bar -->
                      <div class="priority-progress"></div>
                    </div>
                    <button
                      class="priority-btn increase"
                      class:disabled={priority >= 12}
                      on:click={() => {
                        if (priority < 12) {
                          const next = getNextAvailablePriority(pawn.id, workCategory.id, 1);
                          updatePawnWorkPriority(pawn.id, workCategory.id, next);
                        }
                      }}
                      disabled={priority >= 12}
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
  .assigned-works-row {
    display: flex;
    gap: 10px;
    margin: 8px 0;
  }
  .assigned-work {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #181818;
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 0.85em;
  }
  .work-priority {
    color: #ff9800;
    font-weight: bold;
    margin-left: 2px;
  }
  .job-ticker-bar {
    display: flex;
    height: 6px;
    margin: 4px 0 8px 0;
    background: #222;
    border-radius: 3px;
    overflow: hidden;
  }
  .job-tick {
    background: #444;
    transition: background 0.3s;
  }
  .job-tick.active {
    background: #ff9800;
  }
  .active-job-info {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 4px 0 0 0;
    font-size: 0.95em;
    color: #ff9800;
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
  .work-progress-section {
    margin-top: 10px;
    padding: 8px;
    background: #0a0a0a;
    border-radius: 4px;
  }

  .work-progress-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .work-queue {
    display: flex;
    gap: 4px;
    margin: 4px 0;
    flex-wrap: wrap;
  }

  .queue-item {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 6px;
    background: #222;
    border-radius: 3px;
    border-left: 2px solid var(--work-color);
    font-size: 0.8em;
    transition: all 0.3s ease;
  }

  .queue-item.active {
    background: var(--work-color);
    color: #000;
    font-weight: bold;
    transform: scale(1.1);
  }

  .queue-emoji {
    font-size: 1em;
  }

  .queue-priority {
    font-weight: bold;
    min-width: 12px;
    text-align: center;
  }
  .work-emoji {
    font-size: 1.2em;
  }

  .work-label {
    font-size: 0.8em;
    color: #e0e0e0;
    font-weight: bold;
  }

  .harvest-info {
    display: flex;
    justify-content: space-between;
    margin-top: 4px;
    font-size: 0.7em;
  }

  .harvest-rate {
    color: #4caf50;
    font-weight: bold;
  }

  .efficiency-rating {
    color: #888;
  }

  .no-work-assigned {
    margin-top: 10px;
    text-align: center;
    padding: 8px;
    background: #0a0a0a;
    border-radius: 4px;
  }

  .idle-indicator {
    color: #666;
    font-size: 0.9em;
  }

  .category-progress {
    margin-top: 10px;
  }

  .category-production {
    margin: 5px 0;
  }

  .total-harvest {
    color: #4caf50;
    font-weight: bold;
    font-size: 0.9em;
  }

  .priority-progress {
    width: 80px;
    margin: 4px 0;
  }

  .work-feedback {
    margin-top: 8px;
    padding: 6px;
    background: #0a0a0a;
    border-radius: 4px;
  }

  .harvest-prediction {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .harvest-amount {
    color: #4caf50;
    font-weight: bold;
    font-size: 0.9em;
  }

  .efficiency-indicator {
    font-size: 0.8em;
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
