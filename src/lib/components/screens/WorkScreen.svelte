<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { gameState, currentItem, currentRace } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { WORK_CATEGORIES } from '$lib/game/core/Work';
  import { locationService } from '$lib/game/services/LocationServices';
  import { itemService } from '$lib/game/services/ItemService';
  import { workService } from '$lib/game/services/WorkService';
  import { get } from 'svelte/store';

  let race: any = null;
  let pawns: any[] = [];
  let discoveredLocations: any[] = [];
  let workAssignments: Record<string, any> = {};
  let productionTargets: any[] = [];
  let currentJobIndex: Record<string, number> = {};
  // Track current job for each pawn (RimWorld-style cycling)
  let pawnCurrentJobs: Record<string, { workId: string; priority: number; startTime: number }> = {};
  let jobCycleInterval: ReturnType<typeof setInterval>;

  // UI State
  let selectedPawn: string | null = null;
  let selectedLocation: string | null = null;
  let selectedWorkCategory: string | null = null;
  let priorityWarning: string | null = null;

  const unsubscribeGame = gameState.subscribe((state) => {
    pawns = state.pawns || [];
    race = state.race;
    discoveredLocations = locationService.getDiscoveredLocations();
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
    return workService.calculateHarvestAmount(pawn, workType, priority, state);
  }

  function getPawnWorkPriority(pawnId: string, workId: string): number {
    return workAssignments[pawnId]?.workPriorities[workId] || 0;
  }

  function getWorkCategoryColor(workId: string): string {
    const work = workService.getWorkCategory(workId);
    return work?.color || '#9E9E9E';
  }

  function getWorkProgress(pawnId: string, workType: string): number {
    const priority = getPawnWorkPriority(pawnId, workType);
    return (priority / 12) * 100; // Convert 0-12 priority to 0-100 percentage
  }

  function getWorkEfficiencyColor(efficiency: number): string {
    if (efficiency >= 12) return '#9c27b0'; // Purple for excellent
    if (efficiency >= 10) return '#8bc34a'; // Light green for good
    if (efficiency >= 8) return '#ffeb3b'; // Yellow for average
    if (efficiency >= 6) return '#ff9800'; // Orange for below average
    return '#f44336'; // Red for poor
  }

  function getPawnWorkEfficiency(pawnId: string, workType: string): number {
    const pawn = pawns.find((p) => p.id === pawnId);
    const workCategory = workService.getWorkCategory(workType);

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
        workCategory: workService.getWorkCategory(workId)
      }));
  }
</script>

<div class="work-screen">
  <div class="screen-hdr">
    | WORK MANAGEMENT
    <button class="hdr-btn" on:click={() => uiState.setScreen('main')}>BACK</button>
  </div>

  <!-- Workers list -->
  <div class="section-hdr sub">| WORKERS ({pawns.length})</div>
  {#each pawns as pawn}
    {@const currentJob = getCurrentJobForPawn(pawn.id)}
    {@const workCategory = currentJob ? workService.getWorkCategory(currentJob.workId) : null}
    <button
      type="button"
      class="pawn-row"
      class:selected={selectedPawn === pawn.id}
      on:click={() => (selectedPawn = selectedPawn === pawn.id ? null : pawn.id)}
      aria-pressed={selectedPawn === pawn.id}
      aria-label="Select worker {pawn.name}"
    >
      <span class="pawn-name">{pawn.name.toUpperCase()}</span>
      <span class="pawn-stats-inline">
        STR {pawn.stats.strength} DEX {pawn.stats.dexterity} INT {pawn.stats.intelligence}
      </span>
      <span class="pawn-work">
        {#if workCategory}
          {workCategory.name.toUpperCase()}
          {@const efficiency = getPawnWorkEfficiency(pawn.id, currentJob?.workId || '')}
          <span class="eff" style="color: {getWorkEfficiencyColor(efficiency)}">[{efficiency}]</span
          >
        {:else}
          <span class="idle">IDLE</span>
        {/if}
      </span>
    </button>
  {/each}

  <!-- Individual Work Priorities -->
  {#if selectedPawn}
    {@const pawn = pawns.find((p) => p.id === selectedPawn)}
    {#if pawn}
      <div class="section-hdr">| {pawn.name.toUpperCase()} — WORK PRIORITIES</div>
      {#each WORK_CATEGORIES as workCategory}
        {@const priority = getPawnWorkPriority(pawn.id, workCategory.id)}
        {@const efficiency = getPawnWorkEfficiency(pawn.id, workCategory.id)}
        {@const expectedHarvest = getExpectedHarvest(pawn.id, workCategory.id)}
        <div class="priority-row" class:active={priority > 0}>
          <span class="work-name">{workCategory.name.toUpperCase()}</span>
          <span class="harvest">
            {priority > 0 ? `+${expectedHarvest.toFixed(2)}/turn` : '+0/turn'}
          </span>
          <span class="eff-label" style="color: {getWorkEfficiencyColor(efficiency)}">
            {efficiency >= 12
              ? 'EXCEL'
              : efficiency >= 10
                ? 'GOOD'
                : efficiency >= 8
                  ? 'AVG'
                  : 'POOR'}({efficiency})
          </span>
          <div class="pri-controls">
            <button
              class="pri-btn"
              on:click={() => {
                if (priority > 0) {
                  const next = getNextAvailablePriority(pawn.id, workCategory.id, -1);
                  updatePawnWorkPriority(pawn.id, workCategory.id, next);
                }
              }}
              disabled={priority <= 0}>◀</button
            >
            <span class="pri-val" class:zero={priority === 0}>{priority}</span>
            <button
              class="pri-btn"
              on:click={() => {
                if (priority < 12) {
                  const next = getNextAvailablePriority(pawn.id, workCategory.id, 1);
                  updatePawnWorkPriority(pawn.id, workCategory.id, next);
                }
              }}
              disabled={priority >= 12}>▶</button
            >
          </div>
        </div>
      {/each}
    {/if}
  {:else}
    <div class="section-hdr sub">| SELECT A WORKER TO MANAGE PRIORITIES</div>
  {/if}
</div>

<style>
  .work-screen {
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

  /* Pawn list */
  .pawn-row {
    display: flex;
    width: 100%;
    padding: 3px 8px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    cursor: pointer;
    text-align: left;
    gap: 8px;
    align-items: baseline;
  }
  .pawn-row:hover {
    background: var(--bg-hover);
  }
  .pawn-row.selected {
    background: var(--bg-active);
  }

  .pawn-name {
    color: var(--text);
    letter-spacing: 0.04em;
    width: 120px;
    flex-shrink: 0;
  }

  .pawn-stats-inline {
    color: var(--text-muted);
    font-size: 10px;
    flex: 1;
  }

  .pawn-work {
    color: var(--text-dim);
    margin-left: auto;
    font-size: 11px;
  }

  .idle {
    color: var(--text-muted);
    font-style: italic;
  }
  .eff {
    font-size: 10px;
  }

  /* Priority rows */
  .priority-row {
    display: flex;
    align-items: center;
    padding: 3px 8px;
    border-bottom: 1px solid var(--border);
    gap: 8px;
  }
  .priority-row:hover {
    background: var(--bg-hover);
  }
  .priority-row.active {
    background: var(--bg-panel);
  }

  .work-name {
    color: var(--text-dim);
    letter-spacing: 0.04em;
    width: 130px;
    flex-shrink: 0;
    font-size: 11px;
  }

  .harvest {
    color: var(--pos);
    font-size: 11px;
    width: 80px;
    flex-shrink: 0;
  }

  .eff-label {
    font-size: 10px;
    flex: 1;
  }

  .pri-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }

  .pri-btn {
    padding: 1px 6px;
    background: var(--bg-hover);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    cursor: pointer;
  }
  .pri-btn:hover:not(:disabled) {
    border-color: var(--border-hi);
    color: var(--accent-hi);
  }
  .pri-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .pri-val {
    color: var(--accent-hi);
    font-size: 12px;
    width: 20px;
    text-align: center;
    font-weight: bold;
  }
  .pri-val.zero {
    color: var(--text-muted);
  }
</style>
